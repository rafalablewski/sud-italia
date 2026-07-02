import { getMenuWithOverrides } from "@/data/menus";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getConciergeSettings, type ConciergeCapabilityId } from "@/lib/store";
import { ALLERGEN_LABELS, type Allergen, type MenuItem } from "@/data/types";

/**
 * The Concierge capability layer — one set of read capabilities exposed to AI
 * assistants (MCP) and to guests (WhatsApp). Every sample here is computed from
 * the same live menu / availability / location data the customer site and the
 * WhatsApp ordering bot already serve, so "what the agent sees" is real, never
 * canned. Exposure is gated per-capability by the operator toggles in
 * concierge-settings (getConciergeSettings).
 */

export interface CapabilityMeta {
  id: ConciergeCapabilityId;
  kind: "tool" | "resource";
  label: string;
  desc: string;
  /** "public" caps are served by the read-only /api/agent endpoint; */
  /** "conversational" caps run through the authenticated WhatsApp + web checkout. */
  transport: "public" | "conversational";
}

export const CAPABILITY_META: Record<ConciergeCapabilityId, CapabilityMeta> = {
  get_menu: {
    id: "get_menu",
    kind: "resource",
    label: "get_menu",
    desc: "Full menu with prices, categories and dietary tags.",
    transport: "public",
  },
  check_availability: {
    id: "check_availability",
    kind: "tool",
    label: "check_availability",
    desc: "Live availability + prep time per item and location.",
    transport: "public",
  },
  get_allergens: {
    id: "get_allergens",
    kind: "tool",
    label: "get_allergens",
    desc: "EU-14 allergen + dietary breakdown for any item.",
    transport: "public",
  },
  place_order: {
    id: "place_order",
    kind: "tool",
    label: "place_order",
    desc: "Create a takeout / delivery order. Returns order id + ETA.",
    transport: "conversational",
  },
  create_payment: {
    id: "create_payment",
    kind: "tool",
    label: "create_payment",
    desc: "Issue a Stripe payment link / take payment for an order.",
    transport: "conversational",
  },
  locate_truck: {
    id: "locate_truck",
    kind: "tool",
    label: "locate_truck",
    desc: "Our locations, addresses & today's opening hours per city.",
    transport: "public",
  },
};

export const CAPABILITY_ORDER: ConciergeCapabilityId[] = [
  "get_menu",
  "check_availability",
  "get_allergens",
  "place_order",
  "create_payment",
  "locate_truck",
];

