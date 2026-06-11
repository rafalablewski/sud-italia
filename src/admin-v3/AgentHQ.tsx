"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Bot, Check, ChevronRight, FileDown,
  LineChart, Play, Plus, Printer, RefreshCw, Sparkles, Trash2, Users,
} from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Card, CardBody, CardHead, SkeletonRows, Switch } from "./ui";
import { AiModelControl } from "./AiModelControl";
import {
  Monogram, StatusDot, KpiTile, StatTile, SecLabel, ChatPanel, RAIL,
  type BoardKpi, type KpiStatus,
} from "./agent-hq/shared";
import { AgentEditForm } from "./agent-hq/AgentEditForm";
import { buildLiveSystemPrompt, type AgentConfig, type AgentKpi } from "@/lib/ai/boardroom/agent-config";

/**
 * Agent HQ — the operator console for the AI agent fleet. Six sections:
 *   • Command center — fleet KPIs + business KPIs + org chart + activity +
 *     recent activity + upcoming work + daily digest + monthly cost, all from a
 *     single aggregated request so the page renders in one pass (no pop-in).
 *   • Scorecards — one big, readable scorecard per agent.
 *   • Work — operator-created work items, drag-to-assign onto agents, queued +
 *     recent, run on the assigned agent.
 *   • Approvals — the human-in-the-loop queue of gated actions.
 *   • Inbox — escalations + chat any agent.
 *   • Reports — meeting transcripts + decisions, exportable to CSV / PDF.
 *
 * Agents are edited in the Agents section (left list · right full editor);
 * their metrics + KPI target-vs-actual live in Scorecards.
 */

interface Snapshot { scope: string; kpis: BoardKpi[]; flags: string[] }
interface StatusRow {
  id: string; name: string; title: string; accentVar: string; initials: string;
  agentStatus: "active" | "paused" | "draft"; authority: string; modelId: string | null;
  reportsTo: string | null; spentTodayGrosze: number; dailyCapGrosze: number | null;
  concerns: number; status: KpiStatus;
}
interface FleetStats {
  runsToday: number; cost7dGrosze: number; costMonthGrosze: number;
  successRate7d: number | null; runs7d: number; runsByDay7d: number[];
  activeAgents: number; scheduledCount: number;
}
interface AgentEvent { id: string; agentId: string; type: string; summary: string; detail?: string; costGrosze?: number; ok?: boolean; actor: string; at: string }
interface DigestDecision { title: string; owner: string; tool: string | null }
interface DailyDigest { id: string; type: "daily" | "weekly"; createdAt: string; costGrosze: number; agendaCount: number; decisions: DigestDecision[] }
interface ScheduledRow { id: string; name: string; initials: string; accentVar: string; cadence: string; time: string }
interface UpcomingWork { id: string; title: string; agentId: string | null; status: string }
interface CommandPayload {
  gatewayConfigured: boolean;
  snapshot: Snapshot;
  agents: StatusRow[];
  configs: AgentConfig[];
  stats: FleetStats;
  scheduled: ScheduledRow[];
  recentActivity: AgentEvent[];
  upcomingWork: UpcomingWork[];
  dailyDigest: DailyDigest | null;
}

type SectionId = "command" | "agents" | "scorecards" | "work" | "approvals" | "inbox" | "reports" | "settings";
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "command", label: "Command center" },
  { id: "agents", label: "Agents" },
  { id: "scorecards", label: "Scorecards" },
  { id: "work", label: "Work" },
  { id: "approvals", label: "Approvals" },
  { id: "inbox", label: "Inbox" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
];

const TONE: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = {
  run: "info", edit: "neutral", escalation: "bad", approval: "warn", schedule: "ok", note: "neutral",
};
const zl = (g: number) => `${(g / 100).toFixed(2)} zł`;

/* =============================== root ================================== */

