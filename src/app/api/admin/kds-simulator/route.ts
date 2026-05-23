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
 * (getMenuWithOverrides) and streams them onto the orders-driven Kitchen
 * Display via createSimulatedOrder, where they show up clearly marked as
 * SIMULATION. Orders are tagged simulated:true, so getOrders() hides them
 * from the dashboard, Orders list and every report, and they never touch
 * stock, CRM or customer comms. Auto-advance walks each ticket through
 * confirmed → preparing → ready → completed on dwell timers; purge removes
 * them in one shot.
 *
 * Driven by the KDS itself: useKdsSimulator runs spawn/advance from any open
 * board while settings.kdsSimulatorEnabled (owner-only toggle) is on. Kitchen+
 * may call it so the generator works for whoever is at the pass, but spawn /
 * advance are re-checked against the toggle below (purge always allowed, so
 * turning the toggle off can clear the board).
 */

// Base dwell windows (ms). Each ticket gets its OWN jittered version of these
// (see dwellsFor) so tickets don't march through the board in lockstep — a real
// kitchen always has fast tickets and slow tickets in flight at the same time.
const DWELL_CONFIRMED = 18_000;
const DWELL_PREPARING = 42_000;
const DWELL_READY = 24_000;
// Ceiling on simultaneously-active simulated tickets so a runaway client
// loop can't flood the board / DB. Completed sims leave the KDS and don't count.
const MAX_ACTIVE = 40;

// Bound every sim read to the last 24h so the order log can't grow the
// fetch unbounded. The active dwell window is only ~2 min, so 24h is wildly
// generous for catching anything still in flight — but wide enough that a
// sim left "confirmed" across a pause still gets advanced (a tight few-minute
// window would orphan it as a permanent stale ticket on the board).
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

// Stable [0,1) hash of a string (FNV-1a). Lets us derive per-ticket dwell
// jitter from the order id, so the age→status mapping stays deterministic
// (repeated advance() calls converge, no per-order timer needed) while every
// ticket still moves on its own schedule.
function hashUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Per-ticket dwell windows: each phase runs 60%–150% of its base, drawn
 *  independently from the id, so one ticket might rush prep but linger at the
 *  pass while another flies through. */
function dwellsFor(id: string): { confirmed: number; preparing: number; total: number } {
  const jitter = (base: number, salt: string) =>
    Math.round(base * (0.6 + 0.9 * hashUnit(id + salt)));
  const confirmed = jitter(DWELL_CONFIRMED, "·c");
  const preparing = jitter(DWELL_PREPARING, "·p");
  const ready = jitter(DWELL_READY, "·r");
  return { confirmed, preparing, total: confirmed + preparing + ready };
}

/** Deterministic age → status using the ticket's own jittered dwells, so
 *  repeated advance() calls converge without a per-order timer. */
function targetStatus(ageMs: number, id: string): OrderStatus {
  const { confirmed, preparing, total } = dwellsFor(id);
  if (ageMs < confirmed) return "confirmed";
  if (ageMs < confirmed + preparing) return "preparing";
  if (ageMs < total) return "ready";
  return "completed";
}

// Forward-only ordering. A cook can now bump a simulated ticket by hand on the
// live KDS, so the age-based auto-advance must never drag it backwards — it
// only ever moves a ticket further along the flow.
const STATUS_FLOW: OrderStatus[] = ["confirmed", "preparing", "ready", "completed"];
function statusRank(s: OrderStatus): number {
  const i = STATUS_FLOW.indexOf(s);
  return i === -1 ? 0 : i;
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
  // Kitchen+ so the auto-run generator works for anyone viewing the KDS — the
  // real gate is the owner-only kdsSimulatorEnabled toggle, re-checked below
  // for spawn/advance.
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

    // Spawn + advance generate fake load, so they require the toggle.
    const settings = await getSettings();
    if (!settings.kdsSimulatorEnabled) {
      return NextResponse.json({ error: "KDS simulator is disabled in settings" }, { status: 403 });
    }

    // Spawn + advance need a concrete location (orders are per-truck).
    // Default to the first active truck when the operator is viewing "all".
    const slug = locationSlug ?? getActiveLocations()[0]?.slug;
    if (!slug) {
      return NextResponse.json({ error: "No active location" }, { status: 400 });
    }

    if (body.action === "advance") {
      // Only non-completed sims can change state, so skip the rest up front.
      const sims = (await getOrders(slug, simSince(), { includeSimulated: true })).filter(
        (o) => o.simulated && o.status !== "completed",
      );
      const now = Date.now();
      let advanced = 0;
      for (const o of sims) {
        const target = targetStatus(now - Date.parse(o.createdAt), o.id);
        // Forward-only: never undo a manual bump a cook made on the board.
        if (statusRank(target) > statusRank(o.status)) {
          await setSimulatedOrderStatus(o.id, target);
          advanced++;
        }
      }
      return NextResponse.json({ ok: true, advanced });
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
