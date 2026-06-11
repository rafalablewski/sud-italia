"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  CircleDot,
  LineChart,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Card, CardBody, CardHead, InfoButton, SkeletonRows } from "./ui";
import { AiModelControl } from "./AiModelControl";
import { KPI_EXPLAINERS } from "./boardroom-explainers";
import { AgentEditor } from "./AgentEditor";
import {
  AGENT_CONFIG_DEFAULTS,
  CADENCE_OPTIONS,
  type AgentConfig,
} from "@/lib/ai/boardroom/agent-config";
import { resolveModel } from "@/lib/ai/models";

/**
 * Agent HQ — the operator console for the AI agent fleet. Six sections:
 *   • Command center — the agent roster (status, model, authority, reporting
 *     line) over live traffic-light KPIs + what-needs-attention.
 *   • Scorecards — per-agent KPI scorecards (live owned metrics + authored
 *     targets).
 *   • Work — the cross-agent activity feed (runs / edits / escalations) plus
 *     schedules and the convene-the-board run controls.
 *   • Approvals — the human-in-the-loop queue of gated actions agents proposed.
 *   • Inbox — talk to any agent (its live generated prompt + tool allowlist).
 *   • Reports — meeting transcripts + decisions + spend.
 *
 * Every agent is editable (AgentEditor) — name, role, status, reporting line,
 * model, effort, authority, runtime memory, mandate, responsibilities, KPIs,
 * guardrails, escalation threshold, tone, collaborators, tools, spend controls,
 * schedule — and the editor shows the LIVE SYSTEM PROMPT generated from those
 * fields, which is exactly what the agent runs on (Rule #1, Rule #8).
 *
 * Real data only: configs come from /api/admin/ai/boardroom/agents, live KPIs
 * + status from …/overview, activity from …/timeline, approvals from
 * …/approvals, meetings from …/meeting. No mock data.
 */

type KpiStatus = "green" | "yellow" | "red" | "neutral";

interface BoardKpi {
  id: string;
  label: string;
  display: string;
  value: number;
  status: KpiStatus;
  owner: string;
  benchmark: string;
}
interface AgentStatusRow {
  id: string;
  name: string;
  title: string;
  remit: string;
  accentVar: string;
  initials: string;
  agentStatus: "active" | "paused" | "draft";
  authority: string;
  modelId: string | null;
  reportsTo: string | null;
  spentTodayGrosze?: number;
  dailyCapGrosze?: number | null;
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
  agents: AgentStatusRow[];
}

interface Contribution { persona: string; text: string }
interface Decision {
  title: string;
  owner: string;
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
interface AgentEvent {
  id: string;
  agentId: string;
  type: string;
  summary: string;
  detail?: string;
  costGrosze?: number;
  actor: string;
  at: string;
}
interface ApprovalRow {
  meetingId: string;
  meetingType: "daily" | "weekly";
  scope: string;
  createdAt: string;
  index: number;
  title: string;
  owner: string;
  rationale: string;
  proposedTool?: string;
  proposedInput?: Record<string, unknown>;
}

type SectionId = "command" | "scorecards" | "work" | "approvals" | "inbox" | "reports";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "command", label: "Command center" },
  { id: "scorecards", label: "Scorecards" },
  { id: "work", label: "Work" },
  { id: "approvals", label: "Approvals" },
  { id: "inbox", label: "Inbox" },
  { id: "reports", label: "Reports" },
];

/* ------------------------------ small UI bits --------------------------- */

function Monogram({ initials, accentVar, size = 32 }: { initials: string; accentVar: string; size?: number }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: size <= 30 ? 10 : 11, fontWeight: 800, letterSpacing: 0.3,
        background: `color-mix(in oklab, var(${accentVar}) 16%, transparent)`,
        color: `var(${accentVar})`,
      }}
    >
      {initials}
    </span>
  );
}

function StatusDot({ status }: { status: KpiStatus }) {
  const color =
    status === "green" ? "var(--av3-ok)" : status === "yellow" ? "var(--av3-warn)" : status === "red" ? "var(--av3-bad)" : "transparent";
  return <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: color, border: status === "neutral" ? "1.5px solid var(--av3-subtle)" : "none" }} />;
}

function StatusBadge({ s }: { s: "active" | "paused" | "draft" }) {
  return <Badge tone={s === "active" ? "ok" : s === "paused" ? "warn" : "neutral"}>{s}</Badge>;
}

