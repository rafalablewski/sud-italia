"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, Check, ChevronRight, Send, Sparkles } from "lucide-react";
import { Badge, Button, Card, CardBody, InfoButton } from "../ui";
import { KPI_EXPLAINERS } from "../boardroom-explainers";
import { resolveModel } from "@/lib/ai/models";

/**
 * Shared Agent HQ primitives — used by both the command/section page
 * (AgentHQ.tsx) and the dedicated per-agent page (AgentPanel.tsx) so the chat,
 * KPI tiles and agent identity render identically and from one source.
 * Everything is built on the real av3-* design-system classes.
 */

export type KpiStatus = "green" | "yellow" | "red" | "neutral";

export interface BoardKpi {
  id: string;
  label: string;
  display: string;
  value: number;
  status: KpiStatus;
  owner: string;
  benchmark: string;
}

export const statusVar = (s: KpiStatus) =>
  s === "green" ? "--av3-ok" : s === "yellow" ? "--av3-warn" : s === "red" ? "--av3-bad" : "--av3-subtle";

export function StatusDot({ status, size = 7 }: { status: KpiStatus; size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: status === "neutral" ? "transparent" : `var(${statusVar(status)})`,
      border: status === "neutral" ? "1.5px solid var(--av3-subtle)" : "none" }} />
  );
}

export function Monogram({ initials, accentVar, size = 32 }: { initials: string; accentVar: string; size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "var(--av3-r-md)", flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--av3-mono)", fontSize: size <= 28 ? 10 : 11, fontWeight: 700, letterSpacing: 0.2,
      background: `color-mix(in oklab, var(${accentVar}) 16%, transparent)`, color: `var(${accentVar})` }}>
      {initials}
    </span>
  );
}

export function modelLabel(modelId: string | null): string {
  return modelId ? resolveModel(modelId).label : "Global model";
}

export const RAIL: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(184px, 1fr))", gap: "var(--av3-gap-3)" };

/** Business KPI tile — real av3-kpi with accent rail + optional 5-section ⓘ. */
export function KpiTile({ k }: { k: BoardKpi }) {
  const exp = KPI_EXPLAINERS[k.id];
  return (
    <div className="av3-kpi" style={{ "--av3-kpi-accent": `var(${statusVar(k.status)})` } as CSSProperties}>
      <div className="av3-kpi-label">
        <StatusDot status={k.status} /> {k.label}
        {exp && <span style={{ marginLeft: "auto" }}><InfoButton title={k.label} {...exp} /></span>}
      </div>
      <div className="av3-kpi-value">{k.display}</div>
      <div className="av3-kpi-foot"><span style={{ fontSize: 11, color: "var(--av3-subtle)" }}>{k.benchmark}</span></div>
    </div>
  );
}

/** Compact fleet stat — same tile, no benchmark, neutral accent unless given. */
export function StatTile({ label, value, sub, accent = "--av3-c2" }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="av3-kpi" style={{ "--av3-kpi-accent": `var(${accent})` } as CSSProperties}>
      <div className="av3-kpi-label">{label}</div>
      <div className="av3-kpi-value">{value}</div>
      {sub && <div className="av3-kpi-foot"><span style={{ fontSize: 11, color: "var(--av3-subtle)" }}>{sub}</span></div>}
    </div>
  );
}

export function SecLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--av3-subtle)",
      fontWeight: 600, margin: first ? "0 2px 10px" : "22px 2px 10px" }}>{children}</div>
  );
}

/* -------------------------------- Chat ---------------------------------- */

interface ChatEvent {
  type: "text" | "tool_use" | "tool_result" | "error" | "done";
  text?: string;
  toolUse?: { id: string; name: string; input: unknown; executed: boolean; preview?: string; result?: unknown; error?: string };
  totalCostGrosze?: number;
}
interface ChatTurn { id: string; userText: string; events: ChatEvent[] }
type HistItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "bot"; text: string }
  | { id: string; kind: "tool"; name: string; input: unknown; result: unknown; isError: boolean };
interface StoredMsg { role: string; content: unknown }

