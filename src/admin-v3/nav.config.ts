import {
  LayoutDashboard,
  ClipboardList,
  ListTodo,
  Receipt,
  ChefHat,
  Contact,
  CalendarCheck2,
  UtensilsCrossed,
  FlaskConical,
  Thermometer,
  Trash2,
  ClipboardCheck,
  Boxes,
  Building2,
  PackageSearch,
  HardHat,
  CalendarRange,
  Users,
  MessageSquare,
  Gauge,
  BarChart3,
  Banknote,
  Wallet,
  CreditCard,
  Plug,
  QrCode,
  LineChart,
  Rocket,
  TrendingUp,
  Sparkles,
  Calendar,
  CalendarDays,
  Map,
  MapPin,
  Brain,
  Bell,
  Megaphone,
  Bot,
  ShieldCheck,
  Grid3x3,
  History,
  Layers,
  Coins,
  Languages,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { ROLE_RANK, type AdminRole } from "@/lib/admin-roles";
import { permissionForAdminPage } from "@/lib/permissions";

// v3 nav — owned by the v3 tree (the implementation behind the canonical
// `/admin` HQ). Hrefs are rooted at `/admin`; the shell re-roots them onto
// `/manager` / `/franchisee` per the URL the role navigates under. Core
// (POS/KDS/Guest/Service) stays on its own /core routes and is intentionally
// absent here — v3 never rebuilds Core.

export interface NavItemV3 {
  href: string;
  label: string;
  icon: LucideIcon;
  requiredRole?: AdminRole;
  /** When true, route isn't migrated to v3 yet (renders muted, kept for map). */
  pending?: boolean;
}

export interface NavSectionV3 {
  id: string;
  label: string;
  items: NavItemV3[];
}

const P = "/admin";

export const NAV_SECTIONS_V3: NavSectionV3[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: `${P}/welcome`, label: "Welcome", icon: Sparkles },
      { href: `${P}`, label: "Dashboard", icon: LayoutDashboard },
      { href: `${P}/orders`, label: "Orders", icon: ClipboardList, requiredRole: "staff" },
      { href: `${P}/alerts`, label: "Alerts", icon: Bell, requiredRole: "staff" },
      { href: `${P}/comms/tasks`, label: "Tasks", icon: ListTodo, requiredRole: "manager" },
      { href: `${P}/comms/announcements`, label: "Announcements", icon: Megaphone, requiredRole: "manager" },
    ],
  },
  {
    id: "core",
    label: "Core",
    items: [
      { href: "/core/pos", label: "POS", icon: Receipt, requiredRole: "staff" },
      { href: "/core/kds", label: "Kitchen Display", icon: ChefHat, requiredRole: "kitchen" },
      { href: "/core/guest", label: "Guest Engagement", icon: Contact, requiredRole: "staff" },
      { href: "/core/service", label: "Service", icon: CalendarCheck2, requiredRole: "staff" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: `${P}/menu`, label: "Menu", icon: UtensilsCrossed, requiredRole: "manager" },
      { href: `${P}/recipes`, label: "Recipes", icon: FlaskConical, requiredRole: "manager" },
      { href: `${P}/haccp`, label: "HACCP log", icon: Thermometer, requiredRole: "staff" },
      { href: `${P}/waste`, label: "Waste log", icon: Trash2, requiredRole: "staff" },
      { href: `${P}/handover`, label: "Shift handover", icon: ClipboardCheck, requiredRole: "manager" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    items: [
      { href: `${P}/inventory`, label: "Stock", icon: Boxes, requiredRole: "staff" },
      { href: `${P}/suppliers`, label: "Suppliers", icon: Building2, requiredRole: "manager" },
      { href: `${P}/purchase-orders`, label: "Purchase orders", icon: PackageSearch, requiredRole: "manager" },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [
      { href: `${P}/staff`, label: "Staff", icon: HardHat, requiredRole: "manager" },
      { href: `${P}/schedule`, label: "Schedule", icon: CalendarRange, requiredRole: "manager" },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    items: [
      { href: `${P}/customers`, label: "Customers", icon: Users, requiredRole: "staff" },
      { href: `${P}/corporate`, label: "Corporate", icon: Building2, requiredRole: "manager" },
      { href: `${P}/feedback`, label: "Feedback", icon: MessageSquare, requiredRole: "manager" },
      { href: `${P}/surveys`, label: "Pulse surveys", icon: Gauge, requiredRole: "manager" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { href: `${P}/reports`, label: "Reports", icon: BarChart3, requiredRole: "manager" },
      { href: `${P}/cash`, label: "Cash", icon: Banknote, requiredRole: "manager" },
      { href: `${P}/business-costs`, label: "Business costs", icon: Wallet, requiredRole: "manager" },
      { href: `${P}/simulation`, label: "Calculator", icon: LineChart, requiredRole: "manager" },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    items: [
      { href: `${P}/growth`, label: "Campaigns", icon: Rocket, requiredRole: "manager" },
      { href: `${P}/upsell`, label: "Upsell", icon: TrendingUp, requiredRole: "manager" },
      { href: `${P}/crosssell`, label: "Cross-sell", icon: Sparkles, requiredRole: "manager" },
      { href: `${P}/scheduled-bundles`, label: "Scheduled bundles", icon: Calendar, requiredRole: "manager" },
      { href: `${P}/truck`, label: "Events & bookings", icon: CalendarDays, requiredRole: "manager" },
      { href: `${P}/integrations`, label: "Integrations", icon: Plug, requiredRole: "manager" },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    items: [
      { href: `${P}/locations`, label: "Multi-location", icon: Map, requiredRole: "owner" },
      { href: `${P}/locations/manage`, label: "Manage locations", icon: MapPin, requiredRole: "owner" },
      { href: `${P}/menu-engineering`, label: "Menu engineering", icon: UtensilsCrossed, requiredRole: "manager" },
      { href: `${P}/agent-hq`, label: "Agent HQ", icon: Bot, requiredRole: "manager" },
      { href: `${P}/ai`, label: "Insights", icon: Brain, requiredRole: "manager" },
      { href: `${P}/ai/agent`, label: "Ops Agent", icon: Bot, requiredRole: "manager" },
      { href: `${P}/expansion`, label: "Expansion", icon: Map, requiredRole: "owner" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: `${P}/users`, label: "Users & roles", icon: ShieldCheck, requiredRole: "owner" },
      { href: `${P}/permissions`, label: "Permission matrix", icon: Grid3x3, requiredRole: "owner" },
      { href: `${P}/compliance`, label: "Compliance", icon: CalendarCheck2, requiredRole: "manager" },
      { href: `${P}/regulatory-compliance`, label: "Regulatory disclosures", icon: ShieldCheck, requiredRole: "owner" },
      { href: `${P}/soc2`, label: "SOC 2 controls", icon: ShieldCheck, requiredRole: "owner" },
      { href: `${P}/audit-log`, label: "Audit log", icon: History, requiredRole: "manager" },
      { href: `${P}/capabilities`, label: "Capabilities", icon: Layers, requiredRole: "manager" },
      { href: `${P}/payments`, label: "Payments", icon: CreditCard, requiredRole: "manager" },
      { href: `${P}/qr-ordering`, label: "QR ordering", icon: QrCode, requiredRole: "manager" },
      { href: `${P}/currency`, label: "Currency", icon: Coins, requiredRole: "owner" },
      { href: `${P}/languages`, label: "Languages", icon: Languages, requiredRole: "owner" },
      { href: `${P}/settings`, label: "Settings", icon: Settings, requiredRole: "owner" },
    ],
  },
];

export const ALL_NAV_ITEMS_V3: NavItemV3[] = NAV_SECTIONS_V3.flatMap((s) => s.items);

/** The viewer's gate: their role plus their *effective* granular permissions
 *  (from `/api/admin/me` — `allAccess` short-circuits owners, `permissions` is
 *  the resolved key set, role default or per-user custom grant). */
export interface NavGateV3 {
  role: AdminRole | null;
  allAccess?: boolean;
  permissions?: readonly string[] | null;
}

/**
 * Filter the v3 nav for a viewer. Two gates, ANDed:
 *
 *  1. **Role rank** (`requiredRole`) — the legacy floor; also the *only* gate
 *     for items whose page has no mapped permission (Alerts, Boardroom,
 *     Payments, QR ordering, Integrations).
 *  2. **Granular permission** — the admin's Permission Matrix is the source of
 *     truth. Each item is shown only when the viewer's effective permissions
 *     include the key `permissionForAdminPage()` requires for its href. Owners
 *     (`allAccess`) skip this; an unmapped href falls back to the rank gate.
 *
 * Because a role-default user's effective set *is* their role preset, this is a
 * no-op for them (same nav as before) — but a per-user custom grant now shows
 * exactly the pages it permits, and a forbidden page can never sit in the rail.
 */
export function filterNavForRoleV3(
  gate: AdminRole | NavGateV3 | null,
): NavSectionV3[] {
  // Back-compat: a bare role still filters by rank alone.
  const g: NavGateV3 | null =
    gate === null ? null : typeof gate === "string" ? { role: gate } : gate;
  if (!g || !g.role) return [];
  const rank = ROLE_RANK[g.role];
  const granted = new Set(g.permissions ?? []);
  const permissionGated = g.allAccess !== true && Array.isArray(g.permissions);
  return NAV_SECTIONS_V3.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.requiredRole && ROLE_RANK[item.requiredRole] > rank) return false;
      if (!permissionGated) return true;
      const need = permissionForAdminPage(item.href);
      return !need || granted.has(need);
    }),
  })).filter((section) => section.items.length > 0);
}