function kpiSurface(status: KpiStatus): { background: string; border: string } {
  if (status === "red") return { background: "color-mix(in oklab, var(--av3-bad) 6%, var(--av3-s1))", border: "color-mix(in oklab, var(--av3-bad) 26%, var(--av3-line))" };
  if (status === "yellow") return { background: "color-mix(in oklab, var(--av3-warn) 5%, var(--av3-s1))", border: "color-mix(in oklab, var(--av3-warn) 22%, var(--av3-line))" };
  return { background: "var(--av3-s1)", border: "var(--av3-line)" };
}

const RAIL_STYLE: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 };

function SecLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--av3-subtle)", fontWeight: 600, margin: first ? "0 2px 10px" : "22px 2px 10px" }}>
      {children}
    </div>
  );
}

function KpiTile({ k }: { k: BoardKpi }) {
  const exp = KPI_EXPLAINERS[k.id];
  const surface = kpiSurface(k.status);
  return (
    <div style={{ background: surface.background, border: `1px solid ${surface.border}`, borderRadius: "var(--av3-r-lg)", padding: "13px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--av3-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        <StatusDot status={k.status} />
        {k.label}
        {exp && <span style={{ marginLeft: "auto" }}><InfoButton title={k.label} {...exp} /></span>}
      </div>
      <div style={{ fontSize: 23, fontWeight: 700, margin: "9px 0 5px", letterSpacing: -0.4 }}>{k.display}</div>
      <div style={{ fontSize: 11, color: "var(--av3-subtle)" }}>{k.benchmark}</div>
    </div>
  );
}

function modelLabel(modelId: string | null): string {
  if (!modelId) return "Global model";
  return resolveModel(modelId).label;
}

const SALES_KPI_IDS = ["today-revenue", "avg-ticket", "revenue-growth", "refund-rate"];
const COST_KPI_IDS = ["food-cost", "labor-cost", "prime-cost", "satisfaction"];

/* =============================== root ================================== */

export function AgentHQ() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const city = all.find((l) => l.slug === location)?.city ?? "All locations";

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [configs, setConfigs] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<SectionId>("command");
  const [editingId, setEditingId] = useState<string | null>(null);
  // Inbox target + an optional seeded composer message (from an approval).
  const [inboxAgentId, setInboxAgentId] = useState<string | null>(null);
  const [seed, setSeed] = useState<{ agentId: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const qs = location ? `?location=${encodeURIComponent(location)}` : "";
    const [ov, cf] = await Promise.all([
      fetch(`/api/admin/ai/boardroom/overview${qs}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/admin/ai/boardroom/agents`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setOverview(ov);
    if (cf?.agents) setConfigs(cf.agents as AgentConfig[]);
    setLoading(false);
    setRefreshing(false);
  }, [location]);
  useEffect(() => { void load(); }, [load]);

  const gatewayConfigured = overview?.gatewayConfigured ?? false;
  const snapshot = overview?.snapshot ?? null;

  const configById = useMemo(() => new Map<string, AgentConfig>(configs.map((c) => [c.id, c])), [configs]);
  const statusById = useMemo(() => new Map<string, AgentStatusRow>((overview?.agents ?? []).map((a) => [a.id, a])), [overview]);

  // The real tool catalog = the union of every agent's allowlist (we never
  // invent a tool that the registry doesn't expose).
  const toolCatalog = useMemo(() => {
    const set = new Set<string>();
    for (const c of configs) for (const t of c.toolNames) set.add(t);
    return [...set].sort();
  }, [configs]);

  const openChat = useCallback((agentId: string, seedText?: string) => {
    setInboxAgentId(agentId);
    if (seedText) setSeed({ agentId, text: seedText });
    setSection("inbox");
  }, []);

  const actionApproval = useCallback((a: ApprovalRow) => {
    const args = a.proposedInput ? ` Proposed: ${a.proposedTool}(${JSON.stringify(a.proposedInput)}).` : "";
    openChat(a.owner, `Let's action this board decision: ${a.title}.${args} Walk me through it and prepare the change for my approval.`);
  }, [openChat]);

  return (
    <>
      <div className="av3-pagehead">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bot style={{ width: 20, height: 20, color: "var(--av3-c4)" }} />
          <div>
            <h1>Agent HQ</h1>
            <div className="av3-pagehead-sub">
              Your AI agent fleet — command, scorecards, work, approvals, inbox &amp; reports. Each agent is editable end-to-end · {city}
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
            KPIs &amp; agent configs are live, but agents are read-only until <span style={{ fontFamily: "var(--av3-mono)" }}>ANTHROPIC_API_KEY</span> is set. Chat &amp; meetings stay disabled until then. You can still edit every agent.
          </div>
        </div>
      )}

      <div className="av3-filterchips">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={`av3-fchip ${section === s.id ? "is-active" : ""}`} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : section === "command" ? (
        <CommandCenter
          snapshot={snapshot}
          configs={configs}
          statusById={statusById}
          gatewayConfigured={gatewayConfigured}
          onEdit={setEditingId}
          onChat={(id) => openChat(id)}
          onRan={load}
        />
      ) : section === "scorecards" ? (
        <Scorecards snapshot={snapshot} configs={configs} statusById={statusById} onEdit={setEditingId} />
      ) : section === "work" ? (
        <WorkSection configs={configs} gatewayConfigured={gatewayConfigured} onRan={load} />
      ) : section === "approvals" ? (
        <ApprovalsSection configById={configById} onAction={actionApproval} />
      ) : section === "inbox" ? (
        <InboxSection
          configs={configs}
          gatewayConfigured={gatewayConfigured}
          selectedId={inboxAgentId}
          onSelect={setInboxAgentId}
          seed={seed}
          onSeedConsumed={() => setSeed(null)}
          onEdit={setEditingId}
        />
      ) : (
        <ReportsSection configById={configById} gatewayConfigured={gatewayConfigured} onAction={actionApproval} onRan={load} />
      )}

      {editingId && (
        <AgentEditor
          agentId={editingId}
          configs={configs}
          toolCatalog={toolCatalog}
          onClose={() => setEditingId(null)}
          onSaved={(updated) => {
            setConfigs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            void load();
          }}
        />
      )}
    </>
  );
}

