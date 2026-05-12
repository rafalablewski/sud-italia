import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import {
  appendAuditLog,
  deleteComplianceItem,
  getComplianceItems,
  saveComplianceItem,
} from "@/lib/store";
import { COMPLIANCE_KINDS, type ComplianceKind } from "@/data/types";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const location = req.nextUrl.searchParams.get("location") || undefined;
  return NextResponse.json(await getComplianceItems(location));
}

export async function POST(req: NextRequest) {
  return upsert(req);
}

export async function PUT(req: NextRequest) {
  return upsert(req);
}

async function upsert(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  try {
    const body = await req.json();
    if (!body.locationSlug) {
      return NextResponse.json({ error: "locationSlug required" }, { status: 400 });
    }
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Title required" }, { status: 400 });
    }
    if (!COMPLIANCE_KINDS.includes(body.kind as ComplianceKind)) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    if (!body.expiresAt || Number.isNaN(new Date(body.expiresAt).getTime())) {
      return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
    }
    const saved = await saveComplianceItem({
      id: body.id,
      locationSlug: body.locationSlug,
      kind: body.kind,
      title: body.title.trim(),
      expiresAt: body.expiresAt,
      lastRenewedAt: body.lastRenewedAt,
      notes: body.notes?.trim() || undefined,
    });
    await appendAuditLog({
      actor: "admin",
      action: body.id ? "compliance.update" : "compliance.create",
      entityType: "compliance_item",
      entityId: saved.id,
      after: { kind: saved.kind, title: saved.title, expiresAt: saved.expiresAt },
    });
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth) return auth;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = await deleteComplianceItem(id);
  if (ok) {
    await appendAuditLog({
      actor: "admin",
      action: "compliance.delete",
      entityType: "compliance_item",
      entityId: id,
    });
  }
  return NextResponse.json({ ok });
}
