import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/api-middleware";
import { updateScheduledBundleIntent } from "@/lib/store";

/**
 * Admin status mutation for ScheduledBundleIntent rows. Operators move
 * an intent through the lifecycle from /admin/scheduled-bundles:
 *   pending → active   (operator approves; Phase-2 wires Stripe Subs)
 *   any     → paused   (temporarily suspend)
 *   any     → cancelled (kill)
 *
 * No body validation beyond status; weekday/readyAt updates allowed
 * for operator corrections.
 */
const patchSchema = z.object({
  status: z.enum(["pending", "active", "paused", "cancelled"]).optional(),
  weekday: z
    .enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
    .optional(),
  readyAt: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

export const PATCH = withAdmin<{ params: Promise<{ id: string }> }>(
  {},
  async (req: NextRequest, ctx) => {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const json = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid patch" }, { status: 400 });
    }
    const updated = await updateScheduledBundleIntent(id, parsed.data);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ intent: updated });
  },
);
