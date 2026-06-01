"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import { getActiveLocations } from "@/data/locations";
import { useToast } from "../v2/ui/Toast";
import { BottomSheet, MobilePage, PageHeader, SegmentControl } from "../v2/mobile";

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
  get_menu: <BookOpen className="h-5 w-5" />,
  check_availability: <Clock className="h-5 w-5" />,
  get_allergens: <AlertTriangle className="h-5 w-5" />,
  place_order: <ShoppingBag className="h-5 w-5" />,
  create_payment: <CreditCard className="h-5 w-5" />,
  locate_truck: <MapPin className="h-5 w-5" />,
};

const LOCS = getActiveLocations().map((l) => ({ value: l.slug, label: l.city }));

/**
 * Mobile Concierge — the agent capability layer on a phone. The capability
 * list with live/hidden toggles is the home view; tapping a capability opens
 * a bottom-sheet inspector (endpoint, live test, the JSON the agent sees, and
 * the EU-14 allergen matrix for get_allergens). Same PATCH/GET endpoints as
 * the desktop board, so exposure changes and live tests are real.
 */
export function MobileConcierge({ meta, settings, byLocation, waConfigured }: Props) {
  const toast = useToast();
  const [exposure, setExposure] = useState<Record<string, boolean>>(settings.exposure);
  const [loc, setLoc] = useState(LOCS[0]?.value ?? "krakow");
  const [view, setView] = useState<"mcp" | "whatsapp">("mcp");
  const [open, setOpen] = useState<CapId | null>(null);

  const liveCount = meta.filter((m) => exposure[m.id] ?? true).length;
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

  return (
    <MobilePage>
      <PageHeader title="Concierge" subtitle={`${liveCount}/${meta.length} capabilities live`} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 2px" }}>
        <SegmentControl
          ariaLabel="Channel"
          value={view}
          onChange={setView}
          options={[
            { value: "mcp", label: "MCP server" },
            { value: "whatsapp", label: "WhatsApp" },
          ]}
        />
        <SegmentControl ariaLabel="Location" value={loc} onChange={setLoc} options={LOCS} />

        {view === "mcp" ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {meta.map((c) => {
                const on = exposure[c.id] ?? true;
                return (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      opacity: on ? 1 : 0.55,
                    }}
                  >
                    <span style={{ color: "var(--fg-muted)", flex: "none" }}>{CAP_ICON[c.id]}</span>
                    <button
                      type="button"
                      onClick={() => setOpen(c.id)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: "left",
                        background: "none",
                        border: 0,
                        color: "inherit",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)", display: "flex", alignItems: "center", gap: 7 }}>
                        {c.label}
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.05,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: c.kind === "resource" ? "var(--platinum-soft, rgba(203,180,138,.14))" : "var(--brand-soft)",
                            color: c.kind === "resource" ? "var(--platinum, #cbb48a)" : "var(--brand-bright, var(--brand))",
                          }}
                        >
                          {c.kind === "resource" ? "Resource" : "Tool"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 2, lineHeight: 1.35 }}>{c.desc}</div>
                    </button>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={`Toggle ${c.id}`}
                      checked={on}
                      onChange={() => void toggle(c.id)}
                      style={{ width: 22, height: 22, accentColor: "var(--brand)", flex: "none" }}
                    />
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 12, color: "var(--fg-subtle)", lineHeight: 1.5, padding: "0 4px" }}>
              One capability layer, exposed once over MCP/HTTP and the WhatsApp bot — the agent never
              guesses; every answer is auditable.
            </p>
          </>
        ) : (
          <WhatsAppPanel meta={meta} exposure={exposure} waConfigured={waConfigured} capIcon={CAP_ICON} />
        )}
      </div>

      {open && locData && (
        <CapabilitySheet
          cap={meta.find((m) => m.id === open)!}
          loc={loc}
          locLabel={LOCS.find((l) => l.value === loc)?.label ?? loc}
          locData={locData}
          enabled={exposure[open] ?? true}
          onClose={() => setOpen(null)}
        />
      )}
    </MobilePage>
  );
}

