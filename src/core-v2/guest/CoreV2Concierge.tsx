"use client";

import { useMemo, useState } from "react";
import { CoreV2Shell } from "@/core-v2/shell/CoreV2Shell";
import { useCoreToast } from "@/core-v2/ui/Toast";
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
interface Props {
  meta: CapMeta[];
  settings: { exposure: Record<string, boolean> };
  byLocation: Record<string, { samples: Record<string, unknown>; matrix: Matrix }>;
}

/**
 * Core v2 · Guest · Concierge — the AI capability layer + EU-14 allergen matrix.
 * Wired to the same engine as today's /core/guest/concierge: server builds the
 * capability meta + per-location samples + matrix; exposure toggles PATCH
 * /api/admin/concierge. Own cv- UI.
 */
export function CoreV2Concierge({ meta, settings, byLocation }: Props) {
  const toast = useCoreToast();
  const locations = useMemo(() => Object.keys(byLocation), [byLocation]);
  const [loc, setLoc] = useState(locations[0] ?? "krakow");
  const [exposure, setExposure] = useState<Record<string, boolean>>(settings.exposure ?? {});
  const [selected, setSelected] = useState(meta[0]?.id ?? "");

  const liveCount = meta.filter((m) => exposure[m.id]).length;
  const matrix = byLocation[loc]?.matrix;
  const sample = byLocation[loc]?.samples?.[selected];

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
    <CoreV2Shell
      eyebrow="Guest Engagement"
      tabs={guestTabs("concierge")}
      subRight={
        <>
          <span className="cv-chip" style={{ height: 32 }}>{liveCount}/{meta.length} live</span>
          <div className="cv-seg">
            {locations.map((l) => (
              <button key={l} className={loc === l ? "on" : ""} onClick={() => setLoc(l)}>
                {l[0].toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </>
      }
    >
      <div className="cv-concierge">
        {/* capability inspector */}
        <section className="cv-caps">
          <h4 className="cv-profile-h" style={{ padding: "14px 16px 4px", margin: 0 }}>MCP capabilities</h4>
          {meta.map((m) => (
            <div key={m.id} className={m.id === selected ? "cv-cap on" : "cv-cap"} onClick={() => setSelected(m.id)}>
              <div className="cv-cap-h">
                <span className={`cv-cap-kind ${m.kind}`}>{m.kind}</span>
                <b>{m.id}</b>
                <button
                  className={`cv-toggle ${exposure[m.id] ? "on" : ""}`}
                  onClick={(e) => { e.stopPropagation(); void toggle(m.id); }}
                  title={exposure[m.id] ? "Exposed to agents" : "Hidden"}
                  aria-pressed={!!exposure[m.id]}
                >
                  <span className="knob" />
                </button>
              </div>
              <div className="cv-cap-desc">{m.desc}</div>
              <div className="cv-cap-meta">{m.label} · {m.transport}</div>
            </div>
          ))}
        </section>

        {/* sample response */}
        <section className="cv-cap-inspect">
          <div className="cv-cap-inspect-h">
            <b className="mono">GET /api/agent/{selected}?location={loc}</b>
            <a className="cv-btn ghost sm" href={`/api/agent/${selected}?location=${loc}`} target="_blank" rel="noreferrer">Test ↗</a>
          </div>
          <pre className="cv-json">{JSON.stringify(sample ?? {}, null, 2)}</pre>

          {matrix && (
            <>
              <h4 className="cv-profile-h" style={{ marginTop: 8 }}>EU-14 allergen matrix · {loc}</h4>
              <div className="cv-matrix-wrap">
                <table className="cv-matrix">
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
    </CoreV2Shell>
  );
}
