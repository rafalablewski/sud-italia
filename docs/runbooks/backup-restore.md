# Database backup & restore runbook

Nightly logical backup of the Neon Postgres database to S3, plus a tested
restore procedure. Appendix A — "Nightly DB backup + documented restore".

## What gets backed up

A logical snapshot of **every base table in the `public` schema** — both the
relational tables (orders, customers, slots, …) and the `kv_store` blob that
backs `readJSON`/`writeJSON`. The dump is generic: new tables are picked up
automatically, so a new feature's data is never silently missed.

Each table's column types are recorded in the dump so the restore can
reinsert `jsonb` / array values correctly. The document is gzipped and PUT to
S3 with a date-partitioned key:

```
<prefix>/<YYYY>/<MM>/<DD>/backup-<ISO timestamp>.json.gz
```

Code: `src/lib/backup.ts` (`runBackup`), cron route
`src/app/api/admin/cron/db-backup`.

## Schedule

The backup runs nightly via the cron fan-out dispatcher
(`src/app/api/admin/cron/dispatch` → `/api/admin/cron/db-backup`, daily). On
Vercel Hobby the dispatcher fires at 04:00 UTC; on Pro you can give the backup
its own `vercel.json` cron entry.

The job **self-skips** (logs `skipped`, returns 200) when `DATABASE_URL` or the
S3 config is absent — so a misconfiguration never wedges the nightly run; it
just no-ops visibly.

## Configuration

Set in Vercel → Settings → Environment Variables:

| Var | Required | Notes |
| --- | --- | --- |
| `BACKUP_S3_BUCKET` | yes | Target bucket. |
| `BACKUP_S3_REGION` | yes | e.g. `eu-central-1`. |
| `BACKUP_S3_ACCESS_KEY_ID` | yes | IAM user/role with `s3:PutObject` on the bucket/prefix. |
| `BACKUP_S3_SECRET_ACCESS_KEY` | yes | — |
| `BACKUP_S3_PREFIX` | no | Default `backups/sud-italia`. |
| `BACKUP_S3_ENDPOINT` | no | For S3-compatible stores (R2, MinIO). Uses path-style addressing. |
| `CRON_SECRET` | yes | Authorises the cron invocation. |

Scope the IAM credentials to `s3:PutObject` on `arn:aws:s3:::<bucket>/<prefix>/*`
only — the app never needs to read or delete. Enable bucket versioning +
lifecycle expiry (e.g. 35 days) on the bucket so old snapshots roll off.

## Verifying a backup ran

- Manual trigger (owner session or the cron secret):
  `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/admin/cron/db-backup`
  → `{ ok, key, bytes, tableCount, rowCount }`.
- The cron logs `cron.db-backup` with the same fields; a failure logs
  `cron.db-backup failed` at error level (mirrored to Sentry,
  `alert: "backup.failed"` — see docs/runbooks/alerting.md).
- Confirm the object exists in S3 under today's date partition.

## Restore

`scripts/restore-backup.ts` restores a downloaded backup into a target
database. It is **destructive** — it deletes existing rows in every table
present in the backup, then reinserts in foreign-key dependency order
(parents before children), inside a single transaction that rolls back on any
error. Sequences are reset afterwards.

**Rehearse on a branch first.** Create a Neon branch of production, point
`DATABASE_URL` at the branch, and restore there to validate before ever
touching production.

```bash
# 1. Download the snapshot you want from S3
aws s3 cp s3://<bucket>/<prefix>/2026/05/30/backup-....json.gz ./backup.json.gz

# 2. Dry run prints the plan and refuses without --yes
DATABASE_URL='postgres://...branch...' tsx scripts/restore-backup.ts ./backup.json.gz

# 3. Execute
DATABASE_URL='postgres://...branch...' tsx scripts/restore-backup.ts ./backup.json.gz --yes
```

After a restore, redeploy/restart so any in-process caches are dropped, then
spot-check: order count, latest orders, admin users, loyalty settings.

### Restore limitations

- Insert ordering is derived from FK constraints. Tables in a dependency cycle
  are restored last in arbitrary order; if a cycle's FKs are `NOT NULL` and
  non-deferrable a restore may fail — none of the current schema's tables form
  such a cycle, but re-check after large schema changes.
- For point-in-time recovery between nightly snapshots, use Neon's built-in
  PITR; this script covers full-snapshot disaster recovery and cold-storage
  inspection.
