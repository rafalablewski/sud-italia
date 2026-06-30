/**
 * Surface → data-source map. Each operator surface either renders a bespoke
 * screen (KDS, Orders, Dashboard), pulls a live `/api/v1/admin/*` collection
 * (rendered generically by `<DataSurface>`), or — for the two Rule #9/#11 content
 * pages with no data source — shows an honest parity scaffold. No mock data:
 * a surface is either backed by a real endpoint or clearly marked as a scaffold.
 *
 * `kind`:
 *   - "kds"        → the full Kitchen Display board
 *   - "orders"     → the live orders board (operator order spine)
 *   - "dashboard"  → the sales/cost/profit summary rollup
 *   - "data"       → generic live collection from `endpoint` (+ optional `subtitle` key)
 *   - "scaffold"   → no data source (SOC 2, Capabilities) — honest parity page
 */

export type SurfaceKind = "kds" | "orders" | "dashboard" | "data" | "scaffold";

export interface SurfaceConfig {
  kind: SurfaceKind;
  endpoint?: string;
  /** Field on each row to use as the primary line (falls back to name/label/title/id). */
  titleKey?: string;
  /** Field(s) on each row to show as a secondary line. */
  subtitleKeys?: string[];
}

export const SURFACE_CONFIG: Record<string, SurfaceConfig> = {
  // Core
  "/core/pos": { kind: "data", endpoint: "/admin/pos/tabs", titleKey: "label", subtitleKeys: ["status", "total"] },
  "/core/kds": { kind: "kds" },
  "/core/orders": { kind: "orders" },
  "/core/guest": { kind: "data", endpoint: "/admin/loyalty", titleKey: "name", subtitleKeys: ["phone", "points", "tier"] },
  "/core/service": { kind: "data", endpoint: "/admin/floor/tables", titleKey: "number", subtitleKeys: ["zone", "seats", "status"] },

  // Overview
  "/admin/welcome": { kind: "dashboard" },
  "/admin": { kind: "dashboard" },
  "/admin/orders": { kind: "orders" },
  "/admin/alerts": { kind: "data", endpoint: "/admin/alerts", titleKey: "title", subtitleKeys: ["severity", "message"] },
  "/admin/comms/tasks": { kind: "data", endpoint: "/admin/tasks", titleKey: "title", subtitleKeys: ["status", "assignee", "dueAt"] },
  "/admin/comms/announcements": { kind: "data", endpoint: "/admin/announcements", titleKey: "title", subtitleKeys: ["body", "createdAt"] },

  // Operations
  "/admin/menu": { kind: "data", endpoint: "/admin/menu", titleKey: "name", subtitleKeys: ["category", "price", "available"] },
  "/admin/recipes": { kind: "data", endpoint: "/admin/recipes", titleKey: "name", subtitleKeys: ["yield", "ingredientCount"] },
  "/admin/haccp": { kind: "data", endpoint: "/admin/haccp", titleKey: "label", subtitleKeys: ["tempC", "recordedAt", "status"] },
  "/admin/waste": { kind: "data", endpoint: "/admin/waste", titleKey: "item", subtitleKeys: ["quantity", "reason", "recordedAt"] },
  "/admin/handover": { kind: "data", endpoint: "/admin/handover", titleKey: "shift", subtitleKeys: ["outgoingManager", "createdAt"] },

  // Inventory
  "/admin/inventory": { kind: "data", endpoint: "/admin/inventory", titleKey: "name", subtitleKeys: ["onHand", "par", "unit"] },
  "/admin/suppliers": { kind: "data", endpoint: "/admin/suppliers", titleKey: "name", subtitleKeys: ["leadTimeDays", "contact"] },
  "/admin/purchase-orders": { kind: "data", endpoint: "/admin/purchase-orders", titleKey: "id", subtitleKeys: ["supplier", "status", "total"] },

  // People
  "/admin/staff": { kind: "data", endpoint: "/admin/staff", titleKey: "name", subtitleKeys: ["role", "status"] },
  "/admin/schedule": { kind: "data", endpoint: "/admin/schedule", titleKey: "role", subtitleKeys: ["staff", "start", "status"] },

  // Customers
  "/admin/customers": { kind: "data", endpoint: "/admin/customers", titleKey: "name", subtitleKeys: ["phone", "orderCount", "points"] },
  "/admin/corporate": { kind: "data", endpoint: "/admin/corporate", titleKey: "name", subtitleKeys: ["contact", "status"] },
  "/admin/feedback": { kind: "data", endpoint: "/admin/feedback", titleKey: "customerName", subtitleKeys: ["rating", "comment"] },
  "/admin/surveys": { kind: "data", endpoint: "/admin/surveys", titleKey: "title", subtitleKeys: ["responses", "score"] },

  // Finance
  "/admin/reports": { kind: "dashboard" },
  "/admin/cash": { kind: "data", endpoint: "/admin/cash", titleKey: "label", subtitleKeys: ["amount", "recordedAt"] },
  "/admin/business-costs": { kind: "data", endpoint: "/admin/business-costs", titleKey: "name", subtitleKeys: ["category", "amount", "cadence"] },
  "/admin/simulation": { kind: "data", endpoint: "/admin/simulation", titleKey: "label", subtitleKeys: ["value"] },

  // Growth
  "/admin/growth": { kind: "data", endpoint: "/admin/campaigns", titleKey: "name", subtitleKeys: ["channel", "status"] },
  "/admin/upsell": { kind: "data", endpoint: "/admin/settings", titleKey: "key", subtitleKeys: ["value"] },
  "/admin/crosssell": { kind: "data", endpoint: "/admin/settings", titleKey: "key", subtitleKeys: ["value"] },
  "/admin/scheduled-bundles": { kind: "data", endpoint: "/admin/scheduled-bundles", titleKey: "name", subtitleKeys: ["price", "window"] },
  "/admin/events": { kind: "data", endpoint: "/admin/events", titleKey: "title", subtitleKeys: ["status", "date", "partySize"] },
  "/admin/integrations": { kind: "data", endpoint: "/admin/settings", titleKey: "key", subtitleKeys: ["value"] },

  // Intelligence
  "/admin/locations": { kind: "data", endpoint: "/admin/locations", titleKey: "name", subtitleKeys: ["city", "status"] },
  "/admin/locations/manage": { kind: "data", endpoint: "/admin/manage-locations", titleKey: "name", subtitleKeys: ["city", "status"] },
  "/admin/menu-engineering": { kind: "data", endpoint: "/admin/menu-engineering", titleKey: "name", subtitleKeys: ["klass", "margin", "popularity"] },
  "/admin/agent-hq": { kind: "data", endpoint: "/admin/agent-hq", titleKey: "name", subtitleKeys: ["status", "spendToday"] },
  "/admin/ai": { kind: "data", endpoint: "/admin/insights", titleKey: "title", subtitleKeys: ["summary"] },
  "/admin/ai/agent": { kind: "scaffold" },
  "/admin/expansion": { kind: "data", endpoint: "/admin/expansion", titleKey: "name", subtitleKeys: ["score", "city"] },

  // System
  "/admin/users": { kind: "data", endpoint: "/admin/users", titleKey: "name", subtitleKeys: ["email", "role", "scope"] },
  "/admin/permissions": { kind: "data", endpoint: "/admin/permissions", titleKey: "role", subtitleKeys: ["grants"] },
  "/admin/compliance": { kind: "data", endpoint: "/admin/compliance", titleKey: "label", subtitleKeys: ["expiresAt", "status"] },
  "/admin/regulatory-compliance": { kind: "data", endpoint: "/admin/regulatory", titleKey: "label", subtitleKeys: ["zone", "status"] },
  "/admin/soc2": { kind: "scaffold" },
  "/admin/audit-log": { kind: "data", endpoint: "/admin/audit-log", titleKey: "action", subtitleKeys: ["actor", "at"] },
  "/admin/capabilities": { kind: "scaffold" },
  "/admin/payments": { kind: "data", endpoint: "/admin/settings", titleKey: "key", subtitleKeys: ["value"] },
  "/admin/qr-ordering": { kind: "data", endpoint: "/admin/settings", titleKey: "key", subtitleKeys: ["value"] },
  "/admin/currency": { kind: "data", endpoint: "/admin/settings", titleKey: "key", subtitleKeys: ["value"] },
  "/admin/languages": { kind: "data", endpoint: "/admin/settings", titleKey: "key", subtitleKeys: ["value"] },
  "/admin/settings": { kind: "data", endpoint: "/admin/settings", titleKey: "key", subtitleKeys: ["value"] },
};

export function configForPath(path: string): SurfaceConfig {
  return SURFACE_CONFIG[path] ?? { kind: "scaffold" };
}
