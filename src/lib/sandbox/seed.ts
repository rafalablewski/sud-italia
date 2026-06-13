/**
 * Isolated-dataset seeder — populates the active test namespace (`sandbox:` or
 * `sim:`) with rich, internally-consistent data across every namespaced domain,
 * using the real store functions (so it lands in the active namespace via the
 * store's key-prefixing). Runs ONLY while the matching mode is active (the
 * toggle routes enable + bust the cache before calling). It never writes a
 * shared key — the menu, recipes and ingredients stay real.
 *
 * `seedDataset(mode)` is the shared body; `seedSandbox()` / `seedSimulation()`
 * are the mode-bound entry points. Both produce the same full CORE picture
 * (orders → KDS + CRM + analytics + loyalty, tables, slots, staff, schedule,
 * cash, waste, HACCP, feedback, bookings) so every operational surface shows a
 * working business the moment the mode is enabled. createOrder() already
 * cascades into the customer rollup + KDS tickets, so seeding orders also
 * populates CRM and the kitchen board automatically.
 */
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getMenuWithOverrides } from "@/data/menus";
import {
  getActiveDataMode,
  bulkAppendOrders,
  saveTable,
  createSlot,
  getSlots,
  addLoyaltyMember,
  addPointAdjustment,
  saveStaff,
  saveShift,
  recordTimePunch,
  saveSupplier,
  savePurchaseOrder,
  createStockMovement,
  saveWasteLog,
  saveTempLog,
  saveFeedback,
  saveSurveyResponse,
  openCashSession,
  closeCashSession,
  addNotification,
  saveTask,
  getIngredients,
  getRecipes,
  fireKdsTickets,
  recomputeCustomerRollup,
  appendAgentEvent,
} from "@/lib/store";
import { buildDraws } from "@/lib/inventory-decrement";
import { createBooking } from "@/lib/booking";
import type {
  CartItem,
  FulfillmentType,
  MenuItem,
  Order,
  OrderStatus,
  StaffRole,
  TimeSlot,
} from "@/data/types";

type Customer = { name: string; phone: string };

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const min = (m: number) => m * 60_000;
const hours = (h: number) => h * 3_600_000;
const days = (d: number) => d * 86_400_000;
// Id prefix for seeded rows — set per run by seedDataset(). The two modes are
// mutually exclusive and seeding is serial, so a module-level switch is safe and
// keeps every helper's ids namespaced-by-mode (sb-… vs sim-…) for legibility.
let idp = "sb";
const rid = (p: string) => `${idp}-${p}-${Math.random().toString(36).slice(2, 8)}`;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const today = new Date(NOW).toISOString().slice(0, 10);

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

// Per-mode order volume. Sandbox stays a COMPACT FLAT demo (a fixed handful of
// history — enough to fill every screen). Simulation is a DEEP REALISTIC
// rehearsal: ~90 days of trading at a real daily rate, weekend-weighted, spread
// across service hours and a long guest tail — so Reports, Cohort/LTV-CAC, SSSG,
// Dayparts, Hourly throughput and Menu engineering all have genuine signal. This
// data shape is the real line between the two modes.
type Volume =
  | { kind: "flat"; historyDays: number; historyOrders: number; recentOrders: number }
  | { kind: "realistic"; historyDays: number; ordersPerDay: number; syntheticGuests: number; recentOrders: number };
const VOLUME: Record<"sandbox" | "simulation", Volume> = {
  sandbox: { kind: "flat", historyDays: 28, historyOrders: 24, recentOrders: 6 },
  // ~10 months deep so cohort RETENTION (returning vs new) has a real prior
  // period at every UI window preset (30/90/180d), and SSSG/seasonality too.
  simulation: { kind: "realistic", historyDays: 300, ordersPerDay: 8, syntheticGuests: 2500, recentOrders: 14 },
};

/** Seed the active test namespace. `mode` MUST be the live data mode — the
 *  guard refuses to run otherwise so a seed can never land in real data. */
