import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  deleteSimulatedWaConversations,
  getSettings,
  listSimulatedWaPhones,
  saveSimulatedWaConversation,
  type WaMessage,
  type WaSession,
} from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { getActiveLocations } from "@/data/locations";
import type { CartItem, MenuItem } from "@/data/types";

/**
 * WhatsApp chat-simulator API (admin-gated demo / training tool).
 *
 * Mirrors the KDS order simulator. When the owner flips the owner-only
 * settings.whatsappSimulatorEnabled toggle, the WhatsApp console shows
 * Add 1 / Add 5 / Purge controls. `spawn` builds synthetic-but-real
 * conversations ONLY from a real truck menu (getMenuWithOverrides) and writes
 * them through saveSimulatedWaConversation, which persists a real session +
 * transcript (so the console renders them like a live chat) and registers the
 * phone so `purge` can remove every sandbox conversation in one shot. Sessions
 * are tagged simulated:true; sandbox phones use a reserved +48999XXXXXX range.
 *
 * Manager+ may call this so the controls work for whoever is at the console;
 * spawn is re-checked against the toggle (purge is always allowed, so turning
 * the toggle off can clear the console).
 */

// Ceiling on registered sandbox conversations so repeated Add taps can't flood
// the console / store. Purge resets the count to zero.
const MAX_ACTIVE = 30;

const SIM_NAMES = [
  "Marco", "Giulia", "Luca", "Sofia", "Matteo", "Chiara",
  "Davide", "Elena", "Francesco", "Aurora", "Lorenzo", "Martina",
  "Anna", "Piotr", "Kasia", "Tomek", "Ewa", "Jakub",
];

