"use client";

import { Badge, Dialog } from "./ui";
import { AgentEditForm } from "./agent-hq/AgentEditForm";
import type { AgentConfig } from "@/lib/ai/boardroom/agent-config";

/**
 * AgentEditor — the modal wrapper around the shared inline AgentEditForm. Used
 * from the dedicated per-agent page; Scorecards renders AgentEditForm directly.
 */
export function AgentEditor({ agentId, configs, toolCatalog, onClose, onSaved }: {
  agentId: string;
  configs: AgentConfig[];
  toolCatalog: string[];
  onClose: () => void;
  onSaved: (updated: AgentConfig) => void;
}) {
  const agent = configs.find((c) => c.id === agentId);
  return (
    <Dialog
      open
      onClose={onClose}
      width={760}
      title={`Edit · ${agent?.name ?? "agent"}`}
      subtitle={agent?.title}
      headerExtra={agent ? <Badge tone={agent.status === "active" ? "ok" : agent.status === "paused" ? "warn" : "neutral"}>{agent.status}</Badge> : undefined}
    >
      <AgentEditForm agentId={agentId} configs={configs} toolCatalog={toolCatalog} onSaved={onSaved} onClose={onClose} />
    </Dialog>
  );
}