export async function seedDataset(mode: "sandbox" | "simulation"): Promise<void> {
  if ((await getActiveDataMode()) !== mode) {
    throw new Error(`seedDataset refused: ${mode} mode is not active`);
  }
  idp = mode === "simulation" ? "sim" : "sb";
  const vol = VOLUME[mode];
  const locations = await getActiveLocationsAsync();
  const ingredients = await getIngredients(); // shared catalogue
  const recipes = await getRecipes(); // shared formulas — for the stock draw-down
  // Realistic mode trades against a long guest tail; flat mode reuses the 6
  // named regulars by index (its original, deterministic feel).
  const base = vol.kind === "realistic" ? buildGuestBase(vol.syntheticGuests) : null;

  // Loyalty members (drive CRM tiers + points) — chain-wide.
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
  const suppliers = [
    await saveSupplier({ name: "Latteria Napoli", contactName: "Paolo Russo", email: "orders@latterianapoli.it", phone: "+390811234567", leadTimeDays: 3 }),
    await saveSupplier({ name: "Mulino Caputo", contactName: "Anna Caputo", email: "sales@mulinocaputo.it", leadTimeDays: 5 }),
    await saveSupplier({ name: "Kraków Fresh Produce", contactName: "Jan Lewandowski", phone: "+48126540011", leadTimeDays: 1 }),
  ];

  for (const loc of locations) {
    const slug = loc.slug;
    const menu = await getMenuWithOverrides(slug);
    const tableIds = await seedTables(slug);
    await seedSlots(slug);

    // Orders — history + recent + a live KDS rush. Volume/shape is per-mode
    // (VOLUME). Build them all, then land them in one write per location.
    const pending: Order[] = [];
    let cashRevenue = 0;
    if (vol.kind === "realistic") {
      // A real trading curve: ordersPerDay (weekend-weighted) across every day
      // of the window, each at a weighted service hour, from the long guest tail.
      for (let dayAgo = 1; dayAgo <= vol.historyDays; dayAgo++) {
        const n = dayVolume(vol.ordersPerDay, dayAgo);
        for (let k = 0; k < n; k++) {
          const o = buildOrder(slug, menu, { status: "completed", atIso: serviceHourIso(dayAgo), customer: base!.pickGuest() });
          pending.push(o);
          if (pending.length % 3 === 0) cashRevenue += o.totalAmount;
        }
      }
    } else {
      // Flat demo: a fixed handful of history, evenly fanned across the window.
      for (let d = 0; d < vol.historyOrders; d++) {
        const dayAgo = 1 + Math.floor((d / vol.historyOrders) * (vol.historyDays - 1));
        const o = buildOrder(slug, menu, { status: "completed", atIso: serviceHourIso(dayAgo), guestIdx: d % GUESTS.length });
        pending.push(o);
        if (d % 3 === 0) cashRevenue += o.totalAmount;
      }
    }
    // Recent completed orders (today's throughput) + a live KDS rush.
    const todayOrders: Order[] = [];
    for (let i = 0; i < vol.recentOrders; i++) {
      const o = buildOrder(slug, menu, { status: "completed", ageMs: min(8 + i * 7), customer: base?.pickGuest() });
      pending.push(o); todayOrders.push(o);
      if (i % 2 === 0) cashRevenue += o.totalAmount;
    }
    const activeMix: OrderStatus[] = ["preparing", "preparing", "confirmed", "ready", "confirmed"];
    const activeOrders: Order[] = [];
    for (let i = 0; i < activeMix.length; i++) {
      const o = buildOrder(slug, menu, { status: activeMix[i], ageMs: min(1 + i * 3), customer: base?.pickGuest() });
      activeOrders.push(o); pending.push(o); todayOrders.push(o);
    }
    // Land every order for this location in ONE locked write, then fire KDS for
    // the live ones (awaited, so no race on the kv blob).
    await bulkAppendOrders(pending);
    for (const o of activeOrders) await fireKdsTickets(o);

    // Staff + schedule + time-punches.
    const staffIds: string[] = [];
    for (let i = 0; i < STAFF_ROLES.length; i++) {
      const s = await saveStaff({
        name: `${pick(["Marco", "Elena", "Piotr", "Giulia", "Kasia", "Luca"])} ${pick(["R.", "B.", "K.", "N.", "W."])}`,
        role: STAFF_ROLES[i].role, locationSlug: slug, hourlyRateGrosze: STAFF_ROLES[i].rate,
        status: "active", hireDate: iso(days(120 + i * 30)).slice(0, 10),
      });
      staffIds.push(s.id);
    }
    for (let d = 0; d < 5; d++) {
      for (let k = 0; k < 3; k++) {
        const staffId = staffIds[(d + k) % staffIds.length];
        const startAt = new Date(NOW - days(d) ).toISOString().slice(0, 10) + "T11:00:00.000Z";
        const endAt = new Date(NOW - days(d)).toISOString().slice(0, 10) + "T19:00:00.000Z";
        const shift = await saveShift({ staffId, locationSlug: slug, startAt, endAt, role: pick(STAFF_ROLES).role, status: d === 0 ? "in-progress" : "done" });
        if (d <= 1) {
          await recordTimePunch({ staffId, type: "clock-in", occurredAt: startAt, shiftId: shift.id });
          if (d === 1) await recordTimePunch({ staffId, type: "clock-out", occurredAt: endAt, shiftId: shift.id });
        }
      }
    }

    // Stock movements: a baseline receipt for a few catalogue ingredients, then
    // draw stock down through the REAL recipe math for today's service — receive
    // ~1.8× each ingredient's consumption, then consume it — so on-hand reflects
    // sales (not a static count) and lands positive instead of deep-negative.
    for (let i = 0; i < Math.min(5, ingredients.length); i++) {
      await createStockMovement({ ingredientId: ingredients[i].id, locationSlug: slug, type: "receive", quantity: 20 + i * 5, costImpact: (1500 + i * 300), reason: `PO receipt — ${pick(suppliers).name}`, occurredAt: iso(days(2)) });
    }
    const draw = new Map<string, number>();
    for (const o of todayOrders) {
      for (const d of buildDraws(o, recipes)) draw.set(d.ingredientId, (draw.get(d.ingredientId) ?? 0) + d.quantity);
    }
    for (const [ingredientId, qty] of draw) {
      await createStockMovement({ ingredientId, locationSlug: slug, type: "receive", quantity: Math.ceil(qty * 1.8), reason: "PO receipt — opening stock", occurredAt: iso(days(1)) });
      await createStockMovement({ ingredientId, locationSlug: slug, type: "consume", quantity: -qty, reason: "today's service (seed)", byUser: "system:seed", occurredAt: iso(hours(2)) });
    }
    if (ingredients[0]) {
      await createStockMovement({ ingredientId: ingredients[0].id, locationSlug: slug, type: "waste", quantity: -2, costImpact: 300, reason: "spoilage", occurredAt: iso(hours(20)) });
    }

    // Waste log + HACCP temp logs.
    await saveWasteLog({ locationSlug: slug, item: "Mozzarella di Bufala", quantity: 1.5, unit: "kg", reason: "spoilage", estimatedCostGrosze: 4200, recordedBy: "chef", recordedAt: iso(hours(18)) });
    await saveWasteLog({ locationSlug: slug, item: "Margherita (prep error)", quantity: 2, unit: "pcs", reason: "prep_error", estimatedCostGrosze: 1800, recordedBy: "pizzaiolo", recordedAt: iso(hours(6)) });
    for (let i = 0; i < 6; i++) {
      const flagged = i === 2;
      await saveTempLog({ locationSlug: slug, sensor: pick(["Walk-in fridge", "Dough fridge", "Freezer"]), tempCelsius: flagged ? 9.4 : 2 + Math.random() * 3, recordedBy: "manager", recordedAt: iso(hours(i * 4)) });
    }

    // Feedback + survey responses (tied to seeded guests).
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

    // Cash session — open, a mid-shift drop, close with a small realistic variance.
    const opened = await openCashSession({ locationSlug: slug, openingFloat: 30000, openedBy: "manager", notes: "Morning float (demo)" });
    if (!("error" in opened)) {
      const expected = 30000 + cashRevenue;
      await closeCashSession(opened.id, expected - pick([0, 0, 250, -150, 500]), "manager", "EOD count (demo)");
    }

    // Bookings tonight against the 20:00 slot.
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

    // Purchase orders referencing the shared ingredient catalogue.
    if (ingredients.length >= 2) {
      await savePurchaseOrder({
        supplierId: suppliers[0].id, locationSlug: slug, status: "received",
        lines: ingredients.slice(0, 2).map((ing) => ({ ingredientId: ing.id, quantity: 25, unitCost: 1200 })),
        expectedAt: iso(days(1)), receivedAt: iso(days(1)), createdBy: "manager",
      });
      await savePurchaseOrder({
        supplierId: suppliers[1].id, locationSlug: slug, status: "draft",
        lines: ingredients.slice(0, 1).map((ing) => ({ ingredientId: ing.id, quantity: 40, unitCost: 950 })),
        createdBy: "manager",
      });
    }

    // A couple of ops tasks + notifications so those panels aren't empty.
    await saveTask({
      title: "Restock buffalo mozzarella", detail: "Below reorder point at this location.",
      assigneeId: "owner", assigneeName: "Rafał", createdBy: "owner", createdByName: "Rafał",
      locationSlug: slug, priority: "high", status: "open",
    });
    await addNotification({ type: "low_stock", title: "Mozzarella below reorder point", message: `${slug}: 1.2kg left`, locationSlug: slug });
  }

  // Build the CRM rollups once, now that every order across all locations
  // exists — awaited, so the customer projection is complete and race-free. In
  // realistic mode this covers the regulars + heaviest tail guests (capped so
  // the per-phone re-reads stay cheap); the long tail still surfaces in
  // order-derived CRM + cohort analytics, which read orders directly.
  const rollupPhones = base ? base.rollupPhones : GUESTS.map((g) => g.phone);
  for (const phone of rollupPhones) await recomputeCustomerRollup(phone);
}

/** Seed the `sandbox:` demo dataset (explore / train / screenshot). */
export async function seedSandbox(): Promise<void> {
  return seedDataset("sandbox");
}

/** Seed the `sim:` dry-run dataset with the same full CORE picture, so every
 *  operational surface is testable the moment Simulation mode is enabled. */
export async function seedSimulation(): Promise<void> {
  return seedDataset("simulation");
}
