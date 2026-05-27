import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  getWaConversationFlags,
  setWaArchived,
  setWaPinned,
} from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";

/** Operator-console archive / pin state for WhatsApp conversations. */
export const GET = withAdmin(
  { roles: ["staff", "kitchen", "manager", "owner"] },
  async () => {
    return NextResponse.json(await getWaConversationFlags());
  },
);

/** Toggle a conversation's archive / pin flag. Body: { phone, archived?, pinned? }. */
export const POST = withAdmin(
  { roles: ["staff", "kitchen", "manager", "owner"] },
  async (req, _ctx, { user }) => {
    const body = (await req.json().catch(() => ({}))) as {
      phone?: unknown;
      archived?: unknown;
      pinned?: unknown;
    };
    const phone = typeof body.phone === "string" ? normalizePlPhoneE164(body.phone) : null;
    if (!phone) {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }
    if (typeof body.archived === "boolean") {
      await setWaArchived(phone, body.archived);
      await appendAuditLog({
        actor: user.email || user.id,
        action: body.archived ? "whatsapp.conversation.archive" : "whatsapp.conversation.unarchive",
        entityType: "whatsapp_session",
        entityId: phone,
      });
    }
    if (typeof body.pinned === "boolean") {
      await setWaPinned(phone, body.pinned);
      await appendAuditLog({
        actor: user.email || user.id,
        action: body.pinned ? "whatsapp.conversation.pin" : "whatsapp.conversation.unpin",
        entityType: "whatsapp_session",
        entityId: phone,
      });
    }
    return NextResponse.json(await getWaConversationFlags());
  },
);
