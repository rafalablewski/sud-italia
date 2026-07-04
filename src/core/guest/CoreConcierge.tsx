"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CoreShell } from "@/core/shell/CoreShell";
import { CoreSurfToolbar } from "@/core/shell/CoreSurfToolbar";
import { useLocation } from "@/shared/LocationContext";
import { useCoreToast } from "@/core/ui/Toast";
import { guestTabs } from "./guestTabs";

/**
 * Per-capability leading glyph. The concierge exposes a small, stable set of MCP
 * capabilities (menu, allergens, availability, order, payment, loyalty, hours…)
 * so we map the real capability id → an icon by keyword. Unknown ids fall back
 * to a generic grid glyph rather than fabricating a label.
 */
function capIcon(id: string): ReactNode {
  const k = id.toLowerCase();
  let path: ReactNode;
  if (k.includes("menu")) path = <path d="M4 6h16M4 12h16M4 18h10" />;
  else if (k.includes("allerg")) path = (<><path d="M12 2 3 7v6c0 5 4 8 9 9 5-1 9-4 9-9V7z" /><path d="m9 12 2 2 4-4" /></>);
  else if (k.includes("book") || k.includes("reserv") || k.includes("table")) path = <path d="M8 2v4M16 2v4M3 8h18M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />;
  else if (k.includes("avail")) path = (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
  else if (k.includes("order")) path = (<><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.6 13.4a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 8H6" /></>);
  else if (k.includes("pay")) path = (<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>);
  else if (k.includes("loyal") || k.includes("point")) path = <path d="m12 2 3 6.3 6.9.9-5 4.8 1.3 6.9L12 17.6 5.8 20.9 7.1 14l-5-4.8 6.9-.9z" />;
  else if (k.includes("truck") || k.includes("locat") || k.includes("hour") || k.includes("store")) path = (<><circle cx="12" cy="10" r="3" /><path d="M12 2a8 8 0 0 0-8 8c0 5.4 8 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z" /></>);
  else path = (<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>);
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{path}</svg>;
}

/**
 * Tokenise a JSON string into coloured spans (amber keys · green strings ·
 * brand numbers · amber booleans · grey punctuation) so the inspector reads
 * like a real code pane. Operates on the actual rendered JSON — no fabrication.
 */
function highlightJson(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) out.push(src.slice(last, m.index));
    if (m[1] !== undefined) {
      if (m[2]) {
        out.push(<span key={i++} className="key">{m[1]}</span>);
        out.push(<span key={i++} className="punc">{m[2]}</span>);
      } else {
        out.push(<span key={i++} className="str">{m[1]}</span>);
      }
    } else if (m[3] !== undefined) {
      out.push(<span key={i++} className="num">{m[3]}</span>);
    } else if (m[4] !== undefined) {
      out.push(<span key={i++} className="bool">{m[4]}</span>);
    } else if (m[5] !== undefined) {
      out.push(<span key={i++} className="punc">{m[5]}</span>);
    }
    last = re.lastIndex;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

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
export function CoreConcierge({ meta, settings, byLocation, stats }: Props) {
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
  // MCP method for the JSON pane header — resources are read, tools are called.
  const selectedMeta = meta.find((m) => m.id === selected);
  const method = selectedMeta?.kind === "resource" ? "resources/read" : "tools/call";
  const bodyText = test ? test.body : JSON.stringify(sample ?? {}, null, 2);
  const codeComment =
    `// ${test ? "GET" : method} · /api/agent/${selected}?location=${loc}` +
    (test ? ` · HTTP ${test.status || "—"} · ${test.ms}ms` : "");

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
    >
      {/* Unified ActionBar — identity (Guest · Concierge) · live capability
          count on the right. */}
      <CoreSurfToolbar
        ariaLabel="Concierge status"
        section="Guest"
        page="Concierge"
        sub={<>ai capability server · model-context inspector</>}
        right={<span className="core-chip" style={{ height: 32 }}>{liveCount}/{meta.length} live</span>}
      />
      {/* dense-console 6-up stat strip — capabilities/live are config; the rest
          are REAL agent-endpoint telemetry from getAgentCallStats (Rule #1). */}
      <div className="core-statstrip" role="group" aria-label="Concierge metrics">
        <div className="cell"><span className="lab">Capabilities</span><span className="val">{meta.length}</span><span className="delta">registered</span></div>
        <div className="cell"><span className="lab">Live</span><span className="val basil">{liveCount}</span><span className="delta">{liveCount}/{meta.length} exposed</span></div>
        <div className="cell"><span className="lab">Requests today</span><span className="val">{stats.requestsToday}</span><span className="delta">agent hits</span></div>
        <div className="cell"><span className="lab">Avg latency</span><span className="val info">{stats.avgLatencyMs}<small> ms</small></span><span className="delta">per call</span></div>
        <div className="cell"><span className="lab">Deflection</span><span className="val brand">{stats.deflectionPct}<small>%</small></span><span className="delta">served OK</span></div>
        <div className="cell"><span className="lab">Errors</span><span className={stats.errors > 0 ? "val danger" : "val basil"}>{stats.errors}</span><span className={stats.errors > 0 ? "delta dn" : "delta"}>{stats.errorRatePct}% rate</span></div>
      </div>
      <div className="core-concierge">
        {/* LEFT — capability list: friendly labels + leading glyph, exposure toggle */}
        <section className="core-caps">
          <div className="core-caps-h">
            <span className="t">Capabilities</span>
            <span className="live">{liveCount} / {meta.length} live</span>
          </div>
          <div className="core-caplist">
            {meta.map((m) => {
              const on = !!exposure[m.id];
              const cs = stats.byCapability[m.id];
              return (
                <div key={m.id} className={m.id === selected ? "core-cap on" : "core-cap"} onClick={() => selectCap(m.id)}>
                  <span className="core-cap-ico">{capIcon(m.id)}</span>
                  <div className="core-cap-body">
                    <div className="core-cap-nm">{m.label}</div>
                    <div className="core-cap-meta">
                      <span className={on ? "st" : "st off"}><span className="d" />{on ? "live" : "hidden"}</span>
                      {cs && (<>·<span className="lat">{cs.count} req</span>·<span>{cs.avgLatencyMs} ms</span></>)}
                    </div>
                  </div>
                  <button
                    className={`core-toggle ${on ? "on" : ""}`}
                    onClick={(e) => { e.stopPropagation(); void toggle(m.id); }}
                    title={on ? "Exposed to agents" : "Hidden"}
                    aria-pressed={on}
                  >
                    <span className="knob" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* RIGHT — inspector: sample JSON pane + allergen matrix */}
        <section className="core-cap-inspect">
          <div className="core-json-pane">
            <div className="core-json-h">
              <span className="t"><span className="meth">{method}</span><span className="callname">{selected}</span></span>
              <button type="button" className="core-testbtn" disabled={testing} onClick={() => void runTest()}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m5 3 14 9-14 9z" /></svg>
                {testing ? "Testing…" : "Test"}
              </button>
            </div>
            <pre className="core-json"><span className="cmt">{codeComment}</span>{"\n"}{highlightJson(bodyText)}</pre>
          </div>

          {matrix && (
            <div className="core-matrix-pane">
              <div className="core-matrix-h">
                <span className="t">EU-14 allergen matrix</span>
                <span className="note"><b>Same recipe chain-wide</b> — Kraków &amp; Warszawa identical; only listed price varies.</span>
              </div>
              <div className="core-matrix-wrap">
                <table className="core-matrix">
                  <thead>
                    <tr>
                      <th className="dishcol">Dish</th>
                      {matrix.columns.map((c) => (
                        <th key={c.key} title={c.label}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((r) => (
                      <tr key={r.id} className={r.available ? "" : "off"}>
                        <td className="dish">{r.name}</td>
                        {matrix.columns.map((c) => {
                          const hit = r.allergens.includes(c.key) || r.dietary.includes(c.key);
                          return <td key={c.key} className={hit ? "" : "abs"}>{hit ? <span className="dot" /> : "·"}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="core-matrix-legend">
                <span className="lg"><span className="dot" /> present in recipe</span>
                <span className="lg">· not present</span>
                <span className="lg" style={{ marginLeft: "auto" }}>14 EU FIC allergens · declared per chain recipe</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </CoreShell>
  );
}