function transformStoredMessages(messages: StoredMsg[]): HistItem[] {
  const resultById = new Map<string, { isError: boolean; result: unknown }>();
  for (const m of messages) {
    if (m.role === "user" && Array.isArray(m.content)) {
      for (const b of m.content as Record<string, unknown>[]) {
        if (b && b.type === "tool_result" && typeof b.tool_use_id === "string") {
          let result: unknown = b.content;
          if (typeof b.content === "string") { try { result = JSON.parse(b.content); } catch { /* keep raw */ } }
          resultById.set(b.tool_use_id, { isError: b.is_error === true, result });
        }
      }
    }
  }
  const items: HistItem[] = [];
  let n = 0;
  for (const m of messages) {
    const content = m.content;
    if (m.role === "user") {
      if (typeof content === "string") { if (content.trim()) items.push({ id: `h-${n++}`, kind: "user", text: content }); }
      else if (Array.isArray(content)) {
        for (const b of content as Record<string, unknown>[]) {
          if (b && b.type === "text" && typeof b.text === "string" && b.text.trim()) items.push({ id: `h-${n++}`, kind: "user", text: b.text });
        }
      }
    } else if (m.role === "assistant" && Array.isArray(content)) {
      for (const b of content as Record<string, unknown>[]) {
        if (b && b.type === "text" && typeof b.text === "string" && b.text.trim()) items.push({ id: `h-${n++}`, kind: "bot", text: b.text });
        else if (b && b.type === "tool_use" && typeof b.name === "string" && typeof b.id === "string") {
          const r = resultById.get(b.id as string);
          items.push({ id: `h-${n++}`, kind: "tool", name: b.name as string, input: b.input, result: r?.result, isError: r?.isError ?? false });
        }
      }
    }
  }
  return items;
}

function HistoryView({ items }: { items: HistItem[] }) {
  return (
    <>
      {items.map((it) =>
        it.kind === "user" ? <div key={it.id} className="av3-chat-user">{it.text}</div>
        : it.kind === "bot" ? <div key={it.id} className="av3-chat-bot">{it.text}</div>
        : (
          <div key={it.id} className={`av3-tool ${it.isError ? "is-error" : "is-ok"}`}>
            <div className="av3-tool-head"><span className="av3-tool-name">{it.isError ? "× " : "✓ "}{it.name}</span>
              {it.isError ? <Badge tone="bad">error</Badge> : <Badge tone="ok">executed</Badge>}</div>
            <details className="av3-tool-details"><summary><ChevronRight style={{ width: 12, height: 12, display: "inline" }} /> details</summary>
              <pre>{JSON.stringify({ input: it.input, output: it.result }, null, 2)}</pre></details>
          </div>
        ),
      )}
    </>
  );
}

function TurnView({ turn, onApprove }: { turn: ChatTurn; onApprove: (turn: ChatTurn, id: string) => void }) {
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
              <div className="av3-tool-head"><span className="av3-tool-name">{pending ? "→ " : t.error ? "× " : "✓ "}{t.name}</span>
                {pending ? <Badge tone="warn">awaiting approval</Badge> : t.error ? <Badge tone="bad">error</Badge> : <Badge tone="ok">executed</Badge>}</div>
              {t.preview && <p className="av3-tool-preview">{t.preview}</p>}
              {t.error && <p style={{ color: "var(--av3-bad)", fontSize: 12 }}>{t.error}</p>}
              {pending && <Button variant="primary" size="sm" onClick={() => onApprove(turn, t.id)}><Check className="av3-btn-ico" /> Confirm &amp; execute</Button>}
              <details className="av3-tool-details"><summary><ChevronRight style={{ width: 12, height: 12, display: "inline" }} /> details</summary>
                <pre>{JSON.stringify({ input: t.input, output: t.result }, null, 2)}</pre></details>
            </div>
          );
        }
        if (event.type === "error" && event.text) return <div key={i} className="av3-chat-error">{event.text}</div>;
        return null;
      })}
    </div>
  );
}

