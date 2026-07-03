import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getTables, saveTable, deleteTable } from "@/lib/store";
import { TABLE_FEATURES, type TableStatus, type TableFeature } from "@/data/types";

/**
 * Floor tables — per-location CRUD. Manager+ with location scope enforced by
 * withAdmin via the ?location= query param (the client sends it on every call).
 */

const STATUSES: TableStatus[] = ["available", "seated", "reserved", "out-of-service"];

// Reading the table list is staff-level: the POS table picker (staff+) needs
// it to seat a dine-in check. Mutations (POST/PUT/DELETE) stay manager+.
export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    return NextResponse.json(await getTables(locationSlug ?? undefined));
  },
);

export const POST = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "location required" }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const number = String(body.number ?? "").trim();
    const seats = Number(body.seats);
    if (!number) return NextResponse.json({ error: "Table number is required" }, { status: 400 });
    if (!Number.isFinite(seats) || seats < 1 || seats > 50) {
      return NextResponse.json({ error: "Seats must be 1–50" }, { status: 400 });
    }
    const status: TableStatus = STATUSES.includes(body.status) ? body.status : "available";
    const features = Array.isArray(body.features)
      ? (body.features.filter((f: unknown) => TABLE_FEATURES.includes(f as TableFeature)) as TableFeature[])
      : undefined;

    const table = await saveTable({
      id: typeof body.id === "string" ? body.id : undefined,
      locationSlug,
      number,
      seats: Math.round(seats),
      zone: body.zone ? String(body.zone).trim() : undefined,
      status,
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 280) || undefined : undefined,
      features: features && features.length ? features : undefined,
    });
    return NextResponse.json(table);
  },
);

export const DELETE = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await deleteTable(id, locationSlug ?? undefined);
    return NextResponse.json({ ok });
  },
);