/* =========================== Command center ============================ */

function AgentRosterCard({ cfg, row, onEdit, onChat }: {
  cfg: AgentConfig;
  row?: AgentStatusRow;
  onEdit: (id: string) => void;
  onChat: (id: string) => void;
}) {
  const reportsToName = cfg.reportsTo ? AGENT_CONFIG_DEFAULTS[cfg.reportsTo]?.title.split("—")[0].trim() : null;
  return (
    <div className="av3-card" style={{ padding: 13, display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Monogram initials={cfg.initials} accentVar={cfg.accentVar} size={36} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{cfg.name}</span>
            <StatusBadge s={cfg.status} />
            {row && <span style={{ marginLeft: "auto" }}><StatusDot status={row.status} /></span>}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--av3-subtle)", marginTop: 1 }}>{cfg.title}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--av3-muted)", lineHeight: 1.5 }}>{cfg.mandate}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 10.5 }}>
        <Badge tone="info">{modelLabel(cfg.modelId)}</Badge>
        <Badge tone="neutral">{cfg.authority}</Badge>
        <Badge tone="neutral">effort · {cfg.effort}</Badge>
        {reportsToName && <Badge tone="neutral">↳ {reportsToName}</Badge>}
      </div>
      {row && <div style={{ fontSize: 11.5, color: "var(--av3-subtle)" }}>{row.statusText}</div>}
      {row && (row.spentTodayGrosze ?? 0) >= 0 && (
        <div style={{ fontSize: 11, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)" }}>
          Today · {((row.spentTodayGrosze ?? 0) / 100).toFixed(2)} zł{cfg.spend.dailyCapGrosze != null ? ` / ${(cfg.spend.dailyCapGrosze / 100).toFixed(2)} cap` : ""}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        <Button variant="secondary" size="sm" onClick={() => onEdit(cfg.id)}><Pencil className="av3-btn-ico" /> Edit</Button>
        <Button variant="ghost" size="sm" onClick={() => onChat(cfg.id)}><Send className="av3-btn-ico" /> Chat</Button>
      </div>
    </div>
  );
}

function CommandCenter({ snapshot, configs, statusById, gatewayConfigured, onEdit, onChat, onRan }: {
  snapshot: Snapshot | null;
  configs: AgentConfig[];
  statusById: Map<string, AgentStatusRow>;
  gatewayConfigured: boolean;
  onEdit: (id: string) => void;
  onChat: (id: string) => void;
  onRan: () => void;
}) {
  const byId = snapshot ? new Map(snapshot.kpis.map((k) => [k.id, k])) : new Map<string, BoardKpi>();
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((k): k is BoardKpi => !!k);
  const sales = pick(SALES_KPI_IDS);
  const cost = pick(COST_KPI_IDS);

  return (
    <>
      <div style={{ marginBottom: 12 }}><AiModelControl /></div>

      {sales.length > 0 && (<><SecLabel first>Sales &amp; growth</SecLabel><div style={RAIL_STYLE}>{sales.map((k) => <KpiTile key={k.id} k={k} />)}</div></>)}
      {cost.length > 0 && (<><SecLabel>Cost &amp; quality</SecLabel><div style={RAIL_STYLE}>{cost.map((k) => <KpiTile key={k.id} k={k} />)}</div></>)}

      <SecLabel>Agent roster ({configs.length})</SecLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
        {configs.map((cfg) => (
          <AgentRosterCard key={cfg.id} cfg={cfg} row={statusById.get(cfg.id)} onEdit={onEdit} onChat={onChat} />
        ))}
      </div>

      <SecLabel>Org &amp; reporting</SecLabel>
      <Card><CardBody><OrgChart configs={configs} onEdit={onEdit} /></CardBody></Card>

      <SecLabel>What needs attention</SecLabel>
      <Card>
        {!snapshot || snapshot.flags.length === 0 ? (
          <CardBody>
            <div className="av3-empty" style={{ padding: "20px 0" }}>
              <CircleDot style={{ width: 22, height: 22, color: "var(--av3-ok)", margin: "0 auto 8px" }} />
              <div className="av3-empty-title">All KPIs on target</div>
              <div className="av3-empty-text">Convene the board in Reports to hunt the next growth lever.</div>
            </div>
          </CardBody>
        ) : (
          <>
            <CardHead title={`${snapshot.flags.length} metric${snapshot.flags.length > 1 ? "s" : ""} off-target`} description="These seed the next board meeting" />
            <CardBody style={{ paddingTop: 6, paddingBottom: 6 }}>
              {snapshot.flags.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: i < snapshot.flags.length - 1 ? "1px solid var(--av3-line)" : "none", fontSize: 12.5, color: "var(--av3-muted)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--av3-warn)", flexShrink: 0, marginTop: 5 }} />
                  <span>{f}</span>
                </div>
              ))}
            </CardBody>
          </>
        )}
      </Card>

      <SecLabel>Convene the board</SecLabel>
      <Card><CardBody><RunMeetingButtons gatewayConfigured={gatewayConfigured} onRan={onRan} compact /></CardBody></Card>
    </>
  );
}

