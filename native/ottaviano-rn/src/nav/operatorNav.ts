import { ROLE_RANK, rankForRole, type AdminRole } from "./roles";
import { OPERATOR_NAV_DATA, type GeneratedNavItem, type SurfaceStatus } from "./operatorNav.generated";

/**
 * The operator (OttavianoKDS) information architecture — a verifiably 1:1 mirror
 * of the web admin nav (`src/admin-v3/nav.config.ts`) plus the Core surfaces
 * (`src/core/routes.ts`), 54 surfaces across 10 sections. The structure, roles,
 * blurbs and live/scaffold state are GENERATED into `operatorNav.generated.ts`
 * from the web source (CI's `npm run check:native` fails on drift). This file
 * decorates each surface with its native presentation icon (a MaterialCommunityIcons
 * name, no web equivalent) and exposes the role-rank filter + lookup helpers.
 *
 * `path` is the canonical web href, used as the native route key
 * (`/operator/surface/<path>`). `status`: `live` surfaces render real `/api/v1`
 * data; `scaffold` surfaces (SOC 2, Capabilities) are the two hardcoded TSX
 * content pages with no data source — honest parity scaffolds by design.
 */

export type { SurfaceStatus };

export interface OperatorNavItem extends GeneratedNavItem {
  icon: string;
}

export interface OperatorNavSection {
  id: string;
  label: string;
  items: OperatorNavItem[];
}

/** path → MaterialCommunityIcons glyph (the only hand-maintained presentation bit). */
const ICONS: Record<string, string> = {
  "/core/pos": "cash-register",
  "/core/kds": "fire",
  "/core/orders": "format-list-bulleted",
  "/core/guest": "account-group",
  "/core/service": "silverware-fork-knife",
  "/admin/welcome": "star-four-points",
  "/admin": "view-dashboard",
  "/admin/orders": "clipboard-list",
  "/admin/alerts": "bell",
  "/admin/comms/tasks": "checkbox-marked-outline",
  "/admin/comms/announcements": "bullhorn",
  "/admin/menu": "silverware-variant",
  "/admin/recipes": "flask",
  "/admin/haccp": "thermometer",
  "/admin/waste": "trash-can",
  "/admin/handover": "clipboard-check",
  "/admin/inventory": "package-variant-closed",
  "/admin/suppliers": "office-building",
  "/admin/purchase-orders": "file-document-multiple",
  "/admin/staff": "card-account-details",
  "/admin/schedule": "calendar-clock",
  "/admin/customers": "account-circle",
  "/admin/corporate": "briefcase",
  "/admin/feedback": "comment-multiple",
  "/admin/surveys": "gauge",
  "/admin/reports": "chart-bar",
  "/admin/cash": "cash-multiple",
  "/admin/business-costs": "wallet",
  "/admin/simulation": "chart-line",
  "/admin/growth": "send",
  "/admin/upsell": "arrow-up-bold-circle",
  "/admin/crosssell": "star-shooting",
  "/admin/scheduled-bundles": "calendar",
  "/admin/events": "calendar-plus",
  "/admin/integrations": "power-plug",
  "/admin/locations": "map",
  "/admin/locations/manage": "map-marker",
  "/admin/menu-engineering": "silverware-fork-knife",
  "/admin/agent-hq": "robot",
  "/admin/ai": "brain",
  "/admin/ai/agent": "robot-happy",
  "/admin/expansion": "map-search",
  "/admin/users": "shield-check",
  "/admin/permissions": "grid",
  "/admin/compliance": "calendar-check",
  "/admin/regulatory-compliance": "shield-half-full",
  "/admin/soc2": "lock-check",
  "/admin/audit-log": "history",
  "/admin/capabilities": "layers",
  "/admin/payments": "credit-card",
  "/admin/qr-ordering": "qrcode",
  "/admin/currency": "cash",
  "/admin/languages": "translate",
  "/admin/settings": "cog",
};

export const OPERATOR_NAV: OperatorNavSection[] = OPERATOR_NAV_DATA.map((section) => ({
  id: section.id,
  label: section.label,
  items: section.items.map((item) => ({ ...item, icon: ICONS[item.path] ?? "circle-small" })),
}));

export const ALL_SURFACES: OperatorNavItem[] = OPERATOR_NAV.flatMap((s) => s.items);

export function findSurface(path: string): OperatorNavItem | undefined {
  const norm = path.startsWith("/") ? path : `/${path}`;
  return ALL_SURFACES.find((i) => i.path === norm);
}

/** Role-rank gate — the native analogue of web `filterNavForRoleV3` (rank floor;
 *  the granular permission matrix is an operator-token concern resolved server-side). */
export function filterNavForRole(role: string | null): OperatorNavSection[] {
  if (!role) return [];
  const rank = rankForRole(role);
  return OPERATOR_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => ROLE_RANK[item.requiredRole] <= rank),
  })).filter((section) => section.items.length > 0);
}
