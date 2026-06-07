"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, AlertTriangle, Check, ChevronRight, Plus } from "lucide-react";
import { Button, Card, CardBody, CardHeader, EmptyState, Textarea, Badge } from "@/ui";

interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface PendingToolUse {
  id: string;
  name: string;
  input: unknown;
  preview: string;
}

interface ChatEvent {
  type: "text" | "tool_use" | "tool_result" | "error" | "done";
  text?: string;
  toolUse?: {
    id: string;
    name: string;
    input: unknown;
    executed: boolean;
    preview?: string;
    result?: unknown;
    error?: string;
  };
  stopReason?: string;
  totalCostGrosze?: number;
}

interface ChatTurn {
  id: string;
  userText: string;
  events: ChatEvent[];
  /** Tool uses awaiting operator approval before they run for real. */
  pending: PendingToolUse[];
}

interface OpsAgentChatProps {
  gatewayConfigured: boolean;
}

/**
 * Ops agent chat (m4_6 + m4_10). Single conversation column with an
 * approval card whenever the agent proposes a mutating tool.
 *
 * The component is intentionally light on chrome — operators are
 * mid-service, the page needs to load fast and reply fast.
 */
export function OpsAgentChat({ gatewayConfigured }: OpsAgentChatProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshConversations = useCallback(async () => {
    const res = await fetch("/api/admin/ai-agent/conversations");
    if (!res.ok) return;
    const json = (await res.json()) as { conversations: ConversationSummary[] };
    setConversations(json.conversations);
  }, []);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  const startNewConversation = useCallback(async () => {
    const res = await fetch("/api/admin/ai-agent/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Shift conversation" }),
    });
    if (!res.ok) return;
    const json = (await res.json()) as { conversation: ConversationSummary };
    setActiveId(json.conversation.id);
    setTurns([]);
    void refreshConversations();
  }, [refreshConversations]);

  const sendMessage = useCallback(
    async (message: string, approvedToolUseIds: string[] = []) => {
      if (!activeId) {
        setError("Start a conversation first.");
        return;
      }
      setSending(true);
      setError(null);
      const res = await fetch(`/api/admin/ai-agent/conversations/${activeId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, approvedToolUseIds }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? `Request failed (${res.status})`);
        setSending(false);
        return;
      }
      const json = (await res.json()) as { events: ChatEvent[] };
      const pending: PendingToolUse[] = json.events
        .filter((e) => e.type === "tool_use" && e.toolUse && !e.toolUse.executed && e.toolUse.preview)
        .map((e) => ({
          id: e.toolUse!.id,
          name: e.toolUse!.name,
          input: e.toolUse!.input,
          preview: e.toolUse!.preview!,
        }));
      setTurns((prev) => [
        ...prev,
        {
          id: `turn-${Date.now().toString(36)}`,
          userText: message,
          events: json.events,
          pending,
        },
      ]);
      setDraft("");
      setSending(false);
    },
    [activeId],
  );

  const approveTool = useCallback(
    async (turnId: string, toolUseId: string) => {
      const turn = turns.find((t) => t.id === turnId);
      if (!turn) return;
      // Re-send the same user message with the now-approved tool id.
      // The agent loop resumes; the gateway sees the full history and
      // re-derives the same tool call, but executes it for real this
      // time.
      await sendMessage(turn.userText, [toolUseId]);
    },
    [turns, sendMessage],
  );

  if (!gatewayConfigured) {
    return (
      <div className="p-6">
        <EmptyState
          icon={AlertTriangle}
          title="Anthropic API key not configured"
          description="Set ANTHROPIC_API_KEY in the environment and restart to enable the ops agent. Tool registrations and audit logging still run in dev — the agent UI just can't call Claude until the key lands."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bot className="h-7 w-7 text-[var(--info)]" />
          <div>
            <h1 className="text-2xl font-semibold admin-text">Ops Agent</h1>
            <p className="text-sm admin-text-secondary">
              Claude with full read + write tools, role-gated and audit-logged.
            </p>
          </div>
        </div>
        <Button onClick={startNewConversation} variant="primary">
          <Plus className="h-4 w-4 mr-1" /> New conversation
        </Button>
      </div>

      {conversations.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold admin-text">Recent</h2>
          </CardHeader>
          <CardBody className="space-y-1">
            {conversations.slice(0, 8).map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveId(c.id);
                  setTurns([]);
                }}
                className={`w-full text-left flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-[var(--surface-2)] ${
                  activeId === c.id ? "bg-[var(--surface-3)]" : ""
                }`}
              >
                <span className="text-sm admin-text">{c.title}</span>
                <span className="text-xs admin-text-secondary">
                  {new Date(c.updatedAt).toLocaleString()}
                </span>
              </button>
            ))}
          </CardBody>
        </Card>
      )}

      {activeId && (
        <Card>
          <CardBody>
            <div
              ref={scrollRef}
              className="space-y-4 max-h-[55vh] overflow-y-auto pr-1"
            >
              {turns.length === 0 && (
                <EmptyState
                  icon={Sparkles}
                  title="Start the conversation"
                  description="Try: 'Show me the last 10 orders in Kraków' or 'Refund order ord-xxx for 12 PLN, cold pizza'."
                />
              )}
              {turns.map((turn) => (
                <TurnView key={turn.id} turn={turn} onApprove={approveTool} />
              ))}
            </div>

            {error && (
              <div className="mt-3 rounded-md bg-[var(--danger-soft)] border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] text-[var(--danger)] text-sm px-3 py-2">
                {error}
              </div>
            )}

            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim() && !sending) void sendMessage(draft.trim());
              }}
            >
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask the agent…"
                rows={2}
                disabled={sending}
              />
              <Button type="submit" disabled={sending || !draft.trim()}>
                <Send className="h-4 w-4 mr-1" />
                {sending ? "Thinking…" : "Send"}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function TurnView({
  turn,
  onApprove,
}: {
  turn: ChatTurn;
  onApprove: (turnId: string, toolUseId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="rounded-2xl bg-[color-mix(in_oklab,var(--info)_20%,transparent)] text-sm px-3 py-2 max-w-[80%]">
          {turn.userText}
        </div>
      </div>

      {turn.events.map((event, i) => {
        if (event.type === "text" && event.text) {
          return (
            <div
              key={i}
              className="rounded-2xl bg-[var(--surface-2)] text-sm px-3 py-2 max-w-[85%] whitespace-pre-wrap admin-text"
            >
              {event.text}
            </div>
          );
        }
        if (event.type === "tool_use" && event.toolUse) {
          const t = event.toolUse;
          const pending = !t.executed && t.preview;
          return (
            <div
              key={i}
              className={`rounded-lg border text-xs px-3 py-2 max-w-[85%] ${
                pending
                  ? "border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[var(--warning-soft)]"
                  : t.error
                    ? "border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[var(--danger-soft)]"
                    : "border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[var(--success-soft)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono font-semibold admin-text">
                  {pending ? "→ " : t.error ? "× " : "✓ "}
                  {t.name}
                </span>
                {pending ? (
                  <Badge tone="warning">awaiting approval</Badge>
                ) : t.error ? (
                  <Badge tone="danger">error</Badge>
                ) : (
                  <Badge tone="success">executed</Badge>
                )}
              </div>
              {t.preview && (
                <p className="admin-text mb-2">{t.preview}</p>
              )}
              {t.error && <p className="text-[var(--danger)]">{t.error}</p>}
              {pending && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onApprove(turn.id, t.id)}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Confirm &amp; execute
                </Button>
              )}
              <details className="mt-1">
                <summary className="cursor-pointer admin-text-secondary text-[10px]">
                  <ChevronRight className="inline h-3 w-3" /> details
                </summary>
                <pre className="mt-1 max-h-32 overflow-auto bg-[var(--surface-2)] rounded p-2 text-[10px] admin-text">
                  {JSON.stringify({ input: t.input, output: t.result }, null, 2)}
                </pre>
              </details>
            </div>
          );
        }
        if (event.type === "error" && event.text) {
          return (
            <div
              key={i}
              className="rounded-md border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[var(--danger-soft)] text-sm text-[var(--danger)] px-3 py-2"
            >
              {event.text}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
