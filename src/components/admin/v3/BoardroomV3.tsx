"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronRight,
  CircleDot,
  Crown,
  LineChart,
  Megaphone,
  RefreshCw,
  Send,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, type BadgeTone, Button, Card, CardBody, CardHead, InfoButton, Kpi, SkeletonRows } from "./ui";
import { KPI_EXPLAINERS } from "./boardroom-explainers";

/**
 * Boardroom — the AI C-suite team console. A central traffic-light
 * dashboard, four persona panels (CEO/COO/CFO/CMO) each with their owned
 * KPIs + a Claude chat, and a Meetings tab that runs a real multi-agent
 * briefing/review and surfaces the decisions for operator approval.
 *
 * Every number is fetched from the live store via the boardroom API
 * routes (no mock data — Rule #1). Each KPI carries a 5-section ⓘ
 * explainer (Rule #12). Mutations from chats/decisions flow through the
 * existing preview → approve → audit gate.
 */

type PersonaId = "ceo" | "coo" | "cfo" | "cmo";
type KpiStatus = "green" | "yellow" | "red" | "neutral";

interface BoardKpi {
  id: string;
  label: string;
  display: string;
  value: number;
  status: KpiStatus;
  owner: PersonaId;
  benchmark: string;
  spark?: number[];
}
interface AgentStatus {
  id: PersonaId;
  title: string;
  remit: string;
  accentVar: string;
  initials: string;
  concerns: number;
  status: KpiStatus;
  statusText: string;
}
interface Snapshot {
  scope: string;
  generatedAt: string;
  kpis: BoardKpi[];
  flags: string[];
}
interface OverviewResponse {
  gatewayConfigured: boolean;
  snapshot: Snapshot;
  agents: AgentStatus[];
}

interface Contribution { persona: PersonaId; text: string }
interface Decision {
  title: string;
  owner: PersonaId;
  rationale: string;
  proposedTool?: string;
  proposedInput?: Record<string, unknown>;
  status?: string;
}
interface Meeting {
  id: string;
  type: "daily" | "weekly";
  scope: string;
  agenda: string[];
  contributions: Contribution[];
  decisions: Decision[];
  costGrosze: number;
  createdAt: string;
}

const PERSONA_META: Record<PersonaId, { short: string; icon: typeof Crown; accentVar: string }> = {
  ceo: { short: "CEO", icon: Crown, accentVar: "--av3-c4" },
  coo: { short: "COO", icon: Users, accentVar: "--av3-c3" },
  cfo: { short: "CFO", icon: Wallet, accentVar: "--av3-ok" },
  cmo: { short: "CMO", icon: Megaphone, accentVar: "--av3-c5" },
};

const STATUS_TONE: Record<KpiStatus, BadgeTone> = { green: "ok", yellow: "warn", red: "bad", neutral: "neutral" };
const STATUS_ACCENT: Record<KpiStatus, string> = {
  green: "--av3-ok",
  yellow: "--av3-warn",
  red: "--av3-bad",
  neutral: "--av3-muted",
};

type Tab = "overview" | PersonaId | "team" | "meetings";

