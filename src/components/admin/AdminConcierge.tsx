"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  BookOpen,
  Clock,
  CreditCard,
  ExternalLink,
  MapPin,
  MessageCircle,
  Play,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { SegControl, SectionEyebrow } from "./command";
import { useFullscreen } from "./command/useFullscreen";
import { useToast } from "./v2/ui/Toast";

type CapId =
  | "get_menu"
  | "check_availability"
  | "get_allergens"
  | "place_order"
  | "create_payment"
  | "locate_truck";

interface CapMeta {
  id: CapId;
  kind: "tool" | "resource";
  label: string;
  desc: string;
  transport: "public" | "conversational";
}
interface Matrix {
  columns: { key: string; label: string; emoji: string }[];
  rows: { id: string; name: string; available: boolean; allergens: string[]; dietary: string[] }[];
}
interface LocData {
  samples: Record<string, unknown>;
  matrix: Matrix;
}
interface Props {
  meta: CapMeta[];
  settings: { exposure: Record<string, boolean> };
  byLocation: Record<string, LocData>;
  waConfigured: boolean;
}

const CAP_ICON: Record<CapId, React.ReactNode> = {
  get_menu: <BookOpen />,
  check_availability: <Clock />,
  get_allergens: <AlertTriangle />,
  place_order: <ShoppingBag />,
  create_payment: <CreditCard />,
  locate_truck: <MapPin />,
};

const LOCS = [
  { key: "krakow", label: "Kraków" },
  { key: "warszawa", label: "Warszawa" },
];

/* JSON syntax highlight — escapes then colourises keys/strings/numbers. */
function syntaxJson(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
    (m) => {
      let cls = "j-num";
      if (/^"/.test(m)) cls = /:$/.test(m) ? "j-key" : "j-str";
      else if (/true|false/.test(m)) cls = "j-bool";
      else if (/null/.test(m)) cls = "j-null";
      return `<span class="${cls}">${m}</span>`;
    },
  );
}