function OrgChart({ configs, onEdit }: { configs: AgentConfig[]; onEdit: (id: string) => void }) {
  const childrenOf = (id: string | null) => configs.filter((c) => c.reportsTo === id);
  const row = (c: AgentConfig, depth: number) => (
    <div key={c.id}>
      <button
        type="button"
        className="av3-conv-row"
        style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", marginLeft: depth * 22, width: `calc(100% - ${depth * 22}px)` }}
        onClick={() => onEdit(c.id)}
      >
        {depth > 0 && <span style={{ color: "var(--av3-subtle)", marginRight: 2 }}>↳</span>}
        <Monogram initials={c.initials} accentVar={c.accentVar} size={24} />
        <span style={{ fontSize: 12.5, fontWeight: 600, textAlign: "left" }}>{c.name}</span>
        <span style={{ fontSize: 11, color: "var(--av3-subtle)" }}>{c.title.split("—")[0].trim()}</span>
        <StatusBadge s={c.status} />
      </button>
      {childrenOf(c.id).map((kid) => row(kid, depth + 1))}
    </div>
  );
  const roots = childrenOf(null);
  return <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{roots.map((r) => row(r, 0))}</div>;
}

/* ============================== Scorecards ============================= */

function Scorecards({ snapshot, configs, statusById, onEdit }: {
  snapshot: Snapshot | null;
  configs: AgentConfig[];
  statusById: Map<string, AgentStatusRow>;
  onEdit: (id: string) => void;
}) {
  const owned = (id: string) => (snapshot?.kpis ?? []).filter((k) => k.owner === id);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
      {configs.map((cfg) => {
        const live = owned(cfg.id);
        const row = statusById.get(cfg.id);
        return (
          <Card key={cfg.id}>
            <CardHead
              title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Monogram initials={cfg.initials} accentVar={cfg.accentVar} size={26} /> {cfg.name}</span>}
              description={cfg.title}
              actions={<Button variant="ghost" size="sm" onClick={() => onEdit(cfg.id)}><Pencil className="av3-btn-ico" /> Edit</Button>}
            />
            <CardBody style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {live.length > 0 ? (
                <div style={RAIL_STYLE}>{live.map((k) => <KpiTile key={k.id} k={k} />)}</div>
              ) : (
                <div className="av3-cell-muted" style={{ fontSize: 12 }}>
                  {row?.statusText ?? "No live P&L metric owned — advisory agent."}
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--av3-subtle)", fontWeight: 600, marginBottom: 6 }}>Targets it answers for</div>
                {cfg.kpis.length === 0 ? (
                  <div className="av3-cell-muted" style={{ fontSize: 12 }}>No targets set.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: "var(--av3-muted)", lineHeight: 1.7 }}>
                    {cfg.kpis.map((k, i) => <li key={i}>{k}</li>)}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

/* ================================ Work ================================= */

const EVENT_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = {
  run: "info", edit: "neutral", escalation: "bad", approval: "warn", schedule: "ok", note: "neutral",
};

function WorkSection({ configs, gatewayConfigured, onRan }: {
  configs: AgentConfig[];
  gatewayConfigured: boolean;
  onRan: () => void;
}) {
  const [events, setEvents] = useState<AgentEvent[] | null>(null);
  const nameById = useMemo(() => new Map<string, string>(configs.map((c) => [c.id, c.name])), [configs]);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/ai/boardroom/timeline").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setEvents(res?.events ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const scheduled = configs.filter((c) => c.schedule.cadence !== "off");

  return (
    <>
      <Card>
        <CardHead title="Run the fleet" description="Convene the board on today's live numbers — a real round-robin + synthesis into decisions." />
        <CardBody><RunMeetingButtons gatewayConfigured={gatewayConfigured} onRan={() => { onRan(); void load(); }} /></CardBody>
      </Card>

      <SecLabel>Schedules</SecLabel>
      <Card>
        <CardBody>
          {scheduled.length === 0 ? (
            <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>No agents on a schedule. Set a cadence per agent in the editor.</div>
          ) : (
            scheduled.map((c, i) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < scheduled.length - 1 ? "1px solid var(--av3-line)" : "none" }}>
                <Monogram initials={c.initials} accentVar={c.accentVar} size={26} />
                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 130 }}>{c.name}</span>
                <Badge tone="ok">{CADENCE_OPTIONS.find((o) => o.value === c.schedule.cadence)?.label ?? c.schedule.cadence}</Badge>
                <span style={{ fontSize: 12, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)" }}>{c.schedule.time}</span>
              </div>
            ))
          )}
          <div className="av3-cell-muted" style={{ fontSize: 11, marginTop: 10 }}>
            The daily-cadence executives auto-run via the boardroom briefing cron (<span style={{ fontFamily: "var(--av3-mono)" }}>/api/admin/cron/boardroom-briefing</span>).
          </div>
        </CardBody>
      </Card>

      <SecLabel>Activity</SecLabel>
      <Card>
        <CardBody>
          {events === null ? (
            <SkeletonRows rows={4} />
          ) : events.length === 0 ? (
            <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>No agent activity yet. Chat with an agent or run a meeting to populate the log.</div>
          ) : (
            events.map((e, i) => (
              <div key={e.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < events.length - 1 ? "1px solid var(--av3-line)" : "none", alignItems: "flex-start" }}>
                <Badge tone={EVENT_TONE[e.type] ?? "neutral"}>{e.type}</Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}><strong>{nameById.get(e.agentId) ?? e.agentId}</strong> — {e.summary}</div>
                  {e.detail && <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{e.detail}</div>}
                  <div style={{ fontSize: 11, color: "var(--av3-subtle)", marginTop: 3, fontFamily: "var(--av3-mono)" }}>
                    {new Date(e.at).toLocaleString("pl-PL")} · {e.actor}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </>
  );
}

/* ============================== Approvals ============================== */

function ApprovalsSection({ configById, onAction }: {
  configById: Map<string, AgentConfig>;
  onAction: (a: ApprovalRow) => void;
}) {
  const [approvals, setApprovals] = useState<ApprovalRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/ai/boardroom/approvals").then((r) => (r.ok ? r.json() : null)).catch(() => null).then((res) => setApprovals(res?.approvals ?? []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = useCallback(async (a: ApprovalRow, status: "executed" | "dismissed") => {
    const key = `${a.meetingId}-${a.index}`;
    setBusy(key);
    await fetch("/api/admin/ai/boardroom/approvals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId: a.meetingId, index: a.index, status, owner: a.owner }),
    }).catch(() => null);
    setBusy(null);
    load();
  }, [load]);

  return (
    <Card>
      <CardHead title="Pending approvals" description="Gated actions agents proposed — Action runs it via the owning agent (preview → approve → execute → audit); mark it executed or dismiss it to clear the queue." />
      <CardBody>
        {approvals === null ? (
          <SkeletonRows rows={4} />
        ) : approvals.length === 0 ? (
          <div className="av3-empty" style={{ padding: "22px 0" }}>
            <Check aria-hidden />
            <div className="av3-empty-title">Nothing awaiting you</div>
            <div className="av3-empty-text">When a meeting produces a gated action, it queues here for your approval.</div>
          </div>
        ) : (
          approvals.map((a, i) => {
            const owner = configById.get(a.owner);
            const key = `${a.meetingId}-${a.index}`;
            return (
              <div key={key} style={{ display: "flex", gap: 11, padding: "12px 0", borderBottom: i < approvals.length - 1 ? "1px solid var(--av3-line)" : "none", alignItems: "flex-start" }}>
                {owner && <Monogram initials={owner.initials} accentVar={owner.accentVar} size={28} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</div>
                  {a.rationale && <div className="av3-cell-muted" style={{ fontSize: 12, marginTop: 2 }}>{a.rationale}</div>}
                  <div style={{ fontSize: 11, marginTop: 4, fontFamily: "var(--av3-mono)", color: "var(--av3-subtle)" }}>
                    {a.proposedTool} · {owner?.name ?? a.owner} · {new Date(a.createdAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <Button variant="primary" size="sm" onClick={() => onAction(a)}>Action <ChevronRight className="av3-btn-ico" /></Button>
                  <Button variant="secondary" size="sm" loading={busy === key} onClick={() => setStatus(a, "executed")}>Mark done</Button>
                  <Button variant="ghost" size="sm" disabled={busy === key} onClick={() => setStatus(a, "dismissed")}>Dismiss</Button>
                </div>
              </div>
            );
          })
        )}
      </CardBody>
    </Card>
  );
}

/* ================================ Inbox =============================== */

function InboxSection({ configs, gatewayConfigured, selectedId, onSelect, seed, onSeedConsumed, onEdit }: {
  configs: AgentConfig[];
  gatewayConfigured: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  seed: { agentId: string; text: string } | null;
  onSeedConsumed: () => void;
  onEdit: (id: string) => void;
}) {
  // "team" = the generalist board assistant (no persona). Default to first agent.
  const effectiveId = selectedId ?? configs[0]?.id ?? null;
  const selected = effectiveId === "team" ? null : configs.find((c) => c.id === effectiveId) ?? null;
  const nameById = useMemo(() => new Map<string, AgentConfig>(configs.map((c) => [c.id, c])), [configs]);

  const [escalations, setEscalations] = useState<AgentEvent[]>([]);
  useEffect(() => {
    fetch("/api/admin/ai/boardroom/timeline").then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((res) => setEscalations(((res?.events ?? []) as AgentEvent[]).filter((e) => e.type === "escalation").slice(0, 6)));
  }, []);

  return (
    <>
      {escalations.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <CardHead title={`${escalations.length} escalation${escalations.length > 1 ? "s" : ""} from your agents`} description="An agent hit its escalation threshold and is asking for you." />
          <CardBody>
            {escalations.map((e, i) => {
              const a = nameById.get(e.agentId);
              return (
                <div key={e.id} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: i < escalations.length - 1 ? "1px solid var(--av3-line)" : "none", alignItems: "flex-start" }}>
                  <AlertTriangle style={{ width: 16, height: 16, color: "var(--av3-warn)", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5 }}><strong>{a?.name ?? e.agentId}</strong> — {e.summary}</div>
                    <div style={{ fontSize: 11, color: "var(--av3-subtle)", marginTop: 2, fontFamily: "var(--av3-mono)" }}>{e.detail} · {new Date(e.at).toLocaleString("pl-PL")}</div>
                  </div>
                  {a && <Button variant="ghost" size="sm" onClick={() => onSelect(a.id)}>Open <ChevronRight className="av3-btn-ico" /></Button>}
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 240px) 1fr", gap: 12, alignItems: "start" }}>
      <Card>
        <CardBody style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {configs.map((c) => (
            <button key={c.id} type="button" className={`av3-conv-row ${effectiveId === c.id ? "is-active" : ""}`} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px" }} onClick={() => onSelect(c.id)}>
              <Monogram initials={c.initials} accentVar={c.accentVar} size={28} />
              <span style={{ minWidth: 0, textAlign: "left", flex: 1 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 600 }}>{c.name}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--av3-subtle)" }}>{c.status === "active" ? c.authority : c.status}</span>
              </span>
            </button>
          ))}
          <button type="button" className={`av3-conv-row ${effectiveId === "team" ? "is-active" : ""}`} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px" }} onClick={() => onSelect("team")}>
            <Users style={{ width: 28, height: 28, padding: 6, color: "var(--av3-subtle)" }} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Whole team</span>
          </button>
        </CardBody>
      </Card>

      <div>
        <Card>
          <CardHead
            title={selected ? selected.name : "Whole team"}
            description={selected ? selected.title : "A generalist board assistant with every read tool — for cross-functional questions."}
            actions={selected ? <Button variant="ghost" size="sm" onClick={() => onEdit(selected.id)}><Pencil className="av3-btn-ico" /> Edit</Button> : undefined}
          />
        </Card>
        <ChatPanel
          agent={selected}
          gatewayConfigured={gatewayConfigured}
          seed={seed && seed.agentId === effectiveId ? seed.text : null}
          onSeedConsumed={onSeedConsumed}
        />
      </div>
    </div>
    </>
  );
}

/* ================================ Reports ============================= */

function ReportsSection({ configById, gatewayConfigured, onAction, onRan }: {
  configById: Map<string, AgentConfig>;
  gatewayConfigured: boolean;
  onAction: (a: ApprovalRow) => void;
  onRan: () => void;
}) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMeetings = useCallback(async (selectNewest = false) => {
    const res = await fetch("/api/admin/ai/boardroom/meeting").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const list: Meeting[] = res?.meetings ?? [];
    setMeetings(list);
    if (selectNewest && list[0]) setActiveId(list[0].id);
    else setActiveId((prev) => prev ?? list[0]?.id ?? null);
    setLoading(false);
  }, []);
  useEffect(() => { void loadMeetings(); }, [loadMeetings]);

  const active = meetings.find((m) => m.id === activeId) ?? null;

  return (
    <>
      <Card>
        <CardHead title="Reports" description="Daily briefings + weekly reviews — a real multi-agent meeting on live numbers, with transcript, decisions and spend." />
        <CardBody><RunMeetingButtons gatewayConfigured={gatewayConfigured} onRan={() => { loadMeetings(true); onRan(); }} /></CardBody>
      </Card>

      {loading ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={4} /></div>
      ) : meetings.length === 0 ? (
        <Card><CardBody>
          <div className="av3-empty" style={{ padding: "22px 0" }}>
            <Users aria-hidden />
            <div className="av3-empty-title">No reports yet</div>
            <div className="av3-empty-text">Run a daily briefing or weekly review to generate one.</div>
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
          {active && <MeetingView meeting={active} configById={configById} onAction={onAction} />}
        </>
      )}
    </>
  );
}

function MeetingView({ meeting, configById, onAction }: {
  meeting: Meeting;
  configById: Map<string, AgentConfig>;
  onAction: (a: ApprovalRow) => void;
}) {
  const label = (id: string) => configById.get(id)?.name ?? id;
  const accent = (id: string) => configById.get(id)?.accentVar ?? "--av3-subtle";
  const initials = (id: string) => configById.get(id)?.initials ?? "··";
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
          {meeting.contributions.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 11, padding: "12px 0", borderBottom: i < meeting.contributions.length - 1 ? "1px solid var(--av3-line)" : "none" }}>
              <Monogram initials={initials(c.persona)} accentVar={accent(c.persona)} size={30} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: `var(${accent(c.persona)})` }}>{label(c.persona)}</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 2 }}>{c.text}</div>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHead title="Decisions" description="What the board agreed — action the ones with a lever via the owning agent" actions={<Badge tone={meeting.decisions.length ? "brand" : "neutral"}>{meeting.decisions.length}</Badge>} />
        <CardBody>
          {meeting.decisions.length === 0 ? (
            <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>No structured decisions were produced this round.</div>
          ) : (
            meeting.decisions.map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 11, padding: "12px 0", borderBottom: i < meeting.decisions.length - 1 ? "1px solid var(--av3-line)" : "none", alignItems: "flex-start" }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, padding: "3px 8px", borderRadius: "var(--av3-r-sm)", flexShrink: 0, background: `color-mix(in oklab, var(${accent(d.owner)}) 16%, transparent)`, color: `var(${accent(d.owner)})` }}>{initials(d.owner)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{d.title}</div>
                  {d.rationale && <div className="av3-cell-muted" style={{ fontSize: 12, marginTop: 2 }}>{d.rationale}</div>}
                  {d.proposedTool && <div style={{ fontSize: 11, marginTop: 4, fontFamily: "var(--av3-mono)", color: "var(--av3-subtle)" }}>{d.proposedTool}</div>}
                </div>
                {d.proposedTool && (
                  <Button variant="ghost" size="sm" onClick={() => onAction({ meetingId: meeting.id, meetingType: meeting.type, scope: meeting.scope, createdAt: meeting.createdAt, index: i, title: d.title, owner: d.owner, rationale: d.rationale, proposedTool: d.proposedTool, proposedInput: d.proposedInput })}>
                    Action <ChevronRight className="av3-btn-ico" />
                  </Button>
                )}
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </>
  );
}

