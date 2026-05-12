import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { deleteTruckRoute, getTruckRoutes, saveTruckRoute } from "@/lib/store";

async function requireAuth() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const location = req.nextUrl.searchParams.get("location") || undefined;
  return NextResponse.json(await getTruckRoutes(location));
}

async function upsertRoute(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  try {
    const body = await req.json();
    if (!body.name?.trim() || !body.locationSlug) {
      return NextResponse.json({ error: "name + locationSlug required" }, { status: 400 });
    }
    const saved = await saveTruckRoute({
      id: body.id,
      name: body.name.trim(),
      locationSlug: body.locationSlug,
      description: body.description,
      stops: Array.isArray(body.stops) ? body.stops : [],
    });
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  return upsertRoute(req);
}

export async function PUT(req: NextRequest) {
  return upsertRoute(req);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = await deleteTruckRoute(id);
  return NextResponse.json({ ok });
}
