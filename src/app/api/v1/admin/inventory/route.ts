import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter } from "@/lib/api/v1/guard";
import { getIngredientStock, getIngredients } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** A stock row joined with its ingredient name/unit, ready to render. */
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
          lastCountedAt: s.lastCountedAt ?? null,
          updatedAt: s.updatedAt,
        };
      });
    rows.sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name));
    return apiOk(rows, { count: rows.length, lowCount: rows.filter((r) => r.low).length });
  } catch (err) {
    logger.error("v1 admin inventory failed", { layer: "api.v1.admin.inventory" }, err as Error);
    return apiError("internal", "Could not load inventory");
  }
}
