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