export function AdminConcierge({ meta, settings, byLocation, waConfigured }: Props) {
  const toast = useToast();
  const { active: fullscreen, enter: enterFs, exit: exitFs } = useFullscreen();
  const [exposure, setExposure] = useState<Record<string, boolean>>(settings.exposure);
  const [loc, setLoc] = useState("krakow");
  const [view, setView] = useState<"mcp" | "whatsapp">("mcp");
  const [selected, setSelected] = useState<CapId>("get_allergens");
  const [clock, setClock] = useState("--:--:--");
  const [test, setTest] = useState<{ status: number; body: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB"));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setTest(null);
  }, [selected, loc]);

  const liveCount = meta.filter((m) => exposure[m.id] ?? true).length;
  const selectedMeta = meta.find((m) => m.id === selected)!;
  const locData = byLocation[loc];

  const toggle = useCallback(
    async (id: CapId) => {
      const next = !(exposure[id] ?? true);
      setExposure((prev) => ({ ...prev, [id]: next }));
      const res = await fetch("/api/admin/concierge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capability: id, exposed: next }),
      });
      if (res.ok) {
        toast.success(`${id} ${next ? "exposed — live to agents" : "hidden from the agent channel"}`);
      } else {
        setExposure((prev) => ({ ...prev, [id]: !next }));
        toast.error("Could not save exposure");
      }
    },
    [exposure, toast],
  );

  const runTest = useCallback(async () => {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch(`/api/agent/${selected}?location=${loc}`);
      const body = await res.json().catch(() => ({}));
      setTest({ status: res.status, body: JSON.stringify(body, null, 2) });
    } catch {
      setTest({ status: 0, body: "Request failed" });
    } finally {
      setTesting(false);
    }
  }, [selected, loc]);

  const endpoint =
    selectedMeta.transport === "public"
      ? `/api/agent/${selectedMeta.id}?location=${loc}`
      : "conversational · WhatsApp + web checkout";
  const enabled = exposure[selected] ?? true;

  const totalCalls = useMemo(() => liveCount, [liveCount]);

  const board = (
    <div className={`cncrg-atlas${fullscreen ? " is-fullscreen" : ""}`}>
      <header className="cmd-head">
        <div className="cmd-brand">
          <span className="cmd-wordmark">SUD ITALIA</span>
          <span className="cmd-label">Agent Commerce</span>
        </div>
        <div className="cncrg-ctl">
          <span className="cncrg-ctl-lbl">Loc</span>
          <SegControl
            ariaLabel="Location"
            options={LOCS.map((l) => ({ value: l.key, label: l.label }))}
            value={loc}
            onChange={setLoc}
          />
        </div>
        <div className="cncrg-ctl">
          <span className="cncrg-ctl-lbl">Channel</span>
          <SegControl
            ariaLabel="Channel"
            options={[
              { value: "mcp", label: "MCP server" },
              { value: "whatsapp", label: "WhatsApp" },
            ]}
            value={view}
            onChange={(v) => setView(v as "mcp" | "whatsapp")}
          />
        </div>
        <div className="cmd-spacer" />
        <button
          type="button"
          className="cmd-btn"
          onClick={() => (fullscreen ? exitFs() : enterFs())}
          title="Toggle fullscreen"
        >
          {fullscreen ? "Exit" : "Fullscreen"}
        </button>
        <div className="cmd-clock tabular">{clock}</div>
      </header>

      <section className="cncrg-bar">
        <SectionEyebrow icon={<Sparkles className="h-3 w-3" />} label="Agent channel">
          <span className="cncrg-thesis">
            One capability layer — exposed to AI assistants over <b>MCP</b> and to guests over{" "}
            <b>WhatsApp</b>.
          </span>
        </SectionEyebrow>
        <span className="cncrg-stat">
          <b>{meta.length}</b> capabilities · <b>{liveCount}</b> live · <b>{totalCalls}</b> on the public
          read endpoint
        </span>
      </section>

      <div className="cncrg-workspace">
        <section className="cncrg-caps-col" aria-label="Capabilities">
          <div className="cncrg-panel-head">
            Capabilities <span className="cncrg-ph-n">{liveCount}/{meta.length} live</span>
            <span className="cncrg-ph-sep" />
          </div>
          <div className="cncrg-caps">
            {meta.map((c) => {
              const on = exposure[c.id] ?? true;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`cncrg-cap${c.id === selected ? " sel" : ""}${on ? "" : " off"}`}
                  onClick={() => setSelected(c.id)}
                >
                  <span className="cncrg-cap-ic">{CAP_ICON[c.id]}</span>
                  <span className="cncrg-cap-body">
                    <span className="cncrg-cap-top">
                      <span className="cncrg-cap-name">{c.label}</span>
                      <span className={`cncrg-cap-kind ${c.kind}`}>{c.kind}</span>
                    </span>
                    <span className="cncrg-cap-desc">{c.desc}</span>
                    <span className="cncrg-cap-foot">
                      <span className="cncrg-cap-transport">
                        {c.transport === "public" ? "public read endpoint" : "WhatsApp + checkout"}
                      </span>
                    </span>
                  </span>
                  <span
                    role="switch"
                    aria-checked={on}
                    aria-label={`Toggle ${c.id}`}
                    tabIndex={0}
                    className="cncrg-tg"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggle(c.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        void toggle(c.id);
                      }
                    }}
                  />
                </button>
              );
            })}
          </div>

          <div className="cncrg-panel-head">
            Transports <span className="cncrg-ph-sep" />
          </div>
          <div className="cncrg-agents">
            <div className="cncrg-agent">
              <span className="cncrg-ag-dot live" />
              <span className="cncrg-ag-body">
                <span className="cncrg-ag-name">MCP / HTTP read API</span>
                <span className="cncrg-ag-last mono">/api/agent/&lt;capability&gt;</span>
              </span>
              <span className="cncrg-ag-ago">live</span>
            </div>
            <div className="cncrg-agent">
              <span className={`cncrg-ag-dot ${waConfigured ? "live" : "pending"}`} />
              <span className="cncrg-ag-body">
                <span className="cncrg-ag-name">WhatsApp Business</span>
                <span className="cncrg-ag-last mono">/api/webhook · ordering bot</span>
              </span>
              {waConfigured ? (
                <span className="cncrg-ag-ago">live</span>
              ) : (
                <span className="cncrg-ag-pending">Needs config</span>
              )}
            </div>
          </div>
        </section>

        <section className="cncrg-pane" aria-label="Channel detail">
          {view === "mcp" ? (
            <div className="cncrg-pane-scroll">
              <div className="cncrg-insp-head">
                <div className="cncrg-insp-title-row">
                  <span className="cncrg-insp-title">{selectedMeta.label}</span>
                  <span className={`cncrg-cap-kind ${selectedMeta.kind}`}>{selectedMeta.kind}</span>
                </div>
                <span className={`cncrg-endpoint${enabled ? "" : " off"}`}>
                  <span className="cncrg-ep-dot" />
                  {endpoint}
                  {!enabled && " · disabled"}
                </span>
                <span className="cncrg-insp-desc">{selectedMeta.desc}</span>
              </div>

              <div className="cncrg-sec">
                <div className="cncrg-sec-head">
                  What the agent sees <span className="cncrg-sh-tag">JSON</span>
                  <span className="cncrg-sh-sep" />
                  {selectedMeta.transport === "public" && (
                    <button className="cncrg-test-btn" type="button" onClick={runTest} disabled={testing}>
                      <Play /> {testing ? "Testing…" : "Test live"}
                    </button>
                  )}
                </div>
                <div className="cncrg-codeblock">
                  <pre
                    // Highlighted JSON built from our own live data; values are escaped above.
                    dangerouslySetInnerHTML={{ __html: syntaxJson(locData.samples[selected]) }}
                  />
                </div>
                {test && (
                  <div className={`cncrg-test-result ${test.status >= 200 && test.status < 300 ? "ok" : "err"}`}>
                    <div className="cncrg-test-status">
                      Live response · HTTP {test.status || "—"}
                    </div>
                    <div className="cncrg-codeblock">
                      <pre dangerouslySetInnerHTML={{ __html: syntaxJson(safeParse(test.body)) }} />
                    </div>
                  </div>
                )}
              </div>

              {selected === "get_allergens" && (
                <div className="cncrg-sec">
                  <div className="cncrg-sec-head">
                    Allergen matrix <span className="cncrg-sh-tag">EU-14</span>
                    <span className="cncrg-sh-sep" />
                  </div>
                  <div className="cncrg-codeblock" style={{ padding: 0 }}>
                    <table className="cncrg-matrix">
                      <thead>
                        <tr>
                          <th className="item">Item</th>
                          {locData.matrix.columns.map((c) => (
                            <th key={c.key} title={c.label}>
                              {c.emoji}
                            </th>
                          ))}
                          <th>Diet</th>
                        </tr>
                      </thead>
                      <tbody>
                        {locData.matrix.rows.map((r) => (
                          <tr key={r.id} className={r.available ? "" : "soldout"}>
                            <td className="item">{r.name}</td>
                            {locData.matrix.columns.map((c) => (
                              <td key={c.key}>
                                {r.allergens.includes(c.key) ? (
                                  <span className="al-yes" title={`Contains ${c.label}`} />
                                ) : (
                                  <span className="al-no">·</span>
                                )}
                              </td>
                            ))}
                            <td>
                              {r.dietary.length ? (
                                r.dietary.map((d) => (
                                  <span key={d} className={`cncrg-di ${d.replace(/[^a-z]/g, "")}`}>
                                    {d === "gluten-free" ? "GF" : d === "vegetarian" ? "veg" : d}
                                  </span>
                                ))
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="cncrg-matrix-note">
                    <span className="cncrg-mn-dot" />
                    Filled = declared allergen. The agent reads this matrix — every allergen answer is
                    auditable, never guessed.
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="cncrg-pane-scroll">
              <div className="cncrg-wa-head">
                <span className="cncrg-wa-av">
                  <MessageCircle />
                </span>
                <span className="cncrg-wa-id">
                  <span className="cncrg-wa-name">Sud Italia · WhatsApp Business</span>
                  <span className={`cncrg-wa-status ${waConfigured ? "" : "off"}`}>
                    <i /> {waConfigured ? "Connected — ordering bot live" : "Not configured"}
                  </span>
                </span>
                <span className="cncrg-wa-tag">AI agent</span>
              </div>
              <div className="cncrg-sec">
                <div className="cncrg-sec-head">
                  Shared capability layer <span className="cncrg-sh-sep" />
                </div>
                <p className="cncrg-insp-desc">
                  The WhatsApp ordering bot and the MCP read endpoint are two consumers of the same
                  capabilities. The bot calls them behind the scenes to search the menu, check allergens,
                  list slots, place orders and send a Stripe payment link — no app, no sign-up. Paid orders
                  save the number to the guest graph (it shows up in the CRM).
                </p>
                <div className="cncrg-wa-caps">
                  {meta.map((c) => (
                    <span key={c.id} className={`cncrg-wa-cap${(exposure[c.id] ?? true) ? "" : " off"}`}>
                      {CAP_ICON[c.id]} {c.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="cncrg-sec">
                <div className="cncrg-sec-head">
                  Live console <span className="cncrg-sh-sep" />
                </div>
                <Link href="/admin/whatsapp" className="cncrg-wa-link">
                  <MessageCircle /> Open the WhatsApp console
                  <ExternalLink />
                </Link>
                {!waConfigured && (
                  <p className="cncrg-insp-desc">
                    Set <code>WHATSAPP_PHONE_NUMBER_ID</code> and <code>WHATSAPP_ACCESS_TOKEN</code> to connect
                    the live channel. Until then the bot runs in demo mode.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="cncrg-foot">
        <div className="cncrg-legend">
          <span><i style={{ background: "var(--cmd-risk)" }} />Tool</span>
          <span><i style={{ background: "var(--cmd-firing)" }} />Resource</span>
          <span><i style={{ background: "var(--cmd-ready)" }} />Live</span>
        </div>
      </footer>
    </div>
  );

  return fullscreen ? createPortal(board, document.body) : board;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
