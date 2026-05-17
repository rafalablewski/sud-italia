import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  ADMIN_PUSH_TEMPLATES,
  pushToAdmins,
} from "@/lib/admin-push";

/**
 * One-tap "send myself a test push". Useful for verifying VAPID setup +
 * the subscription handshake without waiting for an order to actually
 * land. Scoped to the calling user only — never blasts everyone.
 */
export const POST = withAdmin({}, async (_req, _ctx, { user }) => {
  const sent = await pushToAdmins(
    ADMIN_PUSH_TEMPLATES.test(user.email || user.id),
    { userIds: [user.id], category: "test" },
  );
  return NextResponse.json({ ok: true, sent });
});