export function AgentHQ() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const city = all.find((l) => l.slug === location)?.city ?? "All locations";

  const [cmd, setCmd] = useState<CommandPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<SectionId>("command");
  const [inboxSel, setInboxSel] = useState<string | null>(null);
  const [seed, setSeed] = useState<{ agentId: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const qs = location ? `?location=${encodeURIComponent(location)}` : "";
    const res = await fetch(`/api/admin/ai/boardroom/command${qs}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setCmd(res);
    setLoading(false);
    setRefreshing(false);
  }, [location]);
  useEffect(() => { void load(); }, [load]);

  const configById = useMemo(() => new Map<string, AgentConfig>((cmd?.configs ?? []).map((c) => [c.id, c])), [cmd]);
  const gatewayConfigured = cmd?.gatewayConfigured ?? false;

  const [agentSel, setAgentSel] = useState<string | null>(null);
  const openChat = useCallback((agentId: string, text?: string) => {
    setInboxSel(agentId);
    if (text) setSeed({ agentId, text });
    setSection("inbox");
  }, []);
  const openAgent = useCallback((agentId: string) => { setAgentSel(agentId); setSection("agents"); }, []);

  return (
    <>
      <div className="av3-pagehead">
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ width: 34, height: 34, borderRadius: "var(--av3-r-md)", display: "grid", placeItems: "center", background: "var(--av3-brand-soft)", color: "var(--av3-brand)" }}><Bot style={{ width: 19, height: 19 }} /></span>
          <div>
            <h1>Agent HQ</h1>
            <div className="av3-pagehead-sub">Command, scorecards, work, approvals, inbox &amp; reports for your AI agent fleet · {city}</div>
          </div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); void load(); }}>
            <RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin .7s linear infinite" } : undefined} /> Refresh
          </Button>
        </div>
      </div>

      <div className="av3-filterchips" style={{ marginBottom: 16 }}>
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={`av3-fchip ${section === s.id ? "is-active" : ""}`} onClick={() => setSection(s.id)}>{s.label}</button>
        ))}
      </div>

      {loading ? (
        <Card padding="default"><SkeletonRows rows={8} /></Card>
      ) : !cmd ? (
        <Card><CardBody>Could not load Agent HQ.</CardBody></Card>
      ) : section === "command" ? (
        <CommandCenter cmd={cmd} configById={configById} onOpenAgent={openAgent} />
      ) : section === "agents" ? (
        <Agents cmd={cmd} initialId={agentSel} onConfigSaved={(u) => setCmd((prev) => (prev ? { ...prev, configs: prev.configs.map((c) => (c.id === u.id ? u : c)) } : prev))} />
      ) : section === "scorecards" ? (
        <Scorecards />
      ) : section === "work" ? (
        <WorkBoard configs={cmd.configs} gatewayConfigured={gatewayConfigured} />
      ) : section === "approvals" ? (
        <Approvals configById={configById} onAction={(owner, text) => openChat(owner, text)} />
      ) : section === "inbox" ? (
        <Inbox configs={cmd.configs} gatewayConfigured={gatewayConfigured} selectedId={inboxSel} onSelect={setInboxSel} seed={seed} onSeedConsumed={() => setSeed(null)} />
      ) : section === "reports" ? (
        <Reports configById={configById} gatewayConfigured={gatewayConfigured} onRan={load} />
      ) : (
        <SettingsSection />
      )}

      {!gatewayConfigured && !loading && (
        <Card padding="compact" style={{ marginTop: 24, display: "flex", gap: 10, alignItems: "center" }}>
          <AlertTriangle style={{ width: 18, height: 18, color: "var(--av3-warn)", flexShrink: 0 }} />
          <div style={{ fontSize: 12.5, color: "var(--av3-muted)" }}>
            KPIs &amp; configs are live, but agents are read-only until <span style={{ fontFamily: "var(--av3-mono)" }}>ANTHROPIC_API_KEY</span> is set.
          </div>
        </Card>
      )}
    </>
  );
}

/* =========================== Command center ============================ */

const SALES_IDS = ["today-revenue", "avg-ticket", "revenue-growth", "refund-rate"];
const COST_IDS = ["food-cost", "labor-cost", "prime-cost", "satisfaction"];

function CommandCenter({ cmd, configById, onOpenAgent }: { cmd: CommandPayload; configById: Map<string, AgentConfig>; onOpenAgent: (id: string) => void }) {
  const byId = new Map(cmd.snapshot.kpis.map((k) => [k.id, k]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((k): k is BoardKpi => !!k);
  const sales = pick(SALES_IDS), cost = pick(COST_IDS);
  const s = cmd.stats;

  return (
    <>
      <SecLabel first>Fleet</SecLabel>
      <div style={RAIL}>
        <StatTile label="Active agents" value={`${s.activeAgents}`} sub={`of ${cmd.configs.length}`} accent="--av3-c4" />
        <StatTile label="Runs today" value={`${s.runsToday}`} accent="--av3-c3" />
        <StatTile label="Success rate · 7d" value={s.successRate7d == null ? "—" : `${s.successRate7d}%`} sub={`${s.runs7d} runs`} accent={s.successRate7d != null && s.successRate7d < 90 ? "--av3-warn" : "--av3-ok"} />
        <StatTile label="Cost · 7d" value={zl(s.cost7dGrosze)} accent="--av3-c5" />
        <StatTile label="Scheduled" value={`${s.scheduledCount}`} sub="agents on a cadence" accent="--av3-c6" />
      </div>

      {sales.length > 0 && (<><SecLabel>Sales &amp; growth</SecLabel><div style={RAIL}>{sales.map((k) => <KpiTile key={k.id} k={k} />)}</div></>)}
      {cost.length > 0 && (<><SecLabel>Cost &amp; quality</SecLabel><div style={RAIL}>{cost.map((k) => <KpiTile key={k.id} k={k} />)}</div></>)}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 22, alignItems: "start" }}>
        <OrgCard configs={cmd.configs} statusById={new Map(cmd.agents.map((a) => [a.id, a]))} onOpenAgent={onOpenAgent} />
        <ActivityCard runsByDay7d={s.runsByDay7d} />
        <RecentActivityCard events={cmd.recentActivity} configById={configById} />
        <UpcomingWorkCard work={cmd.upcomingWork} scheduled={cmd.scheduled} configById={configById} />
        <DigestCard digest={cmd.dailyDigest} configById={configById} flags={cmd.snapshot.flags} />
        <MonthlyCostCard stats={s} />
      </div>
    </>
  );
}

function OrgCard({ configs, statusById, onOpenAgent }: { configs: AgentConfig[]; statusById: Map<string, StatusRow>; onOpenAgent: (id: string) => void }) {
  const kids = (id: string | null) => configs.filter((c) => c.reportsTo === id);
  const rowFor = (c: AgentConfig, d: number): React.ReactNode => (
    <div key={c.id}>
      <button type="button" className="av3-conv-row" style={{ marginLeft: d * 20, width: `calc(100% - ${d * 20}px)` }} onClick={() => onOpenAgent(c.id)}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {d > 0 && <span style={{ color: "var(--av3-subtle)" }}>↳</span>}
          <Monogram initials={c.initials} accentVar={c.accentVar} size={22} />
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name}</span>
          <span style={{ fontSize: 11, color: "var(--av3-subtle)" }}>{c.title.split("—")[0].trim()}</span>
        </span>
        <StatusDot status={statusById.get(c.id)?.status ?? "neutral"} />
      </button>
      {kids(c.id).map((k) => rowFor(k, d + 1))}
    </div>
  );
  return (
    <Card>
      <CardHead title="Org & reporting" description="Click an agent to edit it" />
      <CardBody style={{ display: "flex", flexDirection: "column", gap: 2 }}>{kids(null).map((c) => rowFor(c, 0))}</CardBody>
    </Card>
  );
}

function ActivityCard({ runsByDay7d }: { runsByDay7d: number[] }) {
  const max = Math.max(1, ...runsByDay7d);
  const days = ["6d", "5d", "4d", "3d", "2d", "1d", "Today"];
  return (
    <Card>
      <CardHead title="Activity" description="Agent runs over the last 7 days" />
      <CardBody>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 96 }}>
          {runsByDay7d.map((n, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 10.5, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)" }}>{n}</span>
              <div title={`${n} runs`} style={{ width: "100%", height: `${Math.max(4, (n / max) * 70)}px`, borderRadius: "var(--av3-r-sm) var(--av3-r-sm) 0 0", background: i === 6 ? "var(--av3-brand)" : "color-mix(in oklab, var(--av3-c3) 55%, transparent)" }} />
              <span style={{ fontSize: 10, color: "var(--av3-subtle)" }}>{days[i]}</span>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function RecentActivityCard({ events, configById }: { events: AgentEvent[]; configById: Map<string, AgentConfig> }) {
  return (
    <Card>
      <CardHead title="Recent activity" description="Runs, edits, escalations & approvals" />
      <CardBody>
        {events.length === 0 ? <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>No activity yet.</div> :
          events.slice(0, 7).map((e, i) => (
            <div key={e.id} style={{ display: "flex", gap: 9, padding: "8px 0", borderBottom: i < Math.min(events.length, 7) - 1 ? "1px solid var(--av3-line)" : "none", alignItems: "flex-start" }}>
              <Badge tone={TONE[e.type] ?? "neutral"}>{e.type}</Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, lineHeight: 1.4 }}><strong>{configById.get(e.agentId)?.name ?? e.agentId}</strong> — {e.summary}</div>
                <div style={{ fontSize: 10.5, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)" }}>{new Date(e.at).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          ))}
      </CardBody>
    </Card>
  );
}

function UpcomingWorkCard({ work, scheduled, configById }: { work: UpcomingWork[]; scheduled: ScheduledRow[]; configById: Map<string, AgentConfig> }) {
  return (
    <Card>
      <CardHead title="Upcoming work" description="Queued items + scheduled runs" />
      <CardBody>
        {work.length === 0 && scheduled.length === 0 ? (
          <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>Nothing queued. Assign work in the Work tab.</div>
        ) : (<>
          {work.map((w) => (
            <div key={w.id} style={{ display: "flex", gap: 9, padding: "7px 0", alignItems: "center" }}>
              <Badge tone={w.status === "queued" ? "info" : "neutral"}>{w.status}</Badge>
              <span style={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>{w.title}</span>
              {w.agentId && <span style={{ fontSize: 11, color: "var(--av3-subtle)" }}>{configById.get(w.agentId)?.name}</span>}
            </div>
          ))}
          {scheduled.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 9, padding: "7px 0", alignItems: "center" }}>
              <Monogram initials={s.initials} accentVar={s.accentVar} size={20} />
              <span style={{ fontSize: 12.5, flex: 1 }}>{s.name}</span>
              <Badge tone="ok">{s.cadence}</Badge>
              <span style={{ fontSize: 11, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)" }}>{s.time}</span>
            </div>
          ))}
        </>)}
      </CardBody>
    </Card>
  );
}

function DigestCard({ digest, configById, flags }: { digest: DailyDigest | null; configById: Map<string, AgentConfig>; flags: string[] }) {
  return (
    <Card>
      <CardHead title="Daily digest" description={digest ? `${digest.type === "daily" ? "Daily briefing" : "Weekly review"} · ${new Date(digest.createdAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}` : "No briefing yet"} />
      <CardBody>
        {!digest ? (
          <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>{flags.length} metric{flags.length !== 1 ? "s" : ""} off-target. Run a briefing in Reports.</div>
        ) : (<>
          <div style={{ fontSize: 12, color: "var(--av3-muted)", marginBottom: 8 }}>{digest.agendaCount} metric{digest.agendaCount !== 1 ? "s" : ""} on the agenda · cost {zl(digest.costGrosze)}</div>
          {digest.decisions.length === 0 ? <div className="av3-cell-muted" style={{ fontSize: 12 }}>No decisions produced.</div> :
            digest.decisions.map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", alignItems: "flex-start" }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: "var(--av3-r-sm)", background: `color-mix(in oklab, var(${configById.get(d.owner)?.accentVar ?? "--av3-subtle"}) 16%, transparent)`, color: `var(${configById.get(d.owner)?.accentVar ?? "--av3-subtle"})` }}>{configById.get(d.owner)?.initials ?? "··"}</span>
                <span style={{ fontSize: 12.5, flex: 1 }}>{d.title}</span>
              </div>
            ))}
        </>)}
      </CardBody>
    </Card>
  );
}

function MonthlyCostCard({ stats }: { stats: FleetStats }) {
  return (
    <Card>
      <CardHead title="Monthly cost" description="AI spend, month-to-date" />
      <CardBody>
        <div className="av3-kpi-value">{zl(stats.costMonthGrosze)}</div>
        <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
          <div><div style={{ fontSize: 11, color: "var(--av3-subtle)" }}>Last 7 days</div><div style={{ fontFamily: "var(--av3-mono)", fontSize: 14 }}>{zl(stats.cost7dGrosze)}</div></div>
          <div><div style={{ fontSize: 11, color: "var(--av3-subtle)" }}>Runs (7d)</div><div style={{ fontFamily: "var(--av3-mono)", fontSize: 14 }}>{stats.runs7d}</div></div>
        </div>
      </CardBody>
    </Card>
  );
}

/* =============================== Agents (Console) ===================== */

interface ScData {
  stats: { runs7d: number; cost7dGrosze: number; successRate7d: number | null; lastRunAt: string | null };
  kpis: AgentKpi[];
  actuals: Record<string, { value: string; at: string; by: string }>;
}
type ConsoleTab = "overview" | "charter" | "scorecard" | "timeline" | "chat";

function Agents({ cmd, initialId, onConfigSaved }: { cmd: CommandPayload; initialId: string | null; onConfigSaved: (u: AgentConfig) => void }) {
  const [selId, setSelId] = useState<string>(initialId ?? cmd.configs[0]?.id ?? "");
  const [tab, setTab] = useState<ConsoleTab>("overview");
  const [editing, setEditing] = useState(false);
  const [scMap, setScMap] = useState<Record<string, ScData> | null>(null);
  const [tl, setTl] = useState<AgentEvent[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (initialId) { setSelId(initialId); setTab("overview"); setEditing(false); } }, [initialId]);

  const toolCatalog = useMemo(() => {
    const s = new Set<string>(); for (const c of cmd.configs) for (const t of c.toolNames) s.add(t); return [...s].sort();
  }, [cmd.configs]);
  const sel = cmd.configs.find((c) => c.id === selId) ?? cmd.configs[0] ?? null;

  // Per-agent stats + KPI actuals, one fetch for the whole console.
  useEffect(() => {
    fetch("/api/admin/ai/boardroom/scorecards").then((r) => (r.ok ? r.json() : null)).catch(() => null).then((res) => {
      const m: Record<string, ScData> = {};
      for (const s of (res?.scorecards ?? [])) m[s.id] = { stats: s.stats, kpis: s.kpis, actuals: s.actuals };
      setScMap(m);
    });
  }, []);

  // Timeline for the selected agent.
  useEffect(() => {
    if (!sel) return;
    setTl(null);
    fetch(`/api/admin/ai/boardroom/agents/${sel.id}/timeline`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((res) => setTl(res?.events ?? []));
  }, [sel?.id]);

  const pick = (id: string) => { setSelId(id); setTab("overview"); setEditing(false); };

  const logActual = useCallback(async (agentId: string, kpiId: string) => {
    const key = `${agentId}::${kpiId}`;
    const value = (drafts[key] ?? "").trim();
    if (!value) return;
    setBusy(key);
    const res = await fetch("/api/admin/ai/boardroom/scorecards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, kpi: kpiId, value }) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setBusy(null);
    if (res?.actual) {
      setScMap((m) => m ? { ...m, [agentId]: { ...m[agentId], actuals: { ...m[agentId].actuals, [kpiId]: { value: res.actual.value, at: res.actual.at, by: res.actual.by } } } } : m);
      setDrafts((d) => ({ ...d, [key]: "" }));
    }
  }, [drafts]);

  const ownedKpis = sel ? cmd.snapshot.kpis.filter((k) => k.owner === sel.id) : [];
  const sc = sel ? scMap?.[sel.id] : undefined;
  const TABS: ConsoleTab[] = ["overview", "charter", "scorecard", "timeline", "chat"];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 268px) minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
      {/* Left — agent list */}
      <Card style={{ position: "sticky", top: 14 }}>
        <CardHead title="Agents" description="Pick one to open" />
        <CardBody style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {cmd.configs.map((c) => (
            <button key={c.id} type="button" className={`av3-conv-row ${selId === c.id ? "is-active" : ""}`} onClick={() => pick(c.id)}>
              <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <Monogram initials={c.initials} accentVar={c.accentVar} size={28} />
                <span style={{ minWidth: 0, textAlign: "left" }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 600 }}>{c.name}</span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--av3-subtle)" }}>{c.title.split("—")[0].trim()}</span>
                </span>
              </span>
              <Badge tone={c.status === "active" ? "ok" : c.status === "paused" ? "warn" : "neutral"}>{c.status}</Badge>
            </button>
          ))}
        </CardBody>
      </Card>

      {/* Right — working panel */}
      {sel && (
        <Card>
          <CardHead
            title={<span style={{ display: "flex", alignItems: "center", gap: 9 }}><Monogram initials={sel.initials} accentVar={sel.accentVar} size={32} /> <span style={{ fontSize: 16 }}>{sel.name}</span> <Badge tone={sel.status === "active" ? "ok" : sel.status === "paused" ? "warn" : "neutral"}>{sel.status}</Badge></span>}
            description={`${sel.title} · ${sel.modelId ?? "global model"} · ${sel.authority} · effort ${sel.effort}`}
            actions={<Button variant={editing ? "secondary" : "primary"} size="sm" onClick={() => setEditing((e) => !e)}>{editing ? "Close editor" : "Edit"}</Button>}
          />
          {!editing && (
            <div style={{ padding: "12px 16px 0" }}>
              <div className="av3-filterchips">
                {TABS.map((t) => <button key={t} type="button" className={`av3-fchip ${tab === t ? "is-active" : ""}`} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
              </div>
            </div>
          )}
          <CardBody>
            {editing ? (
              <AgentEditForm key={sel.id} agentId={sel.id} configs={cmd.configs} toolCatalog={toolCatalog}
                onSaved={(u) => { onConfigSaved(u); setEditing(false); }} onClose={() => setEditing(false)} />
            ) : tab === "overview" ? (
              <ConsoleOverview sc={sc} ownedKpis={ownedKpis} tl={tl} />
            ) : tab === "charter" ? (
              <ConsoleCharter sel={sel} onPick={pick} configs={cmd.configs} />
            ) : tab === "scorecard" ? (
              <ConsoleScorecard sel={sel} sc={sc} drafts={drafts} setDrafts={setDrafts} busy={busy} onLog={logActual} />
            ) : tab === "timeline" ? (
              tl === null ? <SkeletonRows rows={4} /> : <TimelineList events={tl} />
            ) : (
              <ChatPanel personaId={sel.id} name={sel.name} suggestion={sel.mandate} gatewayConfigured={cmd.gatewayConfigured} />
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function successBar(sr: number | null) {
  return (
    <div style={{ height: 6, borderRadius: 999, background: "var(--av3-s3)", overflow: "hidden", marginTop: 7 }}>
      <div style={{ width: `${sr ?? 0}%`, height: "100%", background: sr == null ? "transparent" : sr >= 90 ? "var(--av3-ok)" : sr >= 70 ? "var(--av3-warn)" : "var(--av3-bad)" }} />
    </div>
  );
}
function SuccessRow({ sr }: { sr: number | null }) {
  return (<>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--av3-muted)", fontWeight: 600 }}>
      <span>Success rate · 7d</span><span style={{ color: sr == null ? "var(--av3-subtle)" : "var(--av3-fg)" }}>{sr == null ? "no runs" : `${sr}%`}</span>
    </div>{successBar(sr)}
  </>);
}
function statRail(sc: ScData | undefined) {
  return (
    <div style={{ ...RAIL, gridTemplateColumns: "repeat(4, 1fr)" }}>
      <StatTile label="Runs 7d" value={`${sc?.stats.runs7d ?? 0}`} accent="--av3-c3" />
      <StatTile label="Cost 7d" value={zl(sc?.stats.cost7dGrosze ?? 0)} accent="--av3-c5" />
      <StatTile label="Last run" value={timeAgo(sc?.stats.lastRunAt ?? null)} accent="--av3-c2" />
      <StatTile label="Success 7d" value={sc?.stats.successRate7d == null ? "—" : `${sc.stats.successRate7d}%`} accent="--av3-ok" />
    </div>
  );
}

function ConsoleOverview({ sc, ownedKpis, tl }: { sc: ScData | undefined; ownedKpis: BoardKpi[]; tl: AgentEvent[] | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {statRail(sc)}
      <div><SuccessRow sr={sc?.stats.successRate7d ?? null} /></div>
      <div>
        <SecLabel first>KPIs it answers for</SecLabel>
        {ownedKpis.length > 0 ? <div style={RAIL}>{ownedKpis.map((k) => <KpiTile key={k.id} k={k} />)}</div>
          : <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>Advisory agent — no owned P&amp;L metric. Targets + actuals live in the Scorecard tab.</div>}
      </div>
      <div>
        <SecLabel>Recent</SecLabel>
        {tl === null ? <SkeletonRows rows={3} /> : tl.length === 0 ? <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>No activity yet.</div> : <TimelineList events={tl.slice(0, 5)} />}
      </div>
    </div>
  );
}

function CharterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--av3-subtle)", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function ConsoleCharter({ sel, onPick, configs }: { sel: AgentConfig; onPick: (id: string) => void; configs: AgentConfig[] }) {
  const Row = CharterRow;
  const collabs = sel.collaborators.map((id) => configs.find((c) => c.id === id)).filter(Boolean) as AgentConfig[];
  return (
    <div>
      <Row label="Mandate">{sel.mandate}</Row>
      <Row label="Responsibilities"><ul style={{ margin: 0, paddingLeft: 16 }}>{sel.responsibilities.map((r, i) => <li key={i}>{r}</li>)}</ul></Row>
      <Row label="KPIs"><ul style={{ margin: 0, paddingLeft: 16 }}>{sel.kpis.map((k) => <li key={k.id}>{k.title}{k.target ? ` — target ${k.target}` : ""}</li>)}</ul></Row>
      <Row label="Tone & communication">{sel.tone}</Row>
      <Row label="Guardrails & ethics">{sel.guardrails}</Row>
      <Row label="Escalation threshold">{sel.escalationThreshold}</Row>
      <Row label="Tools"><span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{sel.toolNames.map((t) => <span key={t} className="av3-badge av3-badge-neutral" style={{ fontFamily: "var(--av3-mono)" }}>{t}</span>)}</span></Row>
      {collabs.length > 0 && (
        <Row label="Collaborators"><span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{collabs.map((c) => (
          <button key={c.id} type="button" className="av3-conv-row" style={{ width: "auto", padding: "5px 9px", display: "inline-flex", gap: 7 }} onClick={() => onPick(c.id)}>
            <Monogram initials={c.initials} accentVar={c.accentVar} size={20} /><span style={{ fontSize: 12.5 }}>{c.name}</span>
          </button>))}</span></Row>
      )}
      <details>
        <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--av3-subtle)" }}>Live system prompt — exactly what it runs on</summary>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 11.5, lineHeight: 1.55, fontFamily: "var(--av3-mono)", background: "var(--av3-s2)", border: "1px solid var(--av3-line)", borderRadius: "var(--av3-r-md)", padding: 12, marginTop: 8, maxHeight: 340, overflow: "auto" }}>{buildLiveSystemPrompt(sel)}</pre>
      </details>
    </div>
  );
}

function ConsoleScorecard({ sel, sc, drafts, setDrafts, busy, onLog }: {
  sel: AgentConfig; sc: ScData | undefined; drafts: Record<string, string>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>; busy: string | null; onLog: (a: string, k: string) => void;
}) {
  const kpis = sc?.kpis ?? sel.kpis;
  return (
    <div>
      <SuccessRow sr={sc?.stats.successRate7d ?? null} />
      <div style={{ marginTop: 14 }}>{statRail(sc)}</div>
      <SecLabel>KPIs — target vs actual</SecLabel>
      {kpis.length === 0 ? <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>No KPI targets set — add them in the editor.</div> :
        kpis.map((kpi, i) => {
          const key = `${sel.id}::${kpi.id}`;
          const actual = sc?.actuals[kpi.id];
          return (
            <div key={kpi.id} style={{ padding: "10px 0", borderTop: i > 0 ? "1px solid var(--av3-line)" : "none" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{kpi.title}{kpi.target ? <span style={{ fontWeight: 400, color: "var(--av3-subtle)" }}>  ·  target {kpi.target}</span> : null}</div>
              <div style={{ fontSize: 12, color: actual ? "var(--av3-fg)" : "var(--av3-subtle)", marginTop: 3 }}>
                {actual ? <>actual: <span style={{ fontFamily: "var(--av3-mono)" }}>{actual.value}</span> <span style={{ color: "var(--av3-subtle)" }}>· {timeAgo(actual.at)} · {actual.by}</span></> : "no actual logged"}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                <input className="av3-input" placeholder="log actual…" value={drafts[key] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onLog(sel.id, kpi.id); } }} style={{ flex: 1 }} />
                <Button variant="secondary" size="sm" loading={busy === key} disabled={!(drafts[key] ?? "").trim()} onClick={() => onLog(sel.id, kpi.id)}>Log</Button>
              </div>
            </div>
          );
        })}
    </div>
  );
}

function TimelineList({ events }: { events: AgentEvent[] }) {
  if (events.length === 0) return <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>No history yet.</div>;
  return (<>
    {events.map((e, i) => (
      <div key={e.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < events.length - 1 ? "1px solid var(--av3-line)" : "none", alignItems: "flex-start" }}>
        <Badge tone={TONE[e.type] ?? "neutral"}>{e.type}</Badge>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5 }}>{e.summary}{typeof e.costGrosze === "number" && e.costGrosze > 0 ? ` · ${zl(e.costGrosze)}` : ""}</div>
          {e.detail && <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{e.detail}</div>}
          <div style={{ fontSize: 11, color: "var(--av3-subtle)", marginTop: 3, fontFamily: "var(--av3-mono)" }}>{new Date(e.at).toLocaleString("pl-PL")} · {e.actor}</div>
        </div>
      </div>
    ))}
  </>);
}

/* ============================== Scorecards ============================= */

interface ScCard {
  id: string; name: string; title: string; initials: string; accentVar: string;
  status: "active" | "paused" | "draft"; authority: string; modelId: string | null; kpis: AgentKpi[];
  stats: { runs7d: number; cost7dGrosze: number; successRate7d: number | null; lastRunAt: string | null };
  actuals: Record<string, { value: string; at: string; by: string }>;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function Scorecards() {
  const [cards, setCards] = useState<ScCard[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/ai/boardroom/scorecards").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setCards(res?.scorecards ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const log = useCallback(async (agentId: string, kpi: string) => {
    const key = `${agentId}::${kpi}`;
    const value = (drafts[key] ?? "").trim();
    if (!value) return;
    setBusy(key);
    const res = await fetch("/api/admin/ai/boardroom/scorecards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, kpi, value }) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setBusy(null);
    if (res?.actual) {
      setCards((prev) => prev?.map((c) => c.id === agentId ? { ...c, actuals: { ...c.actuals, [kpi]: { value: res.actual.value, at: res.actual.at, by: res.actual.by } } } : c) ?? prev);
      setDrafts((d) => ({ ...d, [key]: "" }));
    }
  }, [drafts]);

  if (cards === null) return <Card padding="default"><SkeletonRows rows={8} /></Card>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 14, alignItems: "start" }}>
      {cards.map((c) => {
        const pct = c.stats.successRate7d;
        return (
          <Card key={c.id} padding="default">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ marginTop: 6 }}><StatusDot status={c.status === "active" ? "green" : c.status === "paused" ? "yellow" : "neutral"} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--av3-display)", fontSize: 17, fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)", marginTop: 1 }}>{c.title.split("—")[0].trim()} · {c.modelId ?? "global"}</div>
              </div>
              <Badge tone="brand">{c.authority}</Badge>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--av3-subtle)", fontWeight: 600 }}>
                <span>Success rate (7d)</span>
                <span style={{ color: pct == null ? "var(--av3-subtle)" : "var(--av3-fg)" }}>{pct == null ? "no runs" : `${pct}%`}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "var(--av3-s3)", overflow: "hidden", marginTop: 7 }}>
                <div style={{ width: `${pct ?? 0}%`, height: "100%", background: pct == null ? "transparent" : pct >= 90 ? "var(--av3-ok)" : pct >= 70 ? "var(--av3-warn)" : "var(--av3-bad)" }} />
              </div>
            </div>

            <div style={{ ...RAIL, gridTemplateColumns: "repeat(3, 1fr)", marginTop: 14 }}>
              <StatTile label="Runs 7d" value={`${c.stats.runs7d}`} />
              <StatTile label="Cost 7d" value={zl(c.stats.cost7dGrosze)} />
              <StatTile label="Last run" value={timeAgo(c.stats.lastRunAt)} />
            </div>

            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--av3-platinum)", fontWeight: 700, margin: "20px 0 10px" }}>KPIs — target vs actual</div>
            {c.kpis.length === 0 ? (
              <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>No KPI targets set. Add them in the Agents editor.</div>
            ) : c.kpis.map((kpi, i) => {
              const key = `${c.id}::${kpi.id}`;
              const actual = c.actuals[kpi.id];
              return (
                <div key={kpi.id} style={{ padding: "10px 0", borderTop: i > 0 ? "1px solid var(--av3-line)" : "none" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{kpi.title}{kpi.target ? <span style={{ fontWeight: 400, color: "var(--av3-subtle)" }}>  ·  target {kpi.target}</span> : null}</div>
                  <div style={{ fontSize: 12, color: actual ? "var(--av3-fg)" : "var(--av3-subtle)", marginTop: 3 }}>
                    {actual ? <>actual: <span style={{ fontFamily: "var(--av3-mono)" }}>{actual.value}</span> <span style={{ color: "var(--av3-subtle)" }}>· {timeAgo(actual.at)} · {actual.by}</span></> : "no actual logged"}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                    <input className="av3-input" placeholder="log actual…" value={drafts[key] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void log(c.id, kpi.id); } }} style={{ flex: 1 }} />
                    <Button variant="secondary" size="sm" loading={busy === key} disabled={!(drafts[key] ?? "").trim()} onClick={() => void log(c.id, kpi.id)}>Log</Button>
                  </div>
                </div>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
}

/* ================================ Work ================================= */

interface WorkItem { id: string; title: string; prompt: string; agentId: string | null; status: string; createdAt: string; completedAt?: string; costGrosze?: number; resultSummary?: string }

function WorkBoard({ configs, gatewayConfigured }: { configs: AgentConfig[]; gatewayConfigured: boolean }) {
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const cfg = useMemo(() => new Map<string, AgentConfig>(configs.map((c) => [c.id, c])), [configs]);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/ai/boardroom/work").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setItems(res?.items ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = useCallback(async () => {
    if (!title.trim() || !prompt.trim()) return;
    setBusy("create");
    await fetch("/api/admin/ai/boardroom/work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, prompt, agentId: assignTo || null }) }).catch(() => null);
    setTitle(""); setPrompt(""); setAssignTo(""); setBusy(null); load();
  }, [title, prompt, assignTo, load]);

  const assign = useCallback(async (id: string, agentId: string | null) => {
    await fetch(`/api/admin/ai/boardroom/work/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId }) }).catch(() => null);
    load();
  }, [load]);

  const run = useCallback(async (id: string) => {
    setBusy(id);
    await fetch(`/api/admin/ai/boardroom/work/${id}/run`, { method: "POST" }).catch(() => null);
    setBusy(null); load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    await fetch(`/api/admin/ai/boardroom/work/${id}`, { method: "DELETE" }).catch(() => null);
    load();
  }, [load]);

  const setStatus = useCallback(async (id: string, status: string) => {
    await fetch(`/api/admin/ai/boardroom/work/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).catch(() => null);
    load();
  }, [load]);

  const activeAgents = configs.filter((c) => c.status === "active");
  if (items === null) return <Card padding="default"><SkeletonRows rows={6} /></Card>;

  const unassigned = items.filter((w) => w.status === "unassigned");
  const queued = items.filter((w) => w.status === "queued" || w.status === "running");
  const recent = items.filter((w) => w.status === "done" || w.status === "failed").slice(0, 12);

  const card = (w: WorkItem, opts?: { run?: boolean }) => (
    <Card key={w.id} padding="compact" draggable onDragStart={() => setDragId(w.id)} onDragEnd={() => setDragId(null)}
      style={{ marginBottom: 8, cursor: "grab" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{w.title}</div>
          <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{w.resultSummary || w.prompt}</div>
        </div>
        {w.agentId && <Monogram initials={cfg.get(w.agentId)?.initials ?? "··"} accentVar={cfg.get(w.agentId)?.accentVar ?? "--av3-subtle"} size={24} />}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 9, alignItems: "center", flexWrap: "wrap" }}>
        <Badge tone={w.status === "done" ? "ok" : w.status === "failed" ? "bad" : w.status === "running" ? "warn" : "info"}>{w.status}</Badge>
        {typeof w.costGrosze === "number" && w.costGrosze > 0 && <span style={{ fontSize: 10.5, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)" }}>{zl(w.costGrosze)}</span>}
        {/* Keyboard-accessible (re)assign — the no-drag path. */}
        <select className="av3-select" aria-label="Assign to agent" value={w.agentId ?? ""} style={{ height: 26, fontSize: 11.5, maxWidth: 130 }}
          onChange={(e) => assign(w.id, e.target.value || null)}>
          <option value="">Unassigned</option>
          {activeAgents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {(w.status === "done" || w.status === "failed") && <Button variant="secondary" size="sm" onClick={() => setStatus(w.id, "queued")}>Re-queue</Button>}
          {opts?.run && w.agentId && <Button variant="primary" size="sm" loading={busy === w.id} disabled={!gatewayConfigured} onClick={() => run(w.id)}><Play className="av3-btn-ico" /> Run</Button>}
          <button className="av3-iconbtn-sm" title="Delete" onClick={() => remove(w.id)}><Trash2 style={{ width: 13, height: 13 }} /></button>
        </span>
      </div>
    </Card>
  );

  return (
    <>
      <Card>
        <CardHead title="Assign work" description="Create a task and drag it onto an agent — or pick one here. It runs on the agent's live config." />
        <CardBody>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input className="av3-input" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <select className="av3-select" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">Leave unassigned (drag later)</option>
              {configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <textarea className="av3-input" placeholder="What should the agent do?" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ width: "100%", marginTop: 10, fontFamily: "var(--av3-ui)" }} />
          <div style={{ marginTop: 10 }}><Button variant="primary" loading={busy === "create"} disabled={!title.trim() || !prompt.trim()} onClick={create}><Plus className="av3-btn-ico" /> Add work</Button></div>
        </CardBody>
      </Card>

      <SecLabel>Drop onto an agent to assign</SecLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {configs.filter((c) => c.status === "active").map((c) => (
          <Card key={c.id} padding="none"
            onDragOver={(e) => { if (dragId) e.preventDefault(); }}
            onDrop={() => { if (dragId) { assign(dragId, c.id); setDragId(null); } }}
            style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, borderStyle: dragId ? "dashed" : "solid", borderColor: dragId ? "var(--av3-brand-line)" : "var(--av3-line)" }}>
            <Monogram initials={c.initials} accentVar={c.accentVar} size={24} /><span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name}</span>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 18, alignItems: "start" }}>
        <div onDragOver={(e) => { if (dragId) e.preventDefault(); }} onDrop={() => { if (dragId) { assign(dragId, null); setDragId(null); } }}>
          <SecLabel first>Unassigned ({unassigned.length})</SecLabel>
          {unassigned.length === 0 ? <div className="av3-cell-muted" style={{ fontSize: 12 }}>Drop here to unassign.</div> : unassigned.map((w) => card(w))}
        </div>
        <div>
          <SecLabel first>Queued ({queued.length})</SecLabel>
          {queued.length === 0 ? <div className="av3-cell-muted" style={{ fontSize: 12 }}>Nothing queued.</div> : queued.map((w) => card(w, { run: true }))}
        </div>
        <div>
          <SecLabel first>Recent ({recent.length})</SecLabel>
          {recent.length === 0 ? <div className="av3-cell-muted" style={{ fontSize: 12 }}>No completed work yet.</div> : recent.map((w) => card(w))}
        </div>
      </div>
    </>
  );
}

/* ============================== Approvals ============================== */

interface ApprovalRow { meetingId: string; index: number; createdAt: string; title: string; owner: string; rationale: string; proposedTool?: string }

function Approvals({ configById, onAction }: { configById: Map<string, AgentConfig>; onAction: (owner: string, text: string) => void }) {
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { fetch("/api/admin/ai/boardroom/approvals").then((r) => (r.ok ? r.json() : null)).catch(() => null).then((res) => setRows(res?.approvals ?? [])); }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = useCallback(async (a: ApprovalRow, status: "executed" | "dismissed") => {
    const key = `${a.meetingId}-${a.index}`; setBusy(key);
    await fetch("/api/admin/ai/boardroom/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meetingId: a.meetingId, index: a.index, status }) }).catch(() => null);
    setBusy(null); load();
  }, [load]);

  if (rows === null) return <Card padding="default"><SkeletonRows rows={4} /></Card>;
  return (
    <Card>
      <CardHead title="Pending approvals" description="Gated actions agents proposed. Action runs it via the owning agent (preview → approve → execute → audit); Mark done / Dismiss clear the queue." />
      <CardBody>
        {rows.length === 0 ? (
          <div className="av3-empty" style={{ padding: "26px 0" }}><Check aria-hidden /><div className="av3-empty-title">Nothing awaiting you</div><div className="av3-empty-text">Gated actions from meetings queue here.</div></div>
        ) : rows.map((a, i) => {
          const owner = configById.get(a.owner); const key = `${a.meetingId}-${a.index}`;
          return (
            <div key={key} style={{ display: "flex", gap: 11, padding: "12px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--av3-line)" : "none", alignItems: "flex-start" }}>
              {owner && <Monogram initials={owner.initials} accentVar={owner.accentVar} size={28} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</div>
                {a.rationale && <div className="av3-cell-muted" style={{ fontSize: 12, marginTop: 2 }}>{a.rationale}</div>}
                <div style={{ fontSize: 11, marginTop: 4, fontFamily: "var(--av3-mono)", color: "var(--av3-subtle)" }}>{a.proposedTool} · {owner?.name ?? a.owner} · {new Date(a.createdAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Button variant="primary" size="sm" onClick={() => onAction(a.owner, `Let's action this board decision: ${a.title}. ${a.proposedTool ? `(${a.proposedTool})` : ""} Walk me through it and prepare the change for my approval.`)}>Action <ChevronRight className="av3-btn-ico" /></Button>
                <Button variant="secondary" size="sm" loading={busy === key} onClick={() => setStatus(a, "executed")}>Mark done</Button>
                <Button variant="ghost" size="sm" disabled={busy === key} onClick={() => setStatus(a, "dismissed")}>Dismiss</Button>
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

/* ================================ Inbox =============================== */

function Inbox({ configs, gatewayConfigured, selectedId, onSelect, seed, onSeedConsumed }: {
  configs: AgentConfig[]; gatewayConfigured: boolean; selectedId: string | null;
  onSelect: (id: string) => void; seed: { agentId: string; text: string } | null; onSeedConsumed: () => void;
}) {
  const effectiveId = selectedId ?? configs[0]?.id ?? null;
  const selected = effectiveId === "team" ? null : configs.find((c) => c.id === effectiveId) ?? null;
  const cfg = useMemo(() => new Map<string, AgentConfig>(configs.map((c) => [c.id, c])), [configs]);
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
              const a = cfg.get(e.agentId);
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
        <Card><CardBody style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {configs.map((c) => (
            <button key={c.id} type="button" className={`av3-conv-row ${effectiveId === c.id ? "is-active" : ""}`} onClick={() => onSelect(c.id)}>
              <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <Monogram initials={c.initials} accentVar={c.accentVar} size={26} />
                <span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 12.5, fontWeight: 600 }}>{c.name}</span><span style={{ display: "block", fontSize: 11, color: "var(--av3-subtle)" }}>{c.status === "active" ? c.authority : c.status}</span></span>
              </span>
            </button>
          ))}
          <button type="button" className={`av3-conv-row ${effectiveId === "team" ? "is-active" : ""}`} onClick={() => onSelect("team")}>
            <span style={{ display: "flex", alignItems: "center", gap: 9 }}><Users style={{ width: 26, height: 26, padding: 5, color: "var(--av3-subtle)" }} /><span style={{ fontSize: 12.5, fontWeight: 600 }}>Whole team</span></span>
          </button>
        </CardBody></Card>
        <div>
          <Card><CardHead
            title={selected ? selected.name : "Whole team"}
            description={selected ? selected.title : "A generalist board assistant for cross-functional questions."}
          /></Card>
          <ChatPanel personaId={selected?.id ?? null} name={selected ? selected.name : "the team"} suggestion={selected ? selected.mandate : "Ask the whole team anything about the business."} gatewayConfigured={gatewayConfigured} seed={seed && seed.agentId === effectiveId ? seed.text : null} onSeedConsumed={onSeedConsumed} />
        </div>
      </div>
    </>
  );
}

