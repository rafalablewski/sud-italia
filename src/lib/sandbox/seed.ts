/**
 * Simulation-dataset seeder — populates the `sim:` namespace with rich,
 * internally-consistent data across every namespaced domain, using the real
 * store functions (so it lands in the namespace via the store's key-prefixing).
 * Runs ONLY while Simulation mode is active (the toggle route enables it first).
 * It never writes a shared key — the menu, recipes and ingredients stay real.
 *
 * `seedSimulation()` lays down the full CORE picture (orders → KDS + CRM +
 * analytics + loyalty, tables, slots, staff, schedule, cash, waste, HACCP,
 * feedback, bookings) as a realistic, deep pre-launch dry-run so every
 * operational surface shows a working business the moment the mode is enabled.
 */
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getMenuWithOverrides } from "@/data/menus";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  getActiveDataMode,
  bulkAppendOrders,
  saveTable,
  createSlot,
  getSlots,
  addLoyaltyMember,
  addPointAdjustment,
  saveStaff,
  bulkAppendShifts,
  recordTimePunch,
  saveSupplier,
  savePurchaseOrder,
  bulkAppendStockMovements,
  bulkUpsertIngredientStock,
  bulkAppendWasteLogs,
  bulkAppendTempLogs,
  saveFeedback,
  saveSurveyResponse,
  openCashSession,
  appendCashDrop,
  closeCashSession,
  addNotification,
  saveTask,
  getIngredients,
  fireKdsTickets,
  recomputeCustomerRollupsBulk,
  appendAgentEvent,
} from "@/lib/store";
import { createBooking } from "@/lib/booking";
import { HACCP_SENSORS, rangeForSensor } from "@/lib/haccp";
import type { WasteReason } from "@/lib/store";
import type {
  CartItem,
  FulfillmentType,
  IngredientStock,
  MenuItem,
  Order,
  OrderStatus,
  PurchaseOrderStatus,
  Shift,
  ShiftStatus,
  StaffRole,
  StockMovement,
  StockMovementType,
  TimeSlot,
} from "@/data/types";

type Customer = { name: string; phone: string };

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const min = (m: number) => m * 60_000;
const hours = (h: number) => h * 3_600_000;
const days = (d: number) => d * 86_400_000;
// Id prefix for seeded rows (sim-…) for legibility. Bound to each seed call's
// async context via AsyncLocalStorage so two interleaving seeds can't clobber a
// shared mutable — `idp.toString()` resolves per execution context, not globally.
const idpStorage = new AsyncLocalStorage<string>();
const idp = { toString: () => idpStorage.getStore() ?? "sim" };
const rid = (p: string) => `${idp}-${p}-${Math.random().toString(36).slice(2, 8)}`;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const today = new Date(NOW).toISOString().slice(0, 10);

/** Live progress sink for the Settings → Simulations seed console. The seeder
 *  emits a monotonic percent (0–99; the route caps the final 100) plus a
 *  one-line description of the phase it is *about* to run, so the operator sees
 *  what the deep dry-run is doing instead of a blind spinner. */
export type SeedProgress = (e: { pct: number; msg: string }) => void;

const GUESTS = [
  { name: "Lucia Bianchi", phone: "+48600200412" },
  { name: "Giulia Romano", phone: "+48600200533" },
  { name: "Marek Kowalski", phone: "+48600200644" },
  { name: "Sofia Ferrari", phone: "+48600200755" },
  { name: "Anna Wójcik", phone: "+48600200866" },
  { name: "Tomasz Nowak", phone: "+48600200977" },
];
const CHANNELS: FulfillmentType[] = ["dine-in", "takeout", "delivery"];

// Service-hour weights — dinner heaviest, then lunch, light shoulders/late — so
// the deep simulation dataset shows real Daypart/Hourly peaks instead of a flat
// line. Index = UTC hour; weight = relative order share at that hour.
const HOUR_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [11, 2], [12, 6], [13, 7], [14, 4], [15, 2], [16, 2],
  [17, 4], [18, 7], [19, 9], [20, 8], [21, 5], [22, 2],
];
const HOUR_POOL: number[] = HOUR_WEIGHTS.flatMap(([h, w]) => Array(w).fill(h));

/** A completed order placed `dayAgo` days back at a weighted service hour. */
function serviceHourIso(dayAgo: number): string {
  const at = new Date(NOW - days(dayAgo));
  at.setUTCHours(pick(HOUR_POOL), Math.floor(Math.random() * 60), 0, 0);
  return at.toISOString();
}
/** Weekend/Friday demand uplift (+ a little noise) for a day N days ago. */
function dayVolume(base: number, dayAgo: number): number {
  const dow = new Date(NOW - days(dayAgo)).getUTCDay(); // 0 Sun … 6 Sat
  const f = dow === 6 || dow === 0 ? 1.4 : dow === 5 ? 1.2 : 1;
  return Math.max(1, Math.round(base * f * (0.8 + Math.random() * 0.4)));
}

