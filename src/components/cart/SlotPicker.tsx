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

  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-italia-gray uppercase tracking-wide mb-2">
        <Clock className="h-3 w-3 inline mr-1" />
        Select time
      </p>

      {/* Date selector */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setDayOffset(Math.max(0, dayOffset - 1))}
          disabled={dayOffset === 0}
          className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-italia-dark">
          {dayOffset === 0 ? "Today" : dayOffset === 1 ? "Tomorrow" : formatSlotDate(date)}
        </span>
        <button
          onClick={() => setDayOffset(Math.min(6, dayOffset + 1))}
          disabled={dayOffset >= 6}
          className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Slots grid */}
      {loading ? (
        <div className="text-center py-4 text-sm text-italia-gray">Loading slots...</div>
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
                className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                  isSelected
                    ? "border-italia-red bg-italia-red/5 text-italia-red"
                    : "border-gray-200 text-italia-dark hover:border-gray-300"
                }`}
              >
                <span className="block">{slot.time}</span>
                <span className="block text-[10px] opacity-60">
                  {slot.spotsLeft} left
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