/* =============================== Reports ============================== */

interface Decision { title: string; owner: string; rationale: string; proposedTool?: string; status?: string }
interface Contribution { persona: string; text: string }
interface Meeting { id: string; type: "daily" | "weekly"; scope: string; agenda: string[]; contributions: Contribution[]; decisions: Decision[]; costGrosze: number; createdAt: string }

function Reports({ configById, gatewayConfigured, onRan }: { configById: Map<string, AgentConfig>; gatewayConfigured: boolean; onRan: () => void }) {
  const { location } = useAdminLocationV3();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [running, setRunning] = useState<null | "daily" | "weekly">(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectNewest = false) => {
    const res = await fetch("/api/admin/ai/boardroom/meeting").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const list: Meeting[] = res?.meetings ?? [];
    setMeetings(list);
    setActiveId((prev) => (selectNewest && list[0] ? list[0].id : prev ?? list[0]?.id ?? null));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = useCallback(async (type: "daily" | "weekly") => {
    setRunning(type); setError(null);
    const qs = location ? `?location=${encodeURIComponent(location)}` : "";
    const res = await fetch(`/api/admin/ai/boardroom/meeting${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j }))).catch(() => ({ ok: false, j: { error: "Network error" } }));
    setRunning(null);
    if (!res.ok) setError((res.j as { error?: string }).error ?? "Meeting failed."); else { load(true); onRan(); }
  }, [location, load, onRan]);

  const active = meetings?.find((m) => m.id === activeId) ?? null;
  const label = (id: string) => configById.get(id)?.name ?? id;

  if (meetings === null) return <Card padding="default"><SkeletonRows rows={5} /></Card>;

  return (
    <>
      <Card>
        <CardHead title="Reports" description="Daily briefings & weekly reviews — a real multi-agent meeting on live numbers, with transcript, decisions and spend." />
        <CardBody>
          {gatewayConfigured ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="primary" loading={running === "daily"} disabled={!!running} onClick={() => run("daily")}><Sparkles className="av3-btn-ico" /> Run daily briefing</Button>
              <Button variant="secondary" loading={running === "weekly"} disabled={!!running} onClick={() => run("weekly")}><LineChart className="av3-btn-ico" /> Run weekly review</Button>
            </div>
          ) : <div className="av3-cell-muted" style={{ fontSize: 12 }}>Set <span style={{ fontFamily: "var(--av3-mono)" }}>ANTHROPIC_API_KEY</span> to convene the board.</div>}
          {running && <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 8 }}>The board is deliberating — each active executive weighs in, then converges on decisions. ~20–40s.</div>}
          {error && <div className="av3-chat-error" style={{ marginTop: 8 }}>{error}</div>}
        </CardBody>
      </Card>

      {meetings.length === 0 ? (
        <Card><CardBody><div className="av3-empty" style={{ padding: "26px 0" }}><Users aria-hidden /><div className="av3-empty-title">No reports yet</div><div className="av3-empty-text">Run a daily briefing or weekly review.</div></div></CardBody></Card>
      ) : (<>
        <div className="av3-filterchips" style={{ marginTop: 12 }}>
          {meetings.map((m) => <button key={m.id} type="button" className={`av3-fchip ${activeId === m.id ? "is-active" : ""}`} onClick={() => setActiveId(m.id)}>{m.type === "daily" ? "Daily" : "Weekly"} · {new Date(m.createdAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</button>)}
        </div>
        {active && (
          <Card style={{ marginTop: 12 }}>
            <CardHead
              title={`${active.type === "daily" ? "Daily briefing" : "Weekly review"} — ${active.scope === "all" ? "All locations" : active.scope}`}
              description={`${new Date(active.createdAt).toLocaleString("pl-PL")} · session cost ${zl(active.costGrosze)}`}
              actions={<span style={{ display: "flex", gap: 6 }}>
                <Button variant="ghost" size="sm" onClick={() => exportCsv(active, label)}><FileDown className="av3-btn-ico" /> CSV</Button>
                <Button variant="ghost" size="sm" onClick={() => exportPdf(active, label)}><Printer className="av3-btn-ico" /> PDF</Button>
              </span>}
            />
            <CardBody>
              {active.agenda.length > 0 && <div style={{ fontSize: 12, color: "var(--av3-muted)", marginBottom: 12 }}><strong style={{ color: "var(--av3-fg)" }}>Agenda:</strong> {active.agenda.length} off-target metric{active.agenda.length > 1 ? "s" : ""}.</div>}
              {active.contributions.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 11, padding: "12px 0", borderBottom: i < active.contributions.length - 1 ? "1px solid var(--av3-line)" : "none" }}>
                  <Monogram initials={configById.get(c.persona)?.initials ?? "··"} accentVar={configById.get(c.persona)?.accentVar ?? "--av3-subtle"} size={30} />
                  <div><div style={{ fontSize: 11, fontWeight: 700, color: `var(${configById.get(c.persona)?.accentVar ?? "--av3-subtle"})` }}>{label(c.persona)}</div><div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 2 }}>{c.text}</div></div>
                </div>
              ))}
              {active.decisions.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Decisions</div>
                  {active.decisions.map((d, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", alignItems: "flex-start" }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: "var(--av3-r-sm)", background: `color-mix(in oklab, var(${configById.get(d.owner)?.accentVar ?? "--av3-subtle"}) 16%, transparent)`, color: `var(${configById.get(d.owner)?.accentVar ?? "--av3-subtle"})` }}>{configById.get(d.owner)?.initials ?? "··"}</span>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{d.title}</div>{d.rationale && <div className="av3-cell-muted" style={{ fontSize: 12, marginTop: 2 }}>{d.rationale}</div>}{d.proposedTool && <div style={{ fontSize: 11, marginTop: 3, fontFamily: "var(--av3-mono)", color: "var(--av3-subtle)" }}>{d.proposedTool}</div>}</div>
                      {d.status && d.status !== "proposed" && <Badge tone={d.status === "dismissed" ? "neutral" : "ok"}>{d.status}</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        )}
      </>)}
    </>
  );
}

/* =============================== Settings ============================= */

interface FleetSettings { dailyBudgetGrosze: number | null; autoBriefing: boolean; briefingTime: string }

function SettingsSection() {
  const [settings, setSettings] = useState<FleetSettings | null>(null);
  const [effectiveBudget, setEffectiveBudget] = useState(0);
  const [todaySpend, setTodaySpend] = useState(0);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/ai/boardroom/settings").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (res?.settings) {
      setSettings(res.settings);
      setEffectiveBudget(res.effectiveBudgetGrosze ?? 0);
      setTodaySpend(res.todaySpendGrosze ?? 0);
      setBudgetDraft(res.settings.dailyBudgetGrosze == null ? "" : (res.settings.dailyBudgetGrosze / 100).toString());
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patch = useCallback(async (body: Partial<FleetSettings>, flash = false) => {
    setSaving(true);
    const res = await fetch("/api/admin/ai/boardroom/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setSaving(false);
    if (res?.settings) { setSettings(res.settings); setEffectiveBudget(res.effectiveBudgetGrosze ?? 0); }
    if (flash) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  }, []);

  if (!settings) return <Card padding="default"><SkeletonRows rows={5} /></Card>;

  const budgetPct = effectiveBudget > 0 ? Math.min(100, Math.round((todaySpend / effectiveBudget) * 100)) : 0;
  const saveBudget = () => {
    const t = budgetDraft.trim();
    const grosze = t === "" ? null : Math.max(0, Math.round(Number(t) * 100));
    void patch({ dailyBudgetGrosze: Number.isFinite(grosze as number) || grosze === null ? grosze : settings.dailyBudgetGrosze }, true);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14, alignItems: "start" }}>
      <Card>
        <CardHead title="AI model" description="The model the whole fleet runs on. Per-agent overrides inherit this when set to “Global model”." />
        <CardBody><AiModelControl /></CardBody>
      </Card>

      <Card>
        <CardHead title="Daily AI budget" description="Fleet-wide spend ceiling. Every agent run, meeting and work item is gated by it." />
        <CardBody>
          <div className="av3-kpi-value" style={{ marginBottom: 4 }}>{zl(todaySpend)} <span style={{ fontSize: 13, color: "var(--av3-subtle)" }}>/ {zl(effectiveBudget)} today</span></div>
          <div style={{ height: 6, borderRadius: 999, background: "var(--av3-s3)", overflow: "hidden", margin: "8px 0 16px" }}>
            <div style={{ width: `${budgetPct}%`, height: "100%", background: budgetPct >= 90 ? "var(--av3-bad)" : budgetPct >= 70 ? "var(--av3-warn)" : "var(--av3-ok)" }} />
          </div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--av3-subtle)", fontWeight: 600, marginBottom: 5 }}>Daily cap (PLN)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="av3-input" value={budgetDraft} onChange={(e) => setBudgetDraft(e.target.value)} placeholder="blank = env / default" style={{ flex: 1 }} />
            <Button variant="primary" loading={saving} onClick={saveBudget}>Save</Button>
          </div>
          <div style={{ fontSize: 11, color: "var(--av3-subtle)", marginTop: 6 }}>Blank uses <span style={{ fontFamily: "var(--av3-mono)" }}>AI_DAILY_BUDGET_GROSZE</span> (or the 1000 PLN default).</div>
          {saved && <div style={{ marginTop: 8 }}><Badge tone="ok">Saved</Badge></div>}
        </CardBody>
      </Card>

      <Card>
        <CardHead title="Automation" description="Fleet-wide scheduling defaults." />
        <CardBody>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Auto daily briefing</div>
              <div style={{ fontSize: 11.5, color: "var(--av3-subtle)", marginTop: 2 }}>The briefing cron convenes the board each morning.</div>
            </div>
            <Switch checked={settings.autoBriefing} onChange={(v) => void patch({ autoBriefing: v })} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid var(--av3-line)" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Briefing time</div>
            <input type="time" className="av3-input" value={settings.briefingTime} onChange={(e) => setSettings({ ...settings, briefingTime: e.target.value })} onBlur={(e) => void patch({ briefingTime: e.target.value })} style={{ width: 130 }} />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------- exports -------------------------------- */

function downloadBlob(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvCell(s: string) { return `"${String(s).replace(/"/g, '""')}"`; }

function exportCsv(m: Meeting, label: (id: string) => string) {
  const rows: string[] = ["Section,Agent,Content"];
  for (const c of m.contributions) rows.push([csvCell("Contribution"), csvCell(label(c.persona)), csvCell(c.text)].join(","));
  for (const d of m.decisions) rows.push([csvCell("Decision"), csvCell(label(d.owner)), csvCell(`${d.title}${d.rationale ? ` — ${d.rationale}` : ""}${d.proposedTool ? ` [${d.proposedTool}]` : ""}`)].join(","));
  const date = new Date(m.createdAt).toISOString().slice(0, 10);
  downloadBlob(`agent-hq-${m.type}-${date}.csv`, "text/csv", rows.join("\n"));
}

function exportPdf(m: Meeting, label: (id: string) => string) {
  const date = new Date(m.createdAt).toLocaleString("pl-PL");
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${m.type} report</title>
    <style>body{font:13px/1.6 Georgia,serif;color:#1a1714;max-width:720px;margin:32px auto;padding:0 20px}
    h1{font-size:20px}h2{font-size:14px;margin-top:24px;border-bottom:1px solid #ccc;padding-bottom:4px}
    .a{font-weight:700;margin-top:14px}.m{color:#666;font-size:12px}</style></head><body>
    <h1>${m.type === "daily" ? "Daily briefing" : "Weekly review"} — ${esc(m.scope === "all" ? "All locations" : m.scope)}</h1>
    <div class="m">${date} · session cost ${(m.costGrosze / 100).toFixed(2)} zł · agenda: ${m.agenda.length} off-target</div>
    <h2>Transcript</h2>${m.contributions.map((c) => `<div class="a">${esc(label(c.persona))}</div><div>${esc(c.text)}</div>`).join("")}
    <h2>Decisions</h2>${m.decisions.length ? m.decisions.map((d) => `<div class="a">${esc(label(d.owner))} — ${esc(d.title)}</div><div>${esc(d.rationale || "")}${d.proposedTool ? ` <em>[${esc(d.proposedTool)}]</em>` : ""}</div>`).join("") : "<div>None.</div>"}
    </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 350);
}
