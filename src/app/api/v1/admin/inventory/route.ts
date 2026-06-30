import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter, scopeAllows } from "@/lib/api/v1/guard";
import {
  getIngredientStock,
  getIngredients,
  getStockForIngredient,
  createStockMovement,
} from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** A stock row joined with its ingredient name/unit/cost, ready to render. */
interface StockRowDTO {
  ingredientId: string;
  name: string;
  category: string;
  unit: string;
  locationSlug: string;
  onHand: number;
  parLevel: number;
  reorderPoint: number;
  low: boolean;
  /** Unit cost in grosze (shared ingredient catalogue), 0 when uncosted. */
  costPerUnit: number;
  /** On-hand valuation in grosze (onHand × costPerUnit), rounded — mirrors web. */
  valueGrosze: number;
  lastCountedAt: string | null;
  updatedAt: string;
}

/**
 * `GET /api/v1/admin/inventory` — on-hand stock vs par, mirroring web
 * `/admin/inventory`. Joins the per-location stock rows to the shared ingredient
 * catalogue so the app shows names + units. Staff+; location-scoped.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  try {
    const [stock, ingredients] = await Promise.all([getIngredientStock(), getIngredients()]);
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    const rows: StockRowDTO[] = stock
      .filter((s) => filter.slugs === null || filter.slugs.includes(s.locationSlug))
      .map((s) => {
        const ing = byId.get(s.ingredientId);
        const costPerUnit = ing?.costPerUnit ?? 0;
        return {
          ingredientId: s.ingredientId,
          name: ing?.name ?? s.ingredientId,
          category: ing?.category ?? "other",
          unit: ing?.unit ?? "",
          locationSlug: s.locationSlug,
          onHand: s.onHand,
          parLevel: s.parLevel,
          reorderPoint: s.reorderPoint,
          low: s.onHand <= s.reorderPoint,
          costPerUnit,
          valueGrosze: Math.round(s.onHand * costPerUnit),
          lastCountedAt: s.lastCountedAt ?? null,
          updatedAt: s.updatedAt,
        };
      });
    rows.sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name));
    return apiOk(rows, {
      count: rows.length,
      lowCount: rows.filter((r) => r.low).length,
      outCount: rows.filter((r) => r.onHand <= 0).length,
      totalValueGrosze: rows.reduce((sum, r) => sum + r.valueGrosze, 0),
    });
  } catch (err) {
    logger.error("v1 admin inventory failed", { layer: "api.v1.admin.inventory" }, err as Error);
    return apiError("internal", "Could not load inventory");
  }
}

/**
 * `POST /api/v1/admin/inventory` — adjust an ingredient's on-hand for one
 * location (a counted correction), mirroring the web stock-adjust action. Body
 * `{ ingredientId, locationSlug, delta, reason?, byUser? }` where `delta` is the
 * SIGNED change applied to on-hand (negative to write stock down). Records an
 * `adjust` stock movement through the same `createStockMovement` path the rest of
 * the app uses, so the audit history and on-hand stay consistent (Rule #1/#2).
 * Manager+; the location must be in the caller's scope.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;

  let body: { ingredientId?: string; locationSlug?: string; delta?: number; reason?: string; byUser?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }

  const ingredientId = String(body.ingredientId ?? "").trim();
  const loc = String(body.locationSlug ?? "").trim().toLowerCase();
  const delta = Number(body.delta);
  if (!ingredientId || !loc) {
    return apiError("validation_failed", "ingredientId and locationSlug are required");
  }
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100_000) {
    return apiError("validation_failed", "delta must be a non-zero number within ±100000");
  }
  if (!scopeAllows(guard.claims.scope, loc)) {
    return apiError("forbidden", `Not authorized for location "${loc}"`);
  }

  try {
    const ingredients = await getIngredients();
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) return apiError("not_found", "Unknown ingredient");

    await createStockMovement({
      ingredientId,
      locationSlug: loc,
      type: "adjust",
      quantity: delta,
      reason:
        typeof body.reason === "string" && body.reason.trim()
          ? body.reason.trim().slice(0, 200)
          : "Manual adjustment",
      byUser:
        typeof body.byUser === "string" && body.byUser.trim()
          ? body.byUser.trim().slice(0, 120)
          : guard.claims.name ?? guard.claims.sub,
    });

    const updated = await getStockForIngredient(ingredientId, loc);
    return apiOk(
      {
        ingredientId,
        name: ing.name,
        category: ing.category,
        unit: ing.unit,
        locationSlug: loc,
        onHand: updated?.onHand ?? 0,
        parLevel: updated?.parLevel ?? 0,
        reorderPoint: updated?.reorderPoint ?? 0,
        low: (updated?.onHand ?? 0) <= (updated?.reorderPoint ?? 0),
        lastCountedAt: updated?.lastCountedAt ?? null,
        updatedAt: updated?.updatedAt ?? new Date().toISOString(),
      },
      undefined,
      201,
    );
  } catch (err) {
    logger.error("v1 admin inventory adjust failed", { layer: "api.v1.admin.inventory" }, err as Error);
    return apiError("internal", "Could not adjust stock");
  }
}