export function ChatPanel({ personaId, name, suggestion, gatewayConfigured, seed, onSeedConsumed }: {
  personaId: string | null;
  name: string;
  suggestion: string;
  gatewayConfigured: boolean;
  seed?: string | null;
  onSeedConsumed?: () => void;
}) {
  const tag = personaId ?? "team";
  const [convId, setConvId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistItem[]>([]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setConvId(null); setHistory([]); setTurns([]); setCost(0); setError(null);
    if (!gatewayConfigured) return;
    (async () => {
      const res = await fetch(`/api/admin/ai-agent/conversations/latest?persona=${tag}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (cancelled || !res?.conversation) return;
      setConvId(res.conversation.id);
      setHistory(transformStoredMessages((res.messages ?? []) as StoredMsg[]));
    })();
    return () => { cancelled = true; };
  }, [tag, gatewayConfigured]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [turns, history]);
  useEffect(() => { if (seed) { setDraft(seed); onSeedConsumed?.(); } }, [seed, onSeedConsumed]);

  const send = useCallback(async (message: string, approvedToolUseIds: string[] = [], replaceLast = false) => {
    setSending(true); setError(null);
    try {
      let id = convId;
      if (!id) {
        const created = await fetch("/api/admin/ai-agent/conversations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: `${name} chat`, persona: tag }),
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        id = created?.conversation?.id ?? null;
        if (!id) { setError("Could not start a conversation."); return; }
        setConvId(id);
      }
      const res = await fetch(`/api/admin/ai-agent/conversations/${id}/turn`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, approvedToolUseIds, personaId: personaId ?? undefined }),
      });
      if (!res.ok) { const j = (await res.json().catch(() => ({}))) as { error?: string }; setError(j.error ?? `Request failed (${res.status})`); return; }
      const json = (await res.json()) as { events: ChatEvent[] };
      const c = json.events.find((e) => typeof e.totalCostGrosze === "number")?.totalCostGrosze;
      if (typeof c === "number") setCost((p) => p + c);
      setTurns((prev) => {
        const turn: ChatTurn = { id: `t-${Date.now().toString(36)}`, userText: message, events: json.events };
        return replaceLast ? [...prev.slice(0, -1), turn] : [...prev, turn];
      });
      setDraft("");
    } catch (err) { setError(err instanceof Error ? err.message : "Unexpected error."); }
    finally { setSending(false); }
  }, [convId, personaId, tag, name]);

  const approve = useCallback((turn: ChatTurn, toolUseId: string) => { void send(turn.userText, [toolUseId], true); }, [send]);

  if (!gatewayConfigured) {
    return (
      <Card><CardBody><div className="av3-empty" style={{ padding: "22px 0" }}>
        <AlertTriangle aria-hidden />
        <div className="av3-empty-title">Agent chat needs an API key</div>
        <div className="av3-empty-text">Set <span style={{ fontFamily: "var(--av3-mono)" }}>ANTHROPIC_API_KEY</span> to talk to this agent.</div>
      </div></CardBody></Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <div ref={scrollRef} className="av3-chat-scroll">
          {history.length === 0 && turns.length === 0 ? (
            <div className="av3-empty"><Sparkles aria-hidden />
              <div className="av3-empty-title">Ask {name}</div>
              <div className="av3-empty-text">{suggestion}</div></div>
          ) : (<>
            {history.length > 0 && <HistoryView items={history} />}
            {turns.map((turn) => <TurnView key={turn.id} turn={turn} onApprove={approve} />)}
          </>)}
        </div>
        {error && <div className="av3-chat-error">{error}</div>}
        <form className="av3-chat-composer" onSubmit={(e) => { e.preventDefault(); if (draft.trim() && !sending) void send(draft.trim()); }}>
          <textarea className="av3-input av3-chat-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Ask ${name}…`} rows={2} disabled={sending} />
          <Button type="submit" variant="primary" loading={sending} disabled={sending || !draft.trim()}><Send className="av3-btn-ico" /> {sending ? "Thinking…" : "Send"}</Button>
        </form>
        {cost > 0 && <div className="av3-cell-muted" style={{ fontSize: 11, marginTop: 6, fontFamily: "var(--av3-mono)" }}>Session cost · {(cost / 100).toFixed(2)} zł</div>}
      </CardBody>
    </Card>
  );
}
