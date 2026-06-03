/**
 * Action-level permission catalog + resolution (granular RBAC).
 *
 * Client-safe leaf — like admin-roles.ts it imports nothing server-only, so the
 * nav config, the sidebar filter, the AdminShell page guard, and the Users
 * editor (all `"use client"`) can import the catalog + maps, while the server
 * side (admin-auth.ts, api-middleware.ts) imports the same resolver. One source
 * of truth gates the UI and the API identically.
 *
 * Model (CLAUDE rule for RBAC):
 *  - The 5 roles still exist, but a permission is the unit of authority.
 *  - Each non-owner user can carry an explicit `permissions` array — when set
 *    it is the authoritative, fully-custom grant (role rank is ignored for that
 *    user). When absent the user falls back to their role's default preset, so
 *    every pre-existing account keeps working unchanged.
 *  - `owner` (and the legacy shared "admin" session) is always all-access — the
 *    escape hatch so an operator can never revoke their own ability to fix
 *    permissions and lock themselves out.
 */

import type { AdminRole } from "@/lib/admin-roles";

export interface PermissionDef {
  key: string;
  label: string;
  description: string;
}

export interface PermissionGroup {
  id: string;
  label: string;
  permissions: readonly PermissionDef[];
}

/**
 * The catalog. Grouped by operational domain so the editor renders one card
 * per group. `as const` makes every `key` a string literal, which we fold into
 * the `PermissionKey` union below so a typo anywhere (route map, role preset,
 * editor) fails to compile instead of silently never matching.
 */