// --- HACCP + waste history --------------------------------------------------
// Deep, dated compliance history so the HACCP log and Waste log screens show a
// real record (not a couple of recent rows). Temps are carried in TENTHS of a
// degree (see @/lib/haccp), so a "fridge" reading of 3.2°C is 32 — the verdict
// (ok/flagged) is derived from the sensor's band on save.
const HACCP_DAYS = 30; // ~matches the 30d UI preset; deep enough to feel real
const WASTE_DAYS = 30;

/** A plausible reading (tenths °C) for a sensor: in-band most of the time, an
 *  occasional out-of-band breach so the log has real flagged rows. Cold/freezer
 *  units flag WARM (door left open); hot-hold flags COLD (cooling too far). */
function tempReading(sensor: string): number {
  const r = rangeForSensor(sensor);
  const span = r.maxTenths - r.minTenths;
  if (Math.random() < 0.05) {
    return sensor.toLowerCase().includes("hot")
      ? r.minTenths - (20 + Math.floor(Math.random() * 70)) // hot-hold drifts cold
      : r.maxTenths + (20 + Math.floor(Math.random() * 90)); // chilled/frozen drifts warm
  }
  // Keep ok readings off the band edges so they read as comfortably in-range.
  const lo = r.minTenths + Math.round(span * 0.2);
  const hi = r.maxTenths - Math.round(span * 0.2);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Reason-coded waste presets — realistic item / unit / reason / unit-cost
 *  (grosze) so the daily write-off and "top reason" KPIs are believable. */
const WASTE_PRESETS: { item: string; unit: string; qtyMax: number; reason: WasteReason; costPerUnit: number }[] = [
  { item: "Mozzarella di Bufala", unit: "kg", qtyMax: 2, reason: "spoilage", costPerUnit: 2800 },
  { item: "San Marzano tomatoes", unit: "kg", qtyMax: 3, reason: "spoilage", costPerUnit: 900 },
  { item: "Dough balls", unit: "pcs", qtyMax: 14, reason: "overproduction", costPerUnit: 120 },
  { item: "Margherita", unit: "pcs", qtyMax: 3, reason: "prep_error", costPerUnit: 900 },
  { item: "Marinara", unit: "pcs", qtyMax: 2, reason: "dropped", costPerUnit: 800 },
  { item: "Fresh basil", unit: "bunch", qtyMax: 4, reason: "expired", costPerUnit: 350 },
  { item: "Prosciutto di Parma", unit: "kg", qtyMax: 1, reason: "spoilage", costPerUnit: 6500 },
  { item: "Tiramisù", unit: "pcs", qtyMax: 4, reason: "customer_return", costPerUnit: 1500 },
];

type SeedTempLog = { locationSlug: string; sensor: string; tempCelsius: number; recordedBy?: string; recordedAt: string };
type SeedWasteLog = { locationSlug: string; item: string; quantity: number; unit: string; reason: WasteReason; estimatedCostGrosze?: number; recordedBy?: string; recordedAt: string };

/** Build a location's HACCP reads: every sensor, twice a day (open + close),
 *  across HACCP_DAYS — skipping any timestamp still in the future today. */
function buildTempHistory(slug: string): SeedTempLog[] {
  const out: SeedTempLog[] = [];
  for (let dayAgo = HACCP_DAYS - 1; dayAgo >= 0; dayAgo--) {
    for (const hour of [7, 22]) {
      for (const sensor of HACCP_SENSORS) {
        const at = new Date(NOW - days(dayAgo));
        at.setUTCHours(hour, Math.floor(Math.random() * 30), 0, 0);
        if (at.getTime() > NOW) continue; // don't log the future
        out.push({ locationSlug: slug, sensor, tempCelsius: tempReading(sensor), recordedBy: pick(["manager", "chef", "pizzaiolo"]), recordedAt: at.toISOString() });
      }
    }
  }
  return out;
}

/** Build a location's waste history: a steady ~1/day reason-coded trickle with
 *  some quiet days, plus a guaranteed entry today so the today KPIs populate. */
function buildWasteHistory(slug: string): SeedWasteLog[] {
  const out: SeedWasteLog[] = [];
  for (let dayAgo = WASTE_DAYS - 1; dayAgo >= 0; dayAgo--) {
    const count = dayAgo === 0 ? 1 + Math.floor(Math.random() * 2) : Math.random() < 0.3 ? 0 : 1 + Math.floor(Math.random() * 2);
    for (let k = 0; k < count; k++) {
      const p = pick(WASTE_PRESETS);
      const qty = Math.max(0.5, Math.round((0.5 + Math.random() * p.qtyMax) * 2) / 2);
      const at = new Date(NOW - days(dayAgo));
      const hour = dayAgo === 0 ? 8 + Math.floor(Math.random() * 2) : 9 + Math.floor(Math.random() * 13);
      at.setUTCHours(hour, Math.floor(Math.random() * 60), 0, 0);
      if (at.getTime() > NOW) continue;
      out.push({ locationSlug: slug, item: p.item, quantity: qty, unit: p.unit, reason: p.reason, estimatedCostGrosze: Math.round(qty * p.costPerUnit), recordedBy: pick(["chef", "pizzaiolo", "manager"]), recordedAt: at.toISOString() });
    }
  }
  return out;
}

// --- Staff rota (recurring weekly template) --------------------------------
// The Schedule screen shows a ROLLING 7-day window starting TODAY, so seeding
// only past shifts left the visible week almost empty. Instead lay down a
// stable per-weekday rota across a multi-week window — the SAME pattern every
// week — so whatever 7 days are shown land on a full, consistent rota.
const ROTA_PAST_DAYS = 7; // history (done shifts, time-punches)
const ROTA_FUTURE_DAYS = 13; // ahead (scheduled) — covers today..+6 with headroom
// staffIdx indexes the per-location roster, built in STAFF_ROLES order:
// [manager, pizzaiolo, chef, waiter, waiter, driver]. Same six shifts daily =
// full lunch + dinner coverage, identical every week.
const ROTA_TEMPLATE: { staffIdx: number; role: StaffRole; start: string; end: string }[] = [
  { staffIdx: 0, role: "manager", start: "10:00", end: "18:00" },
  { staffIdx: 2, role: "chef", start: "11:00", end: "21:00" },
  { staffIdx: 1, role: "pizzaiolo", start: "11:30", end: "22:30" },
  { staffIdx: 3, role: "waiter", start: "11:00", end: "16:00" },
  { staffIdx: 4, role: "waiter", start: "16:30", end: "23:00" },
  { staffIdx: 5, role: "driver", start: "16:00", end: "23:00" },
];

/** ISO timestamp at `dayOffset` days from today (UTC) at `hh:mm`. Negative
 *  offset = past. Built in UTC so the day matches the Schedule grid's grouping
 *  (which keys off the ISO date). */
function rotaIso(dayOffset: number, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(NOW);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
}
/** Verdict for a shift against NOW: past = done, straddling = in-progress. */
function rotaStatus(startIso: string, endIso: string): ShiftStatus {
  if (Date.parse(endIso) < NOW) return "done";
  if (Date.parse(startIso) <= NOW) return "in-progress";
  return "scheduled";
}

// --- Inventory (stock levels + movement history) ---------------------------
/** A par level (in the ingredient's own unit) sized to the unit so the numbers
 *  read sensibly — kilos/litres in the tens, pieces in the dozens. */
function baseParFor(unit: string): number {
  switch (unit.toLowerCase()) {
    case "kg": return 8 + Math.floor(Math.random() * 16);
    case "l": return 6 + Math.floor(Math.random() * 14);
    case "g": case "ml": return 2000 + Math.floor(Math.random() * 4000);
    default: return 30 + Math.floor(Math.random() * 90); // pieces / units
  }
}

type SeedStockBuild = { stock: IngredientStock[]; movements: StockMovement[] };
/** Build a location's inventory: a par/reorder + onHand stock row per catalogue
 *  ingredient, with a ~3-week receive/consume/(occasional) waste movement
 *  history whose net EXACTLY equals onHand (so the log and on-hand agree, the
 *  invariant createStockMovement maintains). A realistic share lands below
 *  reorder so the low-stock alerts have something to fire on. */
function buildInventory(slug: string, ingredients: { id: string; unit: string; costPerUnit?: number }[]): SeedStockBuild {
  const stock: IngredientStock[] = [];
  const movements: StockMovement[] = [];
  const mkMove = (ingredientId: string, type: StockMovementType, quantity: number, agoMs: number, reason: string, costImpact?: number): StockMovement =>
    ({ id: rid("mv"), ingredientId, locationSlug: slug, type, quantity, costImpact, reason, occurredAt: iso(agoMs), byUser: "system:seed" });

  for (const ing of ingredients) {
    const par = baseParFor(ing.unit);
    const reorder = Math.max(1, Math.round(par * 0.4));
    const unitCost = ing.costPerUnit && ing.costPerUnit > 0 ? ing.costPerUnit : 200 + Math.floor(Math.random() * 1800);
    // Buy ~1.4–2.2× par over the window across two receipts, then consume most
    // of it; onHand falls out of the net so it always matches the movements.
    const receivedTotal = Math.round(par * (1.4 + Math.random() * 0.8));
    const r1 = Math.round(receivedTotal * 0.55);
    const r2 = receivedTotal - r1;
    movements.push(mkMove(ing.id, "receive", r1, days(21), "Opening stock", Math.round(r1 * unitCost)));
    movements.push(mkMove(ing.id, "receive", r2, days(9), "PO receipt", Math.round(r2 * unitCost)));
    const consumedTotal = Math.round(receivedTotal * (0.55 + Math.random() * 0.38));
    let left = consumedTotal;
    const chunk = Math.max(1, Math.round(consumedTotal / 8));
    for (let d = 16; d >= 1 && left > 0; d -= 2) {
      const q = Math.min(left, chunk);
      movements.push(mkMove(ing.id, "consume", -q, days(d), "Service usage"));
      left -= q;
    }
    let wasted = 0;
    if (Math.random() < 0.12) {
      wasted = Math.max(1, Math.round(par * 0.05));
      movements.push(mkMove(ing.id, "waste", -wasted, days(3), "Spoilage", Math.round(wasted * unitCost)));
    }
    const onHand = Math.max(0, receivedTotal - consumedTotal - wasted);
    stock.push({ ingredientId: ing.id, locationSlug: slug, onHand, parLevel: par, reorderPoint: reorder, lastCountedAt: iso(days(2)), lastCountedBy: "manager", updatedAt: iso(hours(6)) });
  }
  return { stock, movements };
}

// A realistic guest base for the deep simulation dataset: the 6 named regulars
// (enrolled in loyalty, heavily weighted) plus a long tail of occasional guests,
// so Cohort/LTV-CAC and CRM see many one-timers + a few regulars — not 6 whales.
const FIRST_NAMES = ["Jan", "Anna", "Piotr", "Maria", "Tomasz", "Katarzyna", "Krzysztof", "Agnieszka", "Marco", "Sofia", "Luca", "Elena", "Paweł", "Magda", "Andrzej", "Ewa", "Michał", "Zofia", "Marek", "Julia", "Kamil", "Natalia", "Bartosz", "Alicja"];
const LAST_NAMES = ["Nowak", "Kowalski", "Wiśniewski", "Wójcik", "Kowalczyk", "Kamiński", "Lewandowski", "Zieliński", "Szymański", "Woźniak", "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Greco", "Conti"];
/** Build a weighted guest base + a pick() pool that favours the regulars while
 *  spreading most orders across a tail of light/one-time guests. */
function buildGuestBase(synthetic: number): { regulars: Customer[]; pickGuest: () => Customer; rollupPhones: string[] } {
  const tail: { c: Customer; weight: number }[] = [];
  for (let i = 0; i < synthetic; i++) {
    const c: Customer = { name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`, phone: `+48${700000000 + i}` };
    // ~15% are semi-regulars (weight 4–11); the rest are one/two-timers.
    tail.push({ c, weight: Math.random() < 0.15 ? 4 + Math.floor(Math.random() * 8) : 1 });
  }
  const weighted: Customer[] = [
    ...GUESTS.flatMap((g) => Array(18).fill(g) as Customer[]),
    ...tail.flatMap((t) => Array(t.weight).fill(t.c) as Customer[]),
  ];
  // Roll up the 6 regulars + the heaviest tail guests (cap kept low so the
  // per-phone rollup re-reads stay cheap on Neon); the rest still surface in
  // order-derived CRM + cohort analytics.
  const heavyTail = tail.filter((t) => t.weight >= 4).slice(0, 18).map((t) => t.c.phone);
  return {
    regulars: GUESTS,
    pickGuest: () => pick(weighted),
    rollupPhones: [...GUESTS.map((g) => g.phone), ...heavyTail],
  };
}

function lineFrom(menu: MenuItem[], cat: string, locationSlug: string, qty: number): CartItem | null {
  const pool = menu.filter((m) => m.available && m.category === cat);
  if (pool.length === 0) return null;
  return { menuItem: pick(pool), quantity: qty, locationSlug };
}
function buildCart(menu: MenuItem[], locationSlug: string): CartItem[] {
  const cart: CartItem[] = [];
  const pizza = lineFrom(menu, "pizza", locationSlug, 1 + Math.floor(Math.random() * 2));
  if (pizza) cart.push(pizza);
  if (Math.random() > 0.4) { const a = lineFrom(menu, "antipasti", locationSlug, 1); if (a) cart.push(a); }
  if (Math.random() > 0.5) { const d = lineFrom(menu, "drinks", locationSlug, 1 + Math.floor(Math.random() * 2)); if (d) cart.push(d); }
  if (cart.length === 0 && menu[0]) cart.push({ menuItem: menu[0], quantity: 1, locationSlug });
  return cart;
}
const cartTotal = (cart: CartItem[]) => cart.reduce((s, c) => s + c.menuItem.price * c.quantity, 0);

/** Build one demo order object WITHOUT persisting it. The seeder collects these
 *  and lands them via bulkAppendOrders (one locked write per location) so a deep
 *  dataset stays cheap, then fires KDS + rebuilds CRM rollups once afterward. */
function buildOrder(
  locationSlug: string,
  menu: MenuItem[],
  opts: { status: OrderStatus; ageMs?: number; atIso?: string; channel?: FulfillmentType; guestIdx?: number; customer?: Customer },
): Order {
  const cart = buildCart(menu, locationSlug);
  const channel = opts.channel ?? pick(CHANNELS);
  const guest = opts.customer ?? (opts.guestIdx != null ? GUESTS[opts.guestIdx] : pick(GUESTS));
  const createdAt = opts.atIso ?? iso(opts.ageMs ?? 0);
  return {
    id: rid("ord"),
    locationSlug,
    items: cart,
    totalAmount: cartTotal(cart),
    status: opts.status,
    customerName: guest.name,
    customerPhone: guest.phone,
    fulfillmentType: channel,
    partySize: channel === "dine-in" ? 2 + Math.floor(Math.random() * 3) : undefined,
    deliveryAddress: channel === "delivery" ? "ul. Floriańska 12/3" : undefined,
    slotId: "",
    slotDate: createdAt.slice(0, 10),
    slotTime: createdAt.slice(11, 16),
    createdAt,
    paidAt: createdAt,
    channel: Math.random() > 0.7 ? "whatsapp" : "web",
    simulated: false,
  };
}

async function seedTables(locationSlug: string): Promise<string[]> {
  const layout = [
    { number: "1", seats: 2, zone: "Window" }, { number: "2", seats: 2, zone: "Window" },
    { number: "3", seats: 4, zone: "Main" }, { number: "5", seats: 4, zone: "Main" },
    { number: "7", seats: 2, zone: "Window" }, { number: "9", seats: 4, zone: "Main" },
    { number: "11", seats: 6, zone: "Back" }, { number: "12", seats: 6, zone: "Patio" },
  ];
  const ids: string[] = [];
  for (const t of layout) {
    const saved = await saveTable({
      id: `${idp}-tbl-${locationSlug}-${t.number}`,
      locationSlug, number: t.number, seats: t.seats, zone: t.zone,
      status: ["1", "3", "9"].includes(t.number) ? "seated" : "available",
    });
    ids.push(saved.id);
  }
  return ids;
}
async function seedSlots(locationSlug: string): Promise<void> {
  const windows = [
    { time: "12:00", max: 60, cur: 40 }, { time: "13:00", max: 78, cur: 52 },
    { time: "18:00", max: 90, cur: 30 }, { time: "20:00", max: 96, cur: 85 },
    { time: "21:30", max: 60, cur: 38 },
  ];
  for (const w of windows) {
    const slot: TimeSlot = {
      id: `${idp}-slot-${locationSlug}-${w.time.replace(":", "")}`,
      locationSlug, date: today, time: w.time, maxOrders: w.max, currentOrders: w.cur,
      fulfillmentTypes: ["dine-in", "takeout"], status: "active",
    };
    await createSlot(slot);
  }
}

const STAFF_ROLES: { role: StaffRole; rate: number }[] = [
  { role: "manager", rate: 4200 }, { role: "pizzaiolo", rate: 3400 }, { role: "chef", rate: 3600 },
  { role: "waiter", rate: 2800 }, { role: "waiter", rate: 2800 }, { role: "driver", rate: 2900 },
];

// Order volume for the deep, realistic rehearsal: a real daily rate across
// ~6 months, weekend-weighted, spread across service hours and a long guest
// tail — so Reports, Cohort/LTV-CAC, SSSG, Dayparts, Hourly throughput and Menu
// engineering all have genuine signal.
// ~6 months deep so cohort RETENTION (returning vs new) has a real prior
// period at every UI window preset (30/90/180d), and SSSG/seasonality too.
//
// ordersPerDay is sized so the business is ECONOMICALLY SOUND: a busy
// restaurant doing ~70 covers/day at the real ~80 zł avg ticket grosses
// ~180k zł/month, which puts the full-week 6-person rota (~48.5k zł/month) at a
// healthy ~27% labor cost — not the bankrupt 200%+ a token volume produced.
// syntheticGuests scales with volume so the long tail stays mostly one-timers
// (≈ orders ÷ ~2) instead of everyone becoming a regular; recentOrders is
// ~half a day's covers so "today" tracks the daily rate on the dashboards.
//
// HARD CEILING — do NOT raise historyDays back toward a year. In simulation
// mode every domain is stored as ONE kv-blob value (no indexed table), and Neon
// caps a single request at 64MB. At 70/day × 2 locations each order is ~1.2KB,
// so the combined orders.json lands ~34MB at 180 days — comfortably under the
// limit with headroom for production's richer menu. 300 days produced a ~54MB
// blob that (doubled by the old upsert) hit Neon's 413 "request too large".
// Keep the orders blob well under ~45MB: if you need more depth, shard the blob
// or move sim orders to a namespaced table — don't just bump this number.
type Volume = { historyDays: number; ordersPerDay: number; syntheticGuests: number; recentOrders: number };
const SIM_VOLUME: Volume = { historyDays: 180, ordersPerDay: 70, syntheticGuests: 12000, recentOrders: 36 };

/** The seed body — always runs inside the idpStorage("sim") context set by
 *  seedSimulation(), so rid() resolves the sim- prefix. */
async function seedActiveDataset(progress?: SeedProgress): Promise<void> {
  const vol = SIM_VOLUME;
  const locations = await getActiveLocationsAsync();
  const ingredients = await getIngredients(); // shared catalogue
  // Simulation trades against a long guest tail (mostly one-timers + a core).
  const base = buildGuestBase(vol.syntheticGuests);

  // Live progress for the seed console. `total` is the count of tick() calls
  // below: 4 global + 11 per location + 7 finalize. Keep these in sync if you
  // add or remove a milestone, or the bar will drift.
  let step = 0;
  const total = 4 + locations.length * 11 + 7;
  const tick = (msg: string) => {
    step += 1;
    progress?.({ pct: Math.min(99, Math.round((step / total) * 100)), msg });
  };
  tick("Preparing menu, ingredients & guest base");

  // Loyalty members (drive CRM tiers + points) — chain-wide.
  tick("Enrolling loyalty members");
  for (let i = 0; i < GUESTS.length; i++) {
    const g = GUESTS[i];
    const [first, ...rest] = g.name.split(" ");
    await addLoyaltyMember({ phone: g.phone, name: first, lastName: rest.join(" "), signedUpAt: iso(days(30 + i * 20)) });
  }
  await addPointAdjustment({ phone: GUESTS[0].phone, amount: 150, reason: "Anniversary gesture (demo)", adjustedBy: "owner", adjustedAt: iso(days(2)) });
  await addPointAdjustment({ phone: GUESTS[2].phone, amount: -50, reason: "Goodwill correction (demo)", adjustedBy: "manager", adjustedAt: iso(days(5)) });

  // AI agent spend (chain-wide) — a daily boardroom briefing plus rotating
  // scheduled self-reviews across the trailing ~2 weeks, so the Morning Brief's
  // "AI agents · spend" module (yesterday / last 30 days / day-over-day) and Agent
  // HQ aren't empty. Actors meeting:/schedule: are the off-ledger rows the spend
  // helpers sum. d=1 is yesterday, d=2 the prior day — both are populated so the
  // day-over-day change has a denominator. All offsets stay inside the 30d window.
  tick("Seeding AI agent activity");
  const aiPersonas = ["coo", "cfo", "cmo", "ceo"];
  for (let d = 1; d <= 14; d++) {
    await appendAgentEvent({
      agentId: "ceo", type: "schedule", actor: "meeting:daily",
      summary: "Daily boardroom briefing — chain numbers reviewed",
      costGrosze: 250 + (d % 4) * 15, ok: true, at: iso(days(d) + hours(3)),
    });
    if (d % 2 === 1 || d <= 2) {
      const a = aiPersonas[d % aiPersonas.length];
      await appendAgentEvent({
        agentId: a, type: "run", actor: "schedule:cron",
        summary: `${a.toUpperCase()} scheduled self-review`,
        costGrosze: 100 + (d % 3) * 20, ok: true, at: iso(days(d) + hours(6)),
      });
    }
  }

  // Suppliers (chain-wide) + a couple of POs.
  tick("Adding suppliers");
  const suppliers = [
    await saveSupplier({ name: "Latteria Napoli", contactName: "Paolo Russo", email: "orders@latterianapoli.it", phone: "+390811234567", leadTimeDays: 3 }),
    await saveSupplier({ name: "Mulino Caputo", contactName: "Anna Caputo", email: "sales@mulinocaputo.it", leadTimeDays: 5 }),
    await saveSupplier({ name: "Kraków Fresh Produce", contactName: "Jan Lewandowski", phone: "+48126540011", leadTimeDays: 1 }),
  ];

  // HACCP + waste are single cross-location kv blobs, so accumulate every
  // location's deep history and land each in ONE write after the loop.
  const allTempLogs: SeedTempLog[] = [];
  const allWasteLogs: SeedWasteLog[] = [];
  // Shifts / stock / movements are single cross-location kv blobs too —
  // accumulate every location's history and land each in ONE write after loop.
  const allShifts: Shift[] = [];
  const allStock: IngredientStock[] = [];
  const allMovements: StockMovement[] = [];
  const punches: { staffId: string; shiftId: string; startAt: string; endAt: string; done: boolean }[] = [];

  for (const loc of locations) {
    const slug = loc.slug;
    const locName = loc.city;
    tick(`${locName} — tables & slots`);
    const menu = await getMenuWithOverrides(slug);
    const tableIds = await seedTables(slug);
    await seedSlots(slug);

    tick(`${locName} — building order history (${vol.historyDays} days)`);
    // Orders — a real trading curve: ordersPerDay (weekend-weighted) across
    // every day of the window, each at a weighted service hour, from the long
    // guest tail. Build them all, then land them in one write per location.
    const pending: Order[] = [];
    // Cash drawer reflects ONLY today's cash-paid sales (~1/3 of orders pay
    // cash) — a single till can't hold cumulative history, which would show a
    // nonsensical five-figure expected count on the Cash screen.
    let cashRevenue = 0;
    for (let dayAgo = 1; dayAgo <= vol.historyDays; dayAgo++) {
      const n = dayVolume(vol.ordersPerDay, dayAgo);
      for (let k = 0; k < n; k++) {
        const o = buildOrder(slug, menu, { status: "completed", atIso: serviceHourIso(dayAgo), customer: base.pickGuest() });
        pending.push(o);
      }
    }
    // Recent completed orders (today's throughput) + a live KDS rush.
    for (let i = 0; i < vol.recentOrders; i++) {
      const o = buildOrder(slug, menu, { status: "completed", ageMs: min(8 + i * 7), customer: base?.pickGuest() });
      pending.push(o);
      if (i % 3 === 0) cashRevenue += o.totalAmount; // today's cash share
    }
    const activeMix: OrderStatus[] = ["preparing", "preparing", "confirmed", "ready", "confirmed"];
    const activeOrders: Order[] = [];
    for (let i = 0; i < activeMix.length; i++) {
      const o = buildOrder(slug, menu, { status: activeMix[i], ageMs: min(1 + i * 3), customer: base?.pickGuest() });
      activeOrders.push(o); pending.push(o);
    }
    // Land every order for this location in ONE locked write, then fire KDS for
    // the live ones (awaited, so no race on the kv blob).
    tick(`${locName} — landing ${pending.length.toLocaleString("en-US")} orders & live KDS`);
    await bulkAppendOrders(pending);
    for (const o of activeOrders) await fireKdsTickets(o);

    // Staff (the per-location roster, in STAFF_ROLES order so the rota template
    // can index it) + a recurring weekly rota across the visible window.
    tick(`${locName} — staff & weekly rota`);
    const roster: { id: string; role: StaffRole }[] = [];
    for (let i = 0; i < STAFF_ROLES.length; i++) {
      const s = await saveStaff({
        name: `${pick(["Marco", "Elena", "Piotr", "Giulia", "Kasia", "Luca"])} ${pick(["R.", "B.", "K.", "N.", "W."])}`,
        role: STAFF_ROLES[i].role, locationSlug: slug, hourlyRateGrosze: STAFF_ROLES[i].rate,
        status: "active", hireDate: iso(days(120 + i * 30)).slice(0, 10),
      });
      roster.push({ id: s.id, role: STAFF_ROLES[i].role });
    }
    for (let off = -ROTA_PAST_DAYS; off <= ROTA_FUTURE_DAYS; off++) {
      for (const t of ROTA_TEMPLATE) {
        const member = roster[t.staffIdx % roster.length];
        if (!member) continue;
        const startAt = rotaIso(off, t.start);
        const endAt = rotaIso(off, t.end);
        const status = rotaStatus(startAt, endAt);
        allShifts.push({ id: rid("shift"), staffId: member.id, locationSlug: slug, startAt, endAt, role: t.role, status });
        // Time-punches for the last couple of days' worked shifts only.
        if (off >= -2 && (status === "done" || status === "in-progress")) {
          punches.push({ staffId: member.id, shiftId: allShifts[allShifts.length - 1].id, startAt, endAt, done: status === "done" });
        }
      }
    }

    // Inventory — a par/reorder + onHand stock row per catalogue ingredient with
    // a ~3-week movement history (net == onHand). Built here, landed once after
    // the loop. No-op when the (real, shared) ingredient catalogue is empty.
    tick(`${locName} — inventory levels`);
    const inv = buildInventory(slug, ingredients);
    allStock.push(...inv.stock);
    allMovements.push(...inv.movements);

    // HACCP + waste — a deep, dated history (built here, landed once after the
    // loop) so both compliance screens show a real record, not a couple of rows.
    tick(`${locName} — HACCP & waste history`);
    allTempLogs.push(...buildTempHistory(slug));
    allWasteLogs.push(...buildWasteHistory(slug));

    // Feedback + survey responses (tied to seeded guests).
    tick(`${locName} — guest feedback & surveys`);
    for (let i = 0; i < 4; i++) {
      const g = pick(GUESTS);
      await saveFeedback({
        id: rid("fb"), orderId: rid("ord"), customerName: g.name, customerPhone: g.phone, locationSlug: slug,
        date: iso(days(i)), overallRating: pick([5, 5, 4, 5, 3]),
        categoryRatings: { food: pick([5, 4, 5]), service: pick([5, 4, 4]), speed: pick([4, 5, 3]) },
        comment: pick(["Best Margherita in town!", "Quick and friendly.", "A touch slow at peak but worth it.", "Loved the buffalo mozzarella."]),
        status: "new",
      });
    }
    for (let i = 0; i < 5; i++) {
      await saveSurveyResponse({ id: rid("sv"), surveyId: "post-order", trigger: "post-order", rating: pick([5, 5, 4, 5, 3, 4]), comment: i % 2 ? "Smooth checkout" : undefined, customerPhone: pick(GUESTS).phone, locationSlug: slug, date: iso(days(i)) });
    }

    // Cash session — open with a float, record the day's cash takings as a SALE
    // drop (the drawer math counts the close against opening float + drops, so
    // sales MUST be recorded here, not just added to the counted total), bank a
    // mid-shift safe drop when the till runs heavy, then close with a small
    // realistic variance (the EOD shrink signal stays ±a few złoty, not +900).
    tick(`${locName} — cash drawer session`);
    const opened = await openCashSession({ locationSlug: slug, openingFloat: 30000, openedBy: "manager", notes: "Morning float" });
    if (!("error" in opened)) {
      await appendCashDrop(opened.id, { amountGrosze: cashRevenue, kind: "sale", actor: "manager", notes: "Cash sales (today)" });
      let dropsSum = cashRevenue;
      if (cashRevenue > 60000) {
        const safeDrop = -40000; // -400 zł to the safe mid-shift
        await appendCashDrop(opened.id, { amountGrosze: safeDrop, kind: "drop", actor: "manager", notes: "Mid-shift safe drop" });
        dropsSum += safeDrop;
      }
      const expected = 30000 + dropsSum;
      await closeCashSession(opened.id, expected + pick([0, 0, -250, 150, -100]), "manager", "EOD count");
    }

    // Bookings tonight against the 20:00 slot.
    tick(`${locName} — tonight's bookings`);
    const slots = await getSlots(slug, today);
    const dinner = slots.find((s) => s.time === "20:00");
    if (dinner) {
      const picks = [
        { name: GUESTS[0].name, phone: GUESTS[0].phone, party: 2, table: tableIds[4], notes: "Anniversary 🥂" },
        { name: GUESTS[5].name, phone: GUESTS[5].phone, party: 4, table: tableIds[5] },
        { name: GUESTS[1].name, phone: GUESTS[1].phone, party: 6, table: tableIds[6] },
      ];
      for (const p of picks) {
        await createBooking({ locationSlug: slug, slotId: dinner.id, tableId: p.table, customerName: p.name, customerPhone: p.phone, partySize: p.party, notes: p.notes });
      }
    }

    // Purchase orders — a spread across suppliers and every status, referencing
    // the shared ingredient catalogue, dated across the past few weeks so the PO
    // board shows a real pipeline (draft → sent → received, plus a cancellation).
    tick(`${locName} — purchase orders`);
    if (ingredients.length > 0) {
      const poPlan: { status: PurchaseOrderStatus; createdAgo: number }[] = [
        { status: "received", createdAgo: days(18) },
        { status: "received", createdAgo: days(11) },
        { status: "sent", createdAgo: days(4) },
        { status: "draft", createdAgo: days(1) },
        { status: "cancelled", createdAgo: days(7) },
      ];
      for (let p = 0; p < poPlan.length; p++) {
        const plan = poPlan[p];
        const sup = suppliers[p % suppliers.length];
        const lineCount = Math.min(ingredients.length, 2 + Math.floor(Math.random() * 3));
        const lines = Array.from({ length: lineCount }, (_, idx) => {
          const ing = ingredients[(p * 3 + idx) % ingredients.length];
          return { ingredientId: ing.id, quantity: 10 + Math.floor(Math.random() * 30), unitCost: ing.costPerUnit && ing.costPerUnit > 0 ? ing.costPerUnit : 300 + Math.floor(Math.random() * 1500) };
        });
        await savePurchaseOrder({
          supplierId: sup.id, locationSlug: slug, status: plan.status, lines,
          expectedAt: iso(plan.createdAgo - days(3)),
          receivedAt: plan.status === "received" ? iso(plan.createdAgo - days(3)) : undefined,
          createdAt: iso(plan.createdAgo), createdBy: "manager",
        });
      }
    }

    // A couple of ops tasks + notifications so those panels aren't empty.
    tick(`${locName} — ops tasks & alerts`);
    await saveTask({
      title: "Restock buffalo mozzarella", detail: "Below reorder point at this location.",
      assigneeId: "owner", assigneeName: "Rafał", createdBy: "owner", createdByName: "Rafał",
      locationSlug: slug, priority: "high", status: "open",
    });
    await addNotification({ type: "low_stock", title: "Mozzarella below reorder point", message: `${slug}: 1.2kg left`, locationSlug: slug });
  }

  // Land the deep histories in one write each (single locked read-modify-write
  // per cross-location blob) — mirrors bulkAppendOrders so the deep dry-run
  // stays cheap on Neon instead of thousands of round-trips.
  tick(`Landing staff rota (${allShifts.length} shifts)`);
  await bulkAppendShifts(allShifts);
  tick(`Landing inventory stock (${allStock.length} rows)`);
  await bulkUpsertIngredientStock(allStock);
  tick(`Landing stock movements (${allMovements.length})`);
  await bulkAppendStockMovements(allMovements);
  tick(`Landing HACCP readings (${allTempLogs.length})`);
  await bulkAppendTempLogs(allTempLogs);
  tick(`Landing waste log (${allWasteLogs.length})`);
  await bulkAppendWasteLogs(allWasteLogs);
  // Time-punches for recently-worked shifts (small volume, after the rota lands).
  tick(`Recording ${punches.length} time punches`);
  for (const p of punches) {
    await recordTimePunch({ staffId: p.staffId, type: "clock-in", occurredAt: p.startAt, shiftId: p.shiftId });
    if (p.done) await recordTimePunch({ staffId: p.staffId, type: "clock-out", occurredAt: p.endAt, shiftId: p.shiftId });
  }

  // Build the CRM rollups once, now that every order across all locations
  // exists — awaited, so the customer projection is complete and race-free. In
  // realistic mode this covers the regulars + heaviest tail guests; the long
  // tail still surfaces in order-derived CRM + cohort analytics, which read
  // orders directly. recomputeCustomerRollupsBulk reads the (large) order blob
  // ONCE for the whole set — a per-phone loop re-read it once per phone, which
  // is what made "Reset & re-seed" hang past the serverless timeout.
  const rollupPhones = base ? base.rollupPhones : GUESTS.map((g) => g.phone);
  tick(`Rebuilding CRM rollups (${rollupPhones.length} customers)`);
  await recomputeCustomerRollupsBulk(rollupPhones);
}

/** Seed the `sim:` dry-run dataset (the full CORE picture), so every operational
 *  surface is testable the moment Simulation mode is enabled. Refuses to run
 *  unless Simulation mode is active, so a seed can never land in real data.
 *  Pass `progress` to stream phase updates to the Settings seed console. */
export async function seedSimulation(progress?: SeedProgress): Promise<void> {
  if ((await getActiveDataMode()) !== "simulation") {
    throw new Error("seedSimulation refused: simulation mode is not active");
  }
  // Bind the id prefix to this call's async context for the whole seed run.
  return idpStorage.run("sim", () => seedActiveDataset(progress));
}
