import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getCustomerNotes, addCustomerNote, deleteCustomerNote } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** `GET /api/v1/admin/customers/:phone/notes` — the guest's CRM notes. Staff+. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ phone: string }> }) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const { phone: raw } = await ctx.params;
  const canonical = normalizePlPhoneE164(decodeURIComponent(raw)) ?? decodeURIComponent(raw);
  try {
    const notes = await getCustomerNotes(canonical);
    return apiOk(notes.map((n) => ({ id: n.id, body: n.body, tags: n.tags ?? [], authoredBy: n.authoredBy ?? null, createdAt: n.createdAt })),
                 { count: notes.length });
  } catch (err) {
    logger.error("v1 customer notes list failed", { layer: "api.v1.admin.customers.notes" }, err as Error);
    return apiError("internal", "Could not load notes");
  }
}

/** `POST /api/v1/admin/customers/:phone/notes` — add a note. Staff+. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ phone: string }> }) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const { phone: raw } = await ctx.params;
  const canonical = normalizePlPhoneE164(decodeURIComponent(raw)) ?? decodeURIComponent(raw);
  let body: { body?: string; tags?: string[] };
  try { body = await req.json(); } catch { return apiError("bad_request", "Body must be valid JSON"); }
  const text = String(body.body ?? "").trim();
  if (!text) return apiError("validation_failed", "body is required");
  try {
    const note = await addCustomerNote({
      phone: canonical,
      body: text.slice(0, 1000),
      tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 8) : undefined,
      authoredBy: guard.claims.name ?? guard.claims.sub,
    });
    return apiOk({ id: note.id, body: note.body, tags: note.tags ?? [], authoredBy: note.authoredBy ?? null, createdAt: note.createdAt }, undefined, 201);
  } catch (err) {
    logger.error("v1 customer note add failed", { layer: "api.v1.admin.customers.notes" }, err as Error);
    return apiError("internal", "Could not save the note");
  }
}

/** `DELETE /api/v1/admin/customers/:phone/notes?id=` — remove a note. Manager+. */
export async function DELETE(req: NextRequest, _ctx: { params: Promise<{ phone: string }> }) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return apiError("validation_failed", "id is required");
  try {
    const ok = await deleteCustomerNote(id);
    if (!ok) return apiError("not_found", "Unknown note");
    return apiOk({ deleted: true, id });
  } catch (err) {
    logger.error("v1 customer note delete failed", { layer: "api.v1.admin.customers.notes" }, err as Error);
    return apiError("internal", "Could not delete the note");
  }
}
