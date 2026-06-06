"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, Check, ChevronRight, Plus, Send, Sparkles } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead } from "./ui";

interface ConversationSummary { id: string; title: string; createdAt: string; updatedAt: string }
interface PendingToolUse { id: string; name: string; input: unknown; preview: string }
interface ChatEvent {
  type: "text" | "tool_use" | "tool_result" | "error" | "done";
  text?: string;
  toolUse?: { id: string; name: string; input: unknown; executed: boolean; preview?: string; result?: unknown; error?: string };
  stopReason?: string;
  totalCostGrosze?: number;
}
interface ChatTurn { id: string; userText: string; events: ChatEvent[]; pending: PendingToolUse[] }

/**
 * Ops Agent chat — the v3 home for the v2 `OpsAgentChat`. Claude with role-gated
 * read+write tools, human-in-the-loop approval on every mutating tool, and
 * audit logging. Same endpoints (`/api/admin/ai-agent/*`), restyled to `.av3-*`.
 */
export function AgentV3({ gatewayConfigured }: { gatewayConfigured: boolean }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [costGrosze, setCostGrosze] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshConversations = useCallback(async () => {
    const res = await fetch("/api/admin/ai-agent/conversations").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (res?.conversations) setConversations(res.conversations);
  }, []);
  useEffect(() => { void refreshConversations(); }, [refreshConversations]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [turns]);

  const startNewConversation = useCallback(async () => {
    const res = await fetch("/api/admin/ai-agent/conversations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Shift conversation" }),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (res?.conversation) { setActiveId(res.conversation.id); setTurns([]); setCostGrosze(0); void refreshConversations(); }
  }, [refreshConversations]);

  const sendMessage = useCallback(async (message: string, approvedToolUseIds: string[] = []) => {
    if (!activeId) { setError("Start a conversation first."); return; }
    setSending(true); setError(null);
    try {
      const res = await fetch(`/api/admin/ai-agent/conversations/${activeId}/turn`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, approvedToolUseIds }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? `Request failed (${res.status})`); return;
      }
      const json = (await res.json()) as { events: ChatEvent[] };
      const pending: PendingToolUse[] = json.events
        .filter((e) => e.type === "tool_use" && e.toolUse && !e.toolUse.executed && e.toolUse.preview)
        .map((e) => ({ id: e.toolUse!.id, name: e.toolUse!.name, input: e.toolUse!.input, preview: e.toolUse!.preview! }));
      const cost = json.events.find((e) => typeof e.totalCostGrosze === "number")?.totalCostGrosze;
      if (typeof cost === "number") setCostGrosze((c) => c + cost);
      setTurns((prev) => [...prev, { id: `turn-${Date.now().toString(36)}`, userText: message, events: json.events, pending }]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setSending(false);
    }
  }, [activeId]);

  const approveTool = useCallback(async (turnId: string, toolUseId: string) => {
    const turn = turns.find((t) => t.id === turnId);
    if (turn) await sendMessage(turn.userText, [toolUseId]);
  }, [turns, sendMessage]);

  if (!gatewayConfigured) {
    return (
      <>
        <div className="av3-pagehead"><div><h1>Ops Agent</h1><div className="av3-pagehead-sub">Claude with role-gated read + write tools</div></div></div>
        <div className="av3-card" style={{ padding: 0 }}>
          <div className="av3-empty">
            <AlertTriangle aria-hidden />
            <div className="av3-empty-title">Anthropic API key not configured</div>
            <div className="av3-empty-text">Set <span style={{ fontFamily: "var(--av3-mono)" }}>ANTHROPIC_API_KEY</span> in the environment and restart to enable the ops agent. Tool registrations + audit logging still run in dev — the agent just can&apos;t call Claude until the key lands.</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="av3-pagehead">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bot style={{ width: 20, height: 20, color: "var(--av3-info)" }} />
          <div><h1>Ops Agent</h1><div className="av3-pagehead-sub">Claude with full read + write tools, role-gated and audit-logged</div></div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="primary" size="sm" onClick={startNewConversation}><Plus className="av3-btn-ico" /> New conversation</Button>
        </div>
      </div>

      {conversations.length > 0 && (
        <Card>
          <CardHead title="Recent conversations" />
          <CardBody>
            {conversations.slice(0, 8).map((c) => (
              <button key={c.id} type="button" className={`av3-conv-row ${activeId === c.id ? "is-active" : ""}`} onClick={() => { setActiveId(c.id); setTurns([]); setCostGrosze(0); }}>
                <span>{c.title}</span>
                <span className="av3-cell-muted" style={{ fontFamily: "var(--av3-mono)", fontSize: 11 }}>{new Date(c.updatedAt).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </button>
            ))}
          </CardBody>
        </Card>
      )}

      {activeId ? (
        <Card>
          <CardBody>
            <div ref={scrollRef} className="av3-chat-scroll">
              {turns.length === 0 ? (
                <div className="av3-empty">
                  <Sparkles aria-hidden />
                  <div className="av3-empty-title">Start the conversation</div>
                  <div className="av3-empty-text">Try: &ldquo;Show me the last 10 orders in Kraków&rdquo; or &ldquo;Refund order ord-xxx for 12 PLN, cold pizza&rdquo;.</div>
                </div>
              ) : (
                turns.map((turn) => <TurnView key={turn.id} turn={turn} onApprove={approveTool} />)
              )}
            </div>

            {error && <div className="av3-chat-error">{error}</div>}

            <form className="av3-chat-composer" onSubmit={(e) => { e.preventDefault(); if (draft.trim() && !sending) void sendMessage(draft.trim()); }}>
              <textarea className="av3-input av3-chat-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask the agent…" rows={2} disabled={sending} />
              <Button type="submit" variant="primary" loading={sending} disabled={sending || !draft.trim()}><Send className="av3-btn-ico" /> {sending ? "Thinking…" : "Send"}</Button>
            </form>
            {costGrosze > 0 && <div className="av3-cell-muted" style={{ fontSize: 11, marginTop: 6, fontFamily: "var(--av3-mono)" }}>Session cost · {(costGrosze / 100).toFixed(2)} zł</div>}
          </CardBody>
        </Card>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          <div className="av3-empty">
            <Bot aria-hidden />
            <div className="av3-empty-title">No conversation open</div>
            <div className="av3-empty-text">Start a new conversation to ask the agent about orders, stock, refunds and more.</div>
          </div>
        </div>
      )}
    </>
  );
}

function TurnView({ turn, onApprove }: { turn: ChatTurn; onApprove: (turnId: string, toolUseId: string) => void }) {
  return (
    <div className="av3-chat-turn">
      <div className="av3-chat-user">{turn.userText}</div>
      {turn.events.map((event, i) => {
        if (event.type === "text" && event.text) return <div key={i} className="av3-chat-bot">{event.text}</div>;
        if (event.type === "tool_use" && event.toolUse) {
          const t = event.toolUse;
          const pending = !t.executed && t.preview;
          const state = pending ? "is-pending" : t.error ? "is-error" : "is-ok";
          return (
            <div key={i} className={`av3-tool ${state}`}>
              <div className="av3-tool-head">
                <span className="av3-tool-name">{pending ? "→ " : t.error ? "× " : "✓ "}{t.name}</span>
                {pending ? <Badge tone="warn">awaiting approval</Badge> : t.error ? <Badge tone="bad">error</Badge> : <Badge tone="ok">executed</Badge>}
              </div>
              {t.preview && <p className="av3-tool-preview">{t.preview}</p>}
              {t.error && <p style={{ color: "var(--av3-bad)", fontSize: 12 }}>{t.error}</p>}
              {pending && <Button variant="primary" size="sm" onClick={() => onApprove(turn.id, t.id)}><Check className="av3-btn-ico" /> Confirm &amp; execute</Button>}
              <details className="av3-tool-details">
                <summary><ChevronRight style={{ width: 12, height: 12, display: "inline" }} /> details</summary>
                <pre>{JSON.stringify({ input: t.input, output: t.result }, null, 2)}</pre>
              </details>
            </div>
          );
        }
        if (event.type === "error" && event.text) return <div key={i} className="av3-chat-error">{event.text}</div>;
        return null;
      })}
    </div>
  );
}
