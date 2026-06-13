import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getSettings, updateSettings, wipeSimulationData, getOrders } from "@/lib/store";
import { seedSimulation } from "@/lib/sandbox/seed";

/**
 * Simulation mode control — owner-only. Switches the whole business onto an
 * isolated namespace (`sim:`) so real data is physically untouched. First enable
 * seeds a realistic, deep full CORE picture (orders → KDS + CRM, tables, slots,
 * staff, schedule, cash, bookings…) so every operational surface is testable
 * immediately; your edits persist across off→on. "reset" wipes + re-seeds a
 * clean dry-run; "wipe" clears to an empty namespace for hand-entry from
 * scratch. Toggling off hides every test row instantly (kept so you can resume).
 * The analysis/AI cron jobs keep running on the sim data so the agents learn
 * from it, while real-world side-effects (payments, customer sends) stay paused.
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
  if (body.action === "reset") {
    await updateSettings({ simulationModeEnabled: true });
    await wipeSimulationData();
    await seedSimulation();
    await updateSettings({ simulationSeeded: true });
    return NextResponse.json({ ok: true, enabled: true, reset: true });
  }

  // Wipe: clear every test row to an empty namespace but stay in simulation
  // mode (for operators who want to hand-enter the dry-run from scratch). Mark
  // it seeded so a later off→on toggle does NOT auto-reseed over the deliberately
  // empty namespace and clobber the operator's hand-entered data.
  if (body.action === "wipe") {
    await updateSettings({ simulationModeEnabled: true, simulationSeeded: true });
    await wipeSimulationData();
    return NextResponse.json({ ok: true, enabled: true, wiped: true });
  }

  const enabled = body.enabled === true;
  await updateSettings({ simulationModeEnabled: enabled });

  if (enabled) {
    // Seed on FIRST enable only. The persisted `simulationSeeded` flag is the
    // source of truth so a deliberate `wipe` (empty-but-seeded) isn't re-seeded
    // on a later off→on toggle. The empty-orders check is a belt-and-braces
    // guard for legacy namespaces seeded before the flag existed.
    const s = await getSettings();
    const existing = await getOrders();
    let seeded = false;
    if (!s.simulationSeeded && existing.length === 0) {
      await seedSimulation();
      await updateSettings({ simulationSeeded: true });
      seeded = true;
    }
    return NextResponse.json({ ok: true, enabled: true, seeded });
  }

  return NextResponse.json({ ok: true, enabled: false });
});