function dietary(item: MenuItem): string[] {
  return item.tags ?? [];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Location.hours uses coarse day ranges ("Mon-Thu", "Fri-Sat", "Sun"). A plain
// substring check misses the interior days of a range (e.g. "Mon-Thu" doesn't
// contain "Tue"), so parse the range and test inclusion, with weekday-wrap.
function dayInRange(dayRange: string, targetDay: string): boolean {
  const parts = dayRange.split("-").map((p) => p.trim());
  const target = DAY_NAMES.indexOf(targetDay);
  if (target === -1) return false;
  if (parts.length === 1) return parts[0] === targetDay;
  const start = DAY_NAMES.indexOf(parts[0]);
  const end = DAY_NAMES.indexOf(parts[1]);
  if (start === -1 || end === -1) return false;
  return start <= end ? target >= start && target <= end : target >= start || target <= end;
}

function todayHours(loc: Awaited<ReturnType<typeof getActiveLocationsAsync>>[number]): string | null {
  const name = DAY_NAMES[new Date().getDay()];
  const match = (loc.hours ?? []).find((h) => dayInRange(h.day, name)) ?? loc.hours?.[0];
  return match ? `${match.open}–${match.close}` : null;
}

export interface AllergenMatrix {
  columns: { key: Allergen; label: string; emoji: string }[];
  rows: {
    id: string;
    name: string;
    available: boolean;
    allergens: Allergen[];
    dietary: string[];
  }[];
}

export async function buildAllergenMatrix(slug: string): Promise<AllergenMatrix> {
  const menu = await getMenuWithOverrides(slug);
  // Always emit the full EU-14 (FIC Annex II) column set — a proper allergen
  // matrix has consistent columns; absent allergens render as empty cells. This
  // matches the dense-console mockup's 14-column grid.
  const order: Allergen[] = [
    "gluten",
    "dairy",
    "eggs",
    "nuts",
    "peanuts",
    "soy",
    "sesame",
    "fish",
    "shellfish",
    "molluscs",
    "celery",
    "mustard",
    "sulfites",
    "lupin",
  ];
  const columns = order
    .map((a) => ({ key: a, label: ALLERGEN_LABELS[a].en, emoji: ALLERGEN_LABELS[a].emoji }));
  const rows = menu.map((m) => ({
    id: m.id,
    name: m.name,
    available: m.available,
    allergens: m.allergens ?? [],
    dietary: dietary(m),
  }));
  return { columns, rows };
}

/**
 * Build the structured JSON a given capability returns for a location. With
 * `sample: true` the menu/allergen lists are trimmed for the inspector view;
 * the public endpoint returns the full payload.
 */
export async function buildCapabilityResponse(
  id: ConciergeCapabilityId,
  slug: string,
  opts: { sample?: boolean } = {},
): Promise<Record<string, unknown>> {
  const sample = opts.sample ?? false;
  const nowIso = new Date().toISOString();

  if (id === "get_menu") {
    const menu = await getMenuWithOverrides(slug);
    const items = menu.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      price_grosze: m.price,
      dietary: dietary(m),
      available: m.available,
    }));
    return {
      location: slug,
      currency: "PLN",
      updated: nowIso,
      item_count: items.length,
      items: sample
        ? [...items.slice(0, 3), { "…": `${Math.max(0, items.length - 3)} more items` }]
        : items,
    };
  }

  if (id === "check_availability") {
    const menu = await getMenuWithOverrides(slug);
    const items = menu.map((m) => ({
      id: m.id,
      available: m.available,
      prep_minutes: m.prepTimeMinutes ?? null,
      ...(m.available ? {} : { reason: "sold_out" }),
    }));
    return {
      location: slug,
      as_of: nowIso,
      available_count: items.filter((i) => i.available).length,
      items: sample ? items.slice(0, 4) : items,
    };
  }

  if (id === "get_allergens") {
    const matrix = await buildAllergenMatrix(slug);
    const rows = sample ? matrix.rows.slice(0, 1) : matrix.rows;
    return {
      location: slug,
      eu14_compliant: true,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        allergens: r.allergens,
        dietary: r.dietary,
      })),
    };
  }

  if (id === "locate_truck") {
    const locs = await getActiveLocationsAsync();
    const here = locs.find((l) => l.slug === slug) ?? locs[0];
    return {
      city: here?.city ?? slug,
      now_at: here
        ? { address: here.address, hours_today: todayHours(here), coordinates: here.coordinates }
        : null,
      locations: locs.map((l) => ({ slug: l.slug, city: l.city, address: l.address })),
    };
  }

  // Conversational capabilities — described, not served, over the public read
  // endpoint. The real flow lives in the WhatsApp ordering tools + web checkout.
  if (id === "place_order") {
    return {
      transport: "whatsapp + web checkout",
      note: "Orders are created through the authenticated conversational channel, not this read endpoint.",
      example: {
        order_id: "KRK-0000",
        location: slug,
        channel: "takeout",
        status: "awaiting_payment",
      },
    };
  }
  // create_payment
  return {
    transport: "stripe (via order checkout)",
    note: "Payment links are issued by the order pipeline once an order is placed.",
    example: { provider: "stripe", currency: "PLN", status: "link_issued" },
  };
}

/** Whether a capability is currently exposed by the operator. */
export async function isCapabilityExposed(id: ConciergeCapabilityId): Promise<boolean> {
  const settings = await getConciergeSettings();
  return settings.exposure[id] ?? true;
}
