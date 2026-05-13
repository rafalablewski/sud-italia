import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import { getExpansionChecklist, getExpansionChecklists, saveExpansionChecklist } from "@/lib/store";
import type { ExpansionChecklistItem } from "@/data/types";

const VALID_CATEGORIES = new Set<ExpansionChecklistItem["category"]>([
  "legal",
  "site",
  "supply",
  "people",
  "ops",
  "marketing",
]);

export const GET = withAdmin(
  { locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    if (locationSlug) {
      const c = await getExpansionChecklist(locationSlug);
      return NextResponse.json(c ?? null);
    }
    return NextResponse.json(await getExpansionChecklists());
  },
);

// Expansion checklists drive the new-location workflow — manager+ only.
export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    try {
      const body = await req.json();
      if (!body.locationSlug) {
        return NextResponse.json({ error: "Missing locationSlug" }, { status: 400 });
      }
      if (!(await hasLocationAccess(body.locationSlug))) {
        return NextResponse.json(
          { error: `Session is not authorized for location "${body.locationSlug}"` },
          { status: 403 },
        );
      }
      const items: ExpansionChecklistItem[] = Array.isArray(body.items)
        ? body.items.map((raw: Record<string, unknown>) => ({
            id: String(raw.id || `it-${Math.random().toString(36).slice(2, 8)}`),
            label: String(raw.label || "").trim(),
            done: Boolean(raw.done),
            category:
              typeof raw.category === "string" && VALID_CATEGORIES.has(raw.category as ExpansionChecklistItem["category"])
                ? (raw.category as ExpansionChecklistItem["category"])
                : "ops",
            notes: typeof raw.notes === "string" ? raw.notes : undefined,
          }))
        : [];
      const saved = await saveExpansionChecklist({
        locationSlug: body.locationSlug,
        city: body.city,
        items,
        notes: body.notes,
      });
      return NextResponse.json(saved);
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
  },
);
