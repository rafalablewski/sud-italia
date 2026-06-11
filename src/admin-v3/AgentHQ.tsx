"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Bot, Check, ChevronRight, FileDown,
  LineChart, Play, Plus, Printer, RefreshCw, Sparkles, Trash2, Users,
} from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Card, CardBody, CardHead, SkeletonRows } from "./ui";
import { AiModelControl } from "./AiModelControl";
import {
  Monogram, StatusDot, KpiTile, StatTile, SecLabel, ChatPanel, RAIL,
  type BoardKpi, type KpiStatus,
} from "./agent-hq/shared";
import { AgentEditForm } from "./agent-hq/AgentEditForm";
import { CADENCE_OPTIONS, type AgentConfig } from "@/lib/ai/boardroom/agent-config";

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
 * Individual agents live on their own pages (/admin/agent-hq/[id]).
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

type SectionId = "command" | "scorecards" | "work" | "approvals" | "inbox" | "reports";
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "command", label: "Command center" },
  { id: "scorecards", label: "Scorecards" },
  { id: "work", label: "Work" },
  { id: "approvals", label: "Approvals" },
  { id: "inbox", label: "Inbox" },
  { id: "reports", label: "Reports" },
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

  const openChat = useCallback((agentId: string, text?: string) => {
    setInboxSel(agentId);
    if (text) setSeed({ agentId, text });
    setSection("inbox");
  }, []);

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
        <div className="av3-card" style={{ padding: 14 }}><SkeletonRows rows={8} /></div>
      ) : !cmd ? (
        <Card><CardBody>Could not load Agent HQ.</CardBody></Card>
      ) : section === "command" ? (
        <CommandCenter cmd={cmd} configById={configById} />
      ) : section === "scorecards" ? (
        <Scorecards cmd={cmd} onConfigSaved={(u) => setCmd((prev) => (prev ? { ...prev, configs: prev.configs.map((c) => (c.id === u.id ? u : c)) } : prev))} />
      ) : section === "work" ? (
        <WorkBoard configs={cmd.configs} gatewayConfigured={gatewayConfigured} />
      ) : section === "approvals" ? (
        <Approvals configById={configById} onAction={(owner, text) => openChat(owner, text)} />
      ) : section === "inbox" ? (
        <Inbox configs={cmd.configs} gatewayConfigured={gatewayConfigured} selectedId={inboxSel} onSelect={setInboxSel} seed={seed} onSeedConsumed={() => setSeed(null)} />
      ) : (
        <Reports configById={configById} gatewayConfigured={gatewayConfigured} onRan={load} />
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

function CommandCenter({ cmd, configById }: { cmd: CommandPayload; configById: Map<string, AgentConfig> }) {
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

      <div style={{ marginTop: 16 }}><AiModelControl /></div>

      {sales.length > 0 && (<><SecLabel>Sales &amp; growth</SecLabel><div style={RAIL}>{sales.map((k) => <KpiTile key={k.id} k={k} />)}</div></>)}
      {cost.length > 0 && (<><SecLabel>Cost &amp; quality</SecLabel><div style={RAIL}>{cost.map((k) => <KpiTile key={k.id} k={k} />)}</div></>)}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 22, alignItems: "start" }}>
        <OrgCard configs={cmd.configs} statusById={new Map(cmd.agents.map((a) => [a.id, a]))} />
        <ActivityCard runsByDay7d={s.runsByDay7d} />
        <RecentActivityCard events={cmd.recentActivity} configById={configById} />
        <UpcomingWorkCard work={cmd.upcomingWork} scheduled={cmd.scheduled} configById={configById} />
        <DigestCard digest={cmd.dailyDigest} configById={configById} flags={cmd.snapshot.flags} />
        <MonthlyCostCard stats={s} />
      </div>
    </>
  );
}

function OrgCard({ configs, statusById }: { configs: AgentConfig[]; statusById: Map<string, StatusRow> }) {
  const kids = (id: string | null) => configs.filter((c) => c.reportsTo === id);
  const rowFor = (c: AgentConfig, d: number): React.ReactNode => (
    <div key={c.id}>
      <Link href={`/admin/agent-hq/${c.id}`} className="av3-conv-row" style={{ marginLeft: d * 20, width: `calc(100% - ${d * 20}px)` }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {d > 0 && <span style={{ color: "var(--av3-subtle)" }}>↳</span>}
          <Monogram initials={c.initials} accentVar={c.accentVar} size={22} />
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name}</span>
          <span style={{ fontSize: 11, color: "var(--av3-subtle)" }}>{c.title.split("—")[0].trim()}</span>
        </span>
        <StatusDot status={statusById.get(c.id)?.status ?? "neutral"} />
      </Link>
      {kids(c.id).map((k) => rowFor(k, d + 1))}
    </div>
  );
  return (
    <Card>
      <CardHead title="Org & reporting" description="Click an agent for its dedicated panel" />
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
        <div style={{ fontFamily: "var(--av3-display)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.01em" }}>{zl(stats.costMonthGrosze)}</div>
        <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
          <div><div style={{ fontSize: 11, color: "var(--av3-subtle)" }}>Last 7 days</div><div style={{ fontFamily: "var(--av3-mono)", fontSize: 14 }}>{zl(stats.cost7dGrosze)}</div></div>
          <div><div style={{ fontSize: 11, color: "var(--av3-subtle)" }}>Runs (7d)</div><div style={{ fontFamily: "var(--av3-mono)", fontSize: 14 }}>{stats.runs7d}</div></div>
        </div>
      </CardBody>
    </Card>
  );
}

