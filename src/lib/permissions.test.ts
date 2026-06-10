import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PERMISSION_KEYS,
  ROLE_DEFAULT_PERMISSIONS,
  effectiveHas,
  isPermissionKey,
  permissionForAdminPage,
  permissionForApiPath,
  resolveEffectivePermissions,
  userHasPermission,
} from "./permissions";

// Run with:  npx tsx --test src/lib/permissions.test.ts

test("the catalog has no duplicate keys and isPermissionKey is exact", () => {
  assert.equal(new Set(ALL_PERMISSION_KEYS).size, ALL_PERMISSION_KEYS.length);
  assert.ok(ALL_PERMISSION_KEYS.length > 0);
  assert.equal(isPermissionKey("orders.refund"), true);
  assert.equal(isPermissionKey("orders.teleport"), false);
});

test("role default presets line up with the legacy role tiers", () => {
  // Owner is all-access by preset.
  assert.equal(
    ROLE_DEFAULT_PERMISSIONS.owner.length,
    ALL_PERMISSION_KEYS.length,
  );
  // Manager has the operational keys but never system administration.
  assert.ok(ROLE_DEFAULT_PERMISSIONS.manager.includes("menu.edit"));
  assert.ok(!ROLE_DEFAULT_PERMISSIONS.manager.includes("users.edit"));
  assert.ok(!ROLE_DEFAULT_PERMISSIONS.manager.includes("settings.edit"));
  // Staff/kitchen are progressively narrower.
  assert.ok(ROLE_DEFAULT_PERMISSIONS.staff.includes("orders.view"));
  assert.ok(!ROLE_DEFAULT_PERMISSIONS.staff.includes("menu.edit"));
  assert.ok(ROLE_DEFAULT_PERMISSIONS.kitchen.includes("kds.view"));
  assert.ok(!ROLE_DEFAULT_PERMISSIONS.kitchen.includes("orders.refund"));
});

test("manager default excludes owner-by-default surfaces but keeps floor tools", () => {
  const mgr = ROLE_DEFAULT_PERMISSIONS.manager;
  // Owner-by-default (operator policy) — still grantable per-person, but not in
  // the manager preset: Finance reports, all Growth, governance/config.
  for (const k of [
    "reports.view", "business_costs.view", "simulation.view",
    "growth.view", "upsell.view", "crosssell.view", "bundles.view",
    "truck.view", "integrations.view",
    "audit.view", "capabilities.view", "insights.view", "boardroom.view",
    "payments.view", "qr_ordering.view",
    "comms.view", "comms.manage",
  ] as const) {
    assert.ok(!mgr.includes(k), `manager should NOT default to ${k}`);
  }
  // Deliberately kept with the manager.
  for (const k of ["cash.view", "compliance.view", "menu_engineering.view"] as const) {
    assert.ok(mgr.includes(k), `manager should keep ${k}`);
  }
  // Franchisee inherits most tier-2 exclusions (built on MANAGER_PERMS)…
  assert.ok(!ROLE_DEFAULT_PERMISSIONS.franchisee.includes("growth.view"));
  assert.ok(!ROLE_DEFAULT_PERMISSIONS.franchisee.includes("boardroom.view"));
  // …but owns its P&L, so Reports is restored (Cash is in the manager grant).
  assert.ok(ROLE_DEFAULT_PERMISSIONS.franchisee.includes("reports.view"));
  assert.ok(ROLE_DEFAULT_PERMISSIONS.franchisee.includes("cash.view"));
});

test("the four newly-catalogued pages gate on their own permission", () => {
  assert.equal(permissionForAdminPage("/admin/boardroom"), "boardroom.view");
  assert.equal(permissionForAdminPage("/admin/payments"), "payments.view");
  assert.equal(permissionForAdminPage("/admin/qr-ordering"), "qr_ordering.view");
  assert.equal(permissionForAdminPage("/admin/integrations"), "integrations.view");
  assert.equal(permissionForAdminPage("/admin/comms"), "comms.view");
  assert.equal(permissionForApiPath("/api/admin/tasks", "POST"), "comms.manage");
  assert.equal(permissionForApiPath("/api/admin/announcements", "GET"), "comms.view");
  // The personal feeds are intentionally unmapped (any authed user reads own).
  assert.equal(permissionForApiPath("/api/admin/my-tasks", "GET"), null);
  assert.equal(permissionForApiPath("/api/admin/my-announcements", "PUT"), null);
  // …and don't get swallowed by a neighbouring rule (e.g. /admin/menu).
  assert.equal(permissionForAdminPage("/admin/menu"), "menu.view");
  // API side maps too, prefix-agnostic across role aliases.
  assert.equal(permissionForApiPath("/api/admin/payments", "POST"), "payments.view");
  assert.equal(permissionForAdminPage("/manager/boardroom"), "boardroom.view");
});

test("owner and the legacy shared session are always all-access", () => {
  const owner = resolveEffectivePermissions({ role: "owner" });
  assert.equal(owner.all, true);
  assert.equal(owner.custom, false);
  assert.equal(effectiveHas(owner, "settings.edit"), true);

  // Legacy password-only "admin" session: owner shim regardless of role field.
  const legacy = resolveEffectivePermissions({ role: "manager", id: "admin" });
  assert.equal(legacy.all, true);
});

