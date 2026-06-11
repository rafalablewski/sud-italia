"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, RefreshCw } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead, SkeletonRows } from "./ui";
import { AgentEditor } from "./AgentEditor";
import { Monogram, KpiTile, ChatPanel, SecLabel, modelLabel, RAIL, type BoardKpi, type KpiStatus } from "./agent-hq/shared";
import { buildLiveSystemPrompt, CADENCE_OPTIONS, type AgentConfig } from "@/lib/ai/boardroom/agent-config";

/**
 * Dedicated per-agent page (/admin/agent-hq/[id]) — replaces the roster grid.
 * One big, readable panel: identity + controls, the agent's scorecard, its
 * mandate/responsibilities/guardrails/escalation/tone, tools + collaborators,
 * spend + schedule, a live chat, the generated system prompt, and the timeline.
 * Everything is fetched in parallel and rendered in a single pass.
 */

interface AgentEvent { id: string; type: string; summary: string; detail?: string; costGrosze?: number; ok?: boolean; actor: string; at: string }
interface StatusRow { id: string; spentTodayGrosze?: number; status: KpiStatus; concerns: number }

const TONE: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = {
  run: "info", edit: "neutral", escalation: "bad", approval: "warn", schedule: "ok", note: "neutral",
};

export function AgentPanel({ id }: { id: string }) {
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [configs, setConfigs] = useState<AgentConfig[]>([]);
  const [kpis, setKpis] = useState<BoardKpi[]>([]);
  const [row, setRow] = useState<StatusRow | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [gatewayConfigured, setGateway] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const [one, list, overview, tl] = await Promise.all([
      fetch(`/api/admin/ai/boardroom/agents/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/admin/ai/boardroom/agents`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/admin/ai/boardroom/overview`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/admin/ai/boardroom/agents/${id}/timeline`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (!one?.agent) { setNotFound(true); setLoading(false); return; }
    setAgent(one.agent);
    setConfigs(list?.agents ?? []);
    setGateway(overview?.gatewayConfigured ?? false);
    setKpis((overview?.snapshot?.kpis ?? []).filter((k: BoardKpi) => k.owner === id));
    setRow((overview?.agents ?? []).find((a: StatusRow) => a.id === id) ?? null);
    setEvents(tl?.events ?? []);
    setLoading(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const toolCatalog = useMemo(() => {
    const s = new Set<string>(); for (const c of configs) for (const t of c.toolNames) s.add(t); return [...s].sort();
  }, [configs]);

  if (loading) return <div className="av3-card" style={{ padding: 14 }}><SkeletonRows rows={8} /></div>;
  if (notFound || !agent) {
    return (
      <Card><CardBody>
        <div className="av3-empty" style={{ padding: "26px 0" }}>
          <div className="av3-empty-title">Agent not found</div>
          <div className="av3-empty-text"><Link href="/admin/agent-hq" className="av3-btn av3-btn-ghost av3-btn-sm">Back to Agent HQ</Link></div>
        </div>
      </CardBody></Card>
    );
  }

  const a = agent;
  const reportsTo = a.reportsTo ? configs.find((c) => c.id === a.reportsTo)?.name : null;
  const collabs = a.collaborators.map((cid) => configs.find((c) => c.id === cid)).filter(Boolean) as AgentConfig[];
  const cap = a.spend.dailyCapGrosze;
  const sched = CADENCE_OPTIONS.find((o) => o.value === a.schedule.cadence)?.label ?? a.schedule.cadence;

  const infoRows: [string, React.ReactNode][] = [
    ["Mandate", a.mandate],
    ["Responsibilities", <ul key="r" style={{ margin: 0, paddingLeft: 16 }}>{a.responsibilities.map((r, i) => <li key={i}>{r}</li>)}</ul>],
    ["KPIs it answers for", <ul key="k" style={{ margin: 0, paddingLeft: 16 }}>{a.kpis.map((k, i) => <li key={i}>{k}</li>)}</ul>],
    ["Tone & communication", a.tone],
    ["Guardrails & ethics", a.guardrails],
    ["Escalation threshold", a.escalationThreshold],
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Link href="/admin/agent-hq" className="av3-btn av3-btn-ghost av3-btn-sm"><ArrowLeft className="av3-btn-ico" /> Agent HQ</Link>
          <Monogram initials={a.initials} accentVar={a.accentVar} size={40} />
          <div style={{ minWidth: 0 }}>
            <h1>{a.name} <span style={{ marginLeft: 6 }}><Badge tone={a.status === "active" ? "ok" : a.status === "paused" ? "warn" : "neutral"}>{a.status}</Badge></span></h1>
            <div className="av3-pagehead-sub">{a.title}</div>
          </div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="ghost" size="sm" onClick={() => void load()}><RefreshCw className="av3-btn-ico" /> Refresh</Button>
          <Button variant="primary" size="sm" onClick={() => setEditing(true)}><Pencil className="av3-btn-ico" /> Edit agent</Button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        <Badge tone="info">{modelLabel(a.modelId)}</Badge>
        <Badge tone="neutral">authority · {a.authority}</Badge>
        <Badge tone="neutral">effort · {a.effort}</Badge>
        <Badge tone="neutral">memory · {a.runtimeManaged ? "managed" : "stateless"}</Badge>
        {reportsTo && <Badge tone="neutral">reports to · {reportsTo}</Badge>}
        <Badge tone="neutral">schedule · {sched}{a.schedule.cadence !== "off" ? ` ${a.schedule.time}` : ""}</Badge>
        <Badge tone="neutral">spend today · {((row?.spentTodayGrosze ?? 0) / 100).toFixed(2)} zł{cap != null ? ` / ${(cap / 100).toFixed(2)}` : ""}</Badge>
      </div>

      {kpis.length > 0 && (<><SecLabel first>Scorecard</SecLabel><div style={RAIL}>{kpis.map((k) => <KpiTile key={k.id} k={k} />)}</div></>)}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)", gap: 12, alignItems: "start", marginTop: 18 }}>
        <div>
          <Card>
            <CardHead title="Charter" description="The fields that compile into this agent's live system prompt." />
            <CardBody style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {infoRows.map(([label, body]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--av3-subtle)", fontWeight: 600, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--av3-fg)" }}>{body}</div>
                </div>
              ))}
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--av3-subtle)", fontWeight: 600, marginBottom: 6 }}>Tools</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{a.toolNames.map((t) => <span key={t} className="av3-badge av3-badge-neutral" style={{ fontFamily: "var(--av3-mono)" }}>{t}</span>)}</div>
              </div>
              {collabs.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--av3-subtle)", fontWeight: 600, marginBottom: 6 }}>Collaborators</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{collabs.map((c) => (
                    <Link key={c.id} href={`/admin/agent-hq/${c.id}`} className="av3-conv-row" style={{ width: "auto", padding: "5px 9px", display: "inline-flex", gap: 7 }}>
                      <Monogram initials={c.initials} accentVar={c.accentVar} size={22} /><span style={{ fontSize: 12.5 }}>{c.name}</span>
                    </Link>
                  ))}</div>
                </div>
              )}
              <details>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--av3-subtle)" }}>Live system prompt — exactly what it runs on</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 11.5, lineHeight: 1.55, fontFamily: "var(--av3-mono)", background: "var(--av3-s2)", border: "1px solid var(--av3-line)", borderRadius: "var(--av3-r-md)", padding: 12, marginTop: 8, maxHeight: 320, overflow: "auto" }}>{buildLiveSystemPrompt(a)}</pre>
              </details>
            </CardBody>
          </Card>

          <SecLabel>Timeline</SecLabel>
          <Card><CardBody>
            {events.length === 0 ? <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>No history yet.</div> :
              events.map((e, i) => (
                <div key={e.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < events.length - 1 ? "1px solid var(--av3-line)" : "none", alignItems: "flex-start" }}>
                  <Badge tone={TONE[e.type] ?? "neutral"}>{e.type}</Badge>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5 }}>{e.summary}{typeof e.costGrosze === "number" && e.costGrosze > 0 ? ` · ${(e.costGrosze / 100).toFixed(2)} zł` : ""}</div>
                    {e.detail && <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{e.detail}</div>}
                    <div style={{ fontSize: 11, color: "var(--av3-subtle)", marginTop: 3, fontFamily: "var(--av3-mono)" }}>{new Date(e.at).toLocaleString("pl-PL")} · {e.actor}</div>
                  </div>
                </div>
              ))}
          </CardBody></Card>
        </div>

        <div>
          <SecLabel first>Chat</SecLabel>
          <ChatPanel personaId={a.id} name={a.name} suggestion={a.mandate} gatewayConfigured={gatewayConfigured} />
        </div>
      </div>

      {editing && (
        <AgentEditor agentId={a.id} configs={configs} toolCatalog={toolCatalog}
          onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} />
      )}
    </>
  );
}
