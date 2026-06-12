import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getSettings, updateSettings, wipeSimulationData } from "@/lib/store";

/**
 * Simulation mode control — owner-only. Like Sandbox, it switches the whole
 * business onto an isolated namespace (`sim:`) so real data is physically
 * untouched. UNLIKE Sandbox it never seeds: the dataset starts EMPTY and the
 * owner fills it by hand — pushing test orders, waste, costs and customers — as
 * a pre-launch dry-run. Toggling off hides every test row instantly (kept so you
 * can resume); "wipe" clears it. Mutually exclusive with Sandbox mode.
 * (Distinct from /api/admin/simulation, which is the finance Calculator.)
 * See src/lib/store.ts (namespace prefixes).
 */
export const GET = withAdmin({ roles: ["owner"] }, async () => {
  const s = await getSettings();
  return NextResponse.json({ enabled: s.simulationModeEnabled === true });
});

export const POST = withAdmin({ roles: ["owner"] }, async (req: NextRequest) => {
  const body = ((await req.json().catch(() => ({}))) || {}) as { enabled?: boolean; action?: string };

  // Wipe: clear every hand-entered test row but stay in simulation mode.
  if (body.action === "wipe") {
    await updateSettings({ simulationModeEnabled: true, sandboxModeEnabled: false });
    await wipeSimulationData();
    return NextResponse.json({ ok: true, enabled: true, wiped: true });
  }

  // Enabling simulation forces sandbox off (one namespace prefix at a time).
  // No seed — the surface stays empty until the owner adds their own test data.
  const enabled = body.enabled === true;
  await updateSettings({ simulationModeEnabled: enabled, ...(enabled ? { sandboxModeEnabled: false } : {}) });
  return NextResponse.json({ ok: true, enabled });
});
