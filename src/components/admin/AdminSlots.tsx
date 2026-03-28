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
  pending: "bg-yellow-500/20 text-yellow-300",
  confirmed: "bg-blue-500/20 text-blue-300",
  preparing: "bg-orange-500/20 text-orange-300",
  ready: "bg-green-500/20 text-green-300",
  completed: "bg-gray-500/20 text-gray-300",
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
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return dateStr === today;
}

export function AdminSlots() {
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState(activeLocations[0]?.slug || "");
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + delta);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  };

  const goToday = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
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
          <h1 className="text-2xl font-bold font-heading gradient-text">
            Time Slots
          </h1>
          <div className="flex items-center gap-2">
            {draftCount > 0 && (
              <button
                onClick={handleApproveAll}
                className="flex items-center gap-2 px-4 py-2 glass-btn-blue"
              >
                <CheckCheck className="h-4 w-4" />
                Confirm All ({draftCount})
              </button>
            )}
            {selectedIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-2 px-4 py-2 glass-btn text-white rounded-xl font-semibold text-sm"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selectedIds.size})
              </button>
            )}
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2 glass-btn-green text-white rounded-xl font-semibold text-sm"
            >
              <Plus className="h-4 w-4" />
              Add Slot
            </button>
          </div>
        </div>

        {/* Filters: location + date nav */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 admin-text-muted" />
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="glass-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-italia-red"
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
              className="p-2 glass-input rounded-lg hover:bg-white/5 transition-colors"
              title="Previous day"
            >
              <ChevronLeft className="h-4 w-4 admin-text-muted" />
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="glass-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-italia-red"
            />

            <button
              onClick={() => navigateDay(1)}
              className="p-2 glass-input rounded-lg hover:bg-white/5 transition-colors"
              title="Next day"
            >
              <ChevronRight className="h-4 w-4 admin-text-muted" />
            </button>

            <span className="text-sm font-medium admin-text hidden sm:inline">
              {formatDateLabel(selectedDate)}
            </span>

            {isToday(selectedDate) ? (
              <span className="px-2 py-1 text-xs bg-italia-green/10 text-italia-green rounded-lg font-semibold">
                Today
              </span>
            ) : (
              <button
                onClick={goToday}
                className="px-2 py-1 text-xs bg-italia-red/10 admin-red rounded-lg font-medium hover:bg-italia-red/20 transition-colors"
              >
                Go to Today
              </button>
            )}
          </div>
        </div>

        {/* New slot form */}
        {showForm && (
          <div className="glass-card rounded-2xl p-6 shadow-sm mb-6">
            <h2 className="font-bold text-lg mb-4">
              New Slot &mdash; {activeLocations.find((l) => l.slug === selectedLocation)?.city} &mdash; {formatDateLabel(selectedDate)}
            </h2>

            <div className="flex items-center gap-3 mb-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={bulkMode}
                  onChange={(e) => setBulkMode(e.target.checked)}
                  className="accent-red-500"
                />
                Bulk create (time range)
              </label>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs admin-text-muted mb-1">
                  {bulkMode ? "Start time" : "Time"}
                </label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-3 py-2 glass-input rounded-lg text-sm"
                />
              </div>

              {bulkMode && (
                <>
                  <div>
                    <label className="block text-xs admin-text-muted mb-1">End time</label>
                    <input
                      type="time"
                      value={bulkEndTime}
                      onChange={(e) => setBulkEndTime(e.target.value)}
                      className="w-full px-3 py-2 glass-input rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs admin-text-muted mb-1">Interval (min)</label>
                    <select
                      value={bulkInterval}
                      onChange={(e) => setBulkInterval(Number(e.target.value))}
                      className="w-full px-3 py-2 glass-input rounded-lg text-sm"
                    >
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={60}>60 min</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs admin-text-muted mb-1">Max orders per slot</label>
                <input
                  type="number"
                  min={1}
                  value={newMaxOrders}
                  onChange={(e) => setNewMaxOrders(Number(e.target.value))}
                  className="w-full px-3 py-2 glass-input rounded-lg text-sm"
                />
              </div>
            </div>

            {/* Bulk preview */}
            {bulkMode && bulkPreview.length > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-4">
                <p className="text-sm font-semibold text-blue-300">
                  Will create {bulkPreview.length} slot{bulkPreview.length !== 1 ? "s" : ""}, each accepting up to {newMaxOrders} orders:
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {bulkPreview.map((t) => (
                    <span key={t} className="px-2 py-1 bg-blue-100 text-blue-300 text-xs font-mono rounded-lg">
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
                  className="accent-emerald-500"
                />
                Takeout
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newDelivery}
                  onChange={(e) => setNewDelivery(e.target.checked)}
                  className="accent-red-500"
                />
                Delivery
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={saving || (!newTakeout && !newDelivery)}
                className="px-6 py-2 glass-btn-green text-white rounded-xl font-semibold text-sm disabled:opacity-50"
              >
                {saving ? "Creating..." : bulkMode ? `Create ${bulkPreview.length} Slots` : "Create Slot"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-6 py-2 glass-input rounded-xl text-sm hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Slots list */}
        {loading ? (
          <div className="text-center py-12 admin-text-muted">Loading...</div>
        ) : slots.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center shadow-sm">
            <Clock className="h-12 w-12 mx-auto mb-4 text-slate-600" />
            <p className="admin-text-muted font-medium">No slots for this date</p>
            <p className="text-sm text-slate-500 mt-1">
              Click &quot;Add Slot&quot; to create available time slots
            </p>
          </div>
        ) : (
          <>
            {/* Select all / summary bar */}
            <div className="flex items-center gap-3 mb-3 px-1">
              <label className="flex items-center gap-2 text-sm admin-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.size === slots.length && slots.length > 0}
                  onChange={toggleSelectAll}
                  className="glass-checkbox"
                />
                Select all
              </label>
              <span className="text-xs admin-text-muted">
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
                        ? "bg-yellow-500/10 border-2 border-dashed border-yellow-500/30"
                        : "glass-card border border-white/10"
                    }`}
                  >
                    {/* Main row */}
                    <div className="flex items-center gap-3 p-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(slot.id)}
                        onChange={() => toggleSelect(slot.id)}
                        className="glass-checkbox flex-shrink-0"
                      />

                      <div className="text-xl font-bold font-heading admin-text w-16 flex-shrink-0">
                        {formatSlotTime(slot.time)}
                      </div>

                      {isDraft ? (
                        <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs font-semibold rounded-lg flex-shrink-0">
                          Draft
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs font-semibold rounded-lg flex-shrink-0">
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
                          <span className="px-2 py-1 bg-italia-red/10 admin-red text-xs font-medium rounded-lg">
                            Delivery
                          </span>
                        )}
                      </div>

                      <div className="text-sm admin-text-muted flex-shrink-0">
                        <span className="font-semibold admin-text">{slot.currentOrders}</span>
                        {" / "}
                        <input
                          type="number"
                          min={slot.currentOrders}
                          defaultValue={slot.maxOrders}
                          onBlur={(e) => handleUpdateMax(slot.id, Number(e.target.value))}
                          className="w-14 px-1 py-0.5 glass-input rounded text-center text-sm"
                        />
                        {" orders"}
                      </div>

                      <span className={`text-xs font-semibold flex-shrink-0 ${
                        spotsLeft === 0 ? "admin-red" : spotsLeft <= 3 ? "text-yellow-600" : "admin-green"
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
                            className="flex items-center gap-1 px-2 py-1 text-xs admin-text-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                          >
                            <User className="h-3.5 w-3.5" />
                            {orderCount} reservation{orderCount !== 1 ? "s" : ""}
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        )}

                        {isDraft && (
                          <button
                            onClick={() => handleApprove(slot.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 glass-btn-blue text-sm"
                            title="Approve & confirm slot"
                          >
                            <Check className="h-4 w-4" />
                            Confirm
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(slot.id)}
                          className="p-2 text-slate-500 hover:text-italia-red transition-colors"
                          title="Delete slot"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Reservation details (expandable) */}
                    {isExpanded && slot.orders && slot.orders.length > 0 && (
                      <div className="border-t border-white/8 bg-white/4 px-4 py-3">
                        <div className="grid gap-2">
                          {slot.orders.map((order) => (
                            <div
                              key={order.id}
                              className="flex flex-wrap items-center gap-x-4 gap-y-1 glass-card rounded-lg p-3 border border-white/10 text-sm"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <User className="h-4 w-4 admin-text-muted flex-shrink-0" />
                                <span className="font-medium admin-text truncate">
                                  {order.customerName}
                                </span>
                                <span className="text-xs admin-text-muted">
                                  {order.customerPhone}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 text-xs admin-text-muted">
                                {order.fulfillmentType === "delivery" ? (
                                  <Truck className="h-3.5 w-3.5" />
                                ) : (
                                  <Package className="h-3.5 w-3.5" />
                                )}
                                {order.fulfillmentType}
                              </div>

                              <span className="text-xs admin-text-muted">
                                {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
                              </span>

                              <span className="font-semibold admin-text text-sm">
                                {formatPrice(order.totalAmount)}
                              </span>

                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${ORDER_STATUS_COLORS[order.status] || "bg-gray-500/20 text-gray-300"}`}>
                                {order.status}
                              </span>

                              <span className="text-[10px] text-slate-500 ml-auto">
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
