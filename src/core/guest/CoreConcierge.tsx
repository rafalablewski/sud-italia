"use client";

import { useMemo, useState } from "react";
import { CoreShell } from "@/core/shell/CoreShell";
import { useLocation } from "@/shared/LocationContext";
import { useCoreToast } from "@/core/ui/Toast";
import { guestTabs } from "./guestTabs";

interface CapMeta {
  id: string;
  kind: "tool" | "resource";
  label: string;
  desc: string;
  transport: "public" | "conversational";
}
interface Matrix {
  columns: { key: string; label: string; emoji: string }[];
  rows: { id: string; name: string; available: boolean; allergens: string[]; dietary: string[] }[];
}
interface AgentStats {
  requestsToday: number;
  avgLatencyMs: number;
  errors: number;
  errorRatePct: number;
  deflectionPct: number;
  byCapability: Record<string, { count: number; avgLatencyMs: number }>;
}
interface Props {
  meta: CapMeta[];
  settings: { exposure: Record<string, boolean> };
  byLocation: Record<string, { samples: Record<string, unknown>; matrix: Matrix }>;
  waConfigured: boolean;
  stats: AgentStats;
}

/**
 * Core · Guest · Concierge — the AI capability layer + EU-14 allergen matrix.
 * Wired to the same engine as today's /core/guest/concierge: server builds the
 * capability meta + per-location samples + matrix; exposure toggles PATCH
 * /api/admin/concierge. Own core- UI.
 */
