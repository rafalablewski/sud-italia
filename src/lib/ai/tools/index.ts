/**
 * Tool registry side-effect imports. Each module calls registerTool()
 * at import time, so this barrel guarantees every tool is registered
 * before the agent first runs. The agent UI imports from here to
 * trigger the registrations.
 */
import "./query-orders";
import "./query-customers";
import "./mark-item-86";
import "./refund-order";
import "./sms";
import "./analytics";
// Boardroom advisor tools (AI C-suite team) — read-only domain reads for
// the CEO/COO/CFO/CMO personas, plus one gated pricing lever.
import "./pnl";
import "./labor";
import "./menu-engineering";
import "./inventory";
import "./staff";
import "./suppliers";
import "./feedback";
import "./marketing";
import "./forecast";
import "./update-item-price";
import "./scheduled-bundles";
import "./escalate";

export {
  executeToolCall,
  listToolsForRole,
  toolsForApi,
  getTool,
  type ToolCallActor,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type ToolDefinition,
} from "./registry";
