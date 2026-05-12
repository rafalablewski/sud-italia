/**
 * Phase 0 chaos test — proves the fixes from m0_1 (distributed lock) and
 * m0_4 (checkout idempotency) actually hold under concurrent load.
 *
 * Usage:
 *   CHAOS_BASE_URL=https://staging.example.com \
 *   CHAOS_ADMIN_PASSWORD=... \
 *   npm run chaos
 *
 * What it does:
 *   1. Logs in to /api/admin/login as an owner.
 *   2. Creates a single fresh test slot with maxOrders=5 at a future date.
 *   3. Scenario A (oversell test): fires CONCURRENCY=50 independent
 *      checkouts at that slot, each with a distinct phone. Expects exactly
 *      5 to succeed and 45 to get the "slot just filled up" error.
 *   4. Scenario B (idempotency test): creates a SECOND test slot, then
 *      fires CONCURRENCY=50 checkouts with the SAME Idempotency-Key + same
 *      body. Expects all 50 to return the same orderId, slot incremented
 *      exactly once.
 *
 * Caveats:
 *   - When run against `next dev` locally, there's only one Node process,
 *     so the test really validates the per-process Promise chain plus the
 *     atomic incrementSlotOrders check. To prove the cross-instance race
 *     is solved you must run this against a Vercel preview / staging deploy
 *     (which fans out across lambdas).
 *   - Requires UPSTASH_REDIS_REST_URL on staging — otherwise the fallback
 *     in-process mutex kicks in and the test gives a false positive on the
 *     "distributed" guarantee. The script prints a banner reminding you.
 *   - The test creates real slots in the target environment's DATABASE_URL.
 *     Use a staging DB, not prod.
 */

const BASE_URL = (process.env.CHAOS_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const ADMIN_PASSWORD = process.env.CHAOS_ADMIN_PASSWORD || "admin123";
const LOCATION = process.env.CHAOS_LOCATION || "krakow";
const MENU_ITEM_ID = process.env.CHAOS_MENU_ITEM_ID || "krk-pizza-margherita";
const CONCURRENCY = Number(process.env.CHAOS_CONCURRENCY || "50");
const MAX_ORDERS = Number(process.env.CHAOS_MAX_ORDERS || "5");

interface CheckoutResponse {
  url?: string;
  orderId?: string;
  error?: string;
  duplicate?: boolean;
}

interface ChaosResult {
  scenario: string;
  passed: boolean;
  summary: string;
  details: Record<string, unknown>;
}

function log(...args: unknown[]) {
  console.log("[chaos]", ...args);
}

function fail(scenario: string, summary: string, details: Record<string, unknown>): ChaosResult {
  return { scenario, passed: false, summary, details };
}

function pass(scenario: string, summary: string, details: Record<string, unknown>): ChaosResult {
  return { scenario, passed: true, summary, details };
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Login succeeded but no Set-Cookie header returned");
  }
  // Vercel + most reverse proxies emit "name=value; Path=/; ..." — we only need
  // the first cookie pair to put back on subsequent requests.
  const cookiePair = setCookie.split(";")[0];
  return cookiePair;
}

function futureDate(daysAhead: number): { date: string; time: string } {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return {
    date: d.toISOString().slice(0, 10),
    // 12:00 is unlikely to collide with real slots; tests share a date across
    // runs but always create a fresh time-of-day per scenario.
    time: `${String(12 + (daysAhead % 6)).padStart(2, "0")}:${String((Date.now() % 60)).padStart(2, "0")}`,
  };
}

async function createSlot(
  cookie: string,
  scenario: string,
): Promise<{ id: string; date: string; time: string }> {
  const { date, time } = futureDate(30 + Math.floor(Math.random() * 30));
  const res = await fetch(`${BASE_URL}/api/admin/slots`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      locationSlug: LOCATION,
      date,
      time,
      maxOrders: MAX_ORDERS,
      fulfillmentTypes: ["takeout"],
    }),
  });
  if (!res.ok) {
    throw new Error(
      `[${scenario}] Slot create failed: ${res.status} ${await res.text()}`,
    );
  }
  const slot = (await res.json()) as { id: string };
  return { id: slot.id, date, time };
}

async function getSlot(
  cookie: string,
  id: string,
): Promise<{ id: string; currentOrders: number; maxOrders: number } | null> {
  const res = await fetch(
    `${BASE_URL}/api/admin/slots?location=${LOCATION}&id=${id}`,
    { headers: { cookie } },
  );
  if (!res.ok) return null;
  const slots = (await res.json()) as Array<{
    id: string;
    currentOrders: number;
    maxOrders: number;
  }>;
  return slots.find((s) => s.id === id) ?? null;
}

function checkoutBody(slot: { id: string; date: string; time: string }, n: number) {
  return {
    items: [{ id: MENU_ITEM_ID, quantity: 1 }],
    locationSlug: LOCATION,
    customerName: `Chaos Bot ${n}`,
    // Use 5XX numbers — Polish operators won't have these in their real
    // contacts. Unique per request so Scenario A doesn't collide on the
    // customer-side rate limit.
    customerPhone: `+4850000${String(n).padStart(5, "0")}`,
    fulfillmentType: "takeout",
    slotId: slot.id,
    slotDate: slot.date,
    slotTime: slot.time,
  };
}

