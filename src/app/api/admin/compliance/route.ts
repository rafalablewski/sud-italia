import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import {
  appendAuditLog,
  deleteComplianceItem,
  getComplianceItems,
  saveComplianceItem,
} from "@/lib/store";
import { COMPLIANCE_KINDS, type ComplianceKind } from "@/data/types";

export const GET = withAdmin(
  { locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    return NextResponse.json(await getComplianceItems(locationSlug ?? undefined));
  },
);

async function upsert(req: NextRequest, actor: string) {
  try {
    const body = await req.json();
    if (!body.locationSlug) {
      return NextResponse.json({ error: "locationSlug required" }, { status: 400 });
    }
    if (!(await hasLocationAccess(body.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${body.locationSlug}"` },
        { status: 403 },
      );
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
      actor,
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

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => upsert(req, user.email || user.id),
);

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => upsert(req, user.email || user.id),
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ok = await deleteComplianceItem(id);
    if (ok) {
      await appendAuditLog({
        actor: user.email || user.id,
        action: "compliance.delete",
        entityType: "compliance_item",
        entityId: id,
      });
    }
    return NextResponse.json({ ok });
  },
);