/* ============================== Scorecards ============================= */

function Scorecards({ cmd, onConfigSaved }: { cmd: CommandPayload; onConfigSaved: (u: AgentConfig) => void }) {
  const [selId, setSelId] = useState<string>(cmd.configs[0]?.id ?? "");
  const toolCatalog = useMemo(() => {
    const s = new Set<string>(); for (const c of cmd.configs) for (const t of c.toolNames) s.add(t); return [...s].sort();
  }, [cmd.configs]);
  const sel = cmd.configs.find((c) => c.id === selId) ?? cmd.configs[0] ?? null;
  const owned = (id: string) => cmd.snapshot.kpis.filter((k) => k.owner === id);
  const spend = (id: string) => cmd.agents.find((a) => a.id === id)?.spentTodayGrosze ?? 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)", gap: 14, alignItems: "start" }}>
      {/* Left 1/3 — choose an agent */}
      <Card>
        <CardHead title="Agents" description="Pick one to edit" />
        <CardBody style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {cmd.configs.map((c) => (
            <button key={c.id} type="button" className={`av3-conv-row ${selId === c.id ? "is-active" : ""}`} onClick={() => setSelId(c.id)}>
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

      {/* Right 2/3 — full editor for the chosen agent */}
      {sel && (
        <Card>
          <CardHead
            title={<span style={{ display: "flex", alignItems: "center", gap: 9 }}><Monogram initials={sel.initials} accentVar={sel.accentVar} size={30} /> <span style={{ fontSize: 15 }}>Edit · {sel.name}</span></span>}
            description={sel.title}
            actions={<Link href={`/admin/agent-hq/${sel.id}`} className="av3-btn av3-btn-ghost av3-btn-sm">Open panel <ArrowRight className="av3-btn-ico" /></Link>}
          />
          <CardBody>
            {(() => { const live = owned(sel.id); return live.length > 0 ? (
              <div style={{ ...RAIL, marginBottom: 4 }}>{live.map((k) => <KpiTile key={k.id} k={k} />)}</div>
            ) : null; })()}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "12px 0 18px" }}>
              <Meta label="Spend today" value={zl(spend(sel.id))} />
              <Meta label="Schedule" value={CADENCE_OPTIONS.find((o) => o.value === sel.schedule.cadence)?.label ?? sel.schedule.cadence} />
            </div>
            <AgentEditForm key={sel.id} agentId={sel.id} configs={cmd.configs} toolCatalog={toolCatalog} onSaved={onConfigSaved} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
function Meta({ label, value }: { label: string; value: string }) {
  return <div><div style={{ fontSize: 10.5, color: "var(--av3-subtle)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div><div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{value}</div></div>;
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

  if (items === null) return <div className="av3-card" style={{ padding: 14 }}><SkeletonRows rows={6} /></div>;

  const unassigned = items.filter((w) => w.status === "unassigned");
  const queued = items.filter((w) => w.status === "queued" || w.status === "running");
  const recent = items.filter((w) => w.status === "done" || w.status === "failed").slice(0, 12);

  const card = (w: WorkItem, opts?: { run?: boolean }) => (
    <div key={w.id} draggable onDragStart={() => setDragId(w.id)} onDragEnd={() => setDragId(null)}
      className="av3-card" style={{ padding: 11, marginBottom: 8, cursor: "grab" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{w.title}</div>
          <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{w.resultSummary || w.prompt}</div>
        </div>
        {w.agentId && <Monogram initials={cfg.get(w.agentId)?.initials ?? "··"} accentVar={cfg.get(w.agentId)?.accentVar ?? "--av3-subtle"} size={24} />}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 9, alignItems: "center" }}>
        <Badge tone={w.status === "done" ? "ok" : w.status === "failed" ? "bad" : w.status === "running" ? "warn" : "info"}>{w.status}</Badge>
        {typeof w.costGrosze === "number" && w.costGrosze > 0 && <span style={{ fontSize: 10.5, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)" }}>{zl(w.costGrosze)}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {opts?.run && w.agentId && <Button variant="primary" size="sm" loading={busy === w.id} disabled={!gatewayConfigured} onClick={() => run(w.id)}><Play className="av3-btn-ico" /> Run</Button>}
          <button className="av3-iconbtn-sm" title="Delete" onClick={() => remove(w.id)}><Trash2 style={{ width: 13, height: 13 }} /></button>
        </span>
      </div>
    </div>
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
          <div key={c.id}
            onDragOver={(e) => { if (dragId) e.preventDefault(); }}
            onDrop={() => { if (dragId) { assign(dragId, c.id); setDragId(null); } }}
            className="av3-card" style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, borderStyle: dragId ? "dashed" : "solid", borderColor: dragId ? "var(--av3-brand-line)" : "var(--av3-line)" }}>
            <Monogram initials={c.initials} accentVar={c.accentVar} size={24} /><span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name}</span>
          </div>
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

  if (rows === null) return <div className="av3-card" style={{ padding: 14 }}><SkeletonRows rows={4} /></div>;
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
            actions={selected ? <Link href={`/admin/agent-hq/${selected.id}`} className="av3-btn av3-btn-ghost av3-btn-sm">Open panel <ArrowRight className="av3-btn-ico" /></Link> : undefined}
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

  if (meetings === null) return <div className="av3-card" style={{ padding: 14 }}><SkeletonRows rows={5} /></div>;

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
