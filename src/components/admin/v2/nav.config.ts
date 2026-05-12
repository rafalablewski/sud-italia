import {
  LayoutDashboard,
  ClipboardList,
  ChefHat,
  UtensilsCrossed,
  FlaskConical,
  CalendarDays,
  BarChart3,
  Boxes,
  Building2,
  Heart,
  PackageSearch,
  Rocket,
  MessageSquare,
  TrendingUp,
  Brain,
  Map,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Optional one-letter shortcut after `g` (e.g. "d" for Dashboard via `g d`). */
  shortcut?: string;
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
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, shortcut: "d" },
      { href: "/admin/orders", label: "Orders", icon: ClipboardList, shortcut: "o" },
      { href: "/admin/kds", label: "Kitchen Display", icon: ChefHat, shortcut: "k" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed, shortcut: "m" },
      { href: "/admin/recipes", label: "Recipes", icon: FlaskConical },
      { href: "/admin/slots", label: "Slots", icon: CalendarDays },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    items: [
      { href: "/admin/inventory", label: "Stock", icon: Boxes, shortcut: "i" },
      { href: "/admin/suppliers", label: "Suppliers", icon: Building2 },
      { href: "/admin/purchase-orders", label: "Purchase orders", icon: PackageSearch, shortcut: "p" },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    items: [
      { href: "/admin/loyalty", label: "Loyalty", icon: Heart, shortcut: "l" },
      { href: "/admin/feedback", label: "Feedback", icon: MessageSquare },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [{ href: "/admin/reports", label: "Reports", icon: BarChart3, shortcut: "r" }],
  },
  {
    id: "growth",
    label: "Growth",
    items: [
      { href: "/admin/growth", label: "Campaigns", icon: Rocket },
      { href: "/admin/upsell", label: "Upsell", icon: TrendingUp },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    items: [
      { href: "/admin/ai", label: "AI Insights", icon: Brain },
      { href: "/admin/expansion", label: "Expansion", icon: Map },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [{ href: "/admin/settings", label: "Settings", icon: Settings, shortcut: "," }],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);
