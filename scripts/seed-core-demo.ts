/**
 * Dev/demo seeder for the Core suite — populates the local `.data/` store
 * (filesystem fallback, no DATABASE_URL) with REAL records through the real
 * store functions so the live `/core/*` surfaces show a full picture:
 *   - floor tables  → POS table-assign, Service · Floor, Book
 *   - dine-in slots → Service · Slots, Book (dated to the real current day)
 *   - orders        → KDS (active) + Fleet KPIs + CRM rollups + loyalty + spend
 *   - open checks   → POS · Order (tab bar + coursed ticket + charge dock); one
 *                     lands mid-service (starter fired via the real fireTab) so
 *                     the coursing spine shows served/next/held + a KDS ticket
 *   - loyalty members + a family wallet
 *   - reservations  → Book + Service · Floor (booked tables)
 *
 * This is NOT mock data baked into the app — it's real data written through
 * the same persistence the app uses. Re-runnable: it clears its own demo
 * rows first (orders/tables/slots by `demo-` id prefix, reservations by the
 * demo guest phones), so it never piles up and only ever touches its own rows.
 *
 * Local (.data filesystem store):
 *   npx tsx scripts/seed-core-demo.ts          # or: npm run seed:demo
 *
 * Deployed preview (Neon Postgres) — the store auto-routes to the DB when
 * DATABASE_URL is set; ALLOW_DB_SEED is a deliberate guard so this can never
 * be run against a real/production DB by accident:
 *   DATABASE_URL=postgres://… ALLOW_DB_SEED=1 npm run seed:demo
 */
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { getMenuWithOverrides } from "@/data/menus";
import {
  createOrder,
  saveTable,
  createSlot,
  getSlots,
  getOrders,
  getTables,
  getReservations,
  deleteOrder,
  deleteTable,
  deleteSlot,
  deleteReservation,
  addLoyaltyMember,
  recomputeCustomerRollupsBulk,
  saveStaff,
  getStaff,
  deleteStaff,
  assignOrderDriver,
  mutateWaSession,
  appendWaMessage,
  clearWaSession,
  deleteWaTranscript,
  getMenuOverrides,
  setMenuOverride,
  logAgentCall,
  savePosTab,
  getPosTabs,
  deletePosTab,
} from "@/lib/store";
import { fireTab } from "@/lib/pos/fireTab";
import { createBooking } from "@/lib/booking";
import type { Allergen, CartItem, FulfillmentType, MenuItem, Order, OrderStatus, PosCourse, PosTabLine, TimeSlot } from "@/data/types";

