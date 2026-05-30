import { createHash, createHmac } from "crypto";
import { gzipSync } from "zlib";
import { neon } from "@neondatabase/serverless";
import { logger } from "@/lib/logger";

/**
 * Nightly logical backup of the Neon Postgres database to S3.
 *
 * We don't have pg_dump in the serverless runtime, so this takes a logical
 * snapshot: enumerate every base table in the `public` schema (which covers
 * both the relational tables AND the kv_store blob that backs readJSON/
 * writeJSON), `SELECT *` each one, and serialise to a single self-describing
 * JSON document. The document records each table's column types so the
 * restore script (`scripts/restore-backup.ts`) can reinsert jsonb / array
 * values correctly without re-introspecting the schema.
 *
 * The JSON is gzipped and PUT to S3 with a date-partitioned key. We sign the
 * request with a minimal SigV4 implementation (node:crypto only) so we don't
 * pull in the full AWS SDK for one PUT per night.
 *
 * Config (all required to activate; absent any one, the cron logs "skipped"):
 *   BACKUP_S3_BUCKET, BACKUP_S3_REGION,
 *   BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY
 * Optional:
 *   BACKUP_S3_PREFIX   (default "backups/sud-italia")
 *   BACKUP_S3_ENDPOINT (for S3-compatible stores; default AWS)
 */

export const BACKUP_FORMAT_VERSION = 1;

export interface BackupColumn {
  name: string;
  type: string;
}

export interface BackupTable {
  columns: BackupColumn[];
  rows: Record<string, unknown>[];
}

export interface BackupDocument {
  version: number;
  createdAt: string;
  source: "neon";
  tables: Record<string, BackupTable>;
}

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  endpoint?: string;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

export function getS3Config(): S3Config | null {
  const bucket = process.env.BACKUP_S3_BUCKET?.trim();
  const region = process.env.BACKUP_S3_REGION?.trim();
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    prefix: process.env.BACKUP_S3_PREFIX?.trim() || "backups/sud-italia",
    endpoint: process.env.BACKUP_S3_ENDPOINT?.trim() || undefined,
  };
}

/**
 * Produces a logical dump of every base table in the public schema. Generic
 * by design — new tables are picked up automatically, so the backup never
 * silently misses a feature's data.
 */
export async function dumpDatabase(databaseUrl: string): Promise<BackupDocument> {
  const sql = neon(databaseUrl);

  const tableRows = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `) as { table_name: string }[];

  const tables: Record<string, BackupTable> = {};

  for (const { table_name } of tableRows) {
    if (!IDENT.test(table_name)) {
      // Should never happen for our own tables; skip rather than risk an
      // injection via an unexpected identifier.
      logger.warn("backup: skipping table with unexpected name", { table_name });
      continue;
    }

    const cols = (await sql.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table_name],
    )) as { column_name: string; data_type: string }[];

    const rows = (await sql.query(
      `SELECT * FROM "${table_name}"`,
    )) as Record<string, unknown>[];

    tables[table_name] = {
      columns: cols.map((c) => ({ name: c.column_name, type: c.data_type })),
      rows,
    };
  }

  return {
    version: BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    source: "neon",
    tables,
  };
}

// --- Minimal AWS SigV4 for a single S3 PUT (no SDK) ---------------------------

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function signingKey(secret: string, date: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

export interface S3PutResult {
  url: string;
  bytes: number;
  etag?: string;
}

export async function s3PutObject(
  cfg: S3Config,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<S3PutResult> {
  const service = "s3";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  // Virtual-hosted-style by default; path-style for custom endpoints.
  const host = cfg.endpoint
    ? new URL(cfg.endpoint).host
    : `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  const canonicalUri = cfg.endpoint
    ? `/${cfg.bucket}/${key}`
    : `/${key}`;
  const url = cfg.endpoint
    ? `${cfg.endpoint.replace(/\/$/, "")}/${cfg.bucket}/${key}`
    : `https://${host}${canonicalUri}`;

  const payloadHash = sha256Hex(body);
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    canonicalUri.split("/").map(encodeURIComponent).join("/"),
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${cfg.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = hmac(
    signingKey(cfg.secretAccessKey, dateStamp, cfg.region, service),
    stringToSign,
  ).toString("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      "Content-Type": contentType,
      "Content-Length": String(body.length),
    },
    // Node Buffer isn't in the DOM BodyInit union; a Uint8Array view is.
    body: new Uint8Array(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`S3 PUT failed: ${res.status} ${res.statusText} ${text.slice(0, 500)}`);
  }

  return { url, bytes: body.length, etag: res.headers.get("etag") ?? undefined };
}

export function backupObjectKey(cfg: S3Config, when = new Date()): string {
  const y = when.getUTCFullYear();
  const m = String(when.getUTCMonth() + 1).padStart(2, "0");
  const d = String(when.getUTCDate()).padStart(2, "0");
  const stamp = when.toISOString().replace(/[:.]/g, "-");
  return `${cfg.prefix}/${y}/${m}/${d}/backup-${stamp}.json.gz`;
}

export interface BackupRunResult {
  ok: boolean;
  skipped?: string;
  key?: string;
  url?: string;
  bytes?: number;
  tableCount?: number;
  rowCount?: number;
}

/**
 * Orchestrates a full backup run: dump → gzip → upload. Returns a structured
 * result (never throws for the "not configured" case — that's a skip, not a
 * failure) so the cron can log + report cleanly.
 */
export async function runBackup(): Promise<BackupRunResult> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return { ok: true, skipped: "no DATABASE_URL" };

  const cfg = getS3Config();
  if (!cfg) return { ok: true, skipped: "S3 not configured" };

  const doc = await dumpDatabase(databaseUrl);
  const json = JSON.stringify(doc);
  const gz = gzipSync(Buffer.from(json, "utf8"), { level: 9 });
  const key = backupObjectKey(cfg);
  const put = await s3PutObject(cfg, key, gz, "application/gzip");

  const rowCount = Object.values(doc.tables).reduce((n, t) => n + t.rows.length, 0);
  return {
    ok: true,
    key,
    url: put.url,
    bytes: put.bytes,
    tableCount: Object.keys(doc.tables).length,
    rowCount,
  };
}
