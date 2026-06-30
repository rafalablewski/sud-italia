import {
  createOrder,
  updateOrder,
  getPosTab,
  linkPosTabOrder,
  deletePosTab,
  getUpsellSettings,
  getSettings,
  getActorCompTotalToday,
  appendAuditLog,
  withIdempotency,
} from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import { getActiveComboDeals, effectiveUnitPrice } from "@/lib/upsell";
import { manualDiscountGrosze } from "@/lib/pos-discount";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { POS_COURSE_ORDER, courseOf } from "@/lib/pos-coursing";
import { DEFAULT_REFUND_CONTROLS, evaluateRefundGuard } from "@/lib/refund-guard";
import type { AdminRole } from "@/lib/admin-roles";
import type {
  CartItem,
  FulfillmentType,
  Order,
  PosPayment,
  PosCourse,
  PosTab,
  PosTabLine,
  RefundReasonCode,
} from "@/data/types";

/** Tender details from the POS tender sheet — tip, split payments, a manager
 *  comp, and cash handling. All optional; an absent payload charges the full
 *  bill with no tip (the legacy single-tap behaviour). */
export interface PosTender {
  tipGrosze?: number;
  /** Manager comp (food off the bill) in grosze + the operator's reason note. */
  compGrosze?: number;
  compNote?: string;
  /** One entry per tender; a split has several. If omitted the server records a
   *  single payment of the net due in `defaultMethod`. */
  payments?: PosPayment[];
  /** Cash physically handed over (grosze) — drives the change-due figure. */
  cashTenderedGrosze?: number;
  defaultMethod?: "cash" | "card";
}

const clampG = (v: unknown, max: number): number => {
  const n = Math.round(Number(v) || 0);
  return Math.max(0, Math.min(max, n));
};

/**
 * POS tab → Order actuator (the shared core).
 *
 * Extracted from `/api/admin/pos/orders` so every POS caller fires/charges the
 * SAME way — one implementation, no drift (Rule #1/#8). Both
 * `fireTab` and `chargeTab` read the tab from the store as the source of truth, so
 * a caller can only point at a tab id; it can never dictate items, prices, courses
 * or totals. Prices/discounts/combos are resolved server-side off the live menu.
 */

/** A handled, status-bearing failure. Thrown (not returned) so `withIdempotency`
 *  doesn't memoize it — a genuine failure stays retryable; only successes cache. */