// The live floor moves in real time — slots, bookings and open checks must land
// on the ACTUAL current day or Service · Slots / Book / POS read empty. (This was
// pinned to a fixed date, which silently drifted a month into the past.)
// Use LOCAL calendar parts, not toISOString() (UTC): near local midnight the UTC
// date can be the previous/next day, which would date the rows to the wrong day
// vs the app's local-time "today" and read empty — the very failure this fixes.
const _today = new Date();
const TODAY = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, "0")}-${String(_today.getDate()).padStart(2, "0")}`;
const useDB = !!process.env.DATABASE_URL;
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const min = (m: number) => m * 60_000;
const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

// Named repeat guests — drive CRM LTV + loyalty tiers.
const GUESTS = [
  { name: "Lucia Bianchi", phone: "+48600100412", tier: "Platinum" },
  { name: "Giulia Romano", phone: "+48600100533", tier: "Gold" },
  { name: "Marek Kowalski", phone: "+48600100644", tier: "Silver" },
  { name: "Sofia Ferrari", phone: "+48600100755", tier: "Silver" },
  { name: "Anna Wójcik", phone: "+48600100866", tier: "Bronze" },
  { name: "Tomasz Nowak", phone: "+48600100977", tier: "Bronze" },
];

const CHANNELS: FulfillmentType[] = ["dine-in", "takeout", "delivery"];

function lineFrom(menu: MenuItem[], cat: string, locationSlug: string, qty: number): CartItem | null {
  const pool = menu.filter((m) => m.available && m.category === cat);
  if (pool.length === 0) return null;
  const menuItem = pool[Math.floor(Math.random() * pool.length)];
  return { menuItem, quantity: qty, locationSlug };
}

function buildCart(menu: MenuItem[], locationSlug: string): CartItem[] {
  const cart: CartItem[] = [];
  const pizza = lineFrom(menu, "pizza", locationSlug, 1 + Math.floor(Math.random() * 2));
  if (pizza) cart.push(pizza);
  if (Math.random() > 0.4) {
    const anti = lineFrom(menu, "antipasti", locationSlug, 1);
    if (anti) cart.push(anti);
  }
  if (Math.random() > 0.5) {
    const drink = lineFrom(menu, "drinks", locationSlug, 1 + Math.floor(Math.random() * 2));
    if (drink) cart.push(drink);
  }
  if (cart.length === 0 && menu[0]) cart.push({ menuItem: menu[0], quantity: 1, locationSlug });
  return cart;
}

const total = (cart: CartItem[]) => cart.reduce((s, c) => s + c.menuItem.price * c.quantity, 0);

async function makeOrder(
  locationSlug: string,
  menu: MenuItem[],
  opts: { status: OrderStatus; ageMs: number; channel?: FulfillmentType; guestIdx?: number },
): Promise<void> {
  const cart = buildCart(menu, locationSlug);
  const channel = opts.channel ?? CHANNELS[Math.floor(Math.random() * CHANNELS.length)];
  const guest = opts.guestIdx != null ? GUESTS[opts.guestIdx] : GUESTS[Math.floor(Math.random() * GUESTS.length)];
  const createdAt = iso(opts.ageMs);
  const order: Order = {
    id: rid("demo-ord"),
    locationSlug,
    items: cart,
    totalAmount: total(cart),
    status: opts.status,
    customerName: guest.name,
    customerPhone: guest.phone,
    fulfillmentType: channel,
    partySize: channel === "dine-in" ? 2 + Math.floor(Math.random() * 3) : undefined,
    deliveryAddress: channel === "delivery" ? "ul. Floriańska 12/3, Kraków" : undefined,
    slotId: "",
    slotDate: createdAt.slice(0, 10),
    slotTime: createdAt.slice(11, 16),
    createdAt,
    paidAt: createdAt,
    channel: Math.random() > 0.7 ? "whatsapp" : "web",
  };
  // suppressCascades: the fire-and-forget rollup + fireKdsTickets (→ updateOrder)
  // race the next insert on the shared kv orders blob (filesystem/sim) and clobber
  // just-inserted rows — the seed was losing ~85% of its orders this way, leaving
  // the whole /core suite reading empty. We fire ONE awaited bulk rollup after all
  // orders land (see main()); the KDS board derives tickets live from the orders,
  // so it needs no per-order ticket write, and leaving estimatedReadyAt unset lets
  // the board show the fresh *predicted* SLA instead of a stale fired time.
  await createOrder(order, { suppressNotifications: true, suppressCascades: true });
}

async function seedTables(locationSlug: string): Promise<string[]> {
  const layout = [
    { number: "1", seats: 2, zone: "Window" },
    { number: "2", seats: 2, zone: "Window" },
    { number: "3", seats: 4, zone: "Main" },
    { number: "5", seats: 4, zone: "Main" },
    { number: "7", seats: 2, zone: "Window" },
    { number: "9", seats: 4, zone: "Main" },
    { number: "11", seats: 6, zone: "Back" },
    { number: "12", seats: 6, zone: "Patio" },
  ];
  const ids: string[] = [];
  for (const t of layout) {
    const seated = ["1", "3", "9"].includes(t.number);
    const saved = await saveTable({
      id: `demo-tbl-${locationSlug}-${t.number}`,
      locationSlug,
      number: t.number,
      seats: t.seats,
      zone: t.zone,
      status: seated ? "seated" : "available",
    });
    ids.push(saved.id);
  }
  return ids;
}

/** Delivery-group staff so Service · Dispatch shows a live driver roster
 *  (getStaff filtered to the "delivery" role group) instead of "No drivers on
 *  shift". Fixed ids → idempotent upsert on re-seed. */
const DRIVERS: { name: string; role: "driver" | "courier" }[] = [
  { name: "Tomek Wójcik", role: "driver" },
  { name: "Kasia Lewandowska", role: "courier" },
  { name: "Piotr Zieliński", role: "driver" },
  { name: "Ola Dąbrowska", role: "courier" },
];
async function seedDrivers(locationSlug: string): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < DRIVERS.length; i++) {
    const d = DRIVERS[i];
    const saved = await saveStaff({
      id: `demo-drv-${locationSlug}-${i}`,
      name: d.name,
      role: d.role,
      locationSlug,
      hourlyRateGrosze: 2800,
      status: "active",
      hireDate: TODAY,
    });
    ids.push(saved.id);
  }
  return ids;
}

async function seedSlots(locationSlug: string): Promise<void> {
  const windows = [
    { time: "12:00", max: 60, cur: 40 },
    { time: "13:00", max: 78, cur: 52 },
    { time: "18:00", max: 90, cur: 30 },
    { time: "20:00", max: 96, cur: 85 },
    { time: "21:30", max: 60, cur: 38 },
  ];
  for (const w of windows) {
    const slot: TimeSlot = {
      id: `demo-slot-${locationSlug}-${w.time.replace(":", "")}`,
      locationSlug,
      date: TODAY,
      time: w.time,
      maxOrders: w.max,
      currentOrders: w.cur,
      fulfillmentTypes: ["dine-in", "takeout"],
      status: "active",
    };
    await createSlot(slot);
  }
}

// menu category → POS course lane (the till groups lines ANTIPASTI/PRIMI/DOLCI/…).
function tabLine(menu: MenuItem[], cat: string, course: PosCourse, qty: number): PosTabLine | null {
  const pool = menu.filter((m) => m.available && m.category === cat);
  if (pool.length === 0) return null;
  const item = pool[Math.floor(Math.random() * pool.length)];
  return { menuItemId: item.id, quantity: qty, course };
}

/** Open, un-fired checks on the till — so POS · Order lands on a live board
 *  (tab bar + coursed ticket + charge dock) instead of an empty "No open check"
 *  screen. Dine-in tabs are coursed; one takeaway rounds out the strip. Tables
 *  chosen to avoid the ones the bookings take (indices 4–6). */
async function seedOpenTabs(slug: string, menu: MenuItem[], tableIds: string[]): Promise<number> {
  type Spec = {
    name: string;
    channel: FulfillmentType;
    table?: string;
    covers: number;
    guest?: (typeof GUESTS)[number];
    lines: [string, PosCourse, number][];
    // Fire the starter so the check lands mid-service — the coursing spine then
    // shows all three states (served ✓ · next ⚡Fire · held ◷Hold) like the mockup,
    // and the fired course also seeds a real KDS ticket (honest, not faked).
    fireStarter?: boolean;
  };
  const specs: Spec[] = [
    { name: "Tab 1", channel: "dine-in", table: tableIds[1], covers: 2, guest: GUESTS[1], fireStarter: true,
      lines: [["antipasti", "starter", 1], ["pizza", "main", 2], ["desserts", "dessert", 1], ["drinks", "drink", 2]] },
    { name: "Tab 2", channel: "dine-in", table: tableIds[2], covers: 4, guest: GUESTS[2],
      lines: [["antipasti", "starter", 2], ["pizza", "main", 2], ["pasta", "main", 1], ["drinks", "drink", 3]] },
    { name: "Tab 4", channel: "dine-in", table: tableIds[7] ?? tableIds[3], covers: 3, guest: GUESTS[0],
      lines: [["pizza", "main", 2], ["desserts", "dessert", 2], ["drinks", "drink", 1]] },
    { name: "Takeaway", channel: "takeout", covers: 1,
      lines: [["pizza", "main", 1], ["antipasti", "starter", 1]] },
  ];
  let n = 0;
  for (const s of specs) {
    const items = s.lines.map(([cat, course, qty]) => tabLine(menu, cat, course, qty)).filter((l): l is PosTabLine => !!l);
    if (items.length === 0) continue;
    const saved = await savePosTab({
      id: rid("demo-tab"),
      locationSlug: slug,
      name: s.name,
      channel: s.channel,
      status: "open",
      items,
      tableId: s.table,
      covers: s.covers,
      customerPhone: s.guest?.phone,
      customerName: s.guest?.name,
      coursed: s.channel === "dine-in",
    });
    // Fire the starter only if it actually has lines (a menu without an
    // antipasti item would fire an empty course → fireTab throws), and never let
    // a fire failure abort the rest of the seed (other location, bookings, etc.).
    if (s.fireStarter && saved.coursed && items.some((l) => l.course === "starter")) {
      try {
        await fireTab({ tabId: saved.id, locationSlug: slug, courses: ["starter"] });
      } catch (e) {
        console.log(`  fireTab(${s.name}) skipped: ${(e as Error).message}`);
      }
    }
    n++;
  }
  return n;
}

const GUEST_PHONES = new Set(GUESTS.map((g) => g.phone));

/** Remove only this seeder's own demo rows, so a re-run (or seeding a shared
 *  DB) never duplicates and never touches real data. */
async function cleanup(): Promise<void> {
  const orders = await getOrders(undefined, undefined, { includeSimulated: true });
  let n = 0;
  for (const o of orders) if (o.id.startsWith("demo-ord")) { await deleteOrder(o.id); n++; }
  const tabs = await getPosTabs();
  for (const t of tabs) if (t.id.startsWith("demo-tab")) {
    // a mid-service demo tab spawned a real (non-demo-id) order when its starter
    // fired — delete it via the tab's link so re-seeds don't orphan/accumulate it.
    if (t.orderId) await deleteOrder(t.orderId);
    await deletePosTab(t.id, t.locationSlug);
  }
  const tables = await getTables();
  for (const t of tables) if (t.id.startsWith("demo-tbl")) await deleteTable(t.id);
  const staff = await getStaff();
  for (const s of staff) if (s.id.startsWith("demo-drv")) await deleteStaff(s.id);
  for (const g of GUESTS) { await clearWaSession(g.phone); await deleteWaTranscript(g.phone); }
  const slots = await getSlots();
  for (const s of slots) if (s.id.startsWith("demo-slot")) await deleteSlot(s.id);
  const resvs = await getReservations(undefined, TODAY);
  for (const r of resvs) if (r.customerPhone && GUEST_PHONES.has(r.customerPhone)) await deleteReservation(r.id);
  console.log(`cleanup: removed ${n} prior demo orders + demo tables/slots/bookings`);
}

/**
 * Declare EU-1169/2011 allergens for the demo menu so the Concierge allergen
 * matrix + `get_allergens` MCP tool have real data to read (Rule #1 — the
 * feature must actually function). These are the standard, factual allergens
 * for these classic Italian dishes; an operator overrides them per sourcing in
 * the admin Menu editor (this only writes the `allergens` field of the
 * menu-override, preserving any other override). Values are derived from the
 * item's category + name — conservative and per-recipe accurate.
 */
function allergensFor(item: MenuItem): Allergen[] {
  const n = item.name.toLowerCase();
  const set = new Set<Allergen>();
  const add = (...a: Allergen[]) => a.forEach((x) => set.add(x));
  // Base by category — a wheat crust/pasta carries gluten; cheese carries dairy.
  if (item.category === "pizza") add("gluten", "dairy");
  else if (item.category === "pasta") add("gluten");
  else if (item.category === "panini") add("gluten", "dairy");
  else if (item.category === "desserts") add("dairy");
  // Name refinements (factual for the classic recipe).
  if (/napoli|acciugh|anchov|tonno|tuna|sardin/.test(n)) add("fish");
  if (/pesto|genovese/.test(n)) add("nuts");
  if (/carbonara/.test(n)) add("gluten", "eggs", "dairy");
  if (/formagg|cheese|bufala|mozzarella|parmigian|burrata|gorgonzola|ricotta|mascarpone|cacio|panna|gelato|crema/.test(n)) add("dairy");
  if (/vongole|frutti di mare|cozze|clam|mussel|mare/.test(n)) add("molluscs");
  if (/gamber|shrimp|prawn|calamar|squid|seafood|scampi/.test(n)) add("shellfish");
  if (/arancin/.test(n)) add("gluten", "dairy", "eggs");
  if (/tiramis|cannol|profiterol|zeppol|semifreddo/.test(n)) add("gluten", "dairy", "eggs");
  if (/bruschetta|garlic bread|focaccia|crostini|grissin|panino|bread|pane/.test(n)) add("gluten");
  if (/sesam/.test(n)) add("sesame");
  if (/mostard|mustard|senape/.test(n)) add("mustard");
  // Fresh egg pasta ribbons + filled/baked pasta carry eggs (+ usually dairy).
  if (item.category === "pasta" && /tagliatell|tagliolin|fettuccin|ravioli|tortellin|lasagn|gnocch|carbonara|alfredo/.test(n)) add("eggs", "dairy");
  // Drinks, bottled oil + still/sparkling water carry no major allergen; beer is gluten.
  if (item.category === "drinks" || /olio|olive oil|extra virgin/.test(n)) {
    set.clear();
    if (/birra|beer|peroni|nastro|lager|ale/.test(n)) add("gluten");
  }
  return [...set];
}

async function seedAllergens(menu: MenuItem[]): Promise<void> {
  const overrides = await getMenuOverrides();
  for (const item of menu) {
    const allergens = allergensFor(item);
    // Merge into any existing override so we only touch the allergens field.
    await setMenuOverride(item.id, { ...(overrides[item.id] ?? {}), allergens });
  }
}

/** Seed a day of Concierge agent-endpoint hits so the MCP inspector's
 *  telemetry (requests today · avg latency · deflection · errors · per-cap) has
 *  real data out of the box. These are genuine call records the endpoint would
 *  write; a live agent adds to them. */
async function seedAgentCalls(): Promise<void> {
  const mix: { cap: string; n: number; ms: number }[] = [
    { cap: "get_menu", n: 62, ms: 310 },
    { cap: "check_availability", n: 48, ms: 402 },
    { cap: "get_allergens", n: 41, ms: 288 },
    { cap: "place_order", n: 37, ms: 540 },
    { cap: "create_payment", n: 19, ms: 256 },
    { cap: "locate_truck", n: 7, ms: 184 },
  ];
  let seq = 0;
  for (const m of mix) {
    for (let i = 0; i < m.n; i++) {
      seq++;
      // Spread across the last ~10h of today; jitter latency; ~2% errors.
      const at = new Date(Date.now() - min((seq * 4) % (60 * 10))).toISOString();
      const jitter = m.ms + Math.round((Math.sin(seq) * m.ms) / 6);
      await logAgentCall({ capability: m.cap, latencyMs: Math.max(40, jitter), ok: seq % 47 !== 0, at });
    }
  }
  console.log(`agent-call telemetry seeded (${mix.reduce((s, m) => s + m.n, 0)} calls)`);
}

/** Seed a few live WhatsApp conversations so Guest · Inbox lands populated
 *  (3-pane: conversation list + thread + guest context) like the mockup. These
 *  ride the channel's real session + transcript stores (Rule #1). Sessions carry
 *  a 90-min TTL, so a fresh seed keeps them live for the demo window. Idempotent:
 *  each phone's session + transcript is cleared before re-seeding. */
type WaSeedMsg = { mins: number; dir: "in" | "out"; actor: "customer" | "bot" | "operator"; body: string; meta?: Record<string, unknown> };
async function seedWhatsApp(menu: MenuItem[], slug: string): Promise<number> {
  const cart = (cats: [string, number][]): CartItem[] =>
    cats.map(([c, q]) => lineFrom(menu, c, slug, q)).filter((l): l is CartItem => !!l);
  const convos: { guest: (typeof GUESTS)[number]; cart: CartItem[]; fulfillment: FulfillmentType; pendingPay?: boolean; msgs: WaSeedMsg[] }[] = [
    {
      guest: GUESTS[2], cart: cart([["pizza", 1], ["antipasti", 1]]), fulfillment: "takeout",
      msgs: [
        { mins: 14, dir: "in", actor: "customer", body: "Hi! Is the Margherita available on a gluten-free base?" },
        { mins: 13, dir: "out", actor: "bot", body: "Yes — Margherita on a GF base (+6 zł). Shall I add it?", meta: { card: [{ label: "Margherita · GF base", value: "42 zł" }, { label: "Allergens", value: "milk", tone: "info" }] } },
        { mins: 12, dir: "in", actor: "customer", body: "Perfect, one for pickup in 30 min please." },
        { mins: 6, dir: "out", actor: "operator", body: "Got it Marek — firing now, ready in ~6 min 🍕", meta: { staffName: "Kasia" } },
      ],
    },
    {
      guest: GUESTS[4], cart: cart([["pizza", 2], ["drinks", 1]]), fulfillment: "delivery", pendingPay: true,
      msgs: [
        { mins: 22, dir: "in", actor: "customer", body: "Can I get 2 Diavola delivered to Kazimierz?" },
        { mins: 21, dir: "out", actor: "bot", body: "Sure! Your cart is ready — tap to pay and we'll start cooking.", meta: { card: [{ label: "2× Diavola", value: "65 zł" }, { label: "Delivery · Kazimierz", value: "+9 zł" }] } },
        { mins: 20, dir: "in", actor: "customer", body: "Sending payment now 👍" },
      ],
    },
    {
      guest: GUESTS[1], cart: cart([["pizza", 1], ["desserts", 1]]), fulfillment: "dine-in",
      msgs: [
        { mins: 40, dir: "in", actor: "customer", body: "Do you have a table for 4 tonight around 8?" },
        { mins: 39, dir: "out", actor: "operator", body: "We do! Booked you for 20:00, table by the window. See you then, Giulia ✨", meta: { staffName: "Marek" } },
        { mins: 4, dir: "in", actor: "customer", body: "Amazing, thank you!" },
      ],
    },
  ];
  let n = 0;
  for (const c of convos) {
    const phone = c.guest.phone;
    await clearWaSession(phone);
    await deleteWaTranscript(phone);
    for (const m of c.msgs) {
      await appendWaMessage(phone, { at: iso(min(m.mins)), direction: m.dir, kind: "text", body: m.body, actor: m.actor, meta: m.meta });
    }
    await mutateWaSession(phone, (cur) => ({
      ...cur,
      locationSlug: slug,
      customerName: c.guest.name,
      cartItems: c.cart,
      fulfillmentType: c.fulfillment,
      pendingOrderId: c.pendingPay ? rid("demo-wa-ord") : null,
      pendingPaymentUrl: c.pendingPay ? "https://checkout.stripe.com/c/pay/demo" : null,
    }));
    n++;
  }
  return n;
}

async function main() {
  console.log(`store mode: ${useDB ? "Neon Postgres (DATABASE_URL set)" : "filesystem (.data)"}`);
  if (useDB && process.env.ALLOW_DB_SEED !== "1") {
    console.error(
      "\nRefusing to seed a Postgres DB without an explicit opt-in.\n" +
        "This writes demo orders/customers/loyalty rows — never run it against production.\n" +
        "If this is a throwaway preview DB, re-run with:  ALLOW_DB_SEED=1 npm run seed:demo\n",
    );
    process.exit(2);
  }

  const locations = await getActiveLocationsAsync();
  console.log("locations:", locations.map((l) => l.slug).join(", "));
  await cleanup();

  for (const loc of locations) {
    const slug = loc.slug;
    const menu = await getMenuWithOverrides(slug);
    console.log(`\n[${slug}] menu items: ${menu.length}`);

    await seedAllergens(menu);
    console.log(`[${slug}] EU-14 allergens declared`);

    const tableIds = await seedTables(slug);
    await seedSlots(slug);
    const driverIds = await seedDrivers(slug);
    console.log(`[${slug}] tables + slots + ${driverIds.length} drivers seeded`);

    // History — completed orders over the last 30 days (CRM LTV + loyalty).
    let n = 0;
    for (let d = 0; d < 26; d++) {
      const gi = d % GUESTS.length;
      await makeOrder(slug, menu, { status: "completed", ageMs: min(60 * 24 * (1 + (d % 30))) + min(d * 7), guestIdx: gi });
      n++;
    }
    // Recent completed (last hour) → throughput/hr.
    for (let i = 0; i < 6; i++) {
      await makeOrder(slug, menu, { status: "completed", ageMs: min(8 + i * 7) });
      n++;
    }
    // Active tickets on the KDS board (both trucks).
    const activeMix: OrderStatus[] = slug === locations[0].slug
      ? ["preparing", "preparing", "confirmed", "ready"]
      : ["preparing", "confirmed", "confirmed", "ready", "preparing"];
    for (let i = 0; i < activeMix.length; i++) {
      await makeOrder(slug, menu, { status: activeMix[i], ageMs: min(1 + i * 2) });
      n++;
    }
    console.log(`[${slug}] orders seeded: ${n}`);

    // Put a couple of active delivery orders on drivers so Dispatch shows the
    // assigned-to-driver state (not just unassigned cards). Awaited, single
    // calls — no cascade race.
    try {
      const activeDeliv = (await getOrders(slug)).filter(
        (o) => o.fulfillmentType === "delivery" && ["confirmed", "preparing", "ready"].includes(o.status),
      );
      for (let i = 0; i < Math.min(2, activeDeliv.length) && i < driverIds.length; i++) {
        await assignOrderDriver(activeDeliv[i].id, driverIds[i]);
      }
    } catch { /* non-fatal */ }

    // Open checks on the till → POS · Order shows a live board, not an empty screen.
    const openTabs = await seedOpenTabs(slug, menu, tableIds);
    console.log(`[${slug}] open POS checks seeded: ${openTabs}`);

    // Bookings tonight against the 20:00 slot + window tables.
    const slots = await getSlots(slug, TODAY);
    const dinner = slots.find((s) => s.time === "20:00");
    if (dinner) {
      const picks = [
        { name: "Lucia Bianchi", phone: "+48600100412", party: 2, table: tableIds[4], notes: "Anniversary 🥂" },
        { name: "Tomasz Nowak", phone: "+48600100977", party: 4, table: tableIds[5] },
        { name: "Giulia Romano", phone: "+48600100533", party: 6, table: tableIds[6] },
      ];
      for (const p of picks) {
        const r = await createBooking({
          locationSlug: slug,
          slotId: dinner.id,
          tableId: p.table,
          customerName: p.name,
          customerPhone: p.phone,
          partySize: p.party,
          notes: p.notes,
        });
        if (!r.ok) console.log(`  booking ${p.name}: ${r.reason}`);
      }
      console.log(`[${slug}] bookings seeded`);
    }
  }

  // Loyalty members (phone-enrolled) + a family wallet.
  for (let i = 0; i < GUESTS.length; i++) {
    const g = GUESTS[i];
    const [first, ...rest] = g.name.split(" ");
    await addLoyaltyMember({
      phone: g.phone,
      name: first,
      lastName: rest.join(" "),
      signedUpAt: iso(min(60 * 24 * (30 + i * 20))),
    });
  }
  console.log("\nloyalty members seeded");

  // One awaited CRM/loyalty rollup after all orders + members land — replaces the
  // per-order fire-and-forget rollups we suppressed above (which raced + clobbered
  // the orders blob). This is what makes CRM lifetime-spend / repeat-rate and the
  // loyalty points/tier boards read populated instead of all-zero.
  await recomputeCustomerRollupsBulk(GUESTS.map((g) => g.phone));
  console.log("customer rollups computed");

  // Live WhatsApp conversations so Guest · Inbox lands populated (channel-wide,
  // seeded against the first truck's menu).
  const waMenu = await getMenuWithOverrides(locations[0].slug);
  const waCount = await seedWhatsApp(waMenu, locations[0].slug);
  console.log(`whatsapp conversations seeded (${waCount})`);

  await seedAgentCalls();

  console.log("\n✓ Core demo seed complete.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
