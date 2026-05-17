"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Sparkles, Star } from "lucide-react";
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
} from "../v2/mobile";

type AiSentiment = "positive" | "neutral" | "negative";

interface FeedbackEntry {
  id: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  locationSlug: string;
  date: string;
  overallRating: number;
  categoryRatings: Record<string, number>;
  comment: string;
  status: "new" | "reviewed" | "responded";
  sentiment?: AiSentiment;
  themes?: string[];
}

type Status = "all" | "new" | "reviewed" | "responded";

const STATUS_TONE = {
  new: "warning",
  reviewed: "info",
  responded: "success",
} as const;

const SENT_TONE: Record<AiSentiment, "success" | "warning" | "danger"> = {
  positive: "success",
  neutral: "warning",
  negative: "danger",
};

function stars(n: number): string {
  return "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
}

/**
 * Mobile feedback inbox. List of feedback rows; tap → detail sheet with
 * rating breakdown, AI sentiment/themes, and status advance buttons.
 * Manager re-analyze fires the AI sentiment endpoint same as desktop.
 */
export function MobileFeedback() {
  const { location } = useAdminLocation();
  const toast = useToast();
  const [rows, setRows] = useState<FeedbackEntry[]>([]);
  const [status, setStatus] = useState<Status>("all");
  const [minRating, setMinRating] = useState<number | null>(null);
  const [detail, setDetail] = useState<FeedbackEntry | null>(null);

  const refresh = async () => {
    const r = await fetch("/api/admin/feedback");
    if (!r.ok) return;
    const data = (await r.json()) as FeedbackEntry[];
    setRows(Array.isArray(data) ? data : []);
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    return rows
      .filter((f) => !location || f.locationSlug === location)
      .filter((f) => status === "all" || f.status === status)
      .filter((f) => minRating === null || f.overallRating >= minRating)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [rows, status, minRating, location]);

  const counts = useMemo(() => {
    const c = { all: rows.length, new: 0, reviewed: 0, responded: 0 } as Record<Status, number>;
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const setStatusFor = async (id: string, newStatus: FeedbackEntry["status"]) => {
    setRows((arr) => arr.map((f) => (f.id === id ? { ...f, status: newStatus } : f)));
    const r = await fetch("/api/admin/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
    if (!r.ok) {
      toast.error("Could not update status");
      refresh();
    } else {
      toast.success("Updated");
    }
  };

  const analyze = async () => {
    toast.info("Analyzing…");
    const r = await fetch("/api/admin/feedback/analyze", { method: "POST" });
    if (r.ok) {
      toast.success("Analysis complete");
      refresh();
    } else {
      toast.error("Analysis failed");
    }
  };

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SegmentControl<Status>
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: `All (${counts.all})` },
                { value: "new", label: `New (${counts.new})` },
                { value: "reviewed", label: `Reviewed (${counts.reviewed})` },
                { value: "responded", label: `Done (${counts.responded})` },
              ]}
              ariaLabel="Status filter"
            />
            <ChipStrip ariaLabel="Min rating">
              <Chip label="All ratings" active={minRating === null} onClick={() => setMinRating(null)} />
              {[5, 4, 3, 2, 1].map((r) => (
                <Chip
                  key={r}
                  label={`${r}★+`}
                  active={minRating === r}
                  onClick={() => setMinRating(r)}
                />
              ))}
            </ChipStrip>
          </div>
        }
      >
        <PageHeader
          title="Feedback"
          subtitle={`${filtered.length} entr${filtered.length === 1 ? "y" : "ies"}`}
          actions={
            <button
              type="button"
              className="v2-m-btn v2-m-btn-ghost"
              onClick={analyze}
              style={{ minHeight: 32, padding: "0 10px" }}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Analyze
            </button>
          }
        />

        {filtered.length === 0 ? (
          <div className="v2-m-empty">
            <MessageSquare className="h-6 w-6" aria-hidden />
            <div className="v2-m-empty-title">No feedback</div>
            <div className="v2-m-empty-desc">Nothing matches this filter yet.</div>
          </div>
        ) : (
          <ul role="list" className="v2-m-list">
            {filtered.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="v2-m-list-row"
                  onClick={() => setDetail(f)}
                >
                  <span
                    className={`v2-m-list-icon v2-m-tone-${f.sentiment ? SENT_TONE[f.sentiment] : "neutral"}`}
                    aria-hidden
                  >
                    <Star className="h-4 w-4" />
                  </span>
                  <span className="v2-m-list-stack">
                    <span className="v2-m-list-title">
                      {f.customerName || f.customerPhone || "Anonymous"}{" "}
                      <span style={{ color: "var(--warning)" }}>{stars(f.overallRating)}</span>
                    </span>
                    <span className="v2-m-list-sub">
                      {f.comment ? f.comment.slice(0, 64) : "(no comment)"}
                    </span>
                  </span>
                  <span className={`v2-m-pill v2-m-pill-${STATUS_TONE[f.status]}`}>
                    {f.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </MobilePage>

      <BottomSheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.customerName || "Anonymous"} · ${detail.overallRating}★` : ""}
        footer={
          detail ? (
            <div style={{ display: "flex", gap: 6, flex: 1 }}>
              {detail.status !== "reviewed" && (
                <button
                  type="button"
                  className="v2-m-btn v2-m-btn-ghost"
                  style={{ flex: 1 }}
                  onClick={() => { setStatusFor(detail.id, "reviewed"); setDetail(null); }}
                >
                  Mark reviewed
                </button>
              )}
              {detail.status !== "responded" && (
                <button
                  type="button"
                  className="v2-m-btn v2-m-btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => { setStatusFor(detail.id, "responded"); setDetail(null); }}
                >
                  Mark responded
                </button>
              )}
            </div>
          ) : null
        }
      >
        {detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: 12, background: "var(--surface-2)", borderRadius: 10 }}>
              <div style={{ fontSize: 14 }}>{detail.comment || "(no comment)"}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {Object.entries(detail.categoryRatings).map(([cat, v]) => (
                <div
                  key={cat}
                  style={{
                    padding: 8,
                    background: "var(--surface-1)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
                  <div style={{ color: "var(--fg-subtle)", textTransform: "capitalize" }}>{cat}</div>
                  <div className="tabular" style={{ fontWeight: 500, fontSize: 14, color: "var(--warning)" }}>
                    {stars(v)}
                  </div>
                </div>
              ))}
            </div>

            {detail.sentiment && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 10,
                  borderRadius: 10,
                  background: `var(--${SENT_TONE[detail.sentiment]}-soft)`,
                  color: `var(--${SENT_TONE[detail.sentiment]})`,
                }}
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                <span style={{ fontWeight: 500, textTransform: "capitalize", fontSize: 13 }}>
                  AI: {detail.sentiment}
                </span>
              </div>
            )}

            {detail.themes && detail.themes.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", marginBottom: 6 }}>
                  Themes
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {detail.themes.map((t) => (
                    <span key={t} className="v2-m-pill v2-m-pill-neutral">{t}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
              Order #{detail.orderId.slice(-6)} · {detail.locationSlug} · {new Date(detail.date).toLocaleDateString()}
            </div>
          </div>
        )}
      </BottomSheet>
    </PullToRefresh>
  );
}
