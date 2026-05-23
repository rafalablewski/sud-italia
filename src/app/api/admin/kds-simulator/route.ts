import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  createSimulatedOrder,
  deleteSimulatedOrders,
  getOrders,
  getSettings,
} from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { getActiveLocations } from "@/data/locations";
import type { CartItem, Order } from "@/data/types";

/**
 * KDS order-simulator API (admin-gated demo / training tool).
 *
 * Manually driven from the Kitchen Display: when the owner-only
 * settings.kdsSimulatorEnabled toggle is on, the board shows Add 1 / Add 5 /
 * Purge all controls. `spawn` builds synthetic-but-real orders ONLY from the
 * location's real menu (getMenuWithOverrides) and drops them onto the
 * orders-driven KDS via createSimulatedOrder, clearly marked as SIMULATION.
 * The cook then works each ticket through the board with the normal Start prep
 * / Mark ready / Bump buttons — there is no auto-spawn or auto-advance. `purge`
 * clears every simulated ticket in one shot.
 *
 * Orders are tagged simulated:true, so getOrders() hides them from the
 * dashboard, Orders list and every report, and they never touch stock, CRM or
 * customer comms. Kitchen+ may call this so the controls work for whoever is at
 * the pass; spawn is re-checked against the toggle below (purge is always
 * allowed, so turning the toggle off can clear the board).
 */

// Ceiling on simultaneously-active simulated tickets so repeated Add taps can't
// flood the board / DB. Completed sims leave the KDS and don't count.
const MAX_ACTIVE = 40;

// Bound every sim read to the last 24h so the order log can't grow the fetch
// unbounded — wide enough to catch any simulated ticket still on the board.
const SIM_LOOKBACK_MS = 24 * 60 * 60 * 1000;
function simSince(): string {
  return new Date(Date.now() - SIM_LOOKBACK_MS).toISOString();
}

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

export const POST = withAdmin(
  // Kitchen+ so the controls work for whoever is viewing the KDS — the real
  // gate is the owner-only kdsSimulatorEnabled toggle, re-checked below for spawn.
  { roles: ["kitchen"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    let body: { action?: string; count?: number } = {};
    try {
      body = await req.json();
    } catch {
      /* empty body is fine for some actions */
    }

    // Purge is cleanup and stays allowed even when the toggle is off — that's
    // exactly how disabling the simulator clears the board.
    if (body.action === "purge") {
      const removed = await deleteSimulatedOrders(locationSlug ?? undefined);
      return NextResponse.json({ ok: true, removed });
    }

    // Spawn generates fake load, so it requires the toggle.
    const settings = await getSettings();
    if (!settings.kdsSimulatorEnabled) {
      return NextResponse.json({ error: "KDS simulator is disabled in settings" }, { status: 403 });
    }

    // Spawn needs a concrete location (orders are per-truck). Default to the
    // first active truck when the operator is viewing "all".
    const slug = locationSlug ?? getActiveLocations()[0]?.slug;
    if (!slug) {
      return NextResponse.json({ error: "No active location" }, { status: 400 });
    }

    if (body.action === "spawn") {
      const sims = (await getOrders(slug, simSince(), { includeSimulated: true })).filter(
        (o) => o.simulated,
      );
      const activeCount = sims.filter((o) => o.status !== "completed").length;
      if (activeCount >= MAX_ACTIVE) {
        return NextResponse.json({
          ok: false,
          spawned: 0,
          error: `Active simulated tickets capped at ${MAX_ACTIVE} — purge before adding more.`,
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
