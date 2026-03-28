"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminNav } from "./AdminNav";
import {
  Plus,
  Trash2,
  Clock,
  MapPin,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Package,
  Truck,
  User,
} from "lucide-react";
import { locations } from "@/data/locations";
import { formatSlotTime } from "@/lib/format";
import { formatPrice } from "@/lib/utils";

interface SlotOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  fulfillmentType: string;
  status: string;
  itemCount: number;
  createdAt: string;
}

interface SlotData {
  id: string;
  locationSlug: string;
  date: string;
  time: string;
  maxOrders: number;
  currentOrders: number;
  fulfillmentTypes: string[];
  status: "draft" | "active";
  orders?: SlotOrder[];
}

const activeLocations = locations.filter((l) => l.isActive);

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-orange-100 text-orange-800",
  ready: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-600",
};

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

export function AdminSlots() {
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState(activeLocations[0]?.slug || "");
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
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
  const [bulkInterval, setBulkInterval] = useState(30);
  const [bulkMode, setBulkMode] = useState(false);

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Expanded slots (show reservation details)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/slots?location=${selectedLocation}&date=${selectedDate}&includeOrders=true`
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
    setSelectedIds(new Set());
    setExpandedId(null);
  }, [selectedLocation, selectedDate, fetchSlots]);

  // --- Bulk creation preview ---
  const bulkPreview = useMemo(() => {
    if (!bulkMode) return [];
    const startParts = newTime.split(":").map(Number);
    const endParts = bulkEndTime.split(":").map(Number);
    let startMin = startParts[0] * 60 + startParts[1];
    const endMin = endParts[0] * 60 + endParts[1];
    const times: string[] = [];
    while (startMin <= endMin && times.length < 50) {
      const h = Math.floor(startMin / 60).toString().padStart(2, "0");
      const m = (startMin % 60).toString().padStart(2, "0");
      times.push(`${h}:${m}`);
      startMin += bulkInterval;
    }
    return times;
  }, [bulkMode, newTime, bulkEndTime, bulkInterval]);

  // --- Day navigation ---
  const navigateDay = (delta: number) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const goToday = () => {
    setSelectedDate(new Date().toISOString().split("T")[0]);
  };

  // --- Counts ---
  const draftCount = slots.filter((s) => (s.status ?? "draft") === "draft").length;

  // --- Handlers ---
  const handleSubmit = async () => {
    const fulfillmentTypes: string[] = [];
    if (newTakeout) fulfillmentTypes.push("takeout");
    if (newDelivery) fulfillmentTypes.push("delivery");
    if (fulfillmentTypes.length === 0) return;

    setSaving(true);
    try {
      if (bulkMode) {
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
        await fetch("/api/admin/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationSlug: selectedLocation,
            date: selectedDate,
            time: newTime,
            maxOrders: newMaxOrders,
            fulfillmentTypes,
          }),
        });
      }
      setShowForm(false);
      fetchSlots();
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    await fetch("/api/admin/slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "active" }),
    });
    fetchSlots();
  };

  const handleApproveAll = async () => {
    const drafts = slots.filter((s) => (s.status ?? "draft") === "draft");
    if (drafts.length === 0) return;
    await fetch("/api/admin/slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: drafts.map((s) => s.id), status: "active" }),
    });
    fetchSlots();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this slot?")) return;
    await fetch(`/api/admin/slots?id=${id}`, { method: "DELETE" });
    fetchSlots();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected slot(s)?`)) return;
    await fetch(`/api/admin/slots?ids=${[...selectedIds].join(",")}`, { method: "DELETE" });
    setSelectedIds(new Set());
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

  // --- Selection ---
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === slots.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(slots.map((s) => s.id)));
    }
  };

  return (
    <>
      <AdminNav />
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h1 className="text-2xl font-bold font-heading text-italia-dark">
            Time Slots
          </h1>
          <div className="flex items-center gap-2">
            {draftCount > 0 && (
              <button
                onClick={handleApproveAll}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
              >
                <CheckCheck className="h-4 w-4" />
                Confirm All ({draftCount})
              </button>
            )}
            {selectedIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-2 px-4 py-2 bg-italia-red text-white rounded-xl font-semibold text-sm hover:bg-italia-red-dark transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selectedIds.size})
              </button>
            )}
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2 bg-italia-green text-white rounded-xl font-semibold text-sm hover:bg-italia-green-dark transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Slot
            </button>
          </div>
        </div>

        {/* Filters: location + date nav */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateDay(-1)}
              className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              title="Previous day"
            >
              <ChevronLeft className="h-4 w-4 text-italia-gray" />
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-italia-red"
            />

            <button
              onClick={() => navigateDay(1)}
              className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              title="Next day"
            >
              <ChevronRight className="h-4 w-4 text-italia-gray" />
            </button>

            <span className="text-sm font-medium text-italia-dark hidden sm:inline">
              {formatDateLabel(selectedDate)}
            </span>

            {isToday(selectedDate) ? (
              <span className="px-2 py-1 text-xs bg-italia-green/10 text-italia-green rounded-lg font-semibold">
                Today
              </span>
            ) : (
              <button
                onClick={goToday}
                className="px-2 py-1 text-xs bg-italia-red/10 text-italia-red rounded-lg font-medium hover:bg-italia-red/20 transition-colors"
              >
                Go to Today
              </button>
            )}
          </div>
        </div>

        {/* New slot form */}
        {showForm && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
            <h2 className="font-bold text-lg mb-4">
              New Slot &mdash; {activeLocations.find((l) => l.slug === selectedLocation)?.city} &mdash; {formatDateLabel(selectedDate)}
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
                <label className="block text-xs text-italia-gray mb-1">Max orders per slot</label>
                <input
                  type="number"
                  min={1}
                  value={newMaxOrders}
                  onChange={(e) => setNewMaxOrders(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>

            {/* Bulk preview */}
            {bulkMode && bulkPreview.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-semibold text-blue-800">
                  Will create {bulkPreview.length} slot{bulkPreview.length !== 1 ? "s" : ""}, each accepting up to {newMaxOrders} orders:
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {bulkPreview.map((t) => (
                    <span key={t} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-mono rounded-lg">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

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
                {saving ? "Creating..." : bulkMode ? `Create ${bulkPreview.length} Slots` : "Create Slot"}
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
          <>
            {/* Select all / summary bar */}
            <div className="flex items-center gap-3 mb-3 px-1">
              <label className="flex items-center gap-2 text-sm text-italia-gray cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === slots.length && slots.length > 0}
                  onChange={toggleSelectAll}
                  className="accent-italia-red h-4 w-4"
                />
                Select all
              </label>
              <span className="text-xs text-italia-gray">
                {slots.length} slot{slots.length !== 1 ? "s" : ""}
                {draftCount > 0 && ` \u00B7 ${draftCount} draft`}
              </span>
            </div>

            <div className="space-y-3">
              {slots.map((slot) => {
                const isDraft = (slot.status ?? "draft") === "draft";
                const isExpanded = expandedId === slot.id;
                const orderCount = slot.orders?.length ?? 0;
                const spotsLeft = slot.maxOrders - slot.currentOrders;

                return (
                  <div
                    key={slot.id}
                    className={`rounded-xl shadow-sm overflow-hidden ${
                      isDraft
                        ? "bg-yellow-50 border-2 border-dashed border-yellow-300"
                        : "bg-white border border-gray-100"
                    }`}
                  >
                    {/* Main row */}
                    <div className="flex items-center gap-3 p-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(slot.id)}
                        onChange={() => toggleSelect(slot.id)}
                        className="accent-italia-red h-4 w-4 flex-shrink-0"
                      />

                      <div className="text-xl font-bold font-heading text-italia-dark w-16 flex-shrink-0">
                        {formatSlotTime(slot.time)}
                      </div>

                      {isDraft ? (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-lg flex-shrink-0">
                          Draft
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-lg flex-shrink-0">
                          Active
                        </span>
                      )}

                      <div className="flex items-center gap-1.5 flex-shrink-0">
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

                      <div className="text-sm text-italia-gray flex-shrink-0">
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

                      <span className={`text-xs font-semibold flex-shrink-0 ${
                        spotsLeft === 0 ? "text-italia-red" : spotsLeft <= 3 ? "text-yellow-600" : "text-italia-green"
                      }`}>
                        {spotsLeft === 0 ? "FULL" : `${spotsLeft} left`}
                      </span>

                      {/* Spacer */}
                      <div className="flex-1" />

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {orderCount > 0 && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : slot.id)}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-italia-gray hover:text-italia-dark hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <User className="h-3.5 w-3.5" />
                            {orderCount} reservation{orderCount !== 1 ? "s" : ""}
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        )}

                        {isDraft && (
                          <button
                            onClick={() => handleApprove(slot.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                            title="Approve & confirm slot"
                          >
                            <Check className="h-4 w-4" />
                            Confirm
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(slot.id)}
                          className="p-2 text-gray-400 hover:text-italia-red transition-colors"
                          title="Delete slot"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Reservation details (expandable) */}
                    {isExpanded && slot.orders && slot.orders.length > 0 && (
                      <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                        <div className="grid gap-2">
                          {slot.orders.map((order) => (
                            <div
                              key={order.id}
                              className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-white rounded-lg p-3 border border-gray-100 text-sm"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <User className="h-4 w-4 text-italia-gray flex-shrink-0" />
                                <span className="font-medium text-italia-dark truncate">
                                  {order.customerName}
                                </span>
                                <span className="text-xs text-italia-gray">
                                  {order.customerPhone}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 text-xs text-italia-gray">
                                {order.fulfillmentType === "delivery" ? (
                                  <Truck className="h-3.5 w-3.5" />
                                ) : (
                                  <Package className="h-3.5 w-3.5" />
                                )}
                                {order.fulfillmentType}
                              </div>

                              <span className="text-xs text-italia-gray">
                                {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
                              </span>

                              <span className="font-semibold text-italia-dark text-sm">
                                {formatPrice(order.totalAmount)}
                              </span>

                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${ORDER_STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"}`}>
                                {order.status}
                              </span>

                              <span className="text-[10px] text-gray-400 ml-auto">
                                {new Date(order.createdAt).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
