import { test } from "node:test";
import assert from "node:assert/strict";
import { backupObjectKey, getS3Config, BACKUP_FORMAT_VERSION } from "./backup";

// Run with:  npx tsx --test src/lib/backup.test.ts

const cfg = {
  bucket: "b",
  region: "eu-central-1",
  accessKeyId: "k",
  secretAccessKey: "s",
  prefix: "backups/sud-italia",
};

test("backupObjectKey is date-partitioned and gzip-suffixed", () => {
  const key = backupObjectKey(cfg, new Date("2026-05-30T03:00:00Z"));
  assert.match(key, /^backups\/sud-italia\/2026\/05\/30\/backup-.*\.json\.gz$/);
});

test("getS3Config returns null until all four core vars are set", () => {
  const saved = {
    bucket: process.env.BACKUP_S3_BUCKET,
    region: process.env.BACKUP_S3_REGION,
    key: process.env.BACKUP_S3_ACCESS_KEY_ID,
    secret: process.env.BACKUP_S3_SECRET_ACCESS_KEY,
  };
  try {
    delete process.env.BACKUP_S3_BUCKET;
    delete process.env.BACKUP_S3_REGION;
    delete process.env.BACKUP_S3_ACCESS_KEY_ID;
    delete process.env.BACKUP_S3_SECRET_ACCESS_KEY;
    assert.equal(getS3Config(), null);

    process.env.BACKUP_S3_BUCKET = "bk";
    assert.equal(getS3Config(), null, "still null with only bucket set");

    process.env.BACKUP_S3_REGION = "eu-central-1";
    process.env.BACKUP_S3_ACCESS_KEY_ID = "AKIA";
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = "secret";
    const resolved = getS3Config();
    assert.ok(resolved);
    assert.equal(resolved!.bucket, "bk");
    assert.equal(resolved!.prefix, "backups/sud-italia", "default prefix");
  } finally {
    process.env.BACKUP_S3_BUCKET = saved.bucket;
    process.env.BACKUP_S3_REGION = saved.region;
    process.env.BACKUP_S3_ACCESS_KEY_ID = saved.key;
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = saved.secret;
  }
});

test("format version is stable", () => {
  assert.equal(BACKUP_FORMAT_VERSION, 1);
});
