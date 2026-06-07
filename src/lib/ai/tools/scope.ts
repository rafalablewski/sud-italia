import type { ToolExecutionContext } from "./registry";

/**
 * Shared location-scope guard for read tools. Mirrors the inline check
 * in analytics.ts / mark-item-86.ts: a session scoped to specific
 * locations cannot query a sibling location. Returns an error string
 * when the requested location is out of scope, or null when allowed
 * (including the "*" all-access scope and the no-filter case).
 */
export function scopeError(ctx: ToolExecutionContext, locationSlug?: string): string | null {
  if (!locationSlug) return null;
  if (ctx.actor.locationScope === "*") return null;
  if (ctx.actor.locationScope.split(",").includes(locationSlug)) return null;
  return `Session is not authorized for location '${locationSlug}'`;
}

/**
 * Resolve the location a read should target. When the session is
 * scoped to a single location and the caller didn't specify one, default
 * to that location so the agent sees its own truck's data.
 */
export function defaultLocation(ctx: ToolExecutionContext, locationSlug?: string): string | undefined {
  if (locationSlug) return locationSlug;
  if (ctx.actor.locationScope !== "*" && !ctx.actor.locationScope.includes(",")) {
    return ctx.actor.locationScope;
  }
  return undefined;
}
