"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, Star } from "lucide-react";
import { Badge, type BadgeTone, BarChart, type BarDatum, Button, Card, CardBody, CardHead, ChartLegend, type ColumnV3, Dialog, Donut, type DonutDatum, Kpi, SkeletonRows, Table } from "./ui";

type Status = "new" | "reviewed" | "responded";
interface FeedbackEntry {
  id: string;
  orderId: string;
  customerName: string;
  overallRating: number;
  comment: string;
  status: Status;
  sentiment?: "positive" | "neutral" | "negative";
  createdAt?: string;
  locationSlug?: string;
}

const STATUS_LABEL: Record<Status, string> = { new: "New", reviewed: "Reviewed", responded: "Responded" };
const STATUS_TONE: Record<Status, BadgeTone> = { new: "warn", reviewed: "info", responded: "ok" };
const NEXT: Record<Status, Status | null> = { new: "reviewed", reviewed: "responded", responded: null };

function ratingTone(r: number): BadgeTone {
  if (r >= 4) return "ok";
  if (r === 3) return "warn";
  return "bad";
}
function sentimentTone(s: string): BadgeTone {
  if (s === "positive") return "ok";
  if (s === "negative") return "bad";
  return "neutral";
}
function fmtDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short" }) : "—";
}

export function FeedbackV3() {
  const [list, setList] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<FeedbackEntry | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/feedback").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setList(Array.isArray(res) ? res : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = { all: list.length, new: 0, reviewed: 0, responded: 0 } as Record<string, number>;
    for (const f of list) c[f.status]++;
    return c;
  }, [list]);
  const avg = list.length ? list.reduce((s, f) => s + f.overallRating, 0) / list.length : 0;

  const ratingDist = useMemo<BarDatum[]>(
    () => [1, 2, 3, 4, 5].map((star) => ({
      label: `${star}★`,
      value: list.filter((f) => Math.round(f.overallRating) === star).length,
      colorVar: star >= 4 ? "--av3-c4" : star === 3 ? "--av3-c5" : "--av3-c1",
    })),
    [list],
  );
  const sentimentMix = useMemo<DonutDatum[]>(() => {
    const defs = [
      { label: "Positive", key: "positive", colorVar: "--av3-c4" },
      { label: "Neutral", key: "neutral", colorVar: "--av3-c2" },
      { label: "Negative", key: "negative", colorVar: "--av3-c1" },
    ] as const;
    return defs
      .map((d) => ({ label: d.label, value: list.filter((f) => f.sentiment === d.key).length, colorVar: d.colorVar }))
      .filter((d) => d.value > 0);
  }, [list]);
  const sentimentTotal = sentimentMix.reduce((s, d) => s + d.value, 0);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const r = list.filter((f) => (filter === "all" || f.status === filter) && (!needle || (f.customerName ?? "").toLowerCase().includes(needle) || (f.comment ?? "").toLowerCase().includes(needle)));
    return [...r].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  }, [list, filter, q]);

  const setStatus = async (id: string, status: Status) => {
    setBusy(id);
    setList((arr) => arr.map((f) => (f.id === id ? { ...f, status } : f)));
    try {
      await fetch("/api/admin/feedback", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    } finally {
      setBusy(null);
    }
  };
  const analyze = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/admin/feedback/analyze", { method: "POST" });
      if (res.ok) await load();
    } finally {
      setAnalyzing(false);
    }
  };

  const chips: ("all" | Status)[] = ["all", "new", "reviewed", "responded"];
  const cols: ColumnV3<FeedbackEntry>[] = [
    { key: "rating", header: "Rating", render: (f) => <Badge tone={ratingTone(f.overallRating)}><Star style={{ width: 11, height: 11 }} />{f.overallRating}</Badge> },
    { key: "cust", header: "Customer", render: (f) => f.customerName || "—" },
    { key: "comment", header: "Comment", render: (f) => <span className="av3-cell-muted" style={{ display: "inline-block", maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" }}>{f.comment || "—"}</span> },
    { key: "sent", header: "Sentiment", render: (f) => (f.sentiment ? <Badge tone={sentimentTone(f.sentiment)}>{f.sentiment}</Badge> : <span className="av3-cell-muted">—</span>) },
    { key: "st", header: "Status", render: (f) => <Badge tone={STATUS_TONE[f.status]} dot>{STATUS_LABEL[f.status]}</Badge> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Feedback</h1>
          <div className="av3-pagehead-sub">Guest reviews · {avg ? `${avg.toFixed(1)}★ avg` : "no ratings yet"}</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="secondary" size="sm" loading={analyzing} onClick={analyze}><Sparkles className="av3-btn-ico" /> Analyze sentiment</Button>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Avg rating" icon={Star} value={avg ? `${avg.toFixed(1)}` : "—"} accentVar="--av3-c4" />
        <Kpi label="Reviews" icon={Star} value={`${list.length}`} accentVar="--av3-c3" />
        <Kpi label="New" icon={Star} value={`${counts.new}`} accentVar="--av3-c1" />
      </div>

      {list.length > 0 && (
        <div className="av3-grid-2">
          <Card>
            <CardHead title="Rating distribution" description="All guest ratings, 1–5★" />
            <CardBody><BarChart data={ratingDist} height={160} accentVar="--av3-c3" /></CardBody>
          </Card>
          <Card>
            <CardHead title="Sentiment" description="AI-classified review sentiment" />
            <CardBody>
              {sentimentMix.length === 0 ? (
                <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>Run “Analyze sentiment” to classify reviews.</div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                  <Donut data={sentimentMix} size={140} centerValue={sentimentTotal} centerLabel="RATED" />
                  <ChartLegend items={sentimentMix} format={(n) => `${n} · ${Math.round((n / sentimentTotal) * 100)}%`} />
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      <div className="av3-toolbar">
        <div className="av3-filterchips">
          {chips.map((f) => (
            <button key={f} type="button" className={`av3-fchip ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : STATUS_LABEL[f]}<span className="av3-fchip-count">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
        <span className="av3-toolbar-spacer" />
        <input className="av3-input" style={{ fontFamily: "var(--av3-ui)", width: 220, height: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guest or comment…" />
      </div>

      {loading && list.length === 0 ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No feedback</div><div className="av3-empty-text">Guest reviews land here after orders.</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(f) => f.id} onRowClick={(f) => setDetail(f)} />
          )}
        </div>
      )}

      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.customerName || "Guest"} · ${detail.overallRating}★` : ""}
        subtitle={detail ? `Order #${detail.orderId.slice(-5)} · ${fmtDate(detail.createdAt)}` : undefined}
        headerExtra={detail ? <Badge tone={STATUS_TONE[detail.status]} dot>{STATUS_LABEL[detail.status]}</Badge> : undefined}
        width={500}
        footer={detail && NEXT[detail.status] && (
          <Button variant="primary" size="sm" loading={busy === detail.id} onClick={() => { setStatus(detail.id, NEXT[detail.status]!); setDetail({ ...detail, status: NEXT[detail.status]! }); }}>
            Mark {STATUS_LABEL[NEXT[detail.status]!].toLowerCase()}
          </Button>
        )}
      >
        {detail && (
          <>
            {detail.sentiment && <div style={{ marginBottom: 10 }}><Badge tone={sentimentTone(detail.sentiment)}>{detail.sentiment} sentiment</Badge></div>}
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{detail.comment || <span className="av3-cell-muted">No written comment.</span>}</div>
          </>
        )}
      </Dialog>
    </>
  );
}
