import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getSettings,
  updateSettings,
  wipeSandboxData,
  getOrders,
} from "@/lib/store";
import { seedSandbox } from "@/lib/sandbox/seed";

/**
 * Sandbox / Simulation mode control — owner-only. Enabling switches the whole
 * business onto the `sandbox:`-namespaced demo dataset (real data untouched);
 * disabling restores real instantly. First enable seeds rich demo data; reset
 * wipes + re-seeds. See src/lib/store.ts (namespace) + src/lib/sandbox/seed.ts.
 */
export const GET = withAdmin({ roles: ["owner"] }, async () => {
  const s = await getSettings();
  return NextResponse.json({ enabled: s.sandboxModeEnabled === true });
});

export const POST = withAdmin({ roles: ["owner"] }, async (req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean; action?: string };

  // Reset: wipe the sandbox dataset and re-seed a clean demo (mode stays on).
  // Sandbox + simulation are mutually exclusive, so enabling sandbox forces
  // simulation off (one namespace prefix can be live at a time).
  if (body.action === "reset") {
    await updateSettings({ sandboxModeEnabled: true, simulationModeEnabled: false });
    await wipeSandboxData();
    await seedSandbox();
    return NextResponse.json({ ok: true, enabled: true, reset: true });
  }

  const enabled = body.enabled === true;
  await updateSettings({ sandboxModeEnabled: enabled, ...(enabled ? { simulationModeEnabled: false } : {}) });

  if (enabled) {
    // Seed on first enable only (persist across off→on). Reads are now
    // sandbox-namespaced, so an empty order set means "never seeded".
    const existing = await getOrders();
    let seeded = false;
    if (existing.length === 0) {
      await seedSandbox();
      seeded = true;
    }
    return NextResponse.json({ ok: true, enabled: true, seeded });
  }

  return NextResponse.json({ ok: true, enabled: false });
});
