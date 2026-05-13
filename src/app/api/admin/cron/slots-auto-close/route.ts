import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { getSlots, updateSlot } from "@/lib/store";

/**
 * Auto-close slots whose end-of-window is in the past (m1_12).
 *
 * Runs every 5 minutes via vercel.json. "Past-time" = the slot's date+time
 * is earlier than 30 minutes ago (UTC) — gives staff a buffer to take
 * late walk-ins / process a delayed prep that crossed the window. After
 * that grace period the slot moves from `active` to `draft` so it falls
 * off the public booking surface but isn't deleted (operator can re-open
 * for an exception).
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 60 * 1000);
  const cutoffIso = cutoff.toISOString();

  const slots = await getSlots();
  let closed = 0;
  let inspected = 0;
  for (const slot of slots) {
    if (slot.status !== "active") continue;
    // Construct the slot's wall-clock instant (assume UTC for the
    // comparison; the actual scheduling is per-location and the planner
    // hands them out in local time, but for "is it in the past?" UTC is
    // close enough at 30 min grace).
    const slotInstant = new Date(`${slot.date}T${slot.time}:00.000Z`);
    if (!Number.isFinite(slotInstant.getTime())) continue;
    inspected += 1;
    if (slotInstant >= cutoff) continue;
    await updateSlot(slot.id, { status: "draft" });
    closed += 1;
  }

  logCronRun("slots-auto-close", { cutoff: cutoffIso, inspected, closed });
  return NextResponse.json({ ok: true, inspected, closed, cutoff: cutoffIso });
}
