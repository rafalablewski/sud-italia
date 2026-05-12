import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
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

async function requireAuth() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const slug = req.nextUrl.searchParams.get("location") || undefined;
  if (slug) {
    const c = await getExpansionChecklist(slug);
    return NextResponse.json(c ?? null);
  }
  return NextResponse.json(await getExpansionChecklists());
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  try {
    const body = await req.json();
    if (!body.locationSlug) {
      return NextResponse.json({ error: "Missing locationSlug" }, { status: 400 });
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
}