export function BoardroomV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const city = all.find((l) => l.slug === location)?.city ?? "All locations";

  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  // Per-persona draft seed (from a meeting decision) — operator reviews then sends.
  const [seed, setSeed] = useState<{ persona: PersonaId; text: string } | null>(null);

  const load = useCallback(async () => {
    const qs = location ? `?location=${encodeURIComponent(location)}` : "";
    const res = await fetch(`/api/admin/ai/boardroom/overview${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setData(res);
    setLoading(false);
    setRefreshing(false);
  }, [location]);
  useEffect(() => {
    void load();
  }, [load]);

  const gatewayConfigured = data?.gatewayConfigured ?? false;
  const snapshot = data?.snapshot ?? null;
  const agents = data?.agents ?? [];

  const actionDecision = useCallback((d: Decision) => {
    const args = d.proposedInput ? ` Proposed: ${d.proposedTool}(${JSON.stringify(d.proposedInput)}).` : "";
    setSeed({ persona: d.owner, text: `Let's action this board decision: ${d.title}.${args} Walk me through it and prepare any change for my approval.` });
    setTab(d.owner);
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "ceo", label: "Strategy · CEO" },
    { id: "coo", label: "Operations · COO" },
    { id: "cfo", label: "Finance · CFO" },
    { id: "cmo", label: "Marketing · CMO" },
    { id: "team", label: "Team chat" },
    { id: "meetings", label: "Meetings" },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Brain style={{ width: 20, height: 20, color: "var(--av3-c4)" }} />
          <div>
            <h1>Boardroom</h1>
            <div className="av3-pagehead-sub">
              Your AI C-suite — CEO, COO, CFO, CMO — reading live data, flagging risks, and proposing actions · {city}
            </div>
          </div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); void load(); }}>
            <RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin .7s linear infinite" } : undefined} /> Refresh
          </Button>
        </div>
      </div>

      {!gatewayConfigured && !loading && (
        <div className="av3-card" style={{ padding: "12px 14px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <AlertTriangle style={{ width: 18, height: 18, color: "var(--av3-warn)", flexShrink: 0 }} />
          <div style={{ fontSize: 12.5, color: "var(--av3-muted)" }}>
            KPIs below are live, but the agents are read-only until <span style={{ fontFamily: "var(--av3-mono)" }}>ANTHROPIC_API_KEY</span> is set. Chat &amp; meetings stay disabled until then.
          </div>
        </div>
      )}

      <div className="av3-filterchips">
        {tabs.map((t) => (
          <button key={t.id} type="button" className={`av3-fchip ${tab === t.id ? "is-active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : tab === "overview" ? (
        <OverviewTab snapshot={snapshot} agents={agents} onOpenAgent={(id) => setTab(id)} gatewayConfigured={gatewayConfigured} onRan={load} />
      ) : tab === "meetings" ? (
        <MeetingsTab gatewayConfigured={gatewayConfigured} onAction={actionDecision} onRan={load} />
      ) : tab === "team" ? (
        <>
          <Card>
            <CardHead title="Ask the whole team" description="A generalist board assistant with access to every read tool — for cross-functional questions that don't belong to one executive. For a structured, multi-voice discussion, run a meeting." />
          </Card>
          <ChatPanel personaId={null} gatewayConfigured={gatewayConfigured} />
        </>
      ) : (
        <PersonaTab
          personaId={tab}
          agent={agents.find((a) => a.id === tab)}
          kpis={(snapshot?.kpis ?? []).filter((k) => k.owner === tab)}
          gatewayConfigured={gatewayConfigured}
          seed={seed?.persona === tab ? seed.text : null}
          onSeedConsumed={() => setSeed(null)}
        />
      )}
    </>
  );
}

/* ------------------------------- Overview ------------------------------- */

function KpiTile({ k }: { k: BoardKpi }) {
  const exp = KPI_EXPLAINERS[k.id];
  return (
    <Kpi
      label={k.label}
      value={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Badge tone={STATUS_TONE[k.status]} dot>{k.status === "neutral" ? "—" : k.status}</Badge>{k.display}</span>}
      accentVar={STATUS_ACCENT[k.status]}
      spark={k.spark}
      info={exp ? <InfoButton title={k.label} {...exp} /> : undefined}
    />
  );
}

function OverviewTab({
  snapshot,
  agents,
  onOpenAgent,
  gatewayConfigured,
  onRan,
}: {
  snapshot: Snapshot | null;
  agents: AgentStatus[];
  onOpenAgent: (id: PersonaId) => void;
  gatewayConfigured: boolean;
  onRan: () => void;
}) {
  if (!snapshot) return <Card><CardBody>No data yet.</CardBody></Card>;
  return (
    <>
      <div className="av3-kpi-rail">
        {snapshot.kpis.map((k) => <KpiTile key={k.id} k={k} />)}
      </div>

      <Card>
        <CardHead title="Agent status" description="What each of your executives is watching right now" />
        <CardBody>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {agents.map((a) => {
              const Icon = PERSONA_META[a.id].icon;
              return (
                <button key={a.id} type="button" className="av3-conv-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6, padding: 12 }} onClick={() => onOpenAgent(a.id)}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                    <span style={{ width: 26, height: 26, borderRadius: 7, background: `color-mix(in oklab, var(${a.accentVar}) 18%, transparent)`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon style={{ width: 15, height: 15, color: `var(${a.accentVar})` }} />
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{PERSONA_META[a.id].short}</span>
                    <span style={{ marginLeft: "auto" }}><Badge tone={STATUS_TONE[a.status]} dot>{a.status}</Badge></span>
                  </span>
                  <span className="av3-cell-muted" style={{ fontSize: 11.5, textAlign: "left" }}>{a.remit}</span>
                  <span style={{ fontSize: 12, color: a.status === "green" ? "var(--av3-ok)" : "var(--av3-muted)" }}>{a.statusText}</span>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead title="Quick actions" description="Convene the board on today's live numbers" />
        <CardBody>
          <RunMeetingButtons gatewayConfigured={gatewayConfigured} onRan={onRan} compact />
        </CardBody>
      </Card>

      <Card>
        <CardHead title="What needs attention" description="Off-target metrics the board should address" actions={<Badge tone={snapshot.flags.length ? "warn" : "ok"}>{snapshot.flags.length || "0"}</Badge>} />
        <CardBody>
          {snapshot.flags.length === 0 ? (
            <div className="av3-empty" style={{ padding: "20px 0" }}>
              <CircleDot style={{ width: 22, height: 22, color: "var(--av3-ok)", margin: "0 auto 8px" }} />
              <div className="av3-empty-title">All headline KPIs on target</div>
              <div className="av3-empty-text">Convene a meeting to hunt the next growth lever.</div>
            </div>
          ) : (
            snapshot.flags.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--av3-line)", fontSize: 12.5 }}>
                <AlertTriangle style={{ width: 15, height: 15, color: "var(--av3-warn)", flexShrink: 0, marginTop: 1 }} />
                <span>{f}</span>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </>
  );
}

/* ------------------------------- Persona -------------------------------- */

function PersonaTab({
  personaId,
  agent,
  kpis,
  gatewayConfigured,
  seed,
  onSeedConsumed,
}: {
  personaId: PersonaId;
  agent?: AgentStatus;
  kpis: BoardKpi[];
  gatewayConfigured: boolean;
  seed: string | null;
  onSeedConsumed: () => void;
}) {
  const accent = PERSONA_META[personaId].accentVar;
  const Icon = PERSONA_META[personaId].icon;
  return (
    <>
      <Card>
        <CardHead
          title={agent?.title ?? PERSONA_META[personaId].short}
          description={agent?.remit}
          actions={<span style={{ width: 30, height: 30, borderRadius: 8, background: `color-mix(in oklab, var(${accent}) 18%, transparent)`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon style={{ width: 17, height: 17, color: `var(${accent})` }} /></span>}
        />
        {kpis.length > 0 && (
          <CardBody>
            <div className="av3-kpi-rail" style={{ marginBottom: 0 }}>
              {kpis.map((k) => <KpiTile key={k.id} k={k} />)}
            </div>
          </CardBody>
        )}
      </Card>
      <ChatPanel personaId={personaId} gatewayConfigured={gatewayConfigured} seed={seed} onSeedConsumed={onSeedConsumed} />
    </>
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

// Persisted history (rendered read-only above the live turns).
type HistItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "bot"; text: string }
  | { id: string; kind: "tool"; name: string; input: unknown; result: unknown; isError: boolean };
interface StoredMsg { role: string; content: unknown }

/** Flatten persisted Anthropic message blocks into a readable transcript:
 *  user/assistant text bubbles + executed tool cards (output correlated from
 *  the paired tool_result blocks). */
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
      if (typeof content === "string") {
        if (content.trim()) items.push({ id: `h-${n++}`, kind: "user", text: content });
      } else if (Array.isArray(content)) {
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
        it.kind === "user" ? (
          <div key={it.id} className="av3-chat-user">{it.text}</div>
        ) : it.kind === "bot" ? (
          <div key={it.id} className="av3-chat-bot">{it.text}</div>
        ) : (
          <div key={it.id} className={`av3-tool ${it.isError ? "is-error" : "is-ok"}`}>
            <div className="av3-tool-head">
              <span className="av3-tool-name">{it.isError ? "× " : "✓ "}{it.name}</span>
              {it.isError ? <Badge tone="bad">error</Badge> : <Badge tone="ok">executed</Badge>}
            </div>
            <details className="av3-tool-details">
              <summary><ChevronRight style={{ width: 12, height: 12, display: "inline" }} /> details</summary>
              <pre>{JSON.stringify({ input: it.input, output: it.result }, null, 2)}</pre>
            </details>
          </div>
        ),
      )}
    </>
  );
}

const PERSONA_SUGGESTIONS: Record<PersonaId, string> = {
  ceo: "Where should we focus next quarter? Give me one OKR with a number.",
  coo: "What's my biggest operational risk for tomorrow's service?",
  cfo: "Which item is leaking margin, and what should I reprice it to?",
  cmo: "Which daypart is slow, and what campaign would lift it?",
};

function ChatPanel({
  personaId,
  gatewayConfigured,
  seed,
  onSeedConsumed,
}: {
  personaId: PersonaId | null;
  gatewayConfigured: boolean;
  seed?: string | null;
  onSeedConsumed?: () => void;
}) {
  // Conversation tag for persistence: real persona, or "team" for the
  // generalist board chat (kept distinct from the standalone Ops Agent).
  const tag = personaId ?? "team";
  const [convId, setConvId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistItem[]>([]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // On persona switch, reopen that agent's most recent persisted thread (so
  // switching tabs continues the same conversation) and render its history.
  useEffect(() => {
    let cancelled = false;
    setConvId(null);
    setHistory([]);
    setTurns([]);
    setCost(0);
    setError(null);
    if (!gatewayConfigured) return;
    (async () => {
      const res = await fetch(`/api/admin/ai-agent/conversations/latest?persona=${tag}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (cancelled || !res?.conversation) return;
      setConvId(res.conversation.id);
      setHistory(transformStoredMessages((res.messages ?? []) as StoredMsg[]));
    })();
    return () => { cancelled = true; };
  }, [tag, gatewayConfigured]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, history]);

  // A board decision can seed the composer; the operator reviews then sends.
  useEffect(() => {
    if (seed) {
      setDraft(seed);
      onSeedConsumed?.();
    }
  }, [seed, onSeedConsumed]);

  const send = useCallback(
    async (message: string, approvedToolUseIds: string[] = [], replaceLast = false) => {
      setSending(true);
      setError(null);
      try {
        let id = convId;
        if (!id) {
          const created = await fetch("/api/admin/ai-agent/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: personaId ? `${PERSONA_META[personaId].short} chat` : "Team chat", persona: tag }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
          id = created?.conversation?.id ?? null;
          if (!id) {
            setError("Could not start a conversation.");
            return;
          }
          setConvId(id);
        }
        const res = await fetch(`/api/admin/ai-agent/conversations/${id}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, approvedToolUseIds, personaId: personaId ?? undefined }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          setError(json.error ?? `Request failed (${res.status})`);
          return;
        }
        const json = (await res.json()) as { events: ChatEvent[] };
        const c = json.events.find((e) => typeof e.totalCostGrosze === "number")?.totalCostGrosze;
        if (typeof c === "number") setCost((p) => p + c);
        setTurns((prev) => {
          const turn: ChatTurn = { id: `t-${Date.now().toString(36)}`, userText: message, events: json.events };
          return replaceLast ? [...prev.slice(0, -1), turn] : [...prev, turn];
        });
        setDraft("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error.");
      } finally {
        setSending(false);
      }
    },
    [convId, personaId],
  );

  const approve = useCallback(
    (turn: ChatTurn, toolUseId: string) => {
      void send(turn.userText, [toolUseId], true);
    },
    [send],
  );

  if (!gatewayConfigured) {
    return (
      <Card>
        <CardBody>
          <div className="av3-empty" style={{ padding: "22px 0" }}>
            <AlertTriangle aria-hidden />
            <div className="av3-empty-title">Agent chat needs an API key</div>
            <div className="av3-empty-text">Set <span style={{ fontFamily: "var(--av3-mono)" }}>ANTHROPIC_API_KEY</span> to talk to this agent. KPIs above stay live regardless.</div>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <div ref={scrollRef} className="av3-chat-scroll">
          {history.length === 0 && turns.length === 0 ? (
            <div className="av3-empty">
              <Sparkles aria-hidden />
              <div className="av3-empty-title">Ask your {personaId ? PERSONA_META[personaId].short : "team"}</div>
              <div className="av3-empty-text">{personaId ? PERSONA_SUGGESTIONS[personaId] : "Ask the whole team anything about the business."}</div>
            </div>
          ) : (
            <>
              {history.length > 0 && <HistoryView items={history} />}
              {turns.map((turn) => <TurnView key={turn.id} turn={turn} onApprove={approve} />)}
            </>
          )}
        </div>
        {error && <div className="av3-chat-error">{error}</div>}
        <form
          className="av3-chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim() && !sending) void send(draft.trim());
          }}
        >
          <textarea className="av3-input av3-chat-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={personaId ? PERSONA_SUGGESTIONS[personaId] : "Ask the team…"} rows={2} disabled={sending} />
          <Button type="submit" variant="primary" loading={sending} disabled={sending || !draft.trim()}>
            <Send className="av3-btn-ico" /> {sending ? "Thinking…" : "Send"}
          </Button>
        </form>
        {cost > 0 && <div className="av3-cell-muted" style={{ fontSize: 11, marginTop: 6, fontFamily: "var(--av3-mono)" }}>Session cost · {(cost / 100).toFixed(2)} zł</div>}
      </CardBody>
    </Card>
  );
}

function TurnView({ turn, onApprove }: { turn: ChatTurn; onApprove: (turn: ChatTurn, toolUseId: string) => void }) {
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
              {pending && <Button variant="primary" size="sm" onClick={() => onApprove(turn, t.id)}><Check className="av3-btn-ico" /> Confirm &amp; execute</Button>}
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

/* ------------------------------- Meetings ------------------------------- */

function RunMeetingButtons({ gatewayConfigured, onRan, compact }: { gatewayConfigured: boolean; onRan: () => void; compact?: boolean }) {
  const { location } = useAdminLocationV3();
  const [running, setRunning] = useState<null | "daily" | "weekly">(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (type: "daily" | "weekly") => {
      setRunning(type);
      setError(null);
      const qs = location ? `?location=${encodeURIComponent(location)}` : "";
      const res = await fetch(`/api/admin/ai/boardroom/meeting${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .catch(() => ({ ok: false, j: { error: "Network error" } }));
      setRunning(null);
      if (!res.ok) setError((res.j as { error?: string }).error ?? "Meeting failed.");
      else onRan();
    },
    [location, onRan],
  );

  if (!gatewayConfigured) {
    return <div className="av3-cell-muted" style={{ fontSize: 12 }}>Set <span style={{ fontFamily: "var(--av3-mono)" }}>ANTHROPIC_API_KEY</span> to convene the board.</div>;
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="primary" size={compact ? "sm" : "md"} loading={running === "daily"} disabled={!!running} onClick={() => run("daily")}>
          <Sparkles className="av3-btn-ico" /> Run daily briefing
        </Button>
        <Button variant="secondary" size={compact ? "sm" : "md"} loading={running === "weekly"} disabled={!!running} onClick={() => run("weekly")}>
          <LineChart className="av3-btn-ico" /> Run weekly review
        </Button>
      </div>
      {running && <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 8 }}>The board is deliberating — COO, CFO, CMO and CEO each weigh in, then converge on decisions. This takes ~20–40s.</div>}
      {error && <div className="av3-chat-error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function MeetingsTab({ gatewayConfigured, onAction, onRan }: { gatewayConfigured: boolean; onAction: (d: Decision) => void; onRan: () => void }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMeetings = useCallback(async () => {
    const res = await fetch("/api/admin/ai/boardroom/meeting").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const list: Meeting[] = res?.meetings ?? [];
    setMeetings(list);
    setActiveId((prev) => prev ?? list[0]?.id ?? null);
    setLoading(false);
  }, []);
  useEffect(() => { void loadMeetings(); }, [loadMeetings]);

  const active = meetings.find((m) => m.id === activeId) ?? null;

  return (
    <>
      <Card>
        <CardHead title="Convene the board" description="A real multi-agent meeting on today's live numbers — transcript + decisions" />
        <CardBody>
          <RunMeetingButtons gatewayConfigured={gatewayConfigured} onRan={() => { loadMeetings(); onRan(); }} />
        </CardBody>
      </Card>

      {loading ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={4} /></div>
      ) : meetings.length === 0 ? (
        <Card><CardBody>
          <div className="av3-empty" style={{ padding: "22px 0" }}>
            <Users aria-hidden />
            <div className="av3-empty-title">No meetings yet</div>
            <div className="av3-empty-text">Run a daily briefing or weekly review to convene your executives.</div>
          </div>
        </CardBody></Card>
      ) : (
        <>
          <div className="av3-filterchips">
            {meetings.map((m) => (
              <button key={m.id} type="button" className={`av3-fchip ${activeId === m.id ? "is-active" : ""}`} onClick={() => setActiveId(m.id)}>
                {m.type === "daily" ? "Daily" : "Weekly"} · {new Date(m.createdAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
              </button>
            ))}
          </div>
          {active && <MeetingView meeting={active} onAction={onAction} />}
        </>
      )}
    </>
  );
}

function MeetingView({ meeting, onAction }: { meeting: Meeting; onAction: (d: Decision) => void }) {
  return (
    <>
      <Card>
        <CardHead
          title={`${meeting.type === "daily" ? "Daily briefing" : "Weekly review"} — ${meeting.scope === "all" ? "All locations" : meeting.scope}`}
          description={`${new Date(meeting.createdAt).toLocaleString("pl-PL")} · session cost ${(meeting.costGrosze / 100).toFixed(2)} zł`}
        />
        <CardBody>
          {meeting.agenda.length > 0 && (
            <div style={{ marginBottom: 12, fontSize: 12, color: "var(--av3-muted)" }}>
              <strong style={{ color: "var(--av3-fg)" }}>Agenda:</strong> {meeting.agenda.length} off-target metric{meeting.agenda.length > 1 ? "s" : ""}.
            </div>
          )}
          {meeting.contributions.map((c, i) => {
            const meta = PERSONA_META[c.persona];
            const Icon = meta.icon;
            return (
              <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--av3-line)" }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: `color-mix(in oklab, var(${meta.accentVar}) 18%, transparent)`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon style={{ width: 16, height: 16, color: `var(${meta.accentVar})` }} />
                </span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: `var(${meta.accentVar})` }}>{meta.short}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.55 }}>{c.text}</div>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHead title="Decisions" description="What the board agreed — action the ones with a lever via the owning agent" actions={<Badge tone={meeting.decisions.length ? "brand" : "neutral"}>{meeting.decisions.length}</Badge>} />
        <CardBody>
          {meeting.decisions.length === 0 ? (
            <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>No structured decisions were produced this round.</div>
          ) : (
            meeting.decisions.map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--av3-line)", alignItems: "flex-start" }}>
                <Badge tone="neutral">{PERSONA_META[d.owner].short}</Badge>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{d.title}</div>
                  {d.rationale && <div className="av3-cell-muted" style={{ fontSize: 12 }}>{d.rationale}</div>}
                  {d.proposedTool && <div style={{ fontSize: 11, marginTop: 3, fontFamily: "var(--av3-mono)", color: "var(--av3-c4)" }}>action: {d.proposedTool}</div>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => onAction(d)}>Action via {PERSONA_META[d.owner].short} <ChevronRight className="av3-btn-ico" /></Button>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </>
  );
}
