import { AlertTriangle, FlaskConical, Layers } from "lucide-react";
import { POS_COURSE_LABELS } from "@/lib/pos-coursing";
import { fulfillmentLabel } from "@/lib/fulfillment";
import type { TicketTone } from "@/lib/kds-prediction";
import type { KdsTicket } from "@/lib/kds-ticket";

/**
 * Chef-line ticket — the core-suite `.ct` design (ported from kds-chef.html).
 * Deliberately larger and flatter than the floor `.tk` card: oversized item
 * names + quantities and a single full-width action, sized to be read from
 * across the line. No SLA meter or ETA copy — the line cook only needs the
 * dish, the timer, and the bump. Styled by the `.ct*` rules in `suite.css`.
 * Allergens are kept (a safety signal the line must see) even though the
 * static mockup omits them — see `docs/design-system/core/modules/kds.md`.
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

export function KdsCt({
  t,
  now,
  tone,
  advancing,
  onAdvance,
}: {
  t: KdsTicket;
  now: number;
  tone: TicketTone;
  advancing: boolean;
  onAdvance: (t: KdsTicket) => void;
}) {
  const elapsed = Math.max(0, (now - t.paidAtMs) / 1000);
  const toneClass =
    t.status === "ready" ? "ready" : tone === "late" ? "late" : tone === "risk" ? "risk" : tone === "warn" ? "warn" : "";
  const timerText = t.status === "ready" ? "plated" : mmss(elapsed);

  const allergens = Array.from(new Set(t.items.flatMap((i) => i.allergens))).filter(Boolean);

  return (
    <article className={`ct ${toneClass}`} style={t.simulated ? { borderStyle: "dashed" } : undefined}>
      {t.simulated && (
        <div className="ct-sim">
          <FlaskConical width={12} height={12} /> SIMULATION — not a real order
        </div>
      )}
      <div className="ct-h">
        <span className="ct-id">#{t.shortId}</span>
        <span className="ct-type">{fulfillmentLabel(t.fulfillmentType)}</span>
        {tone === "risk" && t.status !== "ready" && <span className="ct-course">At risk</span>}
        <span
          className="ct-timer"
          style={
            t.status === "ready"
              ? { color: "var(--ready)", fontSize: 14, fontFamily: "var(--ui)", fontWeight: 600, letterSpacing: ".02em", textTransform: "uppercase" }
              : undefined
          }
        >
          {timerText}
        </span>
      </div>

      {t.coursing && t.coursing.held.length > 0 && (
        <div className="ct-coursehint">
          <Layers width={12} height={12} />
          Coursed · {t.coursing.held.map((c) => POS_COURSE_LABELS[c]).join(", ")} held
        </div>
      )}

      {t.items.map((i, idx) => (
        <div className="ct-it" key={`${i.name}-${idx}`}>
          <span className="ct-q">{i.quantity}×</span>
          <div>
            <div className="ct-nm">{i.name}</div>
            {i.modifiers.map((m, mi) => (
              <div className="ct-mod" key={mi}>
                {m.label}
              </div>
            ))}
            {i.notes && <div className="ct-mod">{i.notes}</div>}
          </div>
        </div>
      ))}

      {allergens.length > 0 && (
        <div className="ct-alrg">
          <AlertTriangle width={12} height={12} /> Allergens: {allergens.join(" · ")}
        </div>
      )}

      {t.specialInstructions && (
        <div className="ct-notes">
          <b>Note:</b> {t.specialInstructions}
        </div>
      )}

      <div className="ct-f">
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
