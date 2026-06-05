"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getActiveLocations } from "@/data/locations";
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
} from "lucide-react";
import Link from "next/link";
import { CoreShell } from "./core/CoreShell";
import { GuestViewNav } from "./guest/GuestViewNav";
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

const LOCS = getActiveLocations().map((l) => ({ key: l.slug, label: l.city }));

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
  const [exposure, setExposure] = useState<Record<string, boolean>>(settings.exposure);
  const [loc, setLoc] = useState("krakow");
  const [view, setView] = useState<"mcp" | "whatsapp">("mcp");
  const [selected, setSelected] = useState<CapId>("get_allergens");
  const [test, setTest] = useState<{ status: number; body: string; ms: number } | null>(null);
  const [testing, setTesting] = useState(false);

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
    const startedAt = performance.now();
    try {
      const res = await fetch(`/api/agent/${selected}?location=${loc}`);
      const body = await res.json().catch(() => ({}));
      setTest({
        status: res.status,
        body: JSON.stringify(body, null, 2),
        ms: Math.round(performance.now() - startedAt),
      });
    } catch {
      setTest({ status: 0, body: "Request failed", ms: Math.round(performance.now() - startedAt) });
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
    <CoreShell
      active="guest"
      crumbs={
        <>
          Core / <b>Guest Engagement</b>
        </>
      }
      viewnav={<GuestViewNav current="concierge" />}
      topbarRight={
        <>
          <div className="seg">
            <button type="button" className={view === "mcp" ? "on" : ""} onClick={() => setView("mcp")}>
              MCP server
            </button>
            <button
              type="button"
              className={view === "whatsapp" ? "on" : ""}
              onClick={() => setView("whatsapp")}
            >
              WhatsApp
            </button>
          </div>
          <div className="seg">
            {LOCS.map((l) => (
              <button key={l.key} type="button" className={loc === l.key ? "on" : ""} onClick={() => setLoc(l.key)}>
                {l.label}
              </button>
            ))}
          </div>
        </>
      }
    >
      <div className="conc">
        <section className="cap-side" aria-label="Capabilities">
          <div className="cap-statline">
            <b>{meta.length} capabilities</b> · <b>{liveCount} live</b> · {totalCalls} on the public read endpoint
            <span className="thesis">
              One capability layer, exposed once over MCP/HTTP and the WhatsApp bot — the agent never
              guesses; every answer is auditable.
            </span>
          </div>

          <div className="card" style={{ overflow: "hidden" }}>
            {meta.map((c) => {
              const on = exposure[c.id] ?? true;
              return (
                <div key={c.id} className={`cap${c.id === selected ? " sel" : ""}${on ? "" : " off"}`}>
                  <div className="ic">{CAP_ICON[c.id]}</div>
                  <button type="button" className="cap-text" onClick={() => setSelected(c.id)}>
                    <div className="nm">
                      {c.label}{" "}
                      <span className={`kind ${c.kind === "resource" ? "res" : "tool"}`}>
                        {c.kind === "resource" ? "Resource" : "Tool"}
                      </span>
                    </div>
                    <div className="ds">{c.desc}</div>
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`Toggle ${c.id}`}
                    className={`sw-toggle${on ? " on" : ""}`}
                    onClick={() => void toggle(c.id)}
                  />
                </div>
              );
            })}
          </div>

          <div className="transports">
            <div className="eyebrow" style={{ marginBottom: 11 }}>
              Transports
            </div>
            <div className="tr">
              <div className="ic">
                <BookOpen className="icn" />
              </div>
              <div style={{ flex: 1 }}>
                <div className="nm">MCP / HTTP read API</div>
                <div className="ep">/api/agent/&lt;capability&gt;</div>
              </div>
              <span className="badge success">
                <span className="d" />
                Live
              </span>
            </div>
            <div className="tr">
              <div className="ic">
                <MessageCircle className="icn" />
              </div>
              <div style={{ flex: 1 }}>
                <div className="nm">WhatsApp Business</div>
                <div className="ep">/api/whatsapp/webhook · ordering bot</div>
              </div>
              {waConfigured ? (
                <span className="badge success">
                  <span className="d" />
                  Live
                </span>
              ) : (
                <span className="badge neutral">Needs config</span>
              )}
            </div>
          </div>
        </section>

        <section className="inspector" aria-label="Inspector">
          {view === "mcp" ? (
            <>
              <div className="insp-h">
                <h2>{selectedMeta.label}</h2>
                <span className={`kind ${selectedMeta.kind === "resource" ? "res" : "tool"}`}>
                  {selectedMeta.kind === "resource" ? "Resource" : "Tool"}
                </span>
              </div>
              <div className={`insp-ep${enabled ? "" : " off"}`}>
                <span className="live" />
                {endpoint}
                {!enabled && " · disabled"}
              </div>
              {selectedMeta.transport === "public" && (
                <div className="run">
                  <button type="button" className="btn primary" onClick={runTest} disabled={testing}>
                    <Play /> {testing ? "Testing…" : "Test live"}
                  </button>
                  {test && (
                    <span className={`badge ${test.status >= 200 && test.status < 300 ? "success" : "danger"}`}>
                      HTTP {test.status || "—"} · {test.ms}ms
                    </span>
                  )}
                </div>
              )}

              <div className="resp-h">What the agent sees</div>
              <pre
                className="json"
                dangerouslySetInnerHTML={{
                  __html: syntaxJson(test ? safeParse(test.body) : locData.samples[selected]),
                }}
              />

              {selected === "get_allergens" && (
                <>
                  <div className="resp-h" style={{ color: "var(--platinum)" }}>
                    EU-14 allergen matrix · {LOCS.find((l) => l.key === loc)?.label}
                  </div>
                  <table className="matrix">
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
                        <tr key={r.id}>
                          <td className="item">{r.name}</td>
                          {locData.matrix.columns.map((c) => (
                            <td key={c.key}>
                              {r.allergens.includes(c.key) ? <span className="has">●</span> : "·"}
                            </td>
                          ))}
                          <td className="subtle">
                            {r.dietary.length
                              ? r.dietary
                                  .map((d) => (d === "gluten-free" ? "GF" : d === "vegetarian" ? "veg" : d))
                                  .join(", ")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: "11.5px", color: "var(--fg-subtle)", marginTop: 12, lineHeight: 1.5 }}>
                    Filled = declared allergen. The agent reads this matrix — every allergen answer is
                    auditable, never guessed.
                  </p>
                </>
              )}
            </>
          ) : (
            <>
              <div className="insp-h">
                <h2>WhatsApp Business</h2>
                <span className={`badge ${waConfigured ? "success" : "neutral"}`}>
                  <span className="d" />
                  {waConfigured ? "Connected" : "Not configured"}
                </span>
              </div>
              <p className="subtle" style={{ fontSize: 13, lineHeight: 1.55, marginTop: 6 }}>
                The WhatsApp ordering bot and the MCP read endpoint are two consumers of the same
                capabilities — search the menu, check allergens, list slots, place orders and send a Stripe
                payment link. No app, no sign-up. Paid orders save the number to the guest graph (it shows up
                under Guests).
              </p>
              <div className="wa-caps">
                {meta.map((c) => (
                  <span key={c.id} className={`wa-cap${(exposure[c.id] ?? true) ? "" : " off"}`}>
                    {CAP_ICON[c.id]} {c.label}
                  </span>
                ))}
              </div>
              <div className="resp-h" style={{ marginTop: 18 }}>
                Live console
              </div>
              <Link href="/core/guest/whatsapp" className="btn ghost">
                <MessageCircle /> Open the WhatsApp inbox <ExternalLink />
              </Link>
              {!waConfigured && (
                <p className="subtle" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
                  Set <code>WHATSAPP_PHONE_NUMBER_ID</code> and <code>WHATSAPP_ACCESS_TOKEN</code> to connect
                  the live channel. Until then the bot runs in demo mode.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </CoreShell>
  );

  return board;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
