import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getSettings, updateSettings, wipeSimulationData, getOrders } from "@/lib/store";
import { seedSimulation } from "@/lib/sandbox/seed";
import { logger } from "@/lib/logger";

/**
 * Run heavy simulation work while streaming live progress to the client as
 * newline-delimited JSON (one `{t,pct,msg}` object per line). The seed console
 * in Settings → Simulations reads this so the operator watches the deep dry-run
 * build instead of staring at a blind spinner. Auth/role are already enforced by
 * withAdmin before we get here, so a 401/403 stays a normal JSON response and
 * never a half-open stream. `run` returns the fields merged into the final
 * `done` line; any throw becomes an `error` line (the namespace is left as-is).
 */
function streamProgress(
  run: (send: (e: { pct: number; msg: string }) => void) => Promise<Record<string, unknown>>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // A vanished client (operator navigates away mid-seed, or the 15–20s
      // reseed outlives the tab) closes the consumer, after which
      // controller.enqueue throws. Never let that abort the work: swallow the
      // enqueue/close failures and just stop emitting, so the seed always runs
      // to completion server-side instead of leaving a half-populated namespace.
      let open = true;
      const write = (obj: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        const result = await run((e) => write({ t: "log", ...e }));
        write({ t: "done", ok: true, pct: 100, ...result });
      } catch (err) {
        logger.error("simulation-mode stream failed", { layer: "simulation-mode" }, err);
        write({ t: "error", ok: false, msg: err instanceof Error ? err.message : "Operation failed" });
      } finally {
        try { controller.close(); } catch { /* already closed by a vanished client */ }
      }
    },
  });
  return new Response(stream, {
    headers: {
      // NDJSON, explicitly un-buffered so each line reaches the browser the
      // moment it's enqueued (X-Accel-Buffering disables proxy buffering).
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

// The first enable + every "Reset & re-seed" lays down a deep ~10-month dataset
// (tens of thousands of orders plus staff, inventory, compliance and cash
// history). That work is legitimately heavy, so request the platform's max
// function budget rather than the default short window — otherwise the reseed
// is killed mid-flight and the namespace is left half-populated.
export const maxDuration = 300;

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
    return streamProgress(async (send) => {
      send({ pct: 1, msg: "Switching to simulation mode…" });
      await updateSettings({ simulationModeEnabled: true });
      send({ pct: 3, msg: "Wiping previous test dataset…" });
      await wipeSimulationData();
      await seedSimulation(send);
      await updateSettings({ simulationSeeded: true });
      return { enabled: true, reset: true };
    });
  }

  // Wipe: clear every test row to an empty namespace but stay in simulation
  // mode (for operators who want to hand-enter the dry-run from scratch). Mark
  // it seeded so a later off→on toggle does NOT auto-reseed over the deliberately
  // empty namespace and clobber the operator's hand-entered data.
  if (body.action === "wipe") {
    return streamProgress(async (send) => {
      send({ pct: 20, msg: "Marking namespace as seeded (so it won't auto-reseed)…" });
      await updateSettings({ simulationModeEnabled: true, simulationSeeded: true });
      send({ pct: 50, msg: "Clearing every test row…" });
      await wipeSimulationData();
      send({ pct: 95, msg: "Namespace emptied — ready for hand-entry." });
      return { enabled: true, wiped: true };
    });
  }

  const enabled = body.enabled === true;

  if (enabled) {
    return streamProgress(async (send) => {
      send({ pct: 1, msg: "Enabling simulation mode…" });
      await updateSettings({ simulationModeEnabled: true });
      // Seed on FIRST enable only. The persisted `simulationSeeded` flag is the
      // source of truth so a deliberate `wipe` (empty-but-seeded) isn't re-seeded
      // on a later off→on toggle. The empty-orders check is a belt-and-braces
      // guard for legacy namespaces seeded before the flag existed.
      const s = await getSettings();
      const existing = await getOrders();
      let seeded = false;
      if (!s.simulationSeeded && existing.length === 0) {
        await seedSimulation(send);
        await updateSettings({ simulationSeeded: true });
        seeded = true;
      } else {
        send({ pct: 90, msg: "Restoring your existing test dataset…" });
      }
      return { enabled: true, seeded };
    });
  }

  // Disable — fast, but streamed too so the client always speaks one protocol.
  return streamProgress(async (send) => {
    send({ pct: 40, msg: "Hiding every test row…" });
    await updateSettings({ simulationModeEnabled: false });
    return { enabled: false };
  });
});
