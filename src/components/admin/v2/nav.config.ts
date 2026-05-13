import {
  LayoutDashboard,
  Banknote,
  ClipboardList,
  ChefHat,
  UtensilsCrossed,
  FlaskConical,
  CalendarDays,
  CalendarRange,
  BarChart3,
  Boxes,
  Building2,
  CalendarCheck2,
  HardHat,
  Heart,
  History,
  PackageSearch,
  Rocket,
  MessageSquare,
  TrendingUp,
  Truck,
  Brain,
  Map,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ROLE_RANK, type AdminRole } from "@/lib/admin-roles";

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
      { href: "/admin/kds", label: "Kitchen Display", icon: ChefHat, shortcut: "k", requiredRole: "kitchen" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed, shortcut: "m", requiredRole: "manager" },
      { href: "/admin/recipes", label: "Recipes", icon: FlaskConical, requiredRole: "manager" },
      { href: "/admin/slots", label: "Slots", icon: CalendarDays, requiredRole: "manager" },
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
      { href: "/admin/loyalty", label: "Loyalty", icon: Heart, shortcut: "l", requiredRole: "staff" },
      { href: "/admin/feedback", label: "Feedback", icon: MessageSquare, requiredRole: "manager" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { href: "/admin/reports", label: "Reports", icon: BarChart3, shortcut: "r", requiredRole: "manager" },
      { href: "/admin/cash", label: "Cash", icon: Banknote, requiredRole: "manager" },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    items: [
      { href: "/admin/growth", label: "Campaigns", icon: Rocket, requiredRole: "manager" },
      { href: "/admin/upsell", label: "Upsell", icon: TrendingUp, requiredRole: "manager" },
      { href: "/admin/truck", label: "Truck ops", icon: Truck, requiredRole: "manager" },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    items: [
      { href: "/admin/locations", label: "Multi-location", icon: Map, requiredRole: "owner" },
      { href: "/admin/ai", label: "Insights", icon: Brain, requiredRole: "manager" },
      { href: "/admin/expansion", label: "Expansion", icon: Map, requiredRole: "owner" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: "/admin/users", label: "Users & roles", icon: ShieldCheck, requiredRole: "owner" },
      { href: "/admin/compliance", label: "Compliance", icon: CalendarCheck2, requiredRole: "manager" },
      { href: "/admin/audit-log", label: "Audit log", icon: History, requiredRole: "manager" },
      { href: "/admin/settings", label: "Settings", icon: Settings, shortcut: ",", requiredRole: "owner" },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/**
 * Filter the nav for a given role (m2_31). Items without a requiredRole
 * are always visible; items with one are kept when the user's rank is at
 * least the required rank. Sections with no remaining items get dropped.
 *
 * `null` role = no session = render an empty nav (the layout itself
 * handles redirect to /admin/login).
 */
export function filterNavForRole(role: AdminRole | null): NavSection[] {
  if (!role) return [];
  const userRank = ROLE_RANK[role];
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.requiredRole || ROLE_RANK[item.requiredRole] <= userRank,
    ),
  })).filter((section) => section.items.length > 0);
}
