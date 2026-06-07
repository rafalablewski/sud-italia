import { getScheduledBundleIntents, updateScheduledBundleIntent } from "@/lib/store";
import { registerTool } from "./registry";
import { scopeError, defaultLocation } from "./scope";

/**
 * get_scheduled_bundles — read-only view of standing pre-order intents
 * ("the weekly usual"): customers who opted into a recurring bundle on a
 * given weekday. The COO/CMO use it to see what's pending approval and
 * what's already active. Read-only.
 */
registerTool<{ locationSlug?: string; status?: "pending" | "active" | "paused" | "cancelled" }>({
  name: "get_scheduled_bundles",
  description:
    "Read-only standing pre-order intents (recurring 'weekly usual' bundles): customer, bundle, weekday, " +
    "ready time, and lifecycle status (pending/active/paused/cancelled). Use to see what's awaiting approval " +
    "and the active recurring-revenue base. Filter by status (e.g. 'pending').",
  minRole: "manager",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      locationSlug: { type: "string", description: "Optional single-location filter." },
      status: { type: "string", enum: ["pending", "active", "paused", "cancelled"], description: "Optional lifecycle filter." },
    },
  },
  async execute(input, ctx) {
    const err = scopeError(ctx, input.locationSlug);
    if (err) return { ok: false, error: err };
    const loc = defaultLocation(ctx, input.locationSlug);
    const intents = await getScheduledBundleIntents({ locationSlug: loc, status: input.status });
    const byStatus = intents.reduce<Record<string, number>>((acc, i) => {
      acc[i.status] = (acc[i.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      ok: true,
      output: {
        locationSlug: loc ?? "all",
        statusCounts: byStatus,
        intents: intents.slice(0, 40).map((i) => ({
          id: i.id,
          customerPhone: i.customerPhone,
          locationSlug: i.locationSlug,
          bundle: i.bundleName,
          weekday: i.weekday,
          readyAt: i.readyAt,
          status: i.status,
        })),
      },
    };
  },
});

/**
 * manage_scheduled_bundle — move a standing pre-order through its lifecycle:
 * approve a pending intent, or pause / cancel an existing one. MUTATING +
 * manager+: surfaces a preview card the operator approves before it writes.
 * The COO's lever for converting captured demand into recurring revenue.
 */
registerTool<{ id: string; status: "active" | "paused" | "cancelled" }>({
  name: "manage_scheduled_bundle",
  description:
    "Change a standing pre-order's status: 'active' approves a pending intent (start the recurring order), " +
    "'paused' suspends it, 'cancelled' kills it. Provide the intent id (from get_scheduled_bundles). " +
    "Mutates state — the operator approves a preview first.",
  minRole: "manager",
  mutates: true,
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "string", description: "Scheduled-bundle intent id (from get_scheduled_bundles)." },
      status: { type: "string", enum: ["active", "paused", "cancelled"], description: "Target lifecycle status." },
    },
    required: ["id", "status"],
  },
  async execute(input, ctx) {
    // Fetch first so we can scope-check + show a meaningful preview.
    const all = await getScheduledBundleIntents();
    const intent = all.find((i) => i.id === input.id);
    if (!intent) return { ok: false, error: `Scheduled bundle '${input.id}' not found.` };

    const err = scopeError(ctx, intent.locationSlug);
    if (err) return { ok: false, error: err };

    const verb = input.status === "active" ? "Approve" : input.status === "paused" ? "Pause" : "Cancel";
    if (ctx.dryRun) {
      return {
        ok: true,
        preview: `${verb} the ${intent.weekday} "${intent.bundleName}" standing order for ${intent.customerPhone} at ${intent.locationSlug} (${intent.status} → ${input.status}).`,
      };
    }
    const updated = await updateScheduledBundleIntent(input.id, { status: input.status });
    if (!updated) return { ok: false, error: `Scheduled bundle '${input.id}' not found.` };
    return {
      ok: true,
      output: { id: updated.id, previousStatus: intent.status, newStatus: updated.status, bundle: updated.bundleName },
    };
  },
});
