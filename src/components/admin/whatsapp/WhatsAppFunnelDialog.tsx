"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/ui";

/**
 * Conversion-funnel analytics for the WhatsApp channel. Reads the real
 * stage-event log (started → location → cart → fulfillment → slot → pay link →
 * paid) aggregated cumulatively per phone, so the bars are monotonic and the
 * drop-off between stages is honest. No simulated chats (they bypass the live
 * pipeline).
 */

type WindowKey = "7d" | "30d" | "all";

interface Stage {
  stage: string;
  label: string;
  count: number;
  pctOfStart: number;
  pctOfPrev: number;
  dropFromPrev: number;
}
interface FunnelResponse {
  window: string;
  startedCount: number;
  paidCount: number;
  conversionRate: number;
  uniqueConversations: number;
  stages: Stage[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function WhatsAppFunnelDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [windowKey, setWindowKey] = useState<WindowKey>("7d");
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/whatsapp/funnel?window=${windowKey}`);
      if (res.ok) setData((await res.json()) as FunnelResponse);
    } finally {
      setLoading(false);
    }
  }, [windowKey]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      theme="core"
      size="lg"
      title="Conversion funnel"
      description="How far conversations get, from first message to a paid order. Cumulative per phone — reaching a later stage counts toward the earlier ones."
    >
      <div className="wa-funnel-an">
        <div className="wa-fa-windows" role="group" aria-label="Window">
          {(["7d", "30d", "all"] as WindowKey[]).map((w) => (
            <button
              key={w}
              type="button"
              className="cmd-chip"
              aria-pressed={windowKey === w}
              onClick={() => setWindowKey(w)}
            >
              {w === "all" ? "All time" : `Last ${w}`}
            </button>
          ))}
        </div>

        {loading && !data ? (
          <p className="admin-text-secondary text-sm">Loading…</p>
        ) : !data || data.startedCount === 0 ? (
          <p className="admin-text-secondary text-sm">
            No conversations recorded in this window yet. The funnel fills as customers message the
            WhatsApp number.
          </p>
        ) : (
          <>
            <div className="wa-fa-summary">
              <Tile label="Started" value={String(data.startedCount)} />
              <Tile label="Paid" value={String(data.paidCount)} />
              <Tile label="Conversion" value={pct(data.conversionRate)} accent />
            </div>
            <div className="wa-fa-bars">
              {data.stages.map((s, i) => (
                <div key={s.stage} className="wa-fa-row">
                  <div className="wa-fa-row-head">
                    <span className="wa-fa-label">{s.label}</span>
                    <span className="wa-fa-count tnum">
                      {s.count}
                      <span className="wa-fa-of"> · {pct(s.pctOfStart)}</span>
                    </span>
                  </div>
                  <div className="wa-fa-track">
                    <div
                      className="wa-fa-fill"
                      style={{ width: `${Math.round(s.pctOfStart * 100)}%` }}
                    />
                  </div>
                  {i > 0 && s.dropFromPrev > 0 && (
                    <div className="wa-fa-drop">
                      −{s.dropFromPrev} dropped ({pct(1 - s.pctOfPrev)} of previous step)
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`wa-fa-tile${accent ? " accent" : ""}`}>
      <span className="wa-fa-tile-label">{label}</span>
      <span className="wa-fa-tile-value tnum">{value}</span>
    </div>
  );
}
