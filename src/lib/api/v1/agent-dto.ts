import type { AiMessageRow } from "@/lib/ai/conversations";

/** A display-ready agent message for the native chat (text flattened). */
export interface AgentMessageDTO {
  id: string;
  role: "user" | "assistant" | "tool";
  text: string;
  createdAt: string;
}

/** Flatten an Anthropic-style content value (string | block[]) to plain text. */
export function flattenAgentContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => {
      if (typeof b === "string") return b;
      if (b && typeof b === "object") {
        const o = b as Record<string, unknown>;
        if (o.type === "text" && typeof o.text === "string") return o.text;
        if (o.type === "tool_use" && typeof o.name === "string") return `⚙︎ ${o.name}`;
        if (o.type === "tool_result") return "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Map persisted rows → display messages, dropping system/tool-result noise. */
export function toAgentMessages(rows: AiMessageRow[]): AgentMessageDTO[] {
  return rows
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      text: flattenAgentContent(m.content),
      createdAt: m.createdAt,
    }))
    .filter((m) => m.text.length > 0);
}
