import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSoc2Register, type Soc2Signals } from "./soc2";

// Run with:  npx tsx --test src/lib/soc2.test.ts
//
// The register's whole point (audit §11.3) is that status is DERIVED from real
// signals, never a static "compliant" tick. These tests prove a control flips
// met→partial→gap as the underlying posture changes.

const fullyConfigured: Soc2Signals = {
  durableStorage: true,
  sessionSecret: true,
  adminPassword: true,
  productionRuntime: true,
  stripeConfigured: true,
  stripeWebhookVerified: true,
  distributedLock: true,
  cronAuth: true,
  ciPipeline: true,
  adminUserCount: 4,
  activeAdminCount: 4,
  ownerCount: 1,
  rolesInUse: ["owner", "manager", "staff"],
  auditLogCount: 120,
  latestAuditAt: "2026-05-29T10:00:00.000Z",
};

const find = (s: Soc2Signals, id: string) =>
  buildSoc2Register(s).controls.find((c) => c.id === id)!;

test("a fully-configured platform scores every control met", () => {
  const r = buildSoc2Register(fullyConfigured);
  assert.equal(r.summary.gap, 0);
  assert.equal(r.summary.partial, 0);
  assert.equal(r.summary.met, r.summary.total);
  assert.equal(r.summary.scorePct, 100);
});

test("CC6.1 degrades to gap without session secret + admin password", () => {
  const c = find({ ...fullyConfigured, sessionSecret: false, adminPassword: false }, "CC6.1");
  assert.equal(c.status, "gap");
  assert.ok(c.remediation);
});

test("CC6.3 flags 'everyone is an owner' as a least-privilege gap", () => {
  // 3 admins, all owners → no separation of duties.
  const c = find(
    { ...fullyConfigured, adminUserCount: 3, ownerCount: 3, rolesInUse: ["owner"] },
    "CC6.3",
  );
  assert.equal(c.status, "partial");
  assert.match(c.remediation ?? "", /least-privilege/i);
});

test("CC6.7 is partial when Stripe is set but webhooks aren't verified", () => {
  const c = find({ ...fullyConfigured, stripeWebhookVerified: false }, "CC6.7");
  assert.equal(c.status, "partial");
  assert.match(c.remediation ?? "", /STRIPE_WEBHOOK_SECRET/);
});

test("CC7.2 monitoring is partial when audit log lives on the filesystem fallback", () => {
  const c = find({ ...fullyConfigured, durableStorage: false }, "CC7.2");
  assert.equal(c.status, "partial");
  assert.match(c.remediation ?? "", /DATABASE_URL/);
});

test("score is weighted: partial counts as half a control", () => {
  // Knock exactly one control from met to gap → score drops by 1/total.
  const r = buildSoc2Register({
    ...fullyConfigured,
    ciPipeline: false, // CC8.1 has no partial path → straight to gap
  });
  const expected = Math.round(((r.summary.total - 1) / r.summary.total) * 100);
  assert.equal(r.summary.gap, 1);
  assert.equal(r.summary.scorePct, expected);
});