type Stage = "browsing" | "cart" | "fulfillment" | "awaiting_pay";
const STAGES: Stage[] = ["browsing", "cart", "fulfillment", "awaiting_pay"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function simPhone(): string {
  return `+48999${randInt(100000, 999999)}`;
}
const fmtPLN = (g: number) => `${(g / 100).toFixed(2).replace(".", ",")} zł`;

/** Build one sandbox conversation (session + transcript) from a real menu. */
function buildConversation(
  locationSlug: string,
  menu: MenuItem[],
): { session: WaSession; messages: WaMessage[] } | null {
  const sellable = menu.filter((m) => (m.price ?? 0) > 0 && m.available && !m.deliveryOnly);
  const pool = sellable.length > 0 ? sellable : menu.filter((m) => (m.price ?? 0) > 0);
  if (pool.length === 0) return null;

  const stage = pick(STAGES);
  const name = pick(SIM_NAMES);
  const phone = simPhone();
  const cityLabel = locationSlug === "warszawa" ? "Warszawa" : "Kraków";

  // Cart (empty while browsing, 1–3 distinct lines otherwise).
  const chosen = new Map<string, CartItem>();
  if (stage !== "browsing") {
    const lines = randInt(1, 3);
    for (let i = 0; i < lines; i++) {
      const item = pick(pool);
      const existing = chosen.get(item.id);
      if (existing) existing.quantity += 1;
      else chosen.set(item.id, { menuItem: item, quantity: randInt(1, 2), locationSlug });
    }
  }
  const cartItems = [...chosen.values()];
  const subtotal = cartItems.reduce((s, l) => s + (l.menuItem.price ?? 0) * l.quantity, 0);
  const cartLabel = cartItems
    .map((l) => `${l.quantity}× ${l.menuItem.name}`)
    .join(", ");

  const fulfillmentType =
    stage === "fulfillment" || stage === "awaiting_pay"
      ? Math.random() < 0.4
        ? "delivery"
        : "takeout"
      : null;
  const slotId = stage === "fulfillment" || stage === "awaiting_pay" ? "sim-slot" : null;
  const pendingOrderId = stage === "awaiting_pay" ? `SIM-${Math.random().toString(36).slice(2, 8).toUpperCase()}` : null;
  const pendingPaymentUrl = stage === "awaiting_pay" ? "https://checkout.stripe.com/c/pay/sim_demo" : null;

  // Transcript — increasing timestamps across the last few minutes.
  const now = Date.now();
  let t = now - randInt(6, 14) * 60_000;
  const step = () => {
    t += randInt(20, 70) * 1000;
    return new Date(Math.min(t, now)).toISOString();
  };
  const messages: WaMessage[] = [
    { at: step(), direction: "in", kind: "text", body: "Cześć, chciałbym coś zamówić 🍕", actor: "customer" },
    { at: step(), direction: "out", kind: "text", body: `Cześć ${name}! Tu Ottaviano. Z którego miasta? Kraków czy Warszawa?`, actor: "bot" },
    { at: step(), direction: "in", kind: "text", body: cityLabel, actor: "customer" },
  ];

  if (stage === "browsing") {
    messages.push({ at: step(), direction: "out", kind: "list", body: `Świetnie! Oto nasze menu w mieście ${cityLabel}:`, actor: "bot", meta: {} });
    messages.push({ at: step(), direction: "in", kind: "text", body: "Co polecacie?", actor: "customer" });
    messages.push({ at: step(), direction: "out", kind: "text", body: "Klasyk to Margherita 🍕 — a do tego Limonata i Tiramisù.", actor: "bot" });
  } else {
    messages.push({ at: step(), direction: "in", kind: "selection", body: cartLabel, actor: "customer" });
    messages.push({ at: step(), direction: "out", kind: "text", body: `Dodałem do koszyka: ${cartLabel}. Razem ${fmtPLN(subtotal)}. Odbiór czy dostawa?`, actor: "bot" });
  }

  if (stage === "fulfillment" || stage === "awaiting_pay") {
    messages.push({ at: step(), direction: "in", kind: "text", body: fulfillmentType === "delivery" ? "Dostawa" : "Odbiór osobisty", actor: "customer" });
    messages.push({ at: step(), direction: "out", kind: "text", body: "Super. Na kiedy? Mam wolny slot za ~20 min.", actor: "bot" });
    messages.push({ at: step(), direction: "in", kind: "text", body: "Może być", actor: "customer" });
  }

  if (stage === "awaiting_pay") {
    messages.push({ at: step(), direction: "out", kind: "cta_url", body: "Zapłać teraz", actor: "bot", meta: { url: pendingPaymentUrl } });
  }

  const session: WaSession = {
    phone,
    locationSlug: locationSlug === "warszawa" ? "warszawa" : "krakow",
    cartItems,
    fulfillmentType,
    slotId,
    deliveryAddress:
      fulfillmentType === "delivery"
        ? { street: "ul. Demo 1", city: cityLabel, postalCode: "00-001" }
        : null,
    customerName: `${name} (sim)`,
    pendingOrderId,
    pendingPaymentUrl,
    llmMessageHistory: [],
    lastTurnAt: new Date(now).toISOString(),
    simulated: true,
  };

  return { session, messages };
}

export const POST = withAdmin(
  // Manager+ so the controls work for whoever is at the console — the real gate
  // is the owner-only whatsappSimulatorEnabled toggle, re-checked below for spawn.
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    let body: { action?: string; count?: number } = {};
    try {
      body = await req.json();
    } catch {
      /* empty body is fine for purge */
    }

    // Purge is cleanup and stays allowed even when the toggle is off — that's
    // exactly how disabling the simulator clears the console.
    if (body.action === "purge") {
      const removed = await deleteSimulatedWaConversations();
      return NextResponse.json({ ok: true, removed });
    }

    // Spawn generates sandbox load, so it requires the toggle.
    const settings = await getSettings();
    if (!settings.whatsappSimulatorEnabled) {
      return NextResponse.json({ error: "WhatsApp simulator is disabled in settings" }, { status: 403 });
    }

    if (body.action === "spawn") {
      const active = (await listSimulatedWaPhones()).length;
      if (active >= MAX_ACTIVE) {
        return NextResponse.json({
          ok: false,
          spawned: 0,
          error: `Sandbox conversations capped at ${MAX_ACTIVE} — purge before adding more.`,
        });
      }
      const locations = getActiveLocations();
      if (locations.length === 0) {
        return NextResponse.json({ error: "No active location" }, { status: 400 });
      }
      const count = Math.max(1, Math.min(5, body.count ?? 1));
      const spawned: string[] = [];
      for (let i = 0; i < count && active + spawned.length < MAX_ACTIVE; i++) {
        // Spread sandbox chats across the active trucks for variety, unless the
        // operator scoped the request to one truck.
        const slug = locationSlug ?? pick(locations).slug;
        const menu = await getMenuWithOverrides(slug);
        const built = buildConversation(slug, menu);
        if (!built) {
          return NextResponse.json({ error: "No menu items for this location" }, { status: 400 });
        }
        await saveSimulatedWaConversation(built.session, built.messages);
        spawned.push(built.session.phone);
      }
      return NextResponse.json({ ok: true, spawned: spawned.length, phones: spawned });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  },
);
