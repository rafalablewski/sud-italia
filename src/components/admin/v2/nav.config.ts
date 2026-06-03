import {
  LayoutDashboard,
  Banknote,
  ClipboardList,
  ChefHat,
  UtensilsCrossed,
  FlaskConical,
  Calendar,
  CalendarRange,
  BarChart3,
  Boxes,
  Building2,
  CalendarCheck2,
  Gauge,
  HardHat,
  History,
  Coins,
  Languages,
  PackageSearch,
  Rocket,
  MessageSquare,
  TrendingUp,
  Sparkles,
  Truck,
  Brain,
  LineChart,
  Map,
  MapPin,
  Settings,
  ShieldCheck,
  Thermometer,
  Trash2,
  ClipboardCheck,
  Users,
  Layers,
  Grid3x3,
  Wallet,
  Receipt,
  Contact,
  type LucideIcon,
} from "lucide-react";
import { ROLE_RANK, type AdminRole } from "@/lib/admin-roles";
import { permissionForAdminPage } from "@/lib/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Optional one-letter shortcut after `g` (e.g. "d" for Dashboard via `g d`). */
  shortcut?: string;
  /**
   * Minimum role required to see this item (m2_31). When unset, any
   * authenticated user can see it. The check is "user's rank >=
   * requiredRole's rank" — so a manager sees all manager+ items, an
   * owner sees everything.
   */
  requiredRole?: AdminRole;
  /**
   * Optional settings-driven gate. When set, the sidebar hides this item
   * unless the corresponding boolean in /api/admin/settings is true.
   * The page itself still enforces the same check server-side.
   */
  featureFlag?: "simulation";
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * Single source of truth for sidebar + command palette navigation. Later phases
 * append items to existing sections as new pages ship — keep this ordered the
 * way users should scan it (operations → people → money → growth).
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      // Dashboard intentionally has no role gate — it's the landing page;
      // staff who clock in to the admin without permissions still need
      // somewhere to land.
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, shortcut: "d" },
      { href: "/admin/orders", label: "Orders", icon: ClipboardList, shortcut: "o", requiredRole: "staff" },
    ],
  },
  {
    // The proprietary operating systems the truck actually runs on, grouped
    // so the till, the line, the unified guest hub (CRM + Loyalty + Concierge +
    // WhatsApp) and the foundational floor + slots primitives all read as one
    // "Core" platform — the root of running a restaurant.
    id: "core",
    label: "Core",
    items: [
      { href: "/core/pos", label: "POS", icon: Receipt, shortcut: "g", requiredRole: "staff" },
      { href: "/core/kds", label: "Kitchen Display", icon: ChefHat, shortcut: "k", requiredRole: "kitchen" },
      // CRM, Loyalty, Concierge and WhatsApp are unified into one Guest
      // Engagement hub (Inbox / Guests / Loyalty / Concierge views); the old
      // /admin/crm, /admin/loyalty, /admin/concierge, /admin/whatsapp routes
      // redirect here.
      { href: "/core/guest", label: "Guest Engagement", icon: Contact, requiredRole: "staff" },
      // Service is the merged Floor + Slots surface on the Core suite shell:
      // book a dine-in slot + assign a table in one step, plus Floor (live room
      // + twin) and Slots (capacity + demand) as views. The old /admin/floor
      // and /admin/slots redirect into it (?view=floor|slots).
      { href: "/core/service", label: "Service", icon: CalendarCheck2, requiredRole: "staff" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed, shortcut: "m", requiredRole: "manager" },
      { href: "/admin/recipes", label: "Recipes", icon: FlaskConical, requiredRole: "manager" },
      { href: "/admin/haccp", label: "HACCP log", icon: Thermometer, requiredRole: "staff" },
      { href: "/admin/waste", label: "Waste log", icon: Trash2, requiredRole: "staff" },
      { href: "/admin/handover", label: "Shift handover", icon: ClipboardCheck, requiredRole: "manager" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    items: [
      // Staff need to see stock during service (low-stock alerts), but
      // suppliers + POs are manager+ since they touch supplier
      // relationships + cash.
      { href: "/admin/inventory", label: "Stock", icon: Boxes, shortcut: "i", requiredRole: "staff" },
      { href: "/admin/suppliers", label: "Suppliers", icon: Building2, requiredRole: "manager" },
      { href: "/admin/purchase-orders", label: "Purchase orders", icon: PackageSearch, shortcut: "p", requiredRole: "manager" },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [
      { href: "/admin/staff", label: "Staff", icon: HardHat, shortcut: "s", requiredRole: "manager" },
      { href: "/admin/schedule", label: "Schedule", icon: CalendarRange, requiredRole: "manager" },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    items: [
      // Staff need to look up customers during phone orders.
      { href: "/admin/customers", label: "Customers", icon: Users, shortcut: "c", requiredRole: "staff" },
      // Loyalty moved into the Core Guest Engagement hub (/core/guest?view=loyalty).
      { href: "/admin/corporate", label: "Corporate", icon: Building2, requiredRole: "manager" },
      { href: "/admin/feedback", label: "Feedback", icon: MessageSquare, requiredRole: "manager" },
      { href: "/admin/surveys", label: "Pulse surveys", icon: Gauge, requiredRole: "manager" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { href: "/admin/reports", label: "Reports", icon: BarChart3, shortcut: "r", requiredRole: "manager" },
      { href: "/admin/cash", label: "Cash", icon: Banknote, requiredRole: "manager" },
      { href: "/admin/business-costs", label: "Business costs", icon: Wallet, requiredRole: "manager" },
      { href: "/admin/simulation", label: "Calculator", icon: LineChart, requiredRole: "manager", featureFlag: "simulation" },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    items: [
      { href: "/admin/growth", label: "Campaigns", icon: Rocket, requiredRole: "manager" },
      { href: "/admin/upsell", label: "Upsell", icon: TrendingUp, requiredRole: "manager" },
      { href: "/admin/crosssell", label: "Cross-sell", icon: Sparkles, requiredRole: "manager" },
      { href: "/admin/scheduled-bundles", label: "Scheduled bundles", icon: Calendar, requiredRole: "manager" },
      { href: "/admin/truck", label: "Truck ops", icon: Truck, requiredRole: "manager" },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    items: [
      { href: "/admin/locations", label: "Multi-location", icon: Map, requiredRole: "owner" },
      { href: "/admin/locations/manage", label: "Manage locations", icon: MapPin, requiredRole: "owner" },
      { href: "/admin/reports/cohort", label: "Cohort & CLTV", icon: BarChart3, requiredRole: "manager" },
      { href: "/admin/reports/ltv-cac", label: "LTV / CAC", icon: TrendingUp, requiredRole: "manager" },
      { href: "/admin/menu-engineering", label: "Menu engineering", icon: UtensilsCrossed, requiredRole: "manager" },
      { href: "/admin/ai", label: "Insights", icon: Brain, requiredRole: "manager" },
      { href: "/admin/expansion", label: "Expansion", icon: Map, requiredRole: "owner" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: "/admin/users", label: "Users & roles", icon: ShieldCheck, requiredRole: "owner" },
      { href: "/admin/permissions", label: "Permission matrix", icon: Grid3x3, requiredRole: "owner" },
      { href: "/admin/compliance", label: "Compliance", icon: CalendarCheck2, requiredRole: "manager" },
      { href: "/admin/regulatory-compliance", label: "Regulatory disclosures", icon: ShieldCheck, requiredRole: "owner" },
      { href: "/admin/soc2", label: "SOC 2 controls", icon: ShieldCheck, requiredRole: "owner" },
      { href: "/admin/audit-log", label: "Audit log", icon: History, requiredRole: "manager" },
      { href: "/admin/capabilities", label: "Capabilities", icon: Layers, requiredRole: "manager" },
      { href: "/admin/currency", label: "Currency", icon: Coins, requiredRole: "owner" },
      { href: "/admin/languages", label: "Languages", icon: Languages, requiredRole: "owner" },
      { href: "/admin/settings", label: "Settings", icon: Settings, shortcut: ",", requiredRole: "owner" },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/**
 * Filter the nav for a given role (m2_31) and feature-flag map. Items
 * without a requiredRole are always visible role-wise; items with one
 * are kept when the user's rank is at least the required rank. Items
 * with a featureFlag are kept only when the corresponding flag is true.
 * Sections with no remaining items get dropped.
 *
 * `null` role = no session = render an empty nav (the layout itself
 * handles redirect to /admin/login).
 */
export function filterNavForRole(
  role: AdminRole | null,
  flags?: { simulation?: boolean },
): NavSection[] {
  if (!role) return [];
  const userRank = ROLE_RANK[role];
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.requiredRole && ROLE_RANK[item.requiredRole] > userRank) return false;
      if (item.featureFlag && !flags?.[item.featureFlag]) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);
}

/**
 * Filter the nav by the session's effective granular permissions — the
 * permission-aware successor to filterNavForRole. Each item's href is mapped to
 * its `.view` permission via `permissionForAdminPage`; an item is shown when the
 * user holds that permission (or the path is unmapped, e.g. the Dashboard).
 * `allAccess` short-circuits the per-item check for owners. Feature-flag gating
 * is preserved. Sections with no remaining items get dropped.
 */
export function filterNavForPermissions(
  perms: Set<string> | string[] | null,
  allAccess: boolean,
  flags?: { simulation?: boolean },
): NavSection[] {
  if (!allAccess && !perms) return [];
  const held = allAccess
    ? null
    : perms instanceof Set
      ? perms
      : new Set(perms ?? []);
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.featureFlag && !flags?.[item.featureFlag]) return false;
      if (!held) return true; // owner / all-access
      const need = permissionForAdminPage(item.href);
      if (need && !held.has(need)) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);
}
