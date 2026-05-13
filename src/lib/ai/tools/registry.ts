import type Anthropic from "@anthropic-ai/sdk";
import type { AdminRole } from "@/lib/admin-auth";
import { ROLE_RANK } from "@/lib/admin-auth";
import { appendAuditLog } from "@/lib/store";
import { logger } from "@/lib/logger";

/**
 * Tool registry (m4_2 + m4_3). Each tool declares:
 *   - JSON schema for input validation (passed verbatim to Anthropic),
 *   - the minimum AdminRole that may execute it,
 *   - whether it mutates state (informs the "preview card" UI),
 *   - the handler.
 *
 * Every successful execution writes an audit row tagged
 * `actor='claude:${userId}'` so operators can trace any action the
 * agent took back to a human session. Dry-run mode lets the UI render
 * a preview without performing the side effect — used when the agent
 * proposes a destructive action and the operator hasn't confirmed yet.
 */

export interface ToolCallActor {
  userId: string;
  role: AdminRole;
  locationScope: string;
}

export interface ToolExecutionContext {
  actor: ToolCallActor;
  dryRun: boolean;
}

export interface ToolExecutionResult {
  ok: boolean;
  output?: unknown;
  /** Operator-visible reason when ok=false (role gate, validation, etc.) */
  error?: string;
  /**
   * When provided, the UI shows this as a preview card before the
   * operator confirms execution. Required for mutating tools.
   */
  preview?: string;
}

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  /** Minimum role that may execute. */
  minRole: AdminRole;
  /** True for tools that mutate state — UI shows a confirm card. */
  mutates: boolean;
  /**
   * Implementation. When `ctx.dryRun=true`, MUST NOT perform the
   * side effect — instead return a preview describing what would
   * happen.
   */
  execute(input: TInput, ctx: ToolExecutionContext): Promise<ToolExecutionResult>;
}

const registry = new Map<string, ToolDefinition<unknown>>();

export function registerTool<T>(def: ToolDefinition<T>): void {
  registry.set(def.name, def as ToolDefinition<unknown>);
}

export function getTool(name: string): ToolDefinition<unknown> | undefined {
  return registry.get(name);
}

export function listToolsForRole(role: AdminRole): ToolDefinition<unknown>[] {
  const rank = ROLE_RANK[role];
  return Array.from(registry.values()).filter((t) => ROLE_RANK[t.minRole] <= rank);
}

/**
 * Render the registry as the `tools` array the Messages API wants.
 * Filtered to what the calling operator can actually execute so the
 * model doesn't propose tools we'd have to reject anyway.
 */
export function toolsForApi(role: AdminRole): Anthropic.Tool[] {
  return listToolsForRole(role).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

/**
 * Single chokepoint for tool execution. Enforces:
 *   1. role gate — manager+ tools blocked for staff sessions,
 *   2. audit log on success AND failure (denied-by-policy still gets
 *      a row so investigators see attempts),
 *   3. dry-run propagation.
 */
export async function executeToolCall(
  name: string,
  input: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const tool = registry.get(name);
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${name}` };
  }

  if (ROLE_RANK[ctx.actor.role] < ROLE_RANK[tool.minRole]) {
    await appendAuditLog({
      actor: `claude:${ctx.actor.userId}`,
      action: `ai.tool.denied`,
      entityType: "ai.tool",
      entityId: name,
      after: { reason: "insufficient_role", required: tool.minRole, actual: ctx.actor.role },
    });
    return {
      ok: false,
      error: `Tool '${name}' requires role '${tool.minRole}'; your role is '${ctx.actor.role}'`,
    };
  }

  try {
    const result = await tool.execute(input, ctx);
    await appendAuditLog({
      actor: `claude:${ctx.actor.userId}`,
      action: ctx.dryRun ? `ai.tool.preview` : `ai.tool.execute`,
      entityType: "ai.tool",
      entityId: name,
      after: { input, ok: result.ok, error: result.error, dryRun: ctx.dryRun },
    });
    return result;
  } catch (err) {
    logger.error(
      "ai.tool.exception",
      { layer: "ai.tool", tool: name, userId: ctx.actor.userId },
      err,
    );
    await appendAuditLog({
      actor: `claude:${ctx.actor.userId}`,
      action: `ai.tool.exception`,
      entityType: "ai.tool",
      entityId: name,
      after: { input, error: err instanceof Error ? err.message : String(err) },
    });
    return { ok: false, error: err instanceof Error ? err.message : "Tool execution failed" };
  }
}

/** Test-only — reset registry between tests. */
export function _resetRegistryForTests(): void {
  registry.clear();
}
