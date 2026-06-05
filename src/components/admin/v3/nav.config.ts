import {
  LayoutDashboard,
  ClipboardList,
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
  LineChart,
  Rocket,
  TrendingUp,
  Sparkles,
  Calendar,
  Truck,
  Map,
  MapPin,
  Brain,
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

// v3 nav — same taxonomy + permission model as v2 (mirrored from
// components/admin/v2/nav.config.ts) but owned by the v3 tree so v2 can be
// deleted. Hrefs are rooted at the `/admin-v3` preview prefix; they flip to
// `/admin` when v3 becomes the live back-office. Core (POS/KDS/Guest/Service)
// stays on its own /core routes and is intentionally absent here — v3 never
// rebuilds Core.

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

const P = "/admin-v3";

export const NAV_SECTIONS_V3: NavSectionV3[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: `${P}`, label: "Dashboard", icon: LayoutDashboard },
      { href: `${P}/orders`, label: "Orders", icon: ClipboardList, requiredRole: "staff" },
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
      { href: `${P}/staff`, label: "Staff", icon: HardHat, requiredRole: "manager", pending: true },
      { href: `${P}/schedule`, label: "Schedule", icon: CalendarRange, requiredRole: "manager", pending: true },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    items: [
      { href: `${P}/customers`, label: "Customers", icon: Users, requiredRole: "staff", pending: true },
      { href: `${P}/corporate`, label: "Corporate", icon: Building2, requiredRole: "manager", pending: true },
      { href: `${P}/feedback`, label: "Feedback", icon: MessageSquare, requiredRole: "manager", pending: true },
      { href: `${P}/surveys`, label: "Pulse surveys", icon: Gauge, requiredRole: "manager", pending: true },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { href: `${P}/reports`, label: "Reports", icon: BarChart3, requiredRole: "manager", pending: true },
      { href: `${P}/cash`, label: "Cash", icon: Banknote, requiredRole: "manager", pending: true },
      { href: `${P}/business-costs`, label: "Business costs", icon: Wallet, requiredRole: "manager", pending: true },
      { href: `${P}/simulation`, label: "Calculator", icon: LineChart, requiredRole: "manager", pending: true },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    items: [
      { href: `${P}/growth`, label: "Campaigns", icon: Rocket, requiredRole: "manager", pending: true },
      { href: `${P}/upsell`, label: "Upsell", icon: TrendingUp, requiredRole: "manager", pending: true },
      { href: `${P}/crosssell`, label: "Cross-sell", icon: Sparkles, requiredRole: "manager", pending: true },
      { href: `${P}/scheduled-bundles`, label: "Scheduled bundles", icon: Calendar, requiredRole: "manager", pending: true },
      { href: `${P}/truck`, label: "Truck ops", icon: Truck, requiredRole: "manager", pending: true },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    items: [
      { href: `${P}/locations`, label: "Multi-location", icon: Map, requiredRole: "owner", pending: true },
      { href: `${P}/locations/manage`, label: "Manage locations", icon: MapPin, requiredRole: "owner", pending: true },
      { href: `${P}/menu-engineering`, label: "Menu engineering", icon: UtensilsCrossed, requiredRole: "manager", pending: true },
      { href: `${P}/ai`, label: "Insights", icon: Brain, requiredRole: "manager", pending: true },
      { href: `${P}/expansion`, label: "Expansion", icon: Map, requiredRole: "owner", pending: true },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: `${P}/users`, label: "Users & roles", icon: ShieldCheck, requiredRole: "owner", pending: true },
      { href: `${P}/permissions`, label: "Permission matrix", icon: Grid3x3, requiredRole: "owner", pending: true },
      { href: `${P}/audit-log`, label: "Audit log", icon: History, requiredRole: "manager", pending: true },
      { href: `${P}/capabilities`, label: "Capabilities", icon: Layers, requiredRole: "manager", pending: true },
      { href: `${P}/currency`, label: "Currency", icon: Coins, requiredRole: "owner", pending: true },
      { href: `${P}/languages`, label: "Languages", icon: Languages, requiredRole: "owner", pending: true },
      { href: `${P}/settings`, label: "Settings", icon: Settings, requiredRole: "owner", pending: true },
    ],
  },
];

export const ALL_NAV_ITEMS_V3: NavItemV3[] = NAV_SECTIONS_V3.flatMap((s) => s.items);

/** Filter the v3 nav by role rank (mirrors v2's filterNavForRole). */
export function filterNavForRoleV3(role: AdminRole | null): NavSectionV3[] {
  if (!role) return [];
  const rank = ROLE_RANK[role];
  return NAV_SECTIONS_V3.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.requiredRole || ROLE_RANK[item.requiredRole] <= rank),
  })).filter((section) => section.items.length > 0);
}
