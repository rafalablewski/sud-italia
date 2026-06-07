import { Fragment } from "react";
import { AlertTriangle, FlaskConical, Layers } from "lucide-react";
import type { MenuCategory } from "@/data/types";
import { POS_COURSE_LABELS } from "@/lib/pos-coursing";
import { fulfillmentLabel } from "@/lib/fulfillment";
import type { TicketTone } from "@/lib/kds-prediction";
import type { KdsTicket, KdsTicketItem } from "@/lib/kds-ticket";

/**
 * KDS ticket card — the core-suite `.tk` design (ported from kds.html). Neutral
 * by default; the left accent, timer and SLA meter escalate with the SLA tone
 * (warn → risk → late) and flip to ready/green at the pass. Styled by the
 * `.tk*` rules in `suite.css` (scoped to the `.kds-core` surface). Shares the
 * KdsTicket shape with the fleet board so the data never drifts.
 */

const NEXT_LABEL: Record<string, string> = {
  confirmed: "Start prep",
  preparing: "Mark ready",
  ready: "Bump · Done",
};
const CATEGORY_ORDER = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function mmss(seconds: number): string {
  const a = Math.abs(Math.round(seconds));
  return `${Math.floor(a / 60)}:${pad(a % 60)}`;
}

export function KdsTk({
  t,
  now,
  tone,
  advancing,
  onAdvance,
}: {
  t: KdsTicket;
  now: number;
  tone: TicketTone;
  /** Accepted for call-site parity with the old card; the `.tk` design doesn't dim by station. */
  station?: MenuCategory | "all";
  advancing: boolean;
  onAdvance: (t: KdsTicket) => void;
}) {
  const elapsed = Math.max(0, (now - t.paidAtMs) / 1000);
  const slaRem = t.promisedReadyAtMs !== null ? (t.promisedReadyAtMs - now) / 1000 : null;
  const predRem = Math.max(0, (t.predictedReadyAtMs - now) / 1000);

  const toneClass =
    t.status === "ready" ? "ready" : tone === "late" ? "late" : tone === "risk" ? "risk" : tone === "warn" ? "warn" : "";

  // SLA meter fills as the promised window is consumed (0% fresh → 100% due/late).
  let slaPct: number;
  if (t.status === "ready" || (slaRem !== null && slaRem < 0)) {
    slaPct = 100;
  } else if (slaRem !== null && t.promisedReadyAtMs !== null) {
    const window = Math.max(60, (t.promisedReadyAtMs - t.paidAtMs) / 1000);
    slaPct = Math.min(100, Math.max(0, Math.round((1 - slaRem / window) * 100)));
  } else {
    slaPct = Math.min(95, Math.round((elapsed / Math.max(60, predRem + elapsed)) * 100));
  }

  const etaLbl =
    t.status === "ready"
      ? "Ready for expo"
      : slaRem !== null && slaRem < 0
        ? `Over promise · ${mmss(slaRem)}`
        : tone === "risk"
          ? `At risk · ~${mmss(predRem)}`
          : `Ready in ~${mmss(predRem)}`;

  const timerText = t.status === "ready" ? "plated" : mmss(elapsed);

  // Group items by category in canonical station order.
  const groups = new Map<string, KdsTicketItem[]>();
  for (const it of t.items) {
    const arr = groups.get(it.category) ?? [];
    arr.push(it);
    groups.set(it.category, arr);
  }
  const sortedGroups = [...groups.entries()].sort(
    (a, b) =>
      (CATEGORY_ORDER.indexOf(a[0]) < 0 ? 99 : CATEGORY_ORDER.indexOf(a[0])) -
      (CATEGORY_ORDER.indexOf(b[0]) < 0 ? 99 : CATEGORY_ORDER.indexOf(b[0])),
  );

  const allergens = Array.from(new Set(t.items.flatMap((i) => i.allergens))).filter(Boolean);

  return (
    <article className={`tk ${toneClass}`} style={t.simulated ? { borderStyle: "dashed" } : undefined}>
      {t.simulated && (
        <div className="tk-coursehint" style={{ color: "var(--platinum)", paddingTop: 8 }}>
          <FlaskConical width={12} height={12} /> SIMULATION — not a real order
        </div>
      )}
      <div className="tk-h">
        <span className="tk-id">#{t.shortId}</span>
        <span className="tk-type">{fulfillmentLabel(t.fulfillmentType)}</span>
        {tone === "risk" && t.status !== "ready" && <span className="tk-course">At risk</span>}
        <span className="tk-timer">{timerText}</span>
      </div>

      {t.coursing && t.coursing.held.length > 0 && (
        <div className="tk-coursehint">
          <Layers width={12} height={12} />
          Coursed · {t.coursing.held.map((c) => POS_COURSE_LABELS[c]).join(", ")} held
        </div>
      )}

      <div className="tk-items">
        {sortedGroups.map(([cat, items]) => (
          <Fragment key={cat}>
            <div className="tk-grp">{items[0].categoryLabel}</div>
            {items.map((i, idx) => (
              <div className="tk-it" key={`${i.name}-${idx}`}>
                <span className="tk-q">{i.quantity}×</span>
                <div>
                  <div className="tk-nm">{i.name}</div>
                  {i.modifiers.map((m, mi) => (
                    <div className="tk-mod" key={mi}>
                      {m.label}
                    </div>
                  ))}
                  {i.notes && <div className="tk-mod">{i.notes}</div>}
                </div>
              </div>
            ))}
          </Fragment>
        ))}
      </div>

      {allergens.length > 0 && (
        <div className="tk-alrg">
          <AlertTriangle width={12} height={12} /> Allergens: {allergens.join(" · ")}
        </div>
      )}

      {t.specialInstructions && (
        <div className="tk-notes">
          <b>Note:</b> {t.specialInstructions}
        </div>
      )}

      <div className="tk-f">
        <div className="tk-eta">
          <span className="lbl">{etaLbl}</span>
          <div className="sla">
            <i style={{ width: `${slaPct}%` }} />
          </div>
        </div>
        <button
          type="button"
          className="bump"
          disabled={advancing}
          onClick={(e) => {
            e.stopPropagation();
            onAdvance(t);
          }}
        >
          {NEXT_LABEL[t.status] ?? "Advance"}
        </button>
      </div>
    </article>
  );
}