export function CoreConcierge({ meta, settings, byLocation, waConfigured, stats }: Props) {
  const toast = useCoreToast();
  // Drive the inspected location from the shell's global location switcher
  // (CoreLocationChip) — no second, page-local switch. The chip can sit on
  // "All trucks", which has no per-location samples/matrix, so fall back to the
  // first concrete location in that case.
  const { location } = useLocation();
  const locations = useMemo(() => Object.keys(byLocation), [byLocation]);
  const loc = location && byLocation[location] ? location : locations[0] ?? "krakow";
  const [exposure, setExposure] = useState<Record<string, boolean>>(settings.exposure ?? {});
  const [selected, setSelected] = useState(meta[0]?.id ?? "");
  const [test, setTest] = useState<{ status: number; ms: number; body: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const liveCount = meta.filter((m) => exposure[m.id]).length;
  const matrix = byLocation[loc]?.matrix;
  const sample = byLocation[loc]?.samples?.[selected];

  // Reset any prior probe when the inspected capability / location changes.
  const selectCap = (id: string) => {
    setSelected(id);
    setTest(null);
  };

  // Live probe — hit the real public read endpoint, time it, surface the HTTP
  // status. This is the same call an external agent would make.
  const runTest = async () => {
    setTesting(true);
    setTest(null);
    const startedAt = performance.now();
    try {
      const res = await fetch(`/api/agent/${encodeURIComponent(selected)}?location=${encodeURIComponent(loc)}`);
      const body = await res.json().catch(() => ({}));
      setTest({ status: res.status, ms: Math.round(performance.now() - startedAt), body: JSON.stringify(body, null, 2) });
    } catch {
      setTest({ status: 0, ms: Math.round(performance.now() - startedAt), body: "Request failed" });
    } finally {
      setTesting(false);
    }
  };
  const testOk = test != null && test.status >= 200 && test.status < 300;

  const toggle = async (id: string) => {
    const next = !exposure[id];
    setExposure((e) => ({ ...e, [id]: next })); // optimistic
    const res = await fetch("/api/admin/concierge", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capability: id, exposed: next }),
    });
    if (!res.ok) {
      setExposure((e) => ({ ...e, [id]: !next }));
      toast("Could not update exposure", "danger");
    } else {
      toast(`${meta.find((m) => m.id === id)?.label} ${next ? "exposed" : "hidden"}`, "success");
    }
  };

  return (
    <CoreShell
      eyebrow="Guest Engagement"
      tabs={guestTabs("concierge")}
      subRight={<span className="core-chip" style={{ height: 32 }}>{liveCount}/{meta.length} live</span>}
    >
      <div className="core-crumb">
        CORE — GUEST · CONCIERGE · <b>mcp inspector</b> · <span className="fix">{liveCount}/{meta.length} live</span>
      </div>
      <div className="core-sectionhead">
        <h1>Guest · Concierge</h1>
        <span className="sub">ai capability server · model-context inspector</span>
      </div>
      {/* dense-console 6-up stat strip — capabilities/live are config; the rest
          are REAL agent-endpoint telemetry from getAgentCallStats (Rule #1). */}
      <div className="core-statstrip" role="group" aria-label="Concierge metrics">
        <div className="cell"><span className="lab">Capabilities</span><span className="val">{meta.length}</span><span className="delta">registered</span></div>
        <div className="cell"><span className="lab">Live</span><span className="val basil">{liveCount}</span><span className="delta">{liveCount}/{meta.length} exposed</span></div>
        <div className="cell"><span className="lab">Requests today</span><span className="val">{stats.requestsToday}</span><span className="delta">agent hits</span></div>
        <div className="cell"><span className="lab">Avg latency</span><span className="val info">{stats.avgLatencyMs}<small> ms</small></span><span className="delta">per call</span></div>
        <div className="cell"><span className="lab">Deflection</span><span className="val basil">{stats.deflectionPct}<small>%</small></span><span className="delta">served OK</span></div>
        <div className="cell"><span className="lab">Errors</span><span className={stats.errors > 0 ? "val danger" : "val"}>{stats.errors}</span><span className={stats.errors > 0 ? "delta dn" : "delta"}>{stats.errorRatePct}% rate</span></div>
      </div>
      <div className="core-concierge">
        {/* capability inspector */}
        <section className="core-caps">
          <h4 className="core-profile-h" style={{ padding: "14px 16px 4px", margin: 0 }}>MCP capabilities</h4>
          {meta.map((m) => (
            <div key={m.id} className={m.id === selected ? "core-cap on" : "core-cap"} onClick={() => selectCap(m.id)}>
              <div className="core-cap-h">
                <span className={`core-cap-kind ${m.kind}`}>{m.kind}</span>
                <b>{m.id}</b>
                <button
                  className={`core-toggle ${exposure[m.id] ? "on" : ""}`}
                  onClick={(e) => { e.stopPropagation(); void toggle(m.id); }}
                  title={exposure[m.id] ? "Exposed to agents" : "Hidden"}
                  aria-pressed={!!exposure[m.id]}
                >
                  <span className="knob" />
                </button>
              </div>
              <div className="core-cap-desc">{m.desc}</div>
              <div className="core-cap-meta">
                {exposure[m.id] ? <span style={{ color: "var(--basil)" }}>● live</span> : "hidden"} · {m.transport}
                {stats.byCapability[m.id] && ` · ${stats.byCapability[m.id].count} req · ${stats.byCapability[m.id].avgLatencyMs} ms`}
              </div>
            </div>
          ))}
        </section>

        {/* sample response */}
        <section className="core-cap-inspect">
          {/* transports — how an agent reaches these capabilities */}
          <div className="core-transports">
            <div className="core-transport">
              <div className="t-l">
                <b>MCP · HTTP read API</b>
                <span className="ep mono">/api/agent/{selected}</span>
              </div>
              <span className="core-tbadge2 live">Live</span>
            </div>
            <div className="core-transport">
              <div className="t-l">
                <b>WhatsApp Business · ordering bot</b>
                <span className="ep mono">/api/whatsapp/webhook</span>
              </div>
              {waConfigured ? (
                <a className="core-tbadge2 live" href="/core/guest/inbox">Connected ↗</a>
              ) : (
                <span className="core-tbadge2 off">Needs config</span>
              )}
            </div>
          </div>

          <div className="core-cap-inspect-h">
            <b className="mono">GET /api/agent/{selected}?location={loc}</b>
            <div className="core-test">
              <button type="button" className="core-btn ghost sm" disabled={testing} onClick={() => void runTest()}>
                {testing ? "Testing…" : "▶ Test live"}
              </button>
              {test && (
                <span className={`core-tbadge2 ${testOk ? "live" : "off"}`}>HTTP {test.status || "—"} · {test.ms}ms</span>
              )}
            </div>
          </div>
          <pre className="core-json">{test ? test.body : JSON.stringify(sample ?? {}, null, 2)}</pre>

          {matrix && (
            <>
              <h4 className="core-profile-h" style={{ marginTop: 8 }}>EU-14 allergen matrix · {loc}</h4>
              <p className="core-matrix-legend">● contains / applies · dimmed row = 86&apos;d today. The agent reads this matrix — it never guesses allergens.</p>
              <div className="core-matrix-wrap">
                <table className="core-matrix">
                  <thead>
                    <tr>
                      <th>Dish</th>
                      {matrix.columns.map((c) => (
                        <th key={c.key} title={c.label}>{c.emoji}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((r) => (
                      <tr key={r.id} className={r.available ? "" : "off"}>
                        <td className="dish">{r.name}</td>
                        {matrix.columns.map((c) => {
                          const hit = r.allergens.includes(c.key) || r.dietary.includes(c.key);
                          return <td key={c.key} className={hit ? "hit" : ""}>{hit ? "●" : ""}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </CoreShell>
  );
}
