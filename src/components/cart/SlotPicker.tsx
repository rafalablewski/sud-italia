"use client";

import { useState, useEffect } from "react";
import { useCartStore } from "@/store/cart";
import { Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { formatSlotDate } from "@/lib/format";
import { FulfillmentType } from "@/data/types";

interface ClientSlot {
  id: string;
  time: string;
  fulfillmentTypes: string[];
  spotsLeft: number;
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

function SlotSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="skeleton h-14 rounded-xl" />
      ))}
    </div>
  );
}

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

  // Clear selection when fulfillment type or date changes
  useEffect(() => {
    setSelectedSlot(null, null, null);
  }, [fulfillmentType, date, setSelectedSlot]);

  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    if (i === 0) return "Today";
    if (i === 1) return "Tomorrow";
    return formatSlotDate(getDateString(i));
  });

  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-italia-gray uppercase tracking-wide mb-2">
        <Clock className="h-3 w-3 inline mr-1" />
        Select time
      </p>

      {/* Horizontal scrollable date picker (Grab-style) */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-3 -mx-1 px-1">
        {dayLabels.map((label, i) => (
          <button
            key={i}
            onClick={() => setDayOffset(i)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
              dayOffset === i
                ? "border-italia-red bg-italia-red/5 text-italia-red"
                : "border-gray-200 text-italia-gray hover:border-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Slots grid */}
      {loading ? (
        <SlotSkeleton />
      ) : error ? (
        <div className="text-center py-4 text-sm text-italia-red bg-red-50 rounded-xl">
          Could not load time slots. Try again later.
        </div>
      ) : slots.length === 0 ? (
        <div className="text-center py-4 text-sm text-italia-gray bg-gray-50 rounded-xl">
          No available slots for this day
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {slots.map((slot) => {
            const isSelected = selectedSlotId === slot.id;
            const isLow = slot.spotsLeft <= 2;
            const isCritical = slot.spotsLeft === 1;
            return (
              <button
                key={slot.id}
                onClick={() =>
                  setSelectedSlot(
                    isSelected ? null : slot.id,
                    isSelected ? null : slot.time,
                    isSelected ? null : date
                  )
                }
                className={`px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                  isSelected
                    ? "border-italia-red bg-italia-red/5 text-italia-red"
                    : isCritical
                      ? "border-red-300 bg-red-50 text-italia-dark hover:border-red-400"
                      : isLow
                        ? "border-amber-200 text-italia-dark hover:border-amber-300"
                        : "border-gray-200 text-italia-dark hover:border-gray-300"
                }`}
              >
                <span className="block">{slot.time}</span>
                <span className={`block text-[10px] mt-0.5 ${
                  isCritical ? "text-red-600 font-bold" : isLow ? "text-amber-600 font-semibold" : "text-italia-gray"
                }`}>
                  {isCritical ? "Last spot!" : isLow ? `Only ${slot.spotsLeft} left` : `${slot.spotsLeft} spots`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