export class PosActionError extends Error {
  constructor(public readonly httpStatus: number, message: string) {
    super(message);
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Validate a caller-supplied list of course ids. */
function parseCourses(input: unknown): PosCourse[] {
  if (!Array.isArray(input)) return [];
  return input.filter((c): c is PosCourse => POS_COURSE_ORDER.includes(c as PosCourse));
}

/** Resolve a tab's lines against the real menu and price them server-side,
 *  applying any fully-satisfied combo discount for the tab's channel. */
async function buildOrderShape(
  tab: PosTab,
  locationSlug: string,
  /** When set, only these lines are priced — the coursing path passes just the
   *  fired courses' lines so held courses never hit the KDS. Defaults to the
   *  whole tab (the charge / together path). */
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
    // Keep only modifier picks that resolve against THIS item's live groups —
    // the till can't invent an option id, and the priced delta is the menu's.
    const validOptions = new Set((m.modifierGroups ?? []).flatMap((g) => g.options.map((o) => o.id)));
    const modifiers = (li.modifiers ?? []).filter((sel) => validOptions.has(sel.optionId));
    items.push({
      menuItem: m,
      quantity: qty,
      locationSlug,
      ...(modifiers.length ? { selectedModifiers: modifiers } : {}),
      ...(li.notes ? { notes: li.notes } : {}),
    });
  }
  if (items.length === 0) return { error: "No valid items for this menu", status: 400 };

  // Modifier price deltas count toward the charged total (extra cheese +6 zł).
  const itemsTotal = items.reduce((s, ci) => s + effectiveUnitPrice(ci) * ci.quantity, 0);
  const config = (await getUpsellSettings())[locationSlug];
  const combo = getActiveComboDeals(items, config ?? null, tab.channel);
  const comboDiscount = combo.isComplete ? combo.savings : 0;
  const afterCombo = Math.max(0, itemsTotal - comboDiscount);
  const manual = manualDiscountGrosze(afterCombo, tab.discount);

  return {
    items,
    fulfillmentType: tab.channel,
    totalAmount: Math.max(0, afterCombo - manual),
  };
}

/** Create the tab's Order, or re-sync the one it's already linked to. When
 *  `paid` is set the order is stamped paid (charge flow). */
async function persistTabOrder(
  tab: PosTab,
  locationSlug: string,
  shape: { items: CartItem[]; totalAmount: number; fulfillmentType: FulfillmentType },
  paid: boolean,
  coursing?: Order["coursing"],
  /** Charge-time tender fields (tip / payments / comp / cash) merged onto the
   *  order. Only set on the charge path. */
  tender?: Partial<Order>,
): Promise<Order> {
  const now = new Date();
  const partySize = tab.channel === "dine-in" ? tab.covers ?? 2 : undefined;
  const tableId = tab.channel === "dine-in" ? tab.tableId : undefined;
  const deliveryAddress = tab.channel === "delivery" ? tab.address : undefined;
  const customerName = tab.customerName?.trim() || tab.name?.trim() || "Walk-in";
  const customerPhone = tab.customerPhone ? normalizePlPhoneE164(tab.customerPhone) ?? "" : "";

  if (tab.orderId) {
    const patched = await updateOrder(tab.orderId, {
      items: shape.items,
      totalAmount: shape.totalAmount,
      fulfillmentType: shape.fulfillmentType,
      partySize,
      tableId,
      deliveryAddress,
      customerName,
      customerPhone,
      ...(coursing !== undefined ? { coursing } : {}),
      ...(tender ?? {}),
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
    customerName,
    customerPhone,
    fulfillmentType: shape.fulfillmentType,
    partySize,
    tableId,
    deliveryAddress,
    coursing,
    ...(tender ?? {}),
    slotId: "walkin",
    slotDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    slotTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    createdAt: now.toISOString(),
    paidAt: paid ? now.toISOString() : undefined,
  };
  return createOrder(order, { suppressNotifications: true });
}

/**
 * "Send to KDS" / "Fire course". Builds (or re-syncs) the tab's Order and fires
 * it. Coursing: `courses` names the courses to fire now; they accumulate onto
 * `firedCourses` and the order is rebuilt from the union, so each fire grows the
 * ticket and held courses stay off the line. A bare send (no courses, `fireAll`,
 * or a non-coursed tab) fires everything. Idempotent per `idempotencyKey`.
 */
export async function fireTab(opts: {
  tabId: string;
  locationSlug: string;
  courses?: unknown;
  fireAll?: boolean;
  idempotencyKey?: string | null;
}): Promise<{ order: Order; orderId: string; firedCourses: PosCourse[] }> {
  const { tabId, locationSlug } = opts;
  return withIdempotency(opts.idempotencyKey ?? null, async () => {
    const tab = await getPosTab(tabId, locationSlug);
    if (!tab || tab.locationSlug !== locationSlug) throw new PosActionError(404, "Tab not found");

    const coursesPresent = new Set<PosCourse>(tab.items.map((l) => courseOf(l)));
    const requested = parseCourses(opts.courses);
    const fireAll = !tab.coursed || opts.fireAll === true || requested.length === 0;
    const firedSet = fireAll
      ? coursesPresent
      : new Set<PosCourse>([...(tab.firedCourses ?? []), ...requested].filter((c) => coursesPresent.has(c)));

    const linesToFire = tab.items.filter((l) => firedSet.has(courseOf(l)));
    const shape = await buildOrderShape(tab, locationSlug, linesToFire);
    if ("error" in shape) throw new PosActionError(shape.status, shape.error);

    const firedCourses = POS_COURSE_ORDER.filter((c) => firedSet.has(c));
    const coursing = tab.coursed
      ? { fired: firedCourses, held: POS_COURSE_ORDER.filter((c) => coursesPresent.has(c) && !firedSet.has(c)) }
      : undefined;
    const order = await persistTabOrder(tab, locationSlug, shape, false, coursing);
    await linkPosTabOrder(tab.id, { orderId: order.id, sentKds: true, status: "pay", firedCourses }, locationSlug);
    return { order, orderId: order.id, firedCourses };
  });
}

/**
 * "Charge". Ensures the order exists, applies the tender (tip / split / comp /
 * cash change), stamps it paid, and closes the tab. Idempotent per
 * `idempotencyKey` — a retry after a lost response returns the memoized result,
 * never a second payment or a 404 (the tab is already gone).
 *
 * The server owns every figure: the bill total comes from `buildOrderShape`
 * (live menu, combos, discount); the comp is clamped to the bill and gated by
 * the same per-shift refund guard as a post-sale refund; payments are validated
 * to cover net due + tip. A bare call (no `tender`) charges the full bill, no
 * tip — the original single-tap behaviour.
 */
export async function chargeTab(opts: {
  tabId: string;
  locationSlug: string;
  idempotencyKey?: string | null;
  tender?: PosTender;
  /** Actor id + role for the comp audit trail and per-shift comp cap. */
  actor?: string;
  role?: AdminRole;
}): Promise<{
  ok: true;
  orderId: string;
  totalAmount: number;
  tip: number;
  comp: number;
  change: number;
  netCollected: number;
}> {
  const { tabId, locationSlug, tender } = opts;
  return withIdempotency(opts.idempotencyKey ?? null, async () => {
    const tab = await getPosTab(tabId, locationSlug);
    if (!tab || tab.locationSlug !== locationSlug) throw new PosActionError(404, "Tab not found");

    const shape = await buildOrderShape(tab, locationSlug);
    if ("error" in shape) throw new PosActionError(shape.status, shape.error);

    const bill = shape.totalAmount;
    const tip = clampG(tender?.tipGrosze, 5_000_00); // sanity ceiling 5000 zł
    const comp = clampG(tender?.compGrosze, bill); // can't comp more than the bill
    const netDue = Math.max(0, bill - comp);

    // Comp guard — a manager can't comp the whole shift away (audit §11.2). Same
    // pure decision the refund dialog/route use; owners bypass. Checked before
    // the order is stamped paid so a blocked comp never settles the check.
    if (comp > 0 && opts.role) {
      const actor = opts.actor ?? "pos";
      const limits = (await getSettings()).refundControls ?? DEFAULT_REFUND_CONTROLS;
      const compTotalToday = await getActorCompTotalToday(actor, locationSlug);
      const guard = evaluateRefundGuard({
        role: opts.role,
        reasonCode: "manager_comp" as RefundReasonCode,
        amountGrosze: comp,
        actorCompTotalTodayGrosze: compTotalToday,
        limits,
      });
      if (!guard.allowed) throw new PosActionError(403, guard.message ?? "Comp not allowed");
    }

    // Tender breakdown. Default to a single payment of the net due + tip in the
    // chosen method; otherwise take the operator's split, clamped so the
    // recorded payments never exceed what's owed.
    const target = netDue + tip;
    let payments: PosPayment[] = (tender?.payments ?? [])
      .map((p) => ({ method: p.method === "cash" ? "cash" : "card", amount: clampG(p.amount, target) } as PosPayment))
      .filter((p) => p.amount > 0);
    if (payments.length === 0 && target > 0) {
      payments = [{ method: tender?.defaultMethod === "cash" ? "cash" : "card", amount: target }];
    }
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    if (target > 0 && paid < target) {
      throw new PosActionError(400, `Tendered ${(paid / 100).toFixed(2)} zł is short of ${(target / 100).toFixed(2)} zł due`);
    }

    // Cash change: what was physically handed over minus the cash share of the bill.
    const cashShare = payments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0);
    const cashTendered = tender?.cashTenderedGrosze != null ? clampG(tender.cashTenderedGrosze, 50_000_00) : undefined;
    const change = cashTendered != null ? Math.max(0, cashTendered - cashShare) : 0;

    const tenderFields: Partial<Order> = {
      ...(tip > 0 ? { tipAmount: tip } : {}),
      ...(comp > 0
        ? { compAmount: comp, compReasonCode: "manager_comp" as RefundReasonCode, ...(tender?.compNote ? { compNote: tender.compNote.slice(0, 200) } : {}) }
        : {}),
      ...(payments.length ? { payments } : {}),
      ...(cashTendered != null ? { cashTendered, changeGiven: change } : {}),
    };

    const order = await persistTabOrder(tab, locationSlug, shape, true, undefined, tenderFields);

    // A comp is food given away — log it so Reports and the per-shift comp cap
    // (getActorCompTotalToday) count it, exactly like a post-sale partial refund.
    if (comp > 0) {
      await appendAuditLog({
        actor: opts.actor ?? "pos",
        action: "pos.comp",
        entityType: "order",
        entityId: order.id,
        before: { totalAmount: bill },
        after: { refundAmount: comp, reasonCode: "manager_comp", locationSlug, note: tender?.compNote ?? null },
      });
    }

    await deletePosTab(tab.id, locationSlug);
    return { ok: true as const, orderId: order.id, totalAmount: order.totalAmount, tip, comp, change, netCollected: paid };
  });
}
