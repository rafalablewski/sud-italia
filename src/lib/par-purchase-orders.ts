import type { Ingredient, PurchaseOrder, Supplier } from "@/data/types";
import {
  getIngredientStock,
  getIngredients,
  getPurchaseOrders,
  getStockMovements,
  getSuppliers,
  savePurchaseOrder,
} from "@/lib/store";
import { logger } from "@/lib/logger";

/**
 * PAR-driven purchase-order draft generation (audit §3 — replaces
 * eyeball-and-call ordering with a structured draft the operator
 * one-clicks-sends).
 *
 * For every location:
 *   1. Read on-hand stock per ingredient.
 *   2. Estimate average daily usage from the last 14 days of `consume`
 *      stock movements.
 *   3. Compute the lead-time-adjusted reorder threshold:
 *        threshold = reorderPoint + (avgDailyUsage × supplier.leadTimeDays)
 *      If we don't know the lead time, fall back to a 3-day buffer so
 *      we don't under-order from new suppliers.
 *   4. Where on-hand drops below the threshold, queue a line for the
 *      ingredient's supplier with quantity = (parLevel − onHand)
 *      rounded up to the supplier's MOQ (1 by default).
 *   5. Group lines by supplier and emit one draft PO per supplier per
 *      location. Idempotency-safe: re-running the cron the same day
 *      reuses the deterministic id `par-{slug}-{supplierId}-{YYYYMMDD}`
 *      and a `savePurchaseOrder` with the same id replaces the row,
 *      so we never spawn duplicate drafts.
 *
 * The result is a populated drafts queue — the operator opens
 * /admin/purchase-orders, reviews, edits if needed, taps Send.
 */

const FALLBACK_LEAD_DAYS = 3;
const USAGE_WINDOW_DAYS = 14;

function todayUtcStamp(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

interface Draft {
  supplierId: string;
  lines: { ingredientId: string; quantity: number; unitCost: number }[];
  threshold: { ingredientId: string; onHand: number; usagePerDay: number; threshold: number }[];
}

function ceilToInt(n: number): number {
  return Math.max(1, Math.ceil(n));
}

function pickSupplierForIngredient(
  ingredient: Ingredient,
  suppliers: Supplier[],
): Supplier | null {
  if (!ingredient.supplier) return null;
  return (
    suppliers.find((s) => s.id === ingredient.supplier || s.name === ingredient.supplier) ?? null
  );
}

export async function generateParPurchaseOrders(locationSlug: string): Promise<{
  drafts: PurchaseOrder[];
  considered: number;
  belowThreshold: number;
  skippedNoSupplier: number;
}> {
  const [ingredients, suppliers, stockHere, movements] = await Promise.all([
    getIngredients(),
    getSuppliers(),
    getIngredientStock(locationSlug),
    getStockMovements({ locationSlug }),
  ]);

  // Average daily consumption over the trailing window. `consume`
  // movements carry a negative quantity (drain); we absolute-value
  // them so divisions stay positive.
  const cutoffMs = Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const usageByIngredient = new Map<string, number>();
  for (const m of movements) {
    if (m.type !== "consume") continue;
    if (Date.parse(m.occurredAt) < cutoffMs) continue;
    usageByIngredient.set(
      m.ingredientId,
      (usageByIngredient.get(m.ingredientId) || 0) + Math.abs(m.quantity),
    );
  }
  const dailyUsage = (ingredientId: string): number => {
    const total = usageByIngredient.get(ingredientId) || 0;
    return total / USAGE_WINDOW_DAYS;
  };

  const stockMap = new Map(stockHere.map((s) => [s.ingredientId, s]));

  const draftsBySupplier = new Map<string, Draft>();
  let considered = 0;
  let belowThreshold = 0;
  let skippedNoSupplier = 0;

  for (const ingredient of ingredients) {
    const stock = stockMap.get(ingredient.id);
    if (!stock) continue;
    considered += 1;
    const supplier = pickSupplierForIngredient(ingredient, suppliers);
    const leadDays = supplier?.leadTimeDays ?? FALLBACK_LEAD_DAYS;
    const usagePerDay = dailyUsage(ingredient.id);
    const threshold = (stock.reorderPoint || 0) + usagePerDay * leadDays;
    if (stock.onHand >= threshold || stock.parLevel <= 0) continue;
    belowThreshold += 1;
    if (!supplier) {
      skippedNoSupplier += 1;
      continue;
    }
    const orderQty = ceilToInt(stock.parLevel - stock.onHand);
    const draft = draftsBySupplier.get(supplier.id) ?? {
      supplierId: supplier.id,
      lines: [],
      threshold: [],
    };
    draft.lines.push({
      ingredientId: ingredient.id,
      quantity: orderQty,
      unitCost: ingredient.costPerUnit,
    });
    draft.threshold.push({
      ingredientId: ingredient.id,
      onHand: stock.onHand,
      usagePerDay,
      threshold,
    });
    draftsBySupplier.set(supplier.id, draft);
  }

  const stamp = todayUtcStamp();
  const existing = await getPurchaseOrders({ locationSlug, status: "draft" });
  const drafts: PurchaseOrder[] = [];
  for (const draft of draftsBySupplier.values()) {
    const id = `par-${locationSlug}-${draft.supplierId}-${stamp}`;
    // If the operator has already edited & sent today's PAR draft,
    // don't replace it — only refresh while still in `draft` status.
    const prior = existing.find((p) => p.id === id);
    if (prior && prior.status !== "draft") continue;
    const supplier = suppliers.find((s) => s.id === draft.supplierId);
    const noteLines = [
      `Auto-generated by PAR cron (audit §3 row 2).`,
      `Window: trailing ${USAGE_WINDOW_DAYS} days.`,
      `Lead time: ${supplier?.leadTimeDays ?? FALLBACK_LEAD_DAYS} day(s).`,
      ...draft.threshold.map(
        (t) =>
          `  · ${t.ingredientId}: on-hand ${t.onHand}, usage/day ${t.usagePerDay.toFixed(2)}, threshold ${t.threshold.toFixed(2)}`,
      ),
    ];
    const saved = await savePurchaseOrder({
      id,
      supplierId: draft.supplierId,
      locationSlug,
      status: "draft",
      lines: draft.lines,
      notes: noteLines.join("\n"),
    });
    drafts.push(saved);
  }

  logger.info("par.purchase_orders.generated", {
    layer: "par",
    locationSlug,
    considered,
    belowThreshold,
    skippedNoSupplier,
    draftsWritten: drafts.length,
  });

  return { drafts, considered, belowThreshold, skippedNoSupplier };
}
