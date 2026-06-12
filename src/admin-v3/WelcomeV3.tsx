"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, Bot, ClipboardList, LayoutDashboard, RefreshCw, Sparkles, ChevronRight, ArrowRight,
} from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { adminV3BaseForPath, withAdminV3Base } from "@/lib/admin-base";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Card, CardBody, CardHead, SkeletonRows } from "./ui";
import { Monogram } from "./agent-hq/shared";

/**
 * Welcome — the Overview landing above Dashboard. A greeting plus the AI
 * boardroom's latest daily brief (the same meeting Agent HQ → Reports runs),
 * with run-it-now and quick links. All data is live: the brief comes from
 * `/api/admin/ai/boardroom/meeting` (GET latest, POST to convene) and the
 * owner roster from `/api/admin/ai/boardroom/agents` (to name each decision).
 */

interface Decision { title: string; owner: string; rationale: string; proposedTool?: string; status?: string }
interface Contribution { persona: string; text: string }
interface Meeting {
  id: string; type: "daily" | "weekly"; scope: string; agenda: string[];
  contributions: Contribution[]; decisions: Decision[]; costGrosze: number; createdAt: string;
}
interface AgentLite { id: string; name: string; initials: string; accentVar: string }

const zl = (g: number) => `${(g / 100).toFixed(2)} zł`;

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function WelcomeV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const city = all.find((l) => l.slug === location)?.city ?? "All locations";
  const pathname = usePathname();
  const base = adminV3BaseForPath(pathname);
  const link = useCallback((href: string) => withAdminV3Base(base, href), [base]);

  const [brief, setBrief] = useState<Meeting | null>(null);
  const [agents, setAgents] = useState<Map<string, AgentLite>>(new Map());
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [mRes, aRes] = await Promise.all([
      fetch("/api/admin/ai/boardroom/meeting").then((r) => ({ ok: r.ok, status: r.status, j: r.ok ? r.json() : null })).catch(() => ({ ok: false, status: 0, j: null })),
      fetch("/api/admin/ai/boardroom/agents").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (mRes.status === 403) setAccess(false);
    const meetings: Meeting[] = (mRes.j ? (await mRes.j)?.meetings : null) ?? [];
    setBrief(meetings.find((m) => m.type === "daily") ?? null);
    const list: AgentLite[] = (aRes?.agents ?? []).map((a: AgentLite) => ({ id: a.id, name: a.name, initials: a.initials, accentVar: a.accentVar }));
    setAgents(new Map(list.map((a) => [a.id, a])));
    setLoading(false);
    setRefreshing(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const runBrief = useCallback(async () => {
    setRunning(true); setRunError(null);
    const qs = location ? `?location=${encodeURIComponent(location)}` : "";
    const res = await fetch(`/api/admin/ai/boardroom/meeting${qs}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "daily" }) })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })).catch(() => ({ ok: r.ok, j: {} })))
      .catch(() => ({ ok: false, j: { error: "Network error" } }));
    setRunning(false);
    if (res.ok) void load();
    else setRunError((res.j as { error?: string }).error ?? "Could not convene the board.");
  }, [location, load]);

  const owner = (id: string) => agents.get(id);

  const quickLinks: { href: string; label: string; desc: string; icon: typeof Bot }[] = [
    { href: "/admin", label: "Dashboard", desc: "Today's revenue, goals & live KPIs", icon: LayoutDashboard },
    { href: "/admin/orders", label: "Orders", desc: "The live order pipeline", icon: ClipboardList },
    { href: "/admin/alerts", label: "Alerts", desc: "What needs you right now", icon: Bell },
    { href: "/admin/agent-hq", label: "Agent HQ", desc: "Your AI fleet & full reports", icon: Bot },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
          <span style={{ width: 34, height: 34, borderRadius: "var(--av3-r-md)", display: "grid", placeItems: "center", background: "var(--av3-brand-soft)", color: "var(--av3-brand)", flexShrink: 0 }}><Sparkles style={{ width: 19, height: 19 }} /></span>
          <div style={{ minWidth: 0 }}>
            <h1>{greetingFor(new Date())}</h1>
            <div className="av3-pagehead-sub">Your daily brief &amp; quick links · {city} · {new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}</div>
          </div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); void load(); }}>
            <RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin .7s linear infinite" } : undefined} /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHead
          title={<span style={{ display: "flex", alignItems: "center", gap: 9 }}><Sparkles style={{ width: 17, height: 17, color: "var(--av3-brand)" }} /> Daily brief</span>}
          description="A real boardroom meeting on your live numbers — transcript &amp; decisions, prepared each morning by your AI executives."
          actions={access ? (
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Link href={link("/admin/agent-hq")} className="av3-btn av3-btn-ghost av3-btn-sm">Open in Agent HQ <ChevronRight className="av3-btn-ico" /></Link>
              <Button variant="primary" size="sm" loading={running} onClick={runBrief}><Sparkles className="av3-btn-ico" /> Run today's brief</Button>
            </span>
          ) : undefined}
        />
        <CardBody>
          {loading ? (
            <SkeletonRows rows={4} />
          ) : !access ? (
            <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>The daily brief is prepared by your AI boardroom and is available to managers and owners.</div>
          ) : brief ? (
            <>
              <div style={{ fontSize: 12.5, color: "var(--av3-muted)", marginBottom: 12 }}>
                {brief.scope === "all" ? "All locations" : brief.scope} · {new Date(brief.createdAt).toLocaleString("pl-PL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {" · "}{brief.agenda.length} metric{brief.agenda.length !== 1 ? "s" : ""} on the agenda · cost {zl(brief.costGrosze)}
              </div>
              {brief.decisions.length === 0 ? (
                <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>No decisions were logged in the last brief.</div>
              ) : (
                <>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--av3-subtle)", fontWeight: 700, marginBottom: 8 }}>Decisions</div>
                  {brief.decisions.slice(0, 5).map((d, i) => {
                    const o = owner(d.owner);
                    return (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderTop: i > 0 ? "1px solid var(--av3-line)" : "none", alignItems: "flex-start" }}>
                        <Monogram initials={o?.initials ?? "··"} accentVar={o?.accentVar ?? "--av3-subtle"} size={26} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{d.title}</div>
                          {d.rationale && <div className="av3-cell-muted" style={{ fontSize: 12, marginTop: 2 }}>{d.rationale}</div>}
                          {o && <div style={{ fontSize: 11, color: "var(--av3-subtle)", marginTop: 3 }}>{o.name}</div>}
                        </div>
                        {d.status && d.status !== "proposed" && <Badge tone={d.status === "dismissed" ? "neutral" : "ok"}>{d.status}</Badge>}
                      </div>
                    );
                  })}
                </>
              )}
            </>
          ) : (
            <div className="av3-empty" style={{ padding: "22px 0" }}>
              <Sparkles aria-hidden />
              <div className="av3-empty-title">No brief yet today</div>
              <div className="av3-empty-text">Convene your AI boardroom for a fresh briefing on the live numbers.</div>
              <div style={{ marginTop: 12 }}><Button variant="primary" loading={running} onClick={runBrief}><Sparkles className="av3-btn-ico" /> Run today's brief</Button></div>
            </div>
          )}
          {runError && <div className="av3-chat-error" style={{ marginTop: 10 }}>{runError}</div>}
          {running && <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 8 }}>The board is deliberating — each active executive weighs in, then converges on decisions. ~20–40s.</div>}
        </CardBody>
      </Card>

      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--av3-subtle)", fontWeight: 600, margin: "22px 2px 10px" }}>Jump back in</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 12 }}>
        {quickLinks.map((q) => (
          <Link key={q.href} href={link(q.href)} className="av3-card av3-card-link" style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, textDecoration: "none", color: "inherit" }}>
            <span style={{ width: 36, height: 36, borderRadius: "var(--av3-r-md)", display: "grid", placeItems: "center", background: "var(--av3-s2)", color: "var(--av3-fg)", flexShrink: 0 }}><q.icon style={{ width: 18, height: 18 }} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>{q.label}</span>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--av3-subtle)" }}>{q.desc}</span>
            </span>
            <ArrowRight style={{ width: 16, height: 16, color: "var(--av3-subtle)", flexShrink: 0 }} />
          </Link>
        ))}
      </div>
    </>
  );
}
