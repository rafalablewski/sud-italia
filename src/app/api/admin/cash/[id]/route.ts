import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess } from "@/lib/admin-auth";
import {
  appendAuditLog,
  appendCashDrop,
  closeCashSession,
  deleteCashSession,
  getCashSessionById,
  setCashSessionHidden,
} from "@/lib/store";
import { cashCloseSchema, cashDropSchema } from "@/lib/api-schemas";

export const GET = withAdmin<{ params: Promise<{ id: string }> }>(
  {},
  async (_req, { params }) => {
    const { id } = await params;
    const session = await getCashSessionById(id);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await hasLocationAccess(session.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${session.locationSlug}"` },
        { status: 403 },
      );
    }
    return NextResponse.json(session);
  },
);

/**
 * Two POST actions multiplexed via `?action=drop|close`. A single endpoint
 * keeps the URL surface small and matches how a manager actually thinks of
 * the session — one shape, two operations.
 *
 * Both actions touch revenue reconciliation — manager+. Per-cash-session
 * tenancy is checked after fetching the session record.
 */
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["manager", "owner"] },
  async (req, { params }, { user }) => {
    const { id } = await params;
    const action = req.nextUrl.searchParams.get("action");

    const session = await getCashSessionById(id);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await hasLocationAccess(session.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${session.locationSlug}"` },
        { status: 403 },
      );
    }

    if (action === "drop") {
      const parsed = cashDropSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
          { status: 400 },
        );
      }
      const { amountGrosze, kind, notes, actor: bodyActor } = parsed.data;
      const actor = bodyActor || user.email || user.id;
      const updated = await appendCashDrop(id, { amountGrosze, kind, notes, actor });
      if (!updated) {
        return NextResponse.json(
          { error: "Session not found or already closed" },
          { status: 409 },
        );
      }
      await appendAuditLog({
        actor,
        action: `cash.${kind}`,
        entityType: "cash_session",
        entityId: id,
        after: { amountGrosze, kind, notes },
      });
      return NextResponse.json(updated);
    }

    if (action === "close") {
      const parsed = cashCloseSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
          { status: 400 },
        );
      }
      const { closingCountGrosze, closedBy, notes } = parsed.data;
      const actor = closedBy || user.email || user.id;
      const updated = await closeCashSession(id, closingCountGrosze, actor, notes);
      if (!updated) {
        return NextResponse.json(
          { error: "Session not found or already closed" },
          { status: 409 },
        );
      }
      await appendAuditLog({
        actor,
        action: "cash.close",
        entityType: "cash_session",
        entityId: id,
        after: {
          closingCountGrosze: updated.closingCountGrosze,
          varianceGrosze: updated.varianceGrosze,
        },
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  },
);

/** Toggle `hidden` on a cash session. Body: `{ hidden: boolean }`.
 *  Hiding is a soft-delete: the row is removed from the default History view
 *  but retained for audit and revealable via "Show hidden". */
export const PATCH = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["manager", "owner"] },
  async (req, { params }, { user }) => {
    const { id } = await params;
    const session = await getCashSessionById(id);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await hasLocationAccess(session.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${session.locationSlug}"` },
        { status: 403 },
      );
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body.hidden !== "boolean") {
      return NextResponse.json({ error: "Body must include { hidden: boolean }" }, { status: 400 });
    }
    const updated = await setCashSessionHidden(id, body.hidden);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await appendAuditLog({
      actor: user.email || user.id,
      action: body.hidden ? "cash.hide" : "cash.unhide",
      entityType: "cash_session",
      entityId: id,
      after: { hidden: body.hidden },
    });
    return NextResponse.json(updated);
  },
);

/** Hard-delete a cash session. Used for fixing fat-finger opens and test data.
 *  Real reconciled history should be hidden, not deleted — but managers need
 *  an escape hatch when the row is wrong. Audit-logged. */
export const DELETE = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["manager", "owner"] },
  async (_req, { params }, { user }) => {
    const { id } = await params;
    const session = await getCashSessionById(id);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await hasLocationAccess(session.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${session.locationSlug}"` },
        { status: 403 },
      );
    }
    const removed = await deleteCashSession(id);
    if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await appendAuditLog({
      actor: user.email || user.id,
      action: "cash.delete",
      entityType: "cash_session",
      entityId: id,
      before: {
        openedAt: removed.openedAt,
        closedAt: removed.closedAt,
        openingFloat: removed.openingFloat,
        varianceGrosze: removed.varianceGrosze,
      },
    });
    return NextResponse.json({ ok: true });
  },
);
