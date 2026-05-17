import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  type AdminPushCategory,
  getAdminPushPrefs,
  setAdminPushPrefs,
} from "@/lib/admin-push";

const ALL_CATEGORIES: AdminPushCategory[] = [
  "new_order",
  "slot_full",
  "low_slots",
  "order_status",
  "bundle_low_margin",
  "dispute",
  "low_stock",
  "cash_variance",
  "refund",
];

export const GET = withAdmin({}, async (_req, _ctx, { user }) => {
  const prefs = await getAdminPushPrefs(user.id);
  return NextResponse.json({ muted: prefs.muted, available: ALL_CATEGORIES });
});

export const PUT = withAdmin({}, async (req, _ctx, { user }) => {
  const body = (await req.json().catch(() => ({}))) as {
    muted?: AdminPushCategory[];
  };
  const muted = Array.isArray(body.muted)
    ? body.muted.filter((c): c is AdminPushCategory =>
        ALL_CATEGORIES.includes(c as AdminPushCategory),
      )
    : [];
  await setAdminPushPrefs(user.id, muted);
  return NextResponse.json({ ok: true, muted });
});
