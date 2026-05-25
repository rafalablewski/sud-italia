import { AlertTriangle, FlaskConical } from "lucide-react";
import type { MenuCategory } from "@/data/types";
import { fulfillmentLabel } from "@/lib/fulfillment";
import { FulfillmentIcon } from "@/components/FulfillmentIcon";
import type { TicketTone } from "@/lib/kds-prediction";
import type { KdsTicket, KdsTicketItem } from "@/lib/kds-ticket";

/**
 * The KDS ticket card — the single visual primitive shared by the Atlas fleet
 * board, the floor board (desktop + mobile) and the fullscreen kiosk. Styled by
 * the `.ka-*` rules in globals.css (scoped to both `.kds-atlas` and
 * `.kds-floor-dark`), so every surface draws the identical card.
 */

const NEXT_LABEL: Record<string, string> = {
  confirmed: "Start prep",
  preparing: "Mark ready",
  ready: "Bump · Done",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function mmss(seconds: number): string {
  const a = Math.abs(Math.round(seconds));
  return `${Math.floor(a / 60)}:${pad(a % 60)}`;
}

/** Depleting SVG progress ring. Exported so the fleet board's health ring and
 *  the ticket timer share one implementation. */
export function Ring({ size, frac, color, strokeW }: { size: number; frac: number; color: string; strokeW: number }) {
  const r = (size - strokeW) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(Math.max(frac, 0), 1);
  const off = c * (1 - f);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={strokeW} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
      />
    </svg>
  );
}

const CATEGORY_ORDER = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];

export function KdsTicketCard({
  t,
  now,
  tone,
  station,
  advancing,
  onAdvance,
}: {
  t: KdsTicket;
  now: number;
  tone: TicketTone;
  station: MenuCategory | "all";
  advancing: boolean;
  onAdvance: (t: KdsTicket) => void;
}) {
  const elapsed = Math.max(0, (now - t.paidAtMs) / 1000);
  const slaRem = t.promisedReadyAtMs !== null ? (t.promisedReadyAtMs - now) / 1000 : null;
  const predRem = Math.max(0, (t.predictedReadyAtMs - now) / 1000);

  // Depleting ring against the promised window.
  let frac: number;
  let ringColor: string;
  if (t.status === "ready") {
    frac = 1;
    ringColor = "var(--ka-ready)";
  } else if (slaRem !== null && slaRem < 0) {
    frac = 0;
    ringColor = "var(--ka-late)";
  } else if (slaRem !== null && t.promisedReadyAtMs !== null) {
    const promiseWindow = Math.max(60, (t.promisedReadyAtMs - t.paidAtMs) / 1000);
    frac = Math.min(1, slaRem / promiseWindow);
    ringColor = tone === "risk" ? "var(--ka-risk)" : tone === "warn" ? "var(--ka-warn)" : "var(--ka-firing)";
  } else {
    frac = 1;
    ringColor = "var(--ka-firing)";
  }
  const ringCap = t.status === "ready" ? "OK" : slaRem !== null && slaRem < 0 ? "LATE" : slaRem !== null ? mmss(slaRem) : "—";

  const dueLabel =
    t.status === "ready"
      ? "Ready"
      : slaRem === null
        ? "No SLA"
        : slaRem < 0
          ? `Late ${mmss(slaRem)}`
          : `Due ${mmss(slaRem)}`;

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

  const predLine =
    t.status === "ready" ? (
      "Plated · ready for expo"
    ) : tone === "risk" ? (
      <>
        Model: <b>~{mmss(predRem)} to ready</b> · over promise
      </>
    ) : tone === "late" ? (
      `Model: ~${mmss(predRem)} to ready`
    ) : (
      `Predicted ready in ${mmss(predRem)}`
    );

  return (
    <article className={`ka-ticket ${tone}${t.simulated ? " ka-ticket-sim" : ""}`}>
      {t.simulated && (
        <div className="ka-t-sim-tag">
          <FlaskConical className="h-3 w-3" /> SIMULATION — not a real order
        </div>
      )}
      <div className="ka-t-r1">
        <span className="ka-t-id">#{t.shortId}</span>
        <span className="ka-t-chan">
          <FulfillmentIcon type={t.fulfillmentType} className="h-3 w-3" />
          {fulfillmentLabel(t.fulfillmentType)}
        </span>
        {tone === "risk" && (
          <span className="ka-risk-pill">
            <AlertTriangle className="h-2.5 w-2.5" /> At risk
          </span>
        )}
        <span className="ka-t-name">{t.customerName}</span>
      </div>

      <div className="ka-t-timer">
        <div className="ka-timer-ring">
          <Ring size={54} frac={frac} color={ringColor} strokeW={4} />
          <span className="ka-tr-cap tabular">{ringCap}</span>
        </div>
        <div className="ka-timer-info">
          <div className="ka-ti-row">
            <span className="ka-ti-elapsed tabular">{mmss(elapsed)}</span>
            <span className="ka-ti-elapsed-lab">elapsed</span>
            <span className={`ka-ti-due ${tone}`}>{dueLabel}</span>
          </div>
          <div className={`ka-ti-pred${tone === "risk" ? " is-risk" : ""}`}>{predLine}</div>
        </div>
      </div>

      <div className="ka-t-items">
        {sortedGroups.map(([cat, items]) => {
          const dim = station !== "all" && station !== cat;
          const qty = items.reduce((s, i) => s + i.quantity, 0);
          return (
            <div className={`ka-it-group${dim ? " is-dim" : ""}`} key={cat}>
              <div className="ka-ig-head">
                <span className="ka-ig-name">{items[0].categoryLabel}</span>
                <span className="ka-ig-count tabular">{qty}</span>
              </div>
              {items.map((i, idx) => (
                <div className="ka-it" key={`${i.name}-${idx}`}>
                  <div className="ka-it-main">
                    <span className="ka-q tabular">{i.quantity}×</span>
                    <span className="ka-nm">{i.name}</span>
                  </div>
                  {i.notes && <span className="ka-req">⮐ {i.notes}</span>}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {allergens.length > 0 && (
        <div className="ka-t-allergy">
          <div className="ka-ta-head">
            <AlertTriangle className="h-3 w-3" /> Allergen alert
          </div>
          <div className="ka-ta-body">{allergens.join(", ")}</div>
        </div>
      )}

      {t.specialInstructions && (
        <div className="ka-t-notes">
          <div className="ka-tn-head">Notes &amp; requests</div>
          <div className="ka-tn-line">{t.specialInstructions}</div>
        </div>
      )}

      <div className="ka-t-foot">
        <span className="ka-t-meta">
          Slot <b>{t.slotTime}</b> · <b>{t.itemCount}</b> items
        </span>
        <button
          type="button"
          className={`ka-act${t.status === "ready" ? " ready" : ""}`}
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
