import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_RANK, type AdminRole } from "./admin-roles";
import { getAdminIpAllowlist, isAdminIpAllowed } from "./rate-limit";

// Run with:  npx tsx --test src/lib/rbac.test.ts

// Mirrors the gate in withAdmin / hasRole: a session passes when its role rank
// is >= the least-privileged allowed role. Testing it here pins the rank table
// that actually drives every role-gated route + nav item.
function passesGate(role: AdminRole, allowed: AdminRole[]): boolean {
  const minRank = Math.min(...allowed.map((r) => ROLE_RANK[r]));
  return ROLE_RANK[role] >= minRank;
}

test("role ranks are strictly ordered owner > franchisee > manager > staff > kitchen", () => {
  assert.ok(ROLE_RANK.owner > ROLE_RANK.franchisee);
  assert.ok(ROLE_RANK.franchisee > ROLE_RANK.manager);
  assert.ok(ROLE_RANK.manager > ROLE_RANK.staff);
  assert.ok(ROLE_RANK.staff > ROLE_RANK.kitchen);
});

test("owner clears every gate", () => {
  assert.equal(passesGate("owner", ["owner"]), true);
  assert.equal(passesGate("owner", ["manager"]), true);
  assert.equal(passesGate("owner", ["kitchen"]), true);
});

test("a lower role cannot reach a higher-privilege route", () => {
  assert.equal(passesGate("staff", ["manager"]), false);
  assert.equal(passesGate("kitchen", ["staff"]), false);
  assert.equal(passesGate("manager", ["owner"]), false);
});

test("a gate listing multiple roles admits anyone at/above the lowest", () => {
  // staff..owner can bump tickets; kitchen is below staff and excluded.
  const allowed: AdminRole[] = ["staff", "kitchen", "manager", "owner"];
  assert.equal(passesGate("kitchen", allowed), true); // kitchen IS in the list
  const ownerOnly: AdminRole[] = ["owner"];
  assert.equal(passesGate("franchisee", ownerOnly), false);
});

test("IP allowlist is open when unset and exact-match when set", () => {
  const saved = process.env.ADMIN_IP_ALLOWLIST;
  try {
    delete process.env.ADMIN_IP_ALLOWLIST;
    assert.deepEqual(getAdminIpAllowlist(), []);
    assert.equal(isAdminIpAllowed("203.0.113.9"), true, "no allowlist = open");

    process.env.ADMIN_IP_ALLOWLIST = " 203.0.113.10 , 198.51.100.4 ";
    assert.deepEqual(getAdminIpAllowlist(), ["203.0.113.10", "198.51.100.4"]);
    assert.equal(isAdminIpAllowed("203.0.113.10"), true);
    assert.equal(isAdminIpAllowed("198.51.100.4"), true);
    assert.equal(isAdminIpAllowed("203.0.113.99"), false);
    assert.equal(isAdminIpAllowed("unknown"), false, "sentinel IP is denied under an allowlist");
  } finally {
    if (saved === undefined) delete process.env.ADMIN_IP_ALLOWLIST;
    else process.env.ADMIN_IP_ALLOWLIST = saved;
  }
});
