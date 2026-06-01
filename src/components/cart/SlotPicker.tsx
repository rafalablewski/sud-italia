"use client";

import { useState, useEffect } from "react";
import { useCartStore } from "@/store/cart";
import { formatSlotDate } from "@/lib/format";
import { FulfillmentType } from "@/data/types";

interface ClientSlot {
  id: string;
  time: string;
  fulfillmentTypes: string[];
  spotsLeft: number;
  /** Minimum order value (grosze) to book this slot; 0 / absent = none. */
  minSpend?: number;
}

interface SlotPickerProps {
  locationSlug: string;
  fulfillmentType: FulfillmentType;
}

function getDateString(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

/**
 * V8 cart slot picker. Date strip (Oggi · Domani · …) above a slot
 * grid; each slot button shows the time + italic Lora scarcity copy
 * ("ready now · pronto subito", "2 slots left · ultimi 2 posti").
 *
 * Behaviour preserved:
 *   - Reads selectedSlotId from useCartStore, calls setSelectedSlot.
 *   - Re-fetches on date / location / fulfilment change.
 *   - Clears the selection if the new slot list no longer contains it.
 *   - Day-rollover ("Try Sat 24" link) when a day is fully booked.
 */
export function SlotPicker({ locationSlug, fulfillmentType }: SlotPickerProps) {
  const [dayOffset, setDayOffset] = useState(0);
  const [slots, setSlots] = useState<ClientSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const selectedSlotId = useCartStore((s) => s.selectedSlotId);
  const setSelectedSlot = useCartStore((s) => s.setSelectedSlot);

  const date = getDateString(dayOffset);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(`/api/slots?location=${locationSlug}&date=${date}&type=${fulfillmentType}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setSlots(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) { setSlots([]); setError(true); }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [locationSlug, date, fulfillmentType]);

  useEffect(() => {
    if (selectedSlotId && slots.length > 0) {
      const stillAvailable = slots.some((s) => s.id === selectedSlotId);
      if (!stillAvailable) {
        setSelectedSlot(null, null, null);
      }
    } else if (slots.length === 0 && !loading) {
      setSelectedSlot(null, null, null);
    }
  }, [slots, loading, selectedSlotId, setSelectedSlot]);

  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    if (i === 0) return { en: "Today", it: "oggi" };
    if (i === 1) return { en: "Tomorrow", it: "domani" };
    return { en: formatSlotDate(getDateString(i)), it: "" };
  });

  const anyLow = slots.some((s) => s.spotsLeft <= 2);

  return (
    <div className="v8-cart-slots-wrap">
      <div className="v8-cart-days" role="tablist" aria-label="Day">
        {dayLabels.map((label, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={dayOffset === i}
            onClick={() => setDayOffset(i)}
            className={`v8-cart-day${dayOffset === i ? " is-on" : ""}`}
          >
            <span>{label.en}</span>
            {label.it && <span className="v8-cart-day-it">{label.it}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="v8-cart-slots-skel" aria-hidden="true">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="v8-cart-slot-skel" />
          ))}
        </div>
      ) : error ? (
        <div className="v8-cart-slots-empty is-error" role="alert">
          <div className="v8-cart-slots-empty-title">Couldn&apos;t load time slots</div>
          <div className="v8-cart-slots-empty-sub">Please try again in a moment.</div>
        </div>
      ) : slots.length === 0 ? (
        <div className="v8-cart-slots-empty">
          <div className="v8-cart-slots-empty-title">Fully booked today · pieno</div>
          {dayOffset < 6 && (
            <button
              type="button"
              onClick={() => setDayOffset(dayOffset + 1)}
              className="v8-cart-slots-roll"
            >
              Try {formatSlotDate(getDateString(dayOffset + 1))} →
            </button>
          )}
        </div>
      ) : (
        <>
          {anyLow && (
            <div className="v8-cart-slots-low" role="status">
              <em>Ultimi posti</em> — some slots on this day are nearly full.
            </div>
          )}
          <div className="v8-cart-slots">
            {slots.map((slot) => {
              const isSelected = selectedSlotId === slot.id;
              const isLow = slot.spotsLeft <= 2;
              const isCritical = slot.spotsLeft === 1;
              const classes = [
                "v8-cart-slot",
                isSelected ? "is-on" : "",
                isCritical ? "is-critical" : isLow ? "is-low" : "",
              ].filter(Boolean).join(" ");
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() =>
                    setSelectedSlot(
                      isSelected ? null : slot.id,
                      isSelected ? null : slot.time,
                      isSelected ? null : date
                    )
                  }
                  className={classes}
                >
                  <span className="v8-cart-slot-time num">{slot.time}</span>
                  <span className="v8-cart-slot-scarce">
                    {isCritical
                      ? <>Last spot · <em>ultimo!</em></>
                      : isLow
                        ? <>Only <span className="num">{slot.spotsLeft}</span> left · <em>ultimi {slot.spotsLeft}</em></>
                        : <><span className="num">{slot.spotsLeft}</span> slots · <em>liberi</em></>}
                  </span>
                  {slot.minSpend && slot.minSpend > 0 ? (
                    <span className="v8-cart-slot-min">
                      min <span className="num">{Math.round(slot.minSpend / 100)}</span> zł
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
