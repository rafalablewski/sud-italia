"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminNav } from "./AdminNav";
import { Plus, Trash2, Clock, MapPin } from "lucide-react";
import { locations } from "@/data/locations";
import { formatSlotTime } from "@/lib/format";

interface SlotData {
  id: string;
  locationSlug: string;
  date: string;
  time: string;
  maxOrders: number;
  currentOrders: number;
  fulfillmentTypes: string[];
}

const activeLocations = locations.filter((l) => l.isActive);

export function AdminSlots() {
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState(activeLocations[0]?.slug || "");
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  // New slot form
  const [showForm, setShowForm] = useState(false);
  const [newTime, setNewTime] = useState("18:00");
  const [newMaxOrders, setNewMaxOrders] = useState(10);
  const [newTakeout, setNewTakeout] = useState(true);
  const [newDelivery, setNewDelivery] = useState(true);
  const [saving, setSaving] = useState(false);

  // Bulk create
  const [bulkEndTime, setBulkEndTime] = useState("21:00");
  const [bulkInterval, setBulkInterval] = useState(30); // minutes
  const [bulkMode, setBulkMode] = useState(false);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/slots?location=${selectedLocation}&date=${selectedDate}`
      );
      if (res.ok) {
        const data = await res.json();
        data.sort((a: SlotData, b: SlotData) => a.time.localeCompare(b.time));
        setSlots(data);
      }
    } catch (err) {
      console.error("Failed to fetch slots:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, selectedDate]);

  useEffect(() => {
    if (selectedLocation) fetchSlots();
  }, [selectedLocation, selectedDate, fetchSlots]);

  const handleCreateSlot = async (time: string) => {
    const fulfillmentTypes: string[] = [];
    if (newTakeout) fulfillmentTypes.push("takeout");
    if (newDelivery) fulfillmentTypes.push("delivery");

    if (fulfillmentTypes.length === 0) return;

    const res = await fetch("/api/admin/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationSlug: selectedLocation,
        date: selectedDate,
        time,
        maxOrders: newMaxOrders,
        fulfillmentTypes,
      }),
    });

    return res.ok;
  };

  const handleSubmit = async () => {
    const fulfillmentTypes: string[] = [];
    if (newTakeout) fulfillmentTypes.push("takeout");
    if (newDelivery) fulfillmentTypes.push("delivery");
    if (fulfillmentTypes.length === 0) return;

    setSaving(true);
    try {
      if (bulkMode) {
        // Single API call for bulk creation
        await fetch("/api/admin/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationSlug: selectedLocation,
            date: selectedDate,
            maxOrders: newMaxOrders,
            fulfillmentTypes,
            bulk: {
              startTime: newTime,
              endTime: bulkEndTime,
              interval: bulkInterval,
            },
          }),
        });
      } else {
        await handleCreateSlot(newTime);
      }
      setShowForm(false);
      fetchSlots();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this slot?")) return;
    await fetch(`/api/admin/slots?id=${id}`, { method: "DELETE" });
    fetchSlots();
  };

  const handleUpdateMax = async (id: string, maxOrders: number) => {
    await fetch("/api/admin/slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, maxOrders }),
    });
    fetchSlots();
  };

  return (
    <>
      <AdminNav />
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold font-heading text-italia-dark">
            Time Slots
          </h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-italia-green text-white rounded-xl font-semibold text-sm hover:bg-italia-green-dark transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Slot
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-italia-gray" />
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-italia-red"
            >
              {activeLocations.map((loc) => (
                <option key={loc.slug} value={loc.slug}>
                  {loc.city}
                </option>
              ))}
            </select>
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-italia-red"
          />
        </div>

        {/* New slot form */}
        {showForm && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
            <h2 className="font-bold text-lg mb-4">
              New Slot — {selectedLocation} — {selectedDate}
            </h2>

            <div className="flex items-center gap-3 mb-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={bulkMode}
                  onChange={(e) => setBulkMode(e.target.checked)}
                  className="accent-italia-red"
                />
                Bulk create (time range)
              </label>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs text-italia-gray mb-1">
                  {bulkMode ? "Start time" : "Time"}
                </label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>

              {bulkMode && (
                <>
                  <div>
                    <label className="block text-xs text-italia-gray mb-1">End time</label>
                    <input
                      type="time"
                      value={bulkEndTime}
                      onChange={(e) => setBulkEndTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-italia-gray mb-1">Interval (min)</label>
                    <select
                      value={bulkInterval}
                      onChange={(e) => setBulkInterval(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={60}>60 min</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs text-italia-gray mb-1">Max orders</label>
                <input
                  type="number"
                  min={1}
                  value={newMaxOrders}
                  onChange={(e) => setNewMaxOrders(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newTakeout}
                  onChange={(e) => setNewTakeout(e.target.checked)}
                  className="accent-italia-green"
                />
                Takeout
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newDelivery}
                  onChange={(e) => setNewDelivery(e.target.checked)}
                  className="accent-italia-red"
                />
                Delivery
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={saving || (!newTakeout && !newDelivery)}
                className="px-6 py-2 bg-italia-green text-white rounded-xl font-semibold text-sm hover:bg-italia-green-dark transition-colors disabled:opacity-50"
              >
                {saving ? "Creating..." : bulkMode ? "Create Slots" : "Create Slot"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-6 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Slots list */}
        {loading ? (
          <div className="text-center py-12 text-italia-gray">Loading...</div>
        ) : slots.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
            <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-italia-gray font-medium">No slots for this date</p>
            <p className="text-sm text-gray-400 mt-1">
              Click &quot;Add Slot&quot; to create available time slots
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {slots.map((slot) => (
              <div
                key={slot.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="text-xl font-bold font-heading text-italia-dark w-16">
                    {formatSlotTime(slot.time)}
                  </div>

                  <div className="flex items-center gap-2">
                    {slot.fulfillmentTypes.includes("takeout") && (
                      <span className="px-2 py-1 bg-italia-green/10 text-italia-green text-xs font-medium rounded-lg">
                        Takeout
                      </span>
                    )}
                    {slot.fulfillmentTypes.includes("delivery") && (
                      <span className="px-2 py-1 bg-italia-red/10 text-italia-red text-xs font-medium rounded-lg">
                        Delivery
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-italia-gray">
                    <span className="font-semibold text-italia-dark">{slot.currentOrders}</span>
                    {" / "}
                    <input
                      type="number"
                      min={slot.currentOrders}
                      defaultValue={slot.maxOrders}
                      onBlur={(e) => handleUpdateMax(slot.id, Number(e.target.value))}
                      className="w-14 px-1 py-0.5 border border-gray-200 rounded text-center text-sm"
                    />
                    {" orders"}
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(slot.id)}
                  className="p-2 text-gray-400 hover:text-italia-red transition-colors"
                  title="Delete slot"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
