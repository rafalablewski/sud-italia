import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getOrders,
  createOrder,
  updateOrder,
  getPosTab,
  linkPosTabOrder,
  deletePosTab,
  getUpsellSettings,
  withIdempotency,
} from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { getActiveComboDeals } from "@/lib/upsell";
import { POS_COURSE_ORDER, courseOf } from "@/lib/pos-coursing";
import type {
  CartItem,
  FulfillmentType,
  Order,
  PosCourse,
  PosTab,
  PosTabLine,
} from "@/data/types";

/**
 * POS order actuator. The counter-side bridge between an open check (a PosTab)
 * and a real Order:
 *
 *   GET   → this location's live (active) orders, for any board that wants them.
 *   POST  → "Send to KDS": build the order from the persisted tab + the real
 *           menu (prices/discount resolved server-side, never client-supplied)
 *           and fire it onto the Kitchen Display. Idempotent per tab — a tab
 *           already linked to an order re-syncs that order instead of creating
 *           a duplicate ticket.
 *   PATCH → "Charge": ensure the order exists, mark it paid, and close the tab.
 *
 * Both write paths read the tab from the store as the source of truth, so the
 * till can only point at a tab id — it can't dictate items, prices or totals.
 * Notifications are suppressed (the guest is at the window) and the sale is
 * tied to a synthetic same-day "walk-in" slot (counter sales aren't pre-booked
 * time slots). Staff+, location-scoped.
 */

const ACTIVE = new Set(["confirmed", "preparing", "ready"]);

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** A handled, status-bearing failure inside an idempotent block. Thrown (not
 *  returned) so `withIdempotency` doesn't memoize it — a genuine failure stays
 *  retryable while only successful results are cached. */
class PosActionError extends Error {
  constructor(public readonly httpStatus: number, message: string) {
    super(message);
  }
}

/** The standard idempotency header (`Idempotency-Key`). A POS click sends a
 *  fresh key; a network retry of that same click reuses it, so the mutation
 *  runs at most once. */
function idemKey(req: Request): string | null {
  return req.headers.get("idempotency-key");
}

/** Resolve a tab's lines against the real menu and price them server-side,
 *  applying any fully-satisfied combo discount for the tab's channel. */
async function buildOrderShape(
  tab: PosTab,
  locationSlug: string,
  /** When set, only these lines are priced into the order — the coursing path
   *  passes just the fired courses' lines so held courses never hit the KDS.
   *  Defaults to the whole tab (the charge / together path). */
  lines: PosTabLine[] = tab.items,
): Promise<
  | { error: string; status: number }
  | { items: CartItem[]; totalAmount: number; fulfillmentType: FulfillmentType }
> {
  if (!tab.channel) return { error: "Pick a channel first", status: 400 };
  if (lines.length === 0) return { error: "Tab has no items", status: 400 };
  if (tab.channel === "delivery" && !tab.address?.trim()) {
    return { error: "Add a delivery address first", status: 400 };
  }

  const menu = await getMenuWithOverrides(locationSlug);
  const byId = new Map(menu.map((m) => [m.id, m]));
  const items: CartItem[] = [];
  for (const li of lines) {
    const m = byId.get(li.menuItemId);
    const qty = Math.max(1, Math.min(99, Math.round(li.quantity)));
    if (!m) continue;
    items.push({ menuItem: m, quantity: qty, locationSlug });
  }
  if (items.length === 0) return { error: "No valid items for this menu", status: 400 };

  const itemsTotal = items.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0);
  const config = (await getUpsellSettings())[locationSlug];
  const combo = getActiveComboDeals(items, config ?? null, tab.channel);
  const discount = combo.isComplete ? combo.savings : 0;

  return {
    items,
    fulfillmentType: tab.channel,
    totalAmount: Math.max(0, itemsTotal - discount),
  };
}

export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const orders = await getOrders(locationSlug ?? undefined, todayStart.toISOString());
    const active = orders
      .filter((o) => ACTIVE.has(o.status))
      .map((o) => ({
        id: o.id,
        status: o.status,
        fulfillmentType: o.fulfillmentType,
        customerName: o.customerName,
        partySize: o.partySize,
        tableId: o.tableId,
        totalAmount: o.totalAmount,
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
        createdAt: o.createdAt,
      }));
    return NextResponse.json({ orders: active });
  },
);