function WhatsAppPanel({
  meta,
  exposure,
  waConfigured,
  capIcon,
}: {
  meta: CapMeta[];
  exposure: Record<string, boolean>;
  waConfigured: boolean;
  capIcon: Record<CapId, React.ReactNode>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 4px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>WhatsApp Business</h3>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 999,
            background: waConfigured ? "var(--success-soft)" : "var(--surface-3)",
            color: waConfigured ? "var(--success)" : "var(--fg-muted)",
          }}
        >
          {waConfigured ? "Connected" : "Not configured"}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--fg-subtle)", lineHeight: 1.55 }}>
        The WhatsApp ordering bot and the MCP read endpoint are two consumers of the same capabilities —
        search the menu, check allergens, list slots, place orders and send a Stripe payment link. No app,
        no sign-up. Paid orders save the number to the guest graph (it shows up under Guests).
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {meta.map((c) => (
          <span
            key={c.id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 999,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
              opacity: (exposure[c.id] ?? true) ? 1 : 0.5,
            }}
          >
            {capIcon[c.id]} {c.label}
          </span>
        ))}
      </div>
      <Link
        href="/admin/guest?view=inbox"
        className="v2-m-btn v2-m-btn-primary"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        <MessageCircle className="h-4 w-4" /> Open the WhatsApp inbox <ExternalLink className="h-4 w-4" />
      </Link>
      {!waConfigured && (
        <p style={{ fontSize: 12, color: "var(--fg-subtle)", lineHeight: 1.5 }}>
          Set <code>WHATSAPP_PHONE_NUMBER_ID</code> and <code>WHATSAPP_ACCESS_TOKEN</code> to connect the
          live channel. Until then the bot runs in demo mode.
        </p>
      )}
    </div>
  );
}

function CapabilitySheet({
  cap,
  loc,
  locLabel,
  locData,
  enabled,
  onClose,
}: {
  cap: CapMeta;
  loc: string;
  locLabel: string;
  locData: LocData;
  enabled: boolean;
  onClose: () => void;
}) {
  const [test, setTest] = useState<{ status: number; body: unknown; ms: number } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setTest(null);
  }, [cap.id, loc]);

  const endpoint =
    cap.transport === "public" ? `/api/agent/${cap.id}?location=${loc}` : "conversational · WhatsApp + web checkout";

  const runTest = useCallback(async () => {
    setTesting(true);
    setTest(null);
    const startedAt = performance.now();
    try {
      const res = await fetch(`/api/agent/${cap.id}?location=${loc}`);
      const body = await res.json().catch(() => ({}));
      setTest({ status: res.status, body, ms: Math.round(performance.now() - startedAt) });
    } catch {
      setTest({ status: 0, body: "Request failed", ms: Math.round(performance.now() - startedAt) });
    } finally {
      setTesting(false);
    }
  }, [cap.id, loc]);

  const shown = test ? test.body : locData.samples[cap.id];

  return (
    <BottomSheet open onClose={onClose} title={cap.label} size="full">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            fontFamily: "var(--font-admin-mono, monospace)",
            fontSize: 12,
            color: enabled ? "var(--fg-muted)" : "var(--fg-subtle)",
            wordBreak: "break-all",
          }}
        >
          {endpoint}
          {!enabled && " · disabled"}
        </div>

        {cap.transport === "public" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="v2-m-btn v2-m-btn-primary"
              onClick={runTest}
              disabled={testing}
              style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              <Play className="h-4 w-4" /> {testing ? "Testing…" : "Test live"}
            </button>
            {test && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "4px 9px",
                  borderRadius: 999,
                  background: test.status >= 200 && test.status < 300 ? "var(--success-soft)" : "var(--danger-soft)",
                  color: test.status >= 200 && test.status < 300 ? "var(--success)" : "var(--danger)",
                }}
              >
                HTTP {test.status || "—"} · {test.ms}ms
              </span>
            )}
          </div>
        )}

        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.08, color: "var(--fg-subtle)" }}>
          What the agent sees
        </div>
        <pre
          style={{
            margin: 0,
            padding: 12,
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontFamily: "var(--font-admin-mono, monospace)",
            fontSize: 11.5,
            lineHeight: 1.5,
            color: "var(--fg-muted)",
            overflowX: "auto",
            whiteSpace: "pre",
          }}
        >
          {JSON.stringify(shown, null, 2)}
        </pre>

        {cap.id === "get_allergens" && (
          <>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.08, color: "var(--platinum, #cbb48a)" }}>
              EU-14 allergen matrix · {locLabel}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--fg-subtle)", position: "sticky", left: 0, background: "var(--surface-1)" }}>
                      Item
                    </th>
                    {locData.matrix.columns.map((c) => (
                      <th key={c.key} title={c.label} style={{ padding: "6px 4px" }}>
                        {c.emoji}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {locData.matrix.rows.map((r) => (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 8px", color: "var(--fg)", whiteSpace: "nowrap", position: "sticky", left: 0, background: "var(--surface-1)" }}>
                        {r.name}
                      </td>
                      {locData.matrix.columns.map((c) => (
                        <td key={c.key} style={{ padding: "6px 4px", textAlign: "center", color: r.allergens.includes(c.key) ? "var(--danger)" : "var(--fg-subtle)" }}>
                          {r.allergens.includes(c.key) ? "●" : "·"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", lineHeight: 1.5 }}>
              Filled = declared allergen. The agent reads this matrix — every allergen answer is auditable,
              never guessed.
            </p>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
