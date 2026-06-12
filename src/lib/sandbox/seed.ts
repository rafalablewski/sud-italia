/**
 * Sandbox seeder — populates the `sandbox:`-namespaced demo dataset with rich,
 * internally-consistent data across every sandboxed domain, using the real
 * store functions (so it lands in the sandbox namespace via the store's
 * key-prefixing). Runs ONLY while sandbox mode is active (the /api/admin/sandbox
 * route enables + busts the cache before calling). It never writes a shared key
 * — the menu, recipes and ingredients stay real.
 *
 * createOrder() already cascades into the customer rollup + KDS tickets, so
 * seeding orders also populates CRM and the kitchen board automatically.
 */
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getMenuWithOverrides } from "@/data/menus";
import {
  getActiveDataMode,
  createOrder,
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
  fireKdsTickets,
  recomputeCustomerRollup,
  appendAgentEvent,
} from "@/lib/store";
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

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const min = (m: number) => m * 60_000;
const hours = (h: number) => h * 3_600_000;
const days = (d: number) => d * 86_400_000;
const rid = (p: string) => `sb-${p}-${Math.random().toString(36).slice(2, 8)}`;
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

/** Create one demo order. Cascades (rollup + KDS) are suppressed — the seeder
 *  runs them once, awaited, afterward (the fire-and-forget versions race on the
 *  shared kv blob at seeding speed and lose writes). Returns the created order. */
async function makeOrder(
  locationSlug: string,
  menu: MenuItem[],
  opts: { status: OrderStatus; ageMs: number; channel?: FulfillmentType; guestIdx?: number },
): Promise<Order> {
  const cart = buildCart(menu, locationSlug);
  const channel = opts.channel ?? pick(CHANNELS);
  const guest = opts.guestIdx != null ? GUESTS[opts.guestIdx] : pick(GUESTS);
  const createdAt = iso(opts.ageMs);
  const order: Order = {
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
  return createOrder(order, { suppressNotifications: true, suppressCascades: true });
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
      id: `sb-tbl-${locationSlug}-${t.number}`,
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
      id: `sb-slot-${locationSlug}-${w.time.replace(":", "")}`,
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

export async function seedSandbox(): Promise<void> {
  if ((await getActiveDataMode()) !== "sandbox") {
    throw new Error("seedSandbox refused: sandbox mode is not active");
  }
  const locations = await getActiveLocationsAsync();
  const ingredients = await getIngredients(); // shared catalogue

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

    // Orders — 30d history + recent + a live KDS rush. Track cash revenue.
    let cashRevenue = 0;
    for (let d = 0; d < 24; d++) {
      const o = await makeOrder(slug, menu, { status: "completed", ageMs: days(1 + (d % 28)) + min(d * 11), guestIdx: d % GUESTS.length });
      if (d % 3 === 0) cashRevenue += o.totalAmount;
    }
    for (let i = 0; i < 6; i++) {
      const o = await makeOrder(slug, menu, { status: "completed", ageMs: min(8 + i * 7) });
      if (i % 2 === 0) cashRevenue += o.totalAmount;
    }
    const activeMix: OrderStatus[] = ["preparing", "preparing", "confirmed", "ready", "confirmed"];
    const activeOrders: Order[] = [];
    for (let i = 0; i < activeMix.length; i++) {
      activeOrders.push(await makeOrder(slug, menu, { status: activeMix[i], ageMs: min(1 + i * 3) }));
    }
    // Fire KDS tickets for the live orders — awaited, so no race on the blob.
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

    // Stock movements (receipts tied to suppliers + ingredients) + a waste row.
    for (let i = 0; i < Math.min(5, ingredients.length); i++) {
      await createStockMovement({ ingredientId: ingredients[i].id, locationSlug: slug, type: "receive", quantity: 20 + i * 5, costImpact: (1500 + i * 300), reason: `PO receipt — ${pick(suppliers).name}`, occurredAt: iso(days(2)) });
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
  // exists — awaited, so the customer projection is complete and race-free.
  for (const g of GUESTS) await recomputeCustomerRollup(g.phone);
}
