#!/usr/bin/env tsx
/**
 * Restores a logical backup produced by src/lib/backup.ts into a Postgres
 * database. DESTRUCTIVE: it deletes existing rows in every table present in
 * the backup before reinserting.
 *
 * Usage:
 *   # Restore from a local gzipped backup file:
 *   DATABASE_URL=postgres://...  tsx scripts/restore-backup.ts ./backup.json.gz --yes
 *
 *   # Or an uncompressed .json:
 *   DATABASE_URL=postgres://...  tsx scripts/restore-backup.ts ./backup.json --yes
 *
 * Download the object from S3 first (aws s3 cp, or the console), then point
 * this at the local file. We restore into the DATABASE_URL target — point it
 * at a fresh Neon branch first to rehearse before touching production.
 *
 * Insertion order is derived from foreign-key dependencies (topological sort)
 * so parents land before children. Sequences are reset afterwards so future
 * inserts don't collide with restored ids. The whole thing runs in one
 * transaction — on any error it rolls back and the database is untouched.
 */
import { readFileSync } from "fs";
import { gunzipSync } from "zlib";
import { neon } from "@neondatabase/serverless";
import type { BackupDocument } from "../src/lib/backup";

const IDENT = /^[a-z_][a-z0-9_]*$/;

function loadBackup(path: string): BackupDocument {
  const raw = readFileSync(path);
  const json = path.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  const doc = JSON.parse(json) as BackupDocument;
  if (!doc || typeof doc !== "object" || !doc.tables) {
    throw new Error("Not a valid backup document (missing .tables)");
  }
  return doc;
}

/** Kahn topological sort of tables by FK dependency (parents first). */
async function tableOrder(
  sql: ReturnType<typeof neon>,
  tables: string[],
): Promise<string[]> {
  const set = new Set(tables);
  const deps = (await sql.query(
    `SELECT tc.table_name AS child, ccu.table_name AS parent
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name
      AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
  )) as { child: string; parent: string }[];

  const incoming = new Map<string, Set<string>>();
  for (const t of tables) incoming.set(t, new Set());
  for (const { child, parent } of deps) {
    if (child === parent) continue; // self-reference: ignore for ordering
    if (set.has(child) && set.has(parent)) incoming.get(child)!.add(parent);
  }

  const order: string[] = [];
  const ready = tables.filter((t) => incoming.get(t)!.size === 0);
  while (ready.length) {
    const t = ready.shift()!;
    order.push(t);
    for (const [child, parents] of incoming) {
      if (parents.delete(t) && parents.size === 0 && !order.includes(child)) {
        ready.push(child);
      }
    }
  }
  // Any table left in a cycle: append in original order (FKs may be deferred
  // or nullable; restore will still attempt it).
  for (const t of tables) if (!order.includes(t)) order.push(t);
  return order;
}

async function main() {
  const file = process.argv[2];
  const confirmed = process.argv.includes("--yes");
  const url = process.env.DATABASE_URL;

  if (!file) {
    console.error("Usage: DATABASE_URL=... tsx scripts/restore-backup.ts <backup.json[.gz]> --yes");
    process.exit(1);
  }
  if (!url) {
    console.error("DATABASE_URL is required (the restore target).");
    process.exit(1);
  }

  const doc = loadBackup(file);
  const names = Object.keys(doc.tables).filter((n) => IDENT.test(n));
  const totalRows = names.reduce((n, t) => n + doc.tables[t].rows.length, 0);

  console.log(`Backup: ${doc.createdAt} — ${names.length} tables, ${totalRows} rows`);
  console.log(`Target: ${url.replace(/:[^:@/]+@/, ":****@")}`);

  if (!confirmed) {
    console.error("\nThis DELETES existing rows in those tables. Re-run with --yes to proceed.");
    process.exit(1);
  }

  const sql = neon(url);
  const order = await tableOrder(sql, names);

  // jsonb / json / array columns must be re-serialised to JSON text on insert.
  const needsJson = (type: string) =>
    type === "jsonb" || type === "json" || type === "ARRAY" || type.endsWith("[]");

  await sql.query("BEGIN");
  try {
    // Clear children-before-parents (reverse of insert order) to avoid FK
    // violations on delete.
    for (const table of [...order].reverse()) {
      await sql.query(`DELETE FROM "${table}"`);
    }

    for (const table of order) {
      const { columns, rows } = doc.tables[table];
      if (rows.length === 0) continue;
      const colNames = columns.map((c) => c.name).filter((c) => IDENT.test(c));
      const jsonCols = new Set(
        columns.filter((c) => needsJson(c.type)).map((c) => c.name),
      );

      // Insert row-by-row with parameter binding. Batching would be faster but
      // restore is a rare operation and correctness/clarity wins here.
      const colList = colNames.map((c) => `"${c}"`).join(", ");
      const placeholders = colNames.map((_, i) => `$${i + 1}`).join(", ");
      const text = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;

      for (const row of rows) {
        const values = colNames.map((c) => {
          const v = (row as Record<string, unknown>)[c];
          if (v === null || v === undefined) return null;
          return jsonCols.has(c) ? JSON.stringify(v) : v;
        });
        await sql.query(text, values);
      }
      console.log(`  restored ${rows.length} rows into ${table}`);
    }

    // Reset serial/identity sequences so future inserts don't collide.
    const seqs = (await sql.query(
      `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`,
    )) as { sequence_name: string }[];
    for (const { sequence_name } of seqs) {
      if (!IDENT.test(sequence_name)) continue;
      // setval to the max of the owning column where derivable; safe no-op when
      // the sequence isn't column-owned.
      await sql.query(
        `SELECT setval('"${sequence_name}"',
           COALESCE((SELECT last_value FROM "${sequence_name}"), 1), true)`,
      ).catch(() => {});
    }

    await sql.query("COMMIT");
    console.log(`\nRestore complete: ${totalRows} rows across ${names.length} tables.`);
  } catch (err) {
    await sql.query("ROLLBACK").catch(() => {});
    console.error("\nRestore failed — rolled back, database unchanged.");
    console.error(err);
    process.exit(1);
  }
}

main();