// Send a tab to the kitchen (create or re-sync its Order).
export const POST = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "location required" }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    const tabId = body && typeof body.tabId === "string" ? body.tabId : "";
    if (!tabId) return NextResponse.json({ error: "tabId required" }, { status: 400 });

    try {
      // Idempotent per click: a re-sent "Send" / "Fire course" with the same key
      // returns the original result instead of firing a second ticket.
      const result = await withIdempotency(idemKey(req), async () => {
        const tab = await getPosTab(tabId, locationSlug);
        if (!tab || tab.locationSlug !== locationSlug) {
          throw new PosActionError(404, "Tab not found");
        }

        // Coursing: the body may name the courses to fire now. We accumulate them
        // onto whatever's already been fired and rebuild the order from the union,
        // so each "Fire course" grows the kitchen ticket and held courses stay off
        // the line. A bare send (no courses, or a non-coursed tab) fires everything.
        const coursesPresent = new Set<PosCourse>(tab.items.map((l) => courseOf(l)));
        const requested = parseCourses(body?.courses);
        const fireAll = !tab.coursed || body?.fireAll === true || requested.length === 0;
        const firedSet = fireAll
          ? coursesPresent
          : new Set<PosCourse>([...(tab.firedCourses ?? []), ...requested].filter((c) => coursesPresent.has(c)));

        const linesToFire = tab.items.filter((l) => firedSet.has(courseOf(l)));
        const shape = await buildOrderShape(tab, locationSlug, linesToFire);
        if ("error" in shape) throw new PosActionError(shape.status, shape.error);

        const firedCourses = POS_COURSE_ORDER.filter((c) => firedSet.has(c));
        // Coursing metadata for the KDS: which courses are away vs still held.
        // Only meaningful for a coursed check; the kitchen hint shows held courses.
        const coursing = tab.coursed
          ? { fired: firedCourses, held: POS_COURSE_ORDER.filter((c) => coursesPresent.has(c) && !firedSet.has(c)) }
          : undefined;
        const order = await persistTabOrder(tab, locationSlug, shape, false, coursing);
        await linkPosTabOrder(
          tab.id,
          {
            orderId: order.id,
            sentKds: true,
            status: "pay",
            firedCourses,
          },
          locationSlug,
        );
        return { order, orderId: order.id, firedCourses };
      });
      return NextResponse.json(result);
    } catch (e) {
      if (e instanceof PosActionError) return NextResponse.json({ error: e.message }, { status: e.httpStatus });
      throw e;
    }
  },
);

/** Validate a client-supplied list of course ids. */
function parseCourses(input: unknown): PosCourse[] {
  if (!Array.isArray(input)) return [];
  return input.filter((c): c is PosCourse => POS_COURSE_ORDER.includes(c as PosCourse));
}

// Charge a tab: ensure the order exists, mark it paid, then close the tab.
export const PATCH = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "location required" }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    const tabId = body && typeof body.tabId === "string" ? body.tabId : "";
    if (!tabId) return NextResponse.json({ error: "tabId required" }, { status: 400 });

    try {
      // Idempotent charge: the first success memoizes { ok, orderId, totalAmount }
      // under the click's key, so a retry after a lost response returns that —
      // not a 404 (the tab is gone) and never a second payment.
      const result = await withIdempotency(idemKey(req), async () => {
        const tab = await getPosTab(tabId, locationSlug);
        if (!tab || tab.locationSlug !== locationSlug) {
          throw new PosActionError(404, "Tab not found");
        }

        const shape = await buildOrderShape(tab, locationSlug);
        if ("error" in shape) throw new PosActionError(shape.status, shape.error);

        const order = await persistTabOrder(tab, locationSlug, shape, true);
        await deletePosTab(tab.id, locationSlug);
        return { ok: true as const, orderId: order.id, totalAmount: order.totalAmount };
      });
      return NextResponse.json(result);
    } catch (e) {
      if (e instanceof PosActionError) return NextResponse.json({ error: e.message }, { status: e.httpStatus });
      throw e;
    }
  },
);

/** Create the tab's Order, or re-sync the one it's already linked to. When
 *  `paid` is set the order is stamped paid (charge flow). */
async function persistTabOrder(
  tab: PosTab,
  locationSlug: string,
  shape: { items: CartItem[]; totalAmount: number; fulfillmentType: FulfillmentType },
  paid: boolean,
  coursing?: Order["coursing"],
): Promise<Order> {
  const now = new Date();
  const partySize = tab.channel === "dine-in" ? tab.covers ?? 2 : undefined;
  const tableId = tab.channel === "dine-in" ? tab.tableId : undefined;
  const deliveryAddress = tab.channel === "delivery" ? tab.address : undefined;

  if (tab.orderId) {
    const patched = await updateOrder(tab.orderId, {
      items: shape.items,
      totalAmount: shape.totalAmount,
      fulfillmentType: shape.fulfillmentType,
      partySize,
      tableId,
      deliveryAddress,
      ...(coursing !== undefined ? { coursing } : {}),
      ...(paid ? { paidAt: now.toISOString() } : {}),
    });
    if (patched) return patched;
    // Linked order vanished (manual delete) — fall through to a fresh create.
  }

  const order: Order = {
    id: `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    locationSlug,
    items: shape.items,
    totalAmount: shape.totalAmount,
    status: "confirmed",
    customerName: tab.name?.trim() || "Walk-in",
    customerPhone: "",
    fulfillmentType: shape.fulfillmentType,
    partySize,
    tableId,
    deliveryAddress,
    coursing,
    slotId: "walkin",
    slotDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    slotTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    createdAt: now.toISOString(),
    paidAt: paid ? now.toISOString() : undefined,
  };
  return createOrder(order, { suppressNotifications: true });
}
