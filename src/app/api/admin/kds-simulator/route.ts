import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  createSimulatedOrder,
  deleteSimulatedOrders,
  getOrders,
  getSettings,
  setSimulatedOrderStatus,
} from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { getActiveLocations } from "@/data/locations";
import type { CartItem, Order, OrderStatus } from "@/data/types";

/**
 * KDS live-order simulator API (admin-gated demo / training tool).
 *
 * Spawns synthetic-but-real orders built ONLY from the location's real menu
 * (getMenuWithOverrides) and streams them into the orders-driven kitchen
 * display via createSimulatedOrder. Orders are tagged simulated:true, so
 * getOrders() hides them from every report and they never touch stock, CRM
 * or customer comms. Auto-advance walks each ticket through
 * confirmed → preparing → ready → completed on dwell timers; purge removes
 * them in one shot.
 *
 * Manager+ and gated behind settings.kdsSimulatorEnabled — the same toggle
 * the nav + page guard read, mirroring the finance-simulation flag.
 */

// Dwell windows (ms) the age-derived auto-advance walks each ticket through.
const DWELL_CONFIRMED = 18_000;
const DWELL_PREPARING = 42_000;
const DWELL_READY = 24_000;
const TOTAL_ACTIVE = DWELL_CONFIRMED + DWELL_PREPARING + DWELL_READY;
// Ceiling on simultaneously-active simulated tickets so a runaway client
// loop can't flood the board / DB. Completed sims leave the KDS and don't count.
const MAX_ACTIVE = 40;

const SIM_NAMES = [
  "Marco", "Giulia", "Luca", "Sofia", "Matteo", "Chiara",
  "Davide", "Elena", "Francesco", "Aurora", "Lorenzo", "Martina",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Deterministic age → status so repeated advance() calls converge without
 *  a per-order timer. */
function targetStatus(ageMs: number): OrderStatus {
  if (ageMs < DWELL_CONFIRMED) return "confirmed";
  if (ageMs < DWELL_CONFIRMED + DWELL_PREPARING) return "preparing";
  if (ageMs < TOTAL_ACTIVE) return "ready";
  return "completed";
}

/** Build a realistic order from the location's real menu only. Returns null
 *  when the location has no priced menu items. */
async function buildOrder(locationSlug: string): Promise<Order | null> {
  const menu = (await getMenuWithOverrides(locationSlug)).filter((m) => (m.price ?? 0) > 0);
  if (menu.length === 0) return null;
  const fulfillmentType = Math.random() < 0.25 ? "delivery" : "takeout";
  const eligible = fulfillmentType === "delivery" ? menu : menu.filter((m) => !m.deliveryOnly);
  const pool = eligible.length > 0 ? eligible : menu;

  const chosen = new Map<string, CartItem>();
  let maxPrep = 0;
  const lineCount = randInt(1, 4);
  for (let i = 0; i < lineCount; i++) {
    const item = pick(pool);
    maxPrep = Math.max(maxPrep, item.prepTimeMinutes ?? 0);
    const existing = chosen.get(item.id);
    if (existing) existing.quantity += 1;
    else chosen.set(item.id, { menuItem: item, quantity: randInt(1, 2), locationSlug });
  }
  const items = [...chosen.values()];
  const totalAmount = items.reduce((s, l) => s + (l.menuItem.price ?? 0) * l.quantity, 0);

  const now = new Date();
  const prepMin = maxPrep > 0 ? maxPrep : 12;
  const id = `SIM-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  return {
    id,
    locationSlug,
    items,
    totalAmount,
    status: "confirmed",
    customerName: `${pick(SIM_NAMES)} (sim)`,
    customerPhone: `+48555${randInt(100000, 999999)}`,
    fulfillmentType,
    slotId: "sim-slot",
    slotDate: now.toISOString().slice(0, 10),
    slotTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    createdAt: now.toISOString(),
    paidAt: now.toISOString(),
    estimatedReadyAt: new Date(now.getTime() + prepMin * 60_000).toISOString(),
    simulated: true,
  };
}

export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const settings = await getSettings();
    if (!settings.kdsSimulatorEnabled) {
      return NextResponse.json({ enabled: false, orders: [] });
    }
    const sims = (
      await getOrders(locationSlug ?? undefined, undefined, { includeSimulated: true })
    ).filter((o) => o.simulated);
    return NextResponse.json({
      enabled: true,
      orders: sims.map((o) => ({
        id: o.id,
        status: o.status,
        customerName: o.customerName,
        itemCount: o.items.reduce((s, l) => s + l.quantity, 0),
        total: o.totalAmount,
        createdAt: o.createdAt,
        fulfillmentType: o.fulfillmentType,
      })),
    });
  },
);

export const POST = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const settings = await getSettings();
    if (!settings.kdsSimulatorEnabled) {
      return NextResponse.json({ error: "KDS simulator is disabled in settings" }, { status: 403 });
    }

    let body: { action?: string; count?: number } = {};
    try {
      body = await req.json();
    } catch {
      /* empty body is fine for some actions */
    }

    if (body.action === "purge") {
      const removed = await deleteSimulatedOrders(locationSlug ?? undefined);
      return NextResponse.json({ ok: true, removed });
    }

    // Spawn + advance need a concrete location (orders are per-truck).
    // Default to the first active truck when the operator is viewing "all".
    const slug = locationSlug ?? getActiveLocations()[0]?.slug;
    if (!slug) {
      return NextResponse.json({ error: "No active location" }, { status: 400 });
    }

    if (body.action === "advance") {
      const sims = (await getOrders(slug, undefined, { includeSimulated: true })).filter(
        (o) => o.simulated,
      );
      const now = Date.now();
      let advanced = 0;
      for (const o of sims) {
        const target = targetStatus(now - Date.parse(o.createdAt));
        if (target !== o.status) {
          await setSimulatedOrderStatus(o.id, target);
          advanced++;
        }
      }
      return NextResponse.json({ ok: true, advanced });
    }

    if (body.action === "spawn") {
      const sims = (await getOrders(slug, undefined, { includeSimulated: true })).filter(
        (o) => o.simulated,
      );
      const activeCount = sims.filter((o) => o.status !== "completed").length;
      if (activeCount >= MAX_ACTIVE) {
        return NextResponse.json({
          ok: false,
          spawned: 0,
          error: `Active simulated tickets capped at ${MAX_ACTIVE} — purge before spawning more.`,
        });
      }
      const count = Math.max(1, Math.min(5, body.count ?? 1));
      const ids: string[] = [];
      for (let i = 0; i < count && activeCount + ids.length < MAX_ACTIVE; i++) {
        const order = await buildOrder(slug);
        if (!order) {
          return NextResponse.json({ error: "No menu items for this location" }, { status: 400 });
        }
        const saved = await createSimulatedOrder(order);
        ids.push(saved.id);
      }
      return NextResponse.json({ ok: true, spawned: ids.length, ids });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  },
);