/* =============================== Meetings run ========================= */

function RunMeetingButtons({ gatewayConfigured, onRan, compact }: { gatewayConfigured: boolean; onRan: () => void; compact?: boolean }) {
  const { location } = useAdminLocationV3();
  const [running, setRunning] = useState<null | "daily" | "weekly">(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (type: "daily" | "weekly") => {
    setRunning(type);
    setError(null);
    const qs = location ? `?location=${encodeURIComponent(location)}` : "";
    const res = await fetch(`/api/admin/ai/boardroom/meeting${qs}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }),
    }).then((r) => r.json().then((j) => ({ ok: r.ok, j }))).catch(() => ({ ok: false, j: { error: "Network error" } }));
    setRunning(null);
    if (!res.ok) setError((res.j as { error?: string }).error ?? "Meeting failed.");
    else onRan();
  }, [location, onRan]);

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
      {running && <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 8 }}>The board is deliberating — each active executive weighs in, then converges on decisions. ~20–40s.</div>}
      {error && <div className="av3-chat-error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

/* ================================ Chat ================================ */

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

function ChatPanel({ agent, gatewayConfigured, seed, onSeedConsumed }: {
  agent: AgentConfig | null;
  gatewayConfigured: boolean;
  seed?: string | null;
  onSeedConsumed?: () => void;
}) {
  const tag = agent?.id ?? "team";
  const [convId, setConvId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistItem[]>([]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestion = agent ? `Ask ${agent.name} — ${agent.mandate}` : "Ask the whole team anything about the business.";

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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, history]);

  useEffect(() => {
    if (seed) { setDraft(seed); onSeedConsumed?.(); }
  }, [seed, onSeedConsumed]);

  const send = useCallback(async (message: string, approvedToolUseIds: string[] = [], replaceLast = false) => {
    setSending(true); setError(null);
    try {
      let id = convId;
      if (!id) {
        const created = await fetch("/api/admin/ai-agent/conversations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: agent ? `${agent.name} chat` : "Team chat", persona: tag }),
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        id = created?.conversation?.id ?? null;
        if (!id) { setError("Could not start a conversation."); return; }
        setConvId(id);
      }
      const res = await fetch(`/api/admin/ai-agent/conversations/${id}/turn`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, approvedToolUseIds, personaId: agent?.id ?? undefined }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? `Request failed (${res.status})`); return;
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
  }, [convId, agent, tag]);

  const approve = useCallback((turn: ChatTurn, toolUseId: string) => { void send(turn.userText, [toolUseId], true); }, [send]);

  if (!gatewayConfigured) {
    return (
      <Card><CardBody>
        <div className="av3-empty" style={{ padding: "22px 0" }}>
          <AlertTriangle aria-hidden />
          <div className="av3-empty-title">Agent chat needs an API key</div>
          <div className="av3-empty-text">Set <span style={{ fontFamily: "var(--av3-mono)" }}>ANTHROPIC_API_KEY</span> to talk to this agent. KPIs &amp; configs stay live regardless.</div>
        </div>
      </CardBody></Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <div ref={scrollRef} className="av3-chat-scroll">
          {history.length === 0 && turns.length === 0 ? (
            <div className="av3-empty">
              <Sparkles aria-hidden />
              <div className="av3-empty-title">Ask {agent ? agent.name : "the team"}</div>
              <div className="av3-empty-text">{suggestion}</div>
            </div>
          ) : (
            <>
              {history.length > 0 && <HistoryView items={history} />}
              {turns.map((turn) => <TurnView key={turn.id} turn={turn} onApprove={approve} />)}
            </>
          )}
        </div>
        {error && <div className="av3-chat-error">{error}</div>}
        <form className="av3-chat-composer" onSubmit={(e) => { e.preventDefault(); if (draft.trim() && !sending) void send(draft.trim()); }}>
          <textarea className="av3-input av3-chat-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={agent ? `Ask ${agent.name}…` : "Ask the team…"} rows={2} disabled={sending} />
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
