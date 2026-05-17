"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, MinusCircle, PlusCircle, ShieldCheck } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { CashSession } from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocation } from "../v2/LocationContext";
import { useToast } from "../v2/ui/Toast";
import {
  BottomSheet,
  Chip,
  ChipStrip,
  MobilePage,
  PageHeader,
  PullToRefresh,
  SegmentControl,
  Section,
  type StatItem,
  StatRow,
} from "../v2/mobile";

const FALLBACK_LOC = getActiveLocations()[0]?.slug ?? "krakow";
type Tab = "active" | "history";

function sumDrops(s: CashSession): number {
  return s.drops.reduce((acc, d) => acc + d.amountGrosze, 0);
}
function expected(s: CashSession): number {
  return s.openingFloat + sumDrops(s);
}

/**
 * Cash sessions on mobile. Active card with quick Drop / Sale / Adjust;
 * Close opens a count sheet showing variance. History tab is virtualizable
 * but typically <100 entries.
 */
export function MobileCash() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();
  const [pageLoc, setPageLoc] = useState<string>(globalLoc || FALLBACK_LOC);
  const [tab, setTab] = useState<Tab>("active");
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [opening, setOpening] = useState(false);
  const [droppingFor, setDroppingFor] = useState<CashSession | null>(null);
  const [closingFor, setClosingFor] = useState<CashSession | null>(null);

  useEffect(() => {
    if (globalLoc) setPageLoc(globalLoc);
  }, [globalLoc]);

  const refresh = async () => {
    const qs = new URLSearchParams({ location: pageLoc });
    const r = await fetch(`/api/admin/cash?${qs.toString()}`);
    if (!r.ok) return;
    setSessions(((await r.json()) as CashSession[]) ?? []);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageLoc]);

  const active = useMemo(() => sessions.find((s) => !s.closedAt) ?? null, [sessions]);
  const history = useMemo(
    () =>
      sessions
        .filter((s) => s.closedAt && !s.hidden)
        .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? "")),
    [sessions],
  );

  const stats: StatItem[] = active
    ? [
        {
          label: "Opening float",
          value: formatPrice(active.openingFloat),
          icon: Banknote,
          tone: "neutral",
        },
        {
          label: "Drops + sales",
          value: formatPrice(sumDrops(active)),
          icon: PlusCircle,
          tone: "info",
          hint: `${active.drops.length} event${active.drops.length === 1 ? "" : "s"}`,
        },
        {
          label: "Expected in till",
          value: formatPrice(expected(active)),
          icon: ShieldCheck,
          tone: "success",
        },
      ]
    : [];

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SegmentControl<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: "active", label: active ? "Active" : "Start session" },
                { value: "history", label: `History (${history.length})` },
              ]}
              ariaLabel="Cash tab"
            />
            <ChipStrip ariaLabel="Location">
              {getActiveLocations().map((l) => (
                <Chip
                  key={l.slug}
                  label={l.city}
                  active={pageLoc === l.slug}
                  onClick={() => setPageLoc(l.slug)}
                />
              ))}
            </ChipStrip>
          </div>
        }
      >
        <PageHeader title="Cash" subtitle={pageLoc.toUpperCase()} />

        {tab === "active" && (active ? (
          <>
            <StatRow items={stats} />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="v2-m-btn v2-m-btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setDroppingFor(active)}
              >
                <PlusCircle className="h-4 w-4" aria-hidden /> Drop
              </button>
              <button
                type="button"
                className="v2-m-btn v2-m-btn-primary"
                style={{ flex: 1 }}
                onClick={() => setClosingFor(active)}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden /> Close session
              </button>
            </div>

            <Section title={`Movements (${active.drops.length})`}>
              {active.drops.length === 0 ? (
                <div className="v2-m-empty">
                  <div className="v2-m-empty-title">No drops yet</div>
                </div>
              ) : (
                <ul role="list" className="v2-m-list">
                  {[...active.drops].reverse().map((d) => (
                    <li key={d.id}>
                      <div className="v2-m-list-row">
                        <span
                          className={`v2-m-list-icon ${d.amountGrosze >= 0 ? "v2-m-tone-success" : "v2-m-tone-warning"}`}
                          aria-hidden
                        >
                          {d.amountGrosze >= 0 ? <PlusCircle className="h-4 w-4" /> : <MinusCircle className="h-4 w-4" />}
                        </span>
                        <span className="v2-m-list-stack">
                          <span className="v2-m-list-title" style={{ textTransform: "capitalize" }}>
                            {d.kind}
                          </span>
                          <span className="v2-m-list-sub">{d.notes || new Date(d.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </span>
                        <span className="v2-m-list-metric tabular">
                          {d.amountGrosze >= 0 ? "+" : ""}{formatPrice(Math.abs(d.amountGrosze))}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        ) : (
          <div className="v2-m-empty">
            <Banknote className="h-6 w-6" aria-hidden />
            <div className="v2-m-empty-title">No active session</div>
            <div className="v2-m-empty-desc">Open one to start counting drops.</div>
            <button
              type="button"
              className="v2-m-btn v2-m-btn-primary"
              style={{ marginTop: 12 }}
              onClick={() => setOpening(true)}
            >
              Open session
            </button>
          </div>
        ))}

        {tab === "history" && (
          <ul role="list" className="v2-m-list">
            {history.length === 0 ? (
              <li>
                <div className="v2-m-list-empty">No closed sessions yet.</div>
              </li>
            ) : (
              history.slice(0, 30).map((s) => {
                const variance = s.varianceGrosze ?? 0;
                const tone =
                  Math.abs(variance) < 1000
                    ? "success"
                    : Math.abs(variance) < 5000
                      ? "warning"
                      : "danger";
                return (
                  <li key={s.id}>
                    <div className="v2-m-list-row">
                      <span className={`v2-m-list-icon v2-m-tone-${tone}`} aria-hidden>
                        <ShieldCheck className="h-4 w-4" />
                      </span>
                      <span className="v2-m-list-stack">
                        <span className="v2-m-list-title">
                          {new Date(s.closedAt!).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                        <span className="v2-m-list-sub">
                          {formatPrice(expected(s))} expected → {formatPrice(s.closingCountGrosze ?? 0)} counted
                        </span>
                      </span>
                      <span className={`v2-m-pill v2-m-pill-${tone}`}>
                        {variance >= 0 ? "+" : ""}{formatPrice(variance)}
                      </span>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </MobilePage>

      <OpenSheet
        open={opening}
        onClose={() => setOpening(false)}
        locationSlug={pageLoc}
        onOpened={() => {
          setOpening(false);
          refresh();
          toast.success("Session opened");
        }}
      />

      <DropSheet
        session={droppingFor}
        onClose={() => setDroppingFor(null)}
        onDone={() => {
          setDroppingFor(null);
          refresh();
          toast.success("Drop recorded");
        }}
      />

      <CloseSheet
        session={closingFor}
        onClose={() => setClosingFor(null)}
        onClosed={() => {
          setClosingFor(null);
          refresh();
          toast.success("Session closed");
        }}
      />
    </PullToRefresh>
  );
}

function OpenSheet({
  open,
  onClose,
  locationSlug,
  onOpened,
}: {
  open: boolean;
  onClose: () => void;
  locationSlug: string;
  onOpened: () => void;
}) {
  const toast = useToast();
  const [float, setFloat] = useState("200.00");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setFloat("200.00"); }, [open]);

  const submit = async () => {
    const grosze = Math.round(parseFloat(float.replace(",", ".")) * 100);
    if (!Number.isFinite(grosze) || grosze < 0) {
      toast.error("Bad amount");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationSlug, openingFloatGrosze: grosze }),
      });
      if (!r.ok) {
        const data: { error?: string } = await r.json().catch(() => ({}));
        toast.error("Could not open", data.error);
        return;
      }
      onOpened();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Open cash session"
      footer={
        <button
          type="button"
          className="v2-m-btn v2-m-btn-primary"
          style={{ flex: 1 }}
          disabled={busy}
          onClick={submit}
        >
          {busy ? "Opening…" : "Open with this float"}
        </button>
      }
    >
      <AmountInput value={float} onChange={setFloat} label="Opening float" />
    </BottomSheet>
  );
}

function DropSheet({
  session,
  onClose,
  onDone,
}: {
  session: CashSession | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<"sale" | "drop" | "payout" | "adjust">("sale");
  const [amount, setAmount] = useState("0.00");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) {
      setKind("sale");
      setAmount("0.00");
      setNotes("");
    }
  }, [session]);

  const submit = async () => {
    if (!session) return;
    const grosze = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(grosze) || grosze === 0) {
      toast.error("Bad amount");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/cash/${session.id}?action=drop`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountGrosze: kind === "payout" ? -Math.abs(grosze) : Math.abs(grosze),
          kind,
          notes: notes.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const data: { error?: string } = await r.json().catch(() => ({}));
        toast.error("Could not record", data.error);
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={!!session}
      onClose={onClose}
      title="Record till movement"
      footer={
        <button
          type="button"
          className="v2-m-btn v2-m-btn-primary"
          style={{ flex: 1 }}
          disabled={busy}
          onClick={submit}
        >
          {busy ? "Saving…" : `Record ${kind}`}
        </button>
      }
    >
      <SegmentControl
        value={kind}
        onChange={setKind}
        options={[
          { value: "sale", label: "Sale" },
          { value: "drop", label: "Drop" },
          { value: "payout", label: "Payout" },
          { value: "adjust", label: "Adjust" },
        ]}
        ariaLabel="Movement kind"
      />
      <AmountInput value={amount} onChange={setAmount} label="Amount" />
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        style={{
          padding: "10px 12px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          color: "var(--fg)",
          fontSize: 16,
          fontFamily: "var(--font-ui)",
          outline: 0,
          resize: "none",
        }}
      />
    </BottomSheet>
  );
}

function CloseSheet({
  session,
  onClose,
  onClosed,
}: {
  session: CashSession | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  const toast = useToast();
  const [counted, setCounted] = useState("0.00");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) {
      setCounted(((expected(session)) / 100).toFixed(2));
    }
  }, [session]);

  if (!session) return null;
  const exp = expected(session);
  const countedGrosze = Math.round(parseFloat(counted.replace(",", ".")) * 100);
  const variance = (Number.isFinite(countedGrosze) ? countedGrosze : 0) - exp;
  const tone = Math.abs(variance) < 1000 ? "success" : Math.abs(variance) < 5000 ? "warning" : "danger";

  const submit = async () => {
    if (!Number.isFinite(countedGrosze)) {
      toast.error("Bad amount");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/cash/${session.id}?action=close`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closingCountGrosze: countedGrosze }),
      });
      if (!r.ok) {
        const data: { error?: string } = await r.json().catch(() => ({}));
        toast.error("Could not close", data.error);
        return;
      }
      onClosed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={!!session}
      onClose={onClose}
      title="Close cash session"
      footer={
        <button
          type="button"
          className="v2-m-btn v2-m-btn-primary"
          style={{ flex: 1 }}
          disabled={busy}
          onClick={submit}
        >
          {busy ? "Closing…" : "Close session"}
        </button>
      }
    >
      <div
        style={{
          padding: 12,
          background: "var(--surface-2)",
          borderRadius: 10,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
        }}
      >
        <span style={{ color: "var(--fg-subtle)" }}>Expected in till</span>
        <span className="tabular" style={{ fontWeight: 500 }}>{formatPrice(exp)}</span>
      </div>
      <AmountInput value={counted} onChange={setCounted} label="Counted total" />
      <div
        style={{
          padding: 12,
          borderRadius: 10,
          background: `var(--${tone}-soft)`,
          color: `var(--${tone})`,
          fontSize: 13,
          fontWeight: 500,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>Variance</span>
        <span className="tabular">
          {variance >= 0 ? "+" : ""}{formatPrice(variance)}
        </span>
      </div>
    </BottomSheet>
  );
}

function AmountInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      <span style={{ color: "var(--fg-subtle)", fontSize: 13 }}>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          background: "transparent",
          border: 0,
          outline: 0,
          color: "var(--fg)",
          fontSize: 18,
          fontWeight: 500,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      />
      <span style={{ color: "var(--fg-subtle)", fontSize: 13 }}>zł</span>
    </label>
  );
}
