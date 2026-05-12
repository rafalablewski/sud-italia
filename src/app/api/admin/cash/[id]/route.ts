import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import {
  appendAuditLog,
  appendCashDrop,
  closeCashSession,
  getCashSessionById,
} from "@/lib/store";
import type { CashDrop } from "@/data/types";

const VALID_DROP_KINDS: CashDrop["kind"][] = ["sale", "drop", "payout", "adjust"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const session = await getCashSessionById(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(session);
}

/**
 * Two POST actions multiplexed via `?action=drop|close`. A single endpoint
 * keeps the URL surface small and matches how a manager actually thinks of
 * the session — one shape, two operations.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const action = req.nextUrl.searchParams.get("action");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (action === "drop") {
    const amountGrosze = Number(body.amountGrosze);
    const kind = body.kind as CashDrop["kind"];
    if (!Number.isFinite(amountGrosze) || amountGrosze === 0) {
      return NextResponse.json({ error: "amountGrosze required (non-zero)" }, { status: 400 });
    }
    if (!VALID_DROP_KINDS.includes(kind)) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    const updated = await appendCashDrop(id, {
      amountGrosze,
      kind,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      actor: typeof body.actor === "string" ? body.actor : "admin",
    });
    if (!updated) {
      return NextResponse.json(
        { error: "Session not found or already closed" },
        { status: 409 },
      );
    }
    await appendAuditLog({
      actor: typeof body.actor === "string" ? body.actor : "admin",
      action: `cash.${kind}`,
      entityType: "cash_session",
      entityId: id,
      after: { amountGrosze, kind, notes: body.notes },
    });
    return NextResponse.json(updated);
  }

  if (action === "close") {
    const closingCountGrosze = Number(body.closingCountGrosze);
    if (!Number.isFinite(closingCountGrosze) || closingCountGrosze < 0) {
      return NextResponse.json(
        { error: "closingCountGrosze must be a non-negative integer" },
        { status: 400 },
      );
    }
    const updated = await closeCashSession(
      id,
      closingCountGrosze,
      typeof body.closedBy === "string" ? body.closedBy : "admin",
      typeof body.notes === "string" ? body.notes : undefined,
    );
    if (!updated) {
      return NextResponse.json(
        { error: "Session not found or already closed" },
        { status: 409 },
      );
    }
    await appendAuditLog({
      actor: typeof body.closedBy === "string" ? body.closedBy : "admin",
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
}