export const PERMISSION_GROUPS = [
  {
    id: "orders",
    label: "Orders & service",
    permissions: [
      { key: "orders.view", label: "View orders", description: "See the live order queue and order history." },
      { key: "orders.edit", label: "Update orders", description: "Advance status, edit items, reassign fulfilment." },
      { key: "orders.refund", label: "Refund orders", description: "Issue refunds (still bounded by the refund ceiling in Settings)." },
      { key: "orders.void", label: "Void / cancel orders", description: "Cancel or void an order before it is fulfilled." },
      { key: "pos.view", label: "Open POS", description: "Access the point-of-sale till." },
      { key: "pos.sell", label: "Take payment (POS)", description: "Ring up a sale and close a tab." },
      { key: "pos.discount", label: "Apply POS discounts", description: "Comp or discount a line on the till." },
      { key: "kds.view", label: "Kitchen display", description: "See and bump tickets on the KDS." },
      { key: "service.view", label: "View service / floor", description: "See the floor plan, tables and dine-in slots." },
      { key: "service.edit", label: "Manage service / floor", description: "Book slots, assign tables, edit reservations." },
    ],
  },
  {
    id: "guests",
    label: "Guests & customers",
    permissions: [
      { key: "guest.view", label: "View guest hub", description: "See the unified CRM / loyalty / concierge inbox." },
      { key: "guest.edit", label: "Edit guests", description: "Update guest profiles, notes and concierge threads." },
      { key: "guest.loyalty_adjust", label: "Adjust loyalty points", description: "Manually grant or deduct loyalty points." },
      { key: "customers.view", label: "View customers", description: "Look up customer records during phone orders." },
      { key: "customers.edit", label: "Edit customers", description: "Edit customer details and notes." },
      { key: "customers.export", label: "Export / erase customer data", description: "GDPR export and right-to-erasure operations." },
      { key: "corporate.view", label: "View corporate accounts", description: "See corporate / B2B account list." },
      { key: "corporate.edit", label: "Manage corporate accounts", description: "Edit corporate accounts and invoicing terms." },
      { key: "feedback.view", label: "View feedback", description: "Read customer feedback and survey results." },
      { key: "feedback.respond", label: "Respond to feedback", description: "Reply to and resolve feedback items." },
    ],
  },
  {
    id: "menu",
    label: "Menu & kitchen",
    permissions: [
      { key: "menu.view", label: "View menu", description: "See the menu and per-location pricing." },
      { key: "menu.edit", label: "Edit menu", description: "Add / edit dishes, prices and availability." },
      { key: "recipes.view", label: "View recipes", description: "See the chain-wide recipe board and ingredients." },
      { key: "recipes.edit", label: "Edit recipes", description: "Edit recipe formulas and the ingredient catalog." },
      { key: "haccp.view", label: "HACCP log", description: "Record and review temperature / safety checks." },
      { key: "waste.view", label: "Waste log", description: "Record and review waste entries." },
      { key: "handover.view", label: "View shift handover", description: "Read the shift handover notes." },
      { key: "handover.edit", label: "Write shift handover", description: "Author and close shift handover notes." },
    ],
  },
  {
    id: "inventory",
    label: "Inventory & purchasing",
    permissions: [
      { key: "inventory.view", label: "View stock", description: "See stock levels and low-stock alerts." },
      { key: "inventory.adjust", label: "Adjust stock", description: "Record counts, movements and corrections." },
      { key: "suppliers.view", label: "View suppliers", description: "See supplier records and catalogs." },
      { key: "suppliers.edit", label: "Manage suppliers", description: "Edit supplier records and terms." },
      { key: "purchase_orders.view", label: "View purchase orders", description: "See draft and sent purchase orders." },
      { key: "purchase_orders.edit", label: "Edit purchase orders", description: "Create and edit purchase orders." },
      { key: "purchase_orders.approve", label: "Approve purchase orders", description: "Send / approve a PO that commits spend." },
    ],
  },
  {
    id: "people",
    label: "People",
    permissions: [
      { key: "staff.view", label: "View staff", description: "See the staff roster and time punches." },
      { key: "staff.edit", label: "Manage staff", description: "Edit staff records, pay rates and punches." },
      { key: "staff.hire", label: "Hire & provision logins", description: "Hire employees and create their staff/kitchen login accounts (own location only)." },
      { key: "schedule.view", label: "View schedule", description: "See the published shift schedule." },
      { key: "schedule.edit", label: "Edit schedule", description: "Build and publish shift schedules." },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    permissions: [
      { key: "reports.view", label: "View reports", description: "See sales, cohort, LTV/CAC and finance reports." },
      { key: "reports.export", label: "Export reports", description: "Download report data (CSV / JSON)." },
      { key: "cash.view", label: "View cash sessions", description: "See cash drawers, drops and reconciliations." },
      { key: "cash.manage", label: "Manage cash", description: "Open / close drawers, record drops and counts." },
      { key: "business_costs.view", label: "View business costs", description: "See the operating-expense ledger." },
      { key: "business_costs.edit", label: "Edit business costs", description: "Add / edit operating-expense lines." },
      { key: "simulation.view", label: "Calculator / simulator", description: "Use the what-if financial calculator." },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    permissions: [
      { key: "growth.view", label: "View campaigns", description: "See growth campaigns." },
      { key: "growth.edit", label: "Manage campaigns", description: "Create and edit growth campaigns." },
      { key: "upsell.view", label: "View upsell", description: "See upsell configuration." },
      { key: "upsell.edit", label: "Manage upsell", description: "Edit upsell rules." },
      { key: "crosssell.view", label: "View cross-sell", description: "See cross-sell configuration." },
      { key: "crosssell.edit", label: "Manage cross-sell", description: "Edit cross-sell suggestions." },
      { key: "bundles.view", label: "View bundles", description: "See scheduled bundle deals." },
      { key: "bundles.edit", label: "Manage bundles", description: "Create and schedule bundle deals." },
      { key: "truck.view", label: "View truck ops", description: "See truck routes and events." },
      { key: "truck.edit", label: "Manage truck ops", description: "Edit truck routes and schedules." },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    permissions: [
      { key: "locations.view", label: "Multi-location view", description: "See the cross-location HQ rollups." },
      { key: "locations.manage", label: "Manage locations", description: "Add / edit locations." },
      { key: "menu_engineering.view", label: "Menu engineering", description: "Use the menu-engineering board." },
      { key: "insights.view", label: "AI insights", description: "See the AI insights surface." },
      { key: "expansion.view", label: "View expansion", description: "See the expansion planner." },
      { key: "expansion.edit", label: "Edit expansion", description: "Edit expansion checklists and plans." },
    ],
  },
  {
    id: "system",
    label: "System & access",
    permissions: [
      { key: "users.view", label: "View users & roles", description: "See the admin-account list." },
      { key: "users.edit", label: "Manage users & roles", description: "Create, edit, delete admin accounts and permissions." },
      { key: "compliance.view", label: "View compliance", description: "See compliance, regulatory and SOC 2 surfaces." },
      { key: "compliance.edit", label: "Edit compliance", description: "Edit compliance items and regulatory disclosures." },
      { key: "audit.view", label: "View audit log", description: "Read the append-only audit trail." },
      { key: "capabilities.view", label: "View capabilities", description: "See the deployed-capabilities ledger." },
      { key: "settings.view", label: "View settings", description: "Read chain-wide settings, currency and languages." },
      { key: "settings.edit", label: "Edit settings", description: "Change chain-wide settings, currency and languages." },
    ],
  },
] as const;

export type PermissionKey =
  (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_GROUPS.flatMap(
  (g) => g.permissions.map((p) => p.key),
);

const PERMISSION_KEY_SET = new Set<string>(ALL_PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEY_SET.has(value);
}

// --- Role default presets -------------------------------------------------
//
// These seed the editor ("reset to role defaults") and back-stop any account
// that has no explicit `permissions` array. They are intentionally close to
// the legacy role-rank behaviour so the upgrade is a no-op for existing users.

const KITCHEN_PERMS: PermissionKey[] = [
  "kds.view", "haccp.view", "waste.view", "inventory.view",
  "recipes.view", "menu.view", "handover.view",
];

const STAFF_PERMS: PermissionKey[] = [
  "orders.view", "orders.edit", "pos.view", "pos.sell", "kds.view",
  "service.view", "service.edit", "guest.view", "customers.view",
  "inventory.view", "haccp.view", "waste.view", "handover.view",
  "menu.view", "feedback.view",
];

// Manager = everything except the system-administration + cross-location keys
// that have always been owner-only.
const MANAGER_EXCLUDE = new Set<PermissionKey>([
  "users.view", "users.edit", "settings.view", "settings.edit",
  "compliance.edit", "locations.view", "locations.manage",
  "expansion.view", "expansion.edit",
]);
const MANAGER_PERMS: PermissionKey[] = ALL_PERMISSION_KEYS.filter(
  (k) => !MANAGER_EXCLUDE.has(k),
);

// Franchisee (rank 70) sits above manager: same operational grant plus the
// cross-location read surfaces, but still no user/settings administration.
const FRANCHISEE_PERMS: PermissionKey[] = [
  ...MANAGER_PERMS, "locations.view", "expansion.view", "settings.view",
];

export const ROLE_DEFAULT_PERMISSIONS: Record<AdminRole, PermissionKey[]> = {
  owner: [...ALL_PERMISSION_KEYS],
  franchisee: FRANCHISEE_PERMS,
  manager: MANAGER_PERMS,
  staff: STAFF_PERMS,
  kitchen: KITCHEN_PERMS,
};

// --- Resolution -----------------------------------------------------------

export interface EffectivePermissions {
  /** The effective permission keys for this user. */
  keys: Set<PermissionKey>;
  /** True for owner / legacy shared session — unrestricted, all-access. */
  all: boolean;
  /**
   * True when the user carries an explicit custom grant. For these users
   * permissions are authoritative and override role-rank gating; for everyone
   * else the legacy role-rank gate still applies.
   */
  custom: boolean;
}

export function resolveEffectivePermissions(user: {
  role: AdminRole;
  permissions?: readonly string[] | null;
  id?: string;
}): EffectivePermissions {
  // Owner (and the legacy password-only "admin" session) is always all-access.
  if (user.role === "owner" || user.id === "admin") {
    return { keys: new Set(ALL_PERMISSION_KEYS), all: true, custom: false };
  }
  if (Array.isArray(user.permissions)) {
    const keys = new Set<PermissionKey>(
      user.permissions.filter(isPermissionKey),
    );
    return { keys, all: false, custom: true };
  }
  return {
    keys: new Set(ROLE_DEFAULT_PERMISSIONS[user.role]),
    all: false,
    custom: false,
  };
}

export function effectiveHas(
  eff: EffectivePermissions,
  key: PermissionKey,
): boolean {
  return eff.all || eff.keys.has(key);
}

/**
 * Convenience for route handlers that already hold the resolved `user` from
 * `withAdmin`'s auth context — checks a single permission without a second
 * cookie/DB read. Use for explicit, defence-in-depth action gates (e.g. a
 * refund handler asserting `orders.refund` at the call site).
 */
export function userHasPermission(
  user: { role: AdminRole; permissions?: readonly string[] | null; id?: string },
  key: PermissionKey,
): boolean {
  return effectiveHas(resolveEffectivePermissions(user), key);
}

// --- Path → permission maps ----------------------------------------------
//
// One mapping for admin pages (nav filter + client page guard) and one for
// the admin API (server gate in withAdmin). Both return `null` for anything
// unmapped — `null` means "no permission gate", which keeps the dashboard and
// any infra route reachable and makes the gate safe-by-default (an unmapped
// route falls back to the existing role-rank check, never wide open).

export function permissionForAdminPage(pathname: string): PermissionKey | null {
  // The admin pages are served under role prefixes too (/manager/*,
  // /franchisee/* rewrite onto /admin/* — see src/lib/admin-base.ts). Normalise
  // back to the canonical /admin form so one map gates every alias.
  const p = pathname.replace(/^\/(?:manager|franchisee)(?=\/|$)/, "/admin");
  const is = (base: string) => p === base || p.startsWith(base + "/");
  // Order matters where one path is a prefix of another's base.
  if (is("/admin/menu-engineering")) return "menu_engineering.view";
  if (is("/admin/orders")) return "orders.view";
  if (is("/core/pos")) return "pos.view";
  if (is("/core/kds")) return "kds.view";
  if (is("/core/guest")) return "guest.view";
  if (is("/core/service")) return "service.view";
  if (is("/admin/menu")) return "menu.view";
  if (is("/admin/recipes")) return "recipes.view";
  if (is("/admin/haccp")) return "haccp.view";
  if (is("/admin/waste")) return "waste.view";
  if (is("/admin/handover")) return "handover.view";
  if (is("/admin/inventory")) return "inventory.view";
  if (is("/admin/suppliers")) return "suppliers.view";
  if (is("/admin/purchase-orders")) return "purchase_orders.view";
  if (is("/admin/staff")) return "staff.view";
  if (is("/admin/schedule")) return "schedule.view";
  if (is("/admin/customers")) return "customers.view";
  if (is("/admin/corporate")) return "corporate.view";
  if (is("/admin/feedback")) return "feedback.view";
  if (is("/admin/surveys")) return "feedback.view";
  if (is("/admin/reports")) return "reports.view";
  if (is("/admin/cash")) return "cash.view";
  if (is("/admin/business-costs")) return "business_costs.view";
  if (is("/admin/simulation")) return "simulation.view";
  if (is("/admin/growth")) return "growth.view";
  if (is("/admin/upsell")) return "upsell.view";
  if (is("/admin/crosssell")) return "crosssell.view";
  if (is("/admin/scheduled-bundles")) return "bundles.view";
  if (is("/admin/truck")) return "truck.view";
  if (is("/admin/locations")) return "locations.view";
  if (is("/admin/expansion")) return "expansion.view";
  if (is("/admin/ai")) return "insights.view";
  if (is("/admin/users")) return "users.view";
  if (is("/admin/permissions")) return "users.view";
  // Owner-tier "rules" pages — gated by the stronger compliance.edit so a bare
  // compliance.view (held by managers) doesn't surface them; /admin/compliance
  // (the manager-tier calendar) keeps compliance.view.
  if (is("/admin/regulatory-compliance")) return "compliance.edit";
  if (is("/admin/soc2")) return "compliance.edit";
  if (is("/admin/compliance")) return "compliance.view";
  if (is("/admin/audit-log")) return "audit.view";
  if (is("/admin/capabilities")) return "capabilities.view";
  if (is("/admin/currency")) return "settings.view";
  if (is("/admin/languages")) return "settings.view";
  if (is("/admin/settings")) return "settings.view";
  return null;
}

export function permissionForApiPath(
  pathname: string,
  method: string,
): PermissionKey | null {
  if (!pathname.startsWith("/api/admin/")) return null;
  const write = method !== "GET" && method !== "HEAD";
  const rest = pathname.slice("/api/admin/".length);
  const seg = rest.split("/")[0];
  const sub = rest.toLowerCase();
  switch (seg) {
    case "users":
      return write ? "users.edit" : "users.view";
    case "menu":
      return write ? "menu.edit" : "menu.view";
    case "recipes":
    case "ingredients":
      return write ? "recipes.edit" : "recipes.view";
    case "inventory":
    case "stock":
      return write ? "inventory.adjust" : "inventory.view";
    case "suppliers":
      return write ? "suppliers.edit" : "suppliers.view";
    case "purchase-orders":
      if (sub.includes("approve") || sub.includes("send")) return "purchase_orders.approve";
      return write ? "purchase_orders.edit" : "purchase_orders.view";
    case "staff":
      return write ? "staff.edit" : "staff.view";
    case "schedule":
    case "shifts":
      return write ? "schedule.edit" : "schedule.view";
    case "customers":
      if (sub.includes("export") || sub.includes("gdpr") || sub.includes("erase")) return "customers.export";
      return write ? "customers.edit" : "customers.view";
    case "gdpr":
      // Irreversible erasure stays owner-only — return null so withAdmin falls
      // back to the route's owner role gate instead of a mid-tier grant.
      if (sub.includes("delete") || sub.includes("erase")) return null;
      return "customers.export";
    case "corporate":
      return write ? "corporate.edit" : "corporate.view";
    case "feedback":
      return write ? "feedback.respond" : "feedback.view";
    case "reports":
      if (sub.includes("export")) return "reports.export";
      return "reports.view";
    case "cash":
      return write ? "cash.manage" : "cash.view";
    case "business-costs":
      return write ? "business_costs.edit" : "business_costs.view";
    case "settings":
      return write ? "settings.edit" : "settings.view";
    case "currency":
    case "languages":
      return write ? "settings.edit" : "settings.view";
    case "compliance":
      return write ? "compliance.edit" : "compliance.view";
    case "regulatory-compliance":
    case "soc2":
      // Owner-tier surfaces — read or write both require compliance.edit.
      return "compliance.edit";
    case "audit-log":
      return "audit.view";
    case "orders":
      if (sub.includes("refund")) return "orders.refund";
      if (sub.includes("void") || sub.includes("cancel")) return "orders.void";
      return write ? "orders.edit" : "orders.view";
    case "pos":
      if (sub.includes("discount")) return "pos.discount";
      return write ? "pos.sell" : "pos.view";
    case "kds":
      return "kds.view";
    case "guest":
    case "loyalty":
    case "crm":
      if (sub.includes("points") || sub.includes("loyalty"))
        return write ? "guest.loyalty_adjust" : "guest.view";
      return write ? "guest.edit" : "guest.view";
    case "service":
    case "floor":
    case "slots":
    case "reservations":
      return write ? "service.edit" : "service.view";
    case "growth":
      return write ? "growth.edit" : "growth.view";
    case "upsell":
      return write ? "upsell.edit" : "upsell.view";
    case "crosssell":
      return write ? "crosssell.edit" : "crosssell.view";
    case "scheduled-bundles":
      return write ? "bundles.edit" : "bundles.view";
    case "truck":
      return write ? "truck.edit" : "truck.view";
    case "locations":
      return write ? "locations.manage" : "locations.view";
    case "expansion":
      return write ? "expansion.edit" : "expansion.view";
    case "menu-engineering":
      return "menu_engineering.view";
    case "ai":
      return "insights.view";
    default:
      return null;
  }
}
