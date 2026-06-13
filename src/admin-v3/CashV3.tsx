"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, type BadgeTone, Button, Card, CardBody, CardHead, type ColumnV3, Dialog, Kpi, KpiRail, SkeletonKpiRail, SkeletonRows, Table } from "./ui";

interface Drop { amountGrosze: number; kind: string; notes?: string; at?: string }
interface CashSession {
  id: string;
  locationSlug: string;
  openingFloat: number;
  openedAt: string;
  openedBy: string;
  drops: Drop[];
  closedAt?: string;
  closingCountGrosze?: number;
  varianceGrosze?: number;
}

const KINDS = [
  { value: "sale", label: "Cash sale (+)" },
  { value: "drop", label: "Bank drop (−)" },
  { value: "payout", label: "Payout (−)" },
];

function expected(s: CashSession) {
  return s.openingFloat + s.drops.reduce((acc, d) => acc + d.amountGrosze, 0);
}
function varianceTone(g: number): BadgeTone {
  const a = Math.abs(g);
  if (a < 200) return "ok";
  if (a < 1000) return "warn";
  return "bad";
}
function fmtWhen(iso?: string) {
  return iso ? new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

export function CashV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [floatStr, setFloatStr] = useState("");
  const [openedBy, setOpenedBy] = useState("");
  const [entryAmt, setEntryAmt] = useState("");
  const [entryKind, setEntryKind] = useState("sale");
  const [entryNotes, setEntryNotes] = useState("");
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/cash?location=${loc}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const arr: CashSession[] = Array.isArray(res) ? res : Array.isArray(res?.sessions) ? res.sessions : [];
    setSessions(arr);
    setLoading(false);
  }, [loc]);
  useEffect(() => { load(); }, [load]);

  const open = sessions.find((s) => !s.closedAt && s.locationSlug === loc) ?? null;
  const closed = useMemo(() => sessions.filter((s) => s.closedAt).sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime()), [sessions]);

  const openSession = async () => {
    const openingFloat = Math.round(parseFloat(floatStr || "0") * 100);
    if (!Number.isFinite(openingFloat) || openingFloat < 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/cash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationSlug: loc, openingFloat, openedBy: openedBy.trim() || "admin" }) });
      if (res.ok) { setFloatStr(""); setOpenedBy(""); await load(); }
    } finally {
      setBusy(false);
    }
  };

  const recordEntry = async () => {
    if (!open) return;
    let amount = Math.round(parseFloat(entryAmt || "0") * 100);
    if (!amount) return;
    if (entryKind === "drop" || entryKind === "payout") amount = -Math.abs(amount);
    else amount = Math.abs(amount);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/cash/${open.id}?action=drop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountGrosze: amount, kind: entryKind, notes: entryNotes.trim() || undefined }) });
      if (res.ok) { setEntryAmt(""); setEntryNotes(""); await load(); }
    } finally {
      setBusy(false);
    }
  };

  const histCols: ColumnV3<CashSession>[] = [
    { key: "opened", header: "Opened", render: (s) => <span className="av3-cell-muted">{fmtWhen(s.openedAt)}</span> },
    { key: "closed", header: "Closed", render: (s) => <span className="av3-cell-muted">{fmtWhen(s.closedAt)}</span> },
    { key: "float", header: "Opening", num: true, render: (s) => formatPrice(s.openingFloat) },
    { key: "counted", header: "Counted", num: true, render: (s) => (s.closingCountGrosze != null ? formatPrice(s.closingCountGrosze) : "—") },
    { key: "var", header: "Variance", num: true, render: (s) => <Badge tone={varianceTone(s.varianceGrosze ?? 0)}>{(s.varianceGrosze ?? 0) >= 0 ? "+" : ""}{formatPrice(s.varianceGrosze ?? 0)}</Badge> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Cash</h1>
          <div className="av3-pagehead-sub">Till sessions · open · drops · close · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
      </div>

      {loading && sessions.length === 0 ? (
        <>
          <SkeletonKpiRail count={3} />
          <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
        </>
      ) : open ? (
        <>
          <KpiRail>
            <Kpi label="Opening float" icon={Banknote} value={formatPrice(open.openingFloat)} accentVar="--av3-c2" />
            <Kpi label="Expected in drawer" icon={Banknote} value={formatPrice(expected(open))} accentVar="--av3-c4" />
            <Kpi label="Entries" icon={Banknote} value={`${open.drops.length}`} accentVar="--av3-c3" />
          </KpiRail>

          <Card>
            <CardHead title={`Open session · ${city}`} description={`Opened ${fmtWhen(open.openedAt)} by ${open.openedBy}`} actions={<Button variant="primary" size="sm" onClick={() => setClosing(true)}>Close session</Button>} />
            <CardBody>
              <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginBottom: 14 }}>
                <label className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Kind</span>
                  <select className="av3-select" value={entryKind} onChange={(e) => setEntryKind(e.target.value)}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
                </label>
                <label className="av3-field" style={{ width: 110 }}><span className="av3-field-label">Amount (zł)</span><input className="av3-input" type="number" step="0.01" value={entryAmt} onChange={(e) => setEntryAmt(e.target.value)} /></label>
                <label className="av3-field" style={{ flex: 1, minWidth: 160 }}><span className="av3-field-label">Notes</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={entryNotes} onChange={(e) => setEntryNotes(e.target.value)} placeholder="optional" /></label>
                <Button variant="secondary" size="sm" loading={busy} onClick={recordEntry}>Record entry</Button>
              </div>
              {open.drops.length === 0 ? (
                <div className="av3-empty-text" style={{ color: "var(--av3-subtle)", padding: "4px 0" }}>No entries yet. Log cash sales, bank drops or payouts above.</div>
              ) : (
                open.drops.slice().reverse().map((d, i) => (
                  <div className="av3-od-line" key={i}>
                    <div><span className="q" style={{ textTransform: "capitalize" }}>{d.kind}</span>{d.notes ? ` · ${d.notes}` : ""}</div>
                    <span className="lp" style={{ color: d.amountGrosze < 0 ? "var(--av3-bad)" : "var(--av3-ok)" }}>{d.amountGrosze >= 0 ? "+" : ""}{formatPrice(d.amountGrosze)}</span>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </>
      ) : (
        <Card>
          <CardHead title={`Open the till · ${city}`} description="Set the opening float to start a session" />
          <CardBody>
            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <label className="av3-field" style={{ width: 140 }}><span className="av3-field-label">Opening float (zł)</span><input className="av3-input" type="number" step="0.01" value={floatStr} onChange={(e) => setFloatStr(e.target.value)} placeholder="200" /></label>
              <label className="av3-field" style={{ width: 180 }}><span className="av3-field-label">Opened by</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={openedBy} onChange={(e) => setOpenedBy(e.target.value)} placeholder="name" /></label>
              <Button variant="primary" size="sm" loading={busy} onClick={openSession}>Open session</Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card style={{ padding: 0 }}>
        <CardHead title="Recent sessions" />
        {closed.length === 0 ? (
          <CardBody><div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No closed sessions yet.</div></CardBody>
        ) : (
          <Table columns={histCols} rows={closed} rowKey={(s) => s.id} />
        )}
      </Card>

      {closing && open && <CloseDialog session={open} city={city} onClose={() => setClosing(false)} onClosed={async () => { await load(); setClosing(false); }} />}
    </>
  );
}

function CloseDialog({ session, city, onClose, onClosed }: { session: CashSession; city: string; onClose: () => void; onClosed: () => Promise<void> }) {
  const [count, setCount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const exp = expected(session);
  const counted = count.trim() === "" ? null : Math.round(parseFloat(count) * 100);
  const variance = counted == null ? null : counted - exp;

  const submit = async () => {
    if (counted == null) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cash/${session.id}?action=close`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ closingCountGrosze: counted, notes: notes.trim() || undefined }) });
      if (res.ok) await onClosed();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`Close session · ${city}`} subtitle={`Expected in drawer ${formatPrice(exp)}`} width={460}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={counted == null} onClick={submit}>Close session</Button></>}
    >
      <label className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Counted cash (zł)</span><input className="av3-input" type="number" step="0.01" value={count} onChange={(e) => setCount(e.target.value)} autoFocus /></label>
      {variance != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span className="av3-field-label" style={{ marginBottom: 0 }}>Variance</span>
          <Badge tone={varianceTone(variance)}>{variance >= 0 ? "+" : ""}{formatPrice(variance)}</Badge>
        </div>
      )}
      <label className="av3-field"><span className="av3-field-label">Notes</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" /></label>
    </Dialog>
  );
}
