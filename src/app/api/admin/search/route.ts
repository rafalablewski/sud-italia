import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getOrders, getLoyaltyMembers, getIngredients } from "@/lib/store";
import { krakowMenu } from "@/data/menus/krakow";
import { warszawaMenu } from "@/data/menus/warszawa";
import { normalizePlPhoneE164 } from "@/lib/phone";

export interface SearchResult {
  id: string;
  type: "order" | "customer" | "menu-item" | "ingredient";
  label: string;
  sublabel?: string;
  href: string;
  meta?: string;
}

const MAX_PER_GROUP = 5;

function ciIncludes(haystack: string | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle);
}

export const GET = withAdmin({}, async (req) => {
  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  if (q.length === 0) {
    // Return recent orders for the empty-query state so the palette is useful
    // before the user types anything.
    const orders = await getOrders();
    const recentOrders = orders
      .slice()
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, MAX_PER_GROUP)
      .map<SearchResult>((o) => ({
        id: `order:${o.id}`,
        type: "order",
        label: `${o.customerName || "Guest"} · ${(o.totalAmount / 100).toFixed(2)} PLN`,
        sublabel: `${o.id} · ${o.status}`,
        href: `/admin/orders#${o.id}`,
        meta: o.locationSlug,
      }));
    return NextResponse.json<{ results: SearchResult[] }>({ results: recentOrders });
  }

  const normalizedPhone = normalizePlPhoneE164(q);
  const phoneTail = q.replace(/\D/g, "");

  // ORDERS — match id (any-position contains), customer name, or phone
  const orders = await getOrders();
  const orderHits = orders
    .filter((o) => {
      if (o.id.toLowerCase().includes(q)) return true;
      if (ciIncludes(o.customerName, q)) return true;
      if (o.customerPhone) {
        if (normalizedPhone && o.customerPhone === normalizedPhone) return true;
        if (phoneTail.length >= 3 && o.customerPhone.includes(phoneTail)) return true;
      }
      return false;
    })
    .slice(0, MAX_PER_GROUP)
    .map<SearchResult>((o) => ({
      id: `order:${o.id}`,
      type: "order",
      label: `${o.customerName || "Guest"} · ${(o.totalAmount / 100).toFixed(2)} PLN`,
      sublabel: `${o.id} · ${o.status}`,
      href: `/admin/orders#${o.id}`,
      meta: o.locationSlug,
    }));

  // CUSTOMERS — loyalty members by name/phone
  const members = await getLoyaltyMembers();
  const customerHits = members
    .filter((m) => {
      const fullName = `${m.name || ""} ${m.lastName || ""}`.trim();
      if (ciIncludes(fullName, q)) return true;
      if (ciIncludes(m.nickname, q)) return true;
      if (ciIncludes(m.email, q)) return true;
      if (m.phone) {
        if (normalizedPhone && m.phone === normalizedPhone) return true;
        if (phoneTail.length >= 3 && m.phone.includes(phoneTail)) return true;
      }
      return false;
    })
    .slice(0, MAX_PER_GROUP)
    .map<SearchResult>((m) => ({
      id: `customer:${m.phone}`,
      type: "customer",
      label: `${m.name || ""} ${m.lastName || ""}`.trim() || m.nickname || m.phone,
      sublabel: m.phone,
      // Customer detail page ships in Phase 14. Until then deep-link to loyalty
      // search with the phone in the hash so the page can focus that member.
      href: `/admin/loyalty#${encodeURIComponent(m.phone)}`,
    }));

  // MENU ITEMS — across both location menus
  const menuHits = [
    ...krakowMenu.map((m) => ({ item: m, location: "krakow" as const })),
    ...warszawaMenu.map((m) => ({ item: m, location: "warszawa" as const })),
  ]
    .filter(({ item }) => ciIncludes(item.name, q) || ciIncludes(item.description, q) || ciIncludes(item.category, q))
    .slice(0, MAX_PER_GROUP)
    .map<SearchResult>(({ item, location }) => ({
      id: `menu:${item.id}`,
      type: "menu-item",
      label: item.name,
      sublabel: `${item.category} · ${(item.price / 100).toFixed(2)} PLN`,
      href: `/admin/menu#${item.id}`,
      meta: location,
    }));

  // INGREDIENTS
  const ingredients = await getIngredients();
  const ingredientHits = ingredients
    .filter((ing) => ciIncludes(ing.name, q) || ciIncludes(ing.category, q) || ciIncludes(ing.supplier, q))
    .slice(0, MAX_PER_GROUP)
    .map<SearchResult>((ing) => ({
      id: `ingredient:${ing.id}`,
      type: "ingredient",
      label: ing.name,
      sublabel: `${ing.category} · ${(ing.costPerUnit / 100).toFixed(2)} PLN/${ing.unit}`,
      href: `/admin/recipes#${ing.id}`,
    }));

  return NextResponse.json<{ results: SearchResult[] }>({
    results: [...orderHits, ...customerHits, ...menuHits, ...ingredientHits],
  });
});