test("a custom grant is authoritative; absence falls back to role defaults", () => {
  const custom = resolveEffectivePermissions({
    role: "staff",
    permissions: ["reports.view", "cash.manage", "bogus.key"],
  });
  assert.equal(custom.custom, true);
  assert.equal(custom.all, false);
  assert.equal(effectiveHas(custom, "reports.view"), true);
  assert.equal(effectiveHas(custom, "cash.manage"), true);
  // Unknown keys are dropped, and a staff default (orders.view) is NOT implied.
  assert.equal(custom.keys.has("bogus.key" as never), false);
  assert.equal(effectiveHas(custom, "orders.view"), false);

  // No permissions field → role default preset, not custom.
  const fallback = resolveEffectivePermissions({ role: "staff" });
  assert.equal(fallback.custom, false);
  assert.equal(effectiveHas(fallback, "orders.view"), true);
  assert.equal(effectiveHas(fallback, "reports.view"), false);
});

test("admin page paths map to their .view permission (dashboard is ungated)", () => {
  assert.equal(permissionForAdminPage("/admin"), null);
  assert.equal(permissionForAdminPage("/admin/orders"), "orders.view");
  assert.equal(permissionForAdminPage("/admin/reports/cohort"), "reports.view");
  assert.equal(permissionForAdminPage("/admin/locations/manage"), "locations.view");
  // menu-engineering must not be swallowed by the /admin/menu rule.
  assert.equal(permissionForAdminPage("/admin/menu"), "menu.view");
  assert.equal(permissionForAdminPage("/admin/menu-engineering"), "menu_engineering.view");
  // Owner-tier rules pages need the stronger compliance.edit, not bare view.
  assert.equal(permissionForAdminPage("/admin/compliance"), "compliance.view");
  assert.equal(permissionForAdminPage("/admin/regulatory-compliance"), "compliance.edit");
  assert.equal(permissionForAdminPage("/admin/soc2"), "compliance.edit");
  // The Core suite moved to its own top-level /core/* segment but is still
  // permission-gated (CoreProviders reuses this map). The deep paths matter
  // because Guest carries ?view= sub-views under the same .view key.
  assert.equal(permissionForAdminPage("/core/pos"), "pos.view");
  assert.equal(permissionForAdminPage("/core/kds"), "kds.view");
  assert.equal(permissionForAdminPage("/core/guest"), "guest.view");
  assert.equal(permissionForAdminPage("/core/service"), "service.view");
  // Role-prefixed aliases (/manager/*, /franchisee/* rewrite onto /admin/*)
  // normalise back to the same permission — the gate is prefix-agnostic.
  assert.equal(permissionForAdminPage("/manager/inventory"), "inventory.view");
  assert.equal(permissionForAdminPage("/franchisee/reports/cohort"), "reports.view");
  assert.equal(permissionForAdminPage("/manager"), null);
  assert.equal(permissionForAdminPage("/franchisee"), null);
});

test("admin API paths map to method-aware permissions", () => {
  assert.equal(permissionForApiPath("/api/admin/users", "GET"), "users.view");
  assert.equal(permissionForApiPath("/api/admin/users", "POST"), "users.edit");
  assert.equal(permissionForApiPath("/api/admin/menu/item", "PUT"), "menu.edit");
  assert.equal(permissionForApiPath("/api/admin/cash/drop", "POST"), "cash.manage");
  // Action-level routes resolve to their specific capability.
  assert.equal(permissionForApiPath("/api/admin/orders/o1/refund", "POST"), "orders.refund");
  assert.equal(permissionForApiPath("/api/admin/orders/o1/void", "POST"), "orders.void");
  assert.equal(permissionForApiPath("/api/admin/purchase-orders/p1/approve", "POST"), "purchase_orders.approve");
  assert.equal(permissionForApiPath("/api/admin/customers/export", "POST"), "customers.export");
  // Non-admin and unmapped admin routes get no permission gate.
  assert.equal(permissionForApiPath("/api/public/menu", "GET"), null);
  assert.equal(permissionForApiPath("/api/admin/some-future-thing", "GET"), null);
});

test("irreversible GDPR erasure is not grantable via a mid-tier key", () => {
  // Export maps to a mid-tier capability...
  assert.equal(permissionForApiPath("/api/admin/gdpr/export", "GET"), "customers.export");
  // ...but delete falls back to null so the owner-only role gate stands.
  assert.equal(permissionForApiPath("/api/admin/gdpr/delete", "POST"), null);
});

test("userHasPermission gates off the withAdmin auth context (no DB read)", () => {
  const owner = { role: "owner" as const };
  assert.equal(userHasPermission(owner, "settings.edit"), true);

  // Role-default manager keeps the manager preset (can refund, can't edit users).
  const manager = { role: "manager" as const };
  assert.equal(userHasPermission(manager, "orders.refund"), true);
  assert.equal(userHasPermission(manager, "users.edit"), false);

  // A custom staff grant is authoritative — only what was granted counts.
  const customStaff = { role: "staff" as const, permissions: ["cash.view"] };
  assert.equal(userHasPermission(customStaff, "cash.view"), true);
  assert.equal(userHasPermission(customStaff, "cash.manage"), false);
});