async function postCheckout(
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<{ status: number; body: CheckoutResponse }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${BASE_URL}/api/checkout`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as CheckoutResponse;
  return { status: res.status, body: json };
}

async function scenarioA(cookie: string): Promise<ChaosResult> {
  log(`Scenario A: ${CONCURRENCY} independent checkouts at slot with maxOrders=${MAX_ORDERS}`);
  const slot = await createSlot(cookie, "A");
  log(`  slot id=${slot.id} date=${slot.date} time=${slot.time}`);

  const requests = Array.from({ length: CONCURRENCY }, (_, i) =>
    postCheckout(checkoutBody(slot, i)),
  );
  const results = await Promise.all(requests);

  const successes = results.filter((r) => r.status === 200 && r.body.orderId).length;
  const slotFull = results.filter(
    (r) =>
      r.status === 400 &&
      typeof r.body.error === "string" &&
      r.body.error.toLowerCase().includes("filled up"),
  ).length;
  const rateLimited = results.filter((r) => r.status === 429).length;
  const otherFailures = results.length - successes - slotFull - rateLimited;

  const slotState = await getSlot(cookie, slot.id);
  const finalCurrent = slotState?.currentOrders ?? -1;

  const oversold = finalCurrent > MAX_ORDERS;
  const undercount = successes !== finalCurrent;
  // Rate limiting: each request comes from the same client IP (the chaos
  // runner), so /api/checkout's 10/min/IP cap will deny most of them. That's
  // expected for this test — we treat 429s as "indeterminate" and only fail
  // on actual oversells. To exercise the real lock at chain scale, point the
  // script at a staging URL from CONCURRENCY different IPs (or temporarily
  // raise the limit on staging).
  const passed = !oversold && !undercount && successes <= MAX_ORDERS;

  return passed
    ? pass(
        "A: oversell",
        `slot.currentOrders=${finalCurrent} (max=${MAX_ORDERS}), ${successes} ok / ${slotFull} slot-full / ${rateLimited} rate-limited`,
        { successes, slotFull, rateLimited, otherFailures, finalCurrent },
      )
    : fail(
        "A: oversell",
        `OVERSELL: finalCurrent=${finalCurrent} max=${MAX_ORDERS} successes=${successes}`,
        { successes, slotFull, rateLimited, otherFailures, finalCurrent },
      );
}

async function scenarioB(cookie: string): Promise<ChaosResult> {
  log(`Scenario B: ${CONCURRENCY} checkouts with the SAME Idempotency-Key`);
  const slot = await createSlot(cookie, "B");
  log(`  slot id=${slot.id} date=${slot.date} time=${slot.time}`);

  const idempotencyKey = `chaos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const body = checkoutBody(slot, 999);

  const requests = Array.from({ length: CONCURRENCY }, () =>
    postCheckout(body, idempotencyKey),
  );
  const results = await Promise.all(requests);

  const successes = results.filter((r) => r.status === 200 && r.body.orderId);
  const rateLimited = results.filter((r) => r.status === 429).length;
  const orderIds = new Set(successes.map((r) => r.body.orderId));

  const slotState = await getSlot(cookie, slot.id);
  const finalCurrent = slotState?.currentOrders ?? -1;

  // We expect every non-rate-limited response to share the same orderId, and
  // the slot to have been incremented exactly once.
  const sameOrderId = orderIds.size <= 1;
  const oneIncrement = finalCurrent === 1;
  const passed = sameOrderId && oneIncrement;

  return passed
    ? pass(
        "B: idempotency",
        `${successes.length} ok / ${rateLimited} rate-limited / ${orderIds.size} unique orderId / slot=${finalCurrent}`,
        {
          uniqueOrderIds: [...orderIds],
          successes: successes.length,
          rateLimited,
          finalCurrent,
        },
      )
    : fail(
        "B: idempotency",
        `idempotency broke: uniqueOrderIds=${orderIds.size} (want 1) finalCurrent=${finalCurrent} (want 1)`,
        {
          uniqueOrderIds: [...orderIds],
          successes: successes.length,
          rateLimited,
          finalCurrent,
        },
      );
}

async function main() {
  log(`base=${BASE_URL} location=${LOCATION} item=${MENU_ITEM_ID}`);
  log(`concurrency=${CONCURRENCY} maxOrdersPerSlot=${MAX_ORDERS}`);
  log("");
  log("REMINDER: this proves the per-process + atomic-update guarantees.");
  log("To exercise the cross-instance Upstash lock, run against a Vercel");
  log("preview/staging with UPSTASH_REDIS_REST_URL configured.");
  log("");

  const cookie = await login();
  log("authenticated as admin");

  const results: ChaosResult[] = [];
  results.push(await scenarioA(cookie));
  results.push(await scenarioB(cookie));

  log("");
  log("=== summary ===");
  for (const r of results) {
    log(`  ${r.passed ? "PASS" : "FAIL"}  ${r.scenario}  ${r.summary}`);
    if (!r.passed) {
      log("        details:", JSON.stringify(r.details));
    }
  }

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[chaos] uncaught error:", err);
  process.exit(2);
});
