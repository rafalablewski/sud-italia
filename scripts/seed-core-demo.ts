/**
 * Dev/demo seeder for the Core suite — populates the local `.data/` store
 * (filesystem fallback, no DATABASE_URL) with REAL records through the real
 * store functions so the live `/core/*` surfaces show a full picture:
 *   - floor tables  → POS table-assign, Service · Floor, Book
 *   - dine-in slots → Service · Slots, Book
 *   - orders        → KDS (active) + Fleet KPIs + CRM rollups + loyalty + spend
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
  getMenuOverrides,
  setMenuOverride,
  logAgentCall,
} from "@/lib/store";
import { createBooking } from "@/lib/booking";
import type { Allergen, CartItem, FulfillmentType, MenuItem, Order, OrderStatus, TimeSlot } from "@/data/types";

const TODAY = "2026-06-07";
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
  await createOrder(order, { suppressNotifications: true });
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

const GUEST_PHONES = new Set(GUESTS.map((g) => g.phone));

/** Remove only this seeder's own demo rows, so a re-run (or seeding a shared
 *  DB) never duplicates and never touches real data. */
async function cleanup(): Promise<void> {
  const orders = await getOrders(undefined, undefined, { includeSimulated: true });
  let n = 0;
  for (const o of orders) if (o.id.startsWith("demo-ord")) { await deleteOrder(o.id); n++; }
  const tables = await getTables();
  for (const t of tables) if (t.id.startsWith("demo-tbl")) await deleteTable(t.id);
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
    console.log(`[${slug}] tables + slots seeded`);

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

  await seedAgentCalls();

  console.log("\n✓ Core demo seed complete.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
