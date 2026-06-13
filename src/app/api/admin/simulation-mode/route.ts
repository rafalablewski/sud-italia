import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getSettings, updateSettings, wipeSimulationData, getOrders } from "@/lib/store";
import { seedSimulation } from "@/lib/sandbox/seed";

/**
 * Simulation mode control — owner-only. Like Sandbox, it switches the whole
 * business onto an isolated namespace (`sim:`) so real data is physically
 * untouched. First enable seeds the SAME full CORE picture as Sandbox
 * (orders → KDS + CRM, tables, slots, staff, schedule, cash, bookings…) so every
 * operational surface is testable immediately; your edits persist across off→on.
 * "reset" wipes + re-seeds a clean dry-run; "wipe" clears to an empty namespace
 * for hand-entry from scratch. Toggling off hides every test row instantly (kept
 * so you can resume). Mutually exclusive with Sandbox mode. Unlike Sandbox, the
 * analysis/AI cron jobs keep running on the sim data so the agents learn from it.
 * (Distinct from /api/admin/simulation, which is the finance Calculator.)
 * See src/lib/store.ts (namespace prefixes) + src/lib/sandbox/seed.ts.
 */
export const GET = withAdmin({ roles: ["owner"] }, async () => {
  const s = await getSettings();
  return NextResponse.json({ enabled: s.simulationModeEnabled === true });
});

export const POST = withAdmin({ roles: ["owner"] }, async (req: NextRequest) => {
  const body = ((await req.json().catch(() => ({}))) || {}) as { enabled?: boolean; action?: string };

  // Reset: wipe the sim dataset and re-seed a clean dry-run (mode stays on).
  // Enabling simulation forces sandbox off (one namespace prefix at a time).
  if (body.action === "reset") {
    await updateSettings({ simulationModeEnabled: true, sandboxModeEnabled: false });
    await wipeSimulationData();
    await seedSimulation();
    return NextResponse.json({ ok: true, enabled: true, reset: true });
  }

  // Wipe: clear every test row to an empty namespace but stay in simulation
  // mode (for operators who want to hand-enter the dry-run from scratch).
  if (body.action === "wipe") {
    await updateSettings({ simulationModeEnabled: true, sandboxModeEnabled: false });
    await wipeSimulationData();
    return NextResponse.json({ ok: true, enabled: true, wiped: true });
  }

  const enabled = body.enabled === true;
  await updateSettings({ simulationModeEnabled: enabled, ...(enabled ? { sandboxModeEnabled: false } : {}) });

  if (enabled) {
    // Seed on first enable only (persist across off→on). Reads are now
    // sim-namespaced, so an empty order set means "never seeded".
    const existing = await getOrders();
    let seeded = false;
    if (existing.length === 0) {
      await seedSimulation();
      seeded = true;
    }
    return NextResponse.json({ ok: true, enabled: true, seeded });
  }

  return NextResponse.json({ ok: true, enabled: false });
});
