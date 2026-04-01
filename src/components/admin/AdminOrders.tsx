"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminNav } from "./AdminNav";
import { statusBadgeClass } from "@/lib/admin-utils";
import { Package, Truck, Clock, ClipboardList, RefreshCw, MapPin, Trash2 } from "lucide-react";
import { locations } from "@/data/locations";
import { LocationTabs } from "./LocationTabs";
import { formatPrice } from "@/lib/utils";
import { formatSlotDate } from "@/lib/format";
import type { Order } from "@/data/types";

const activeLocations = locations.filter((l) => l.isActive);


const STATUS_ORDER: Order["status"][] = ["pending", "confirmed", "preparing", "ready", "completed"];

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = selectedLocation ? `?location=${selectedLocation}` : "";
      const res = await fetch(`/api/admin/orders${params}`);
      if (res.ok) {
        setOrders(await res.json());
      } else {
        setError("Failed to load orders. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [selectedLocation]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleStatusChange = async (orderId: string, status: string) => {
    await fetch("/api/admin/orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, status }),
    });
    fetchOrders();
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (
      !window.confirm(
        "Delete this order permanently? This cannot be undone. The time slot will be freed if the slot still exists."
      )
    ) {
      return;
    }
    setDeletingId(orderId);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Could not delete order.");
        return;
      }
      setError("");
      await fetchOrders();
    } catch {
      setError("Network error while deleting.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <AdminNav />
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-heading font-bold admin-text">Orders</h1>
            <p className="text-sm admin-text-dim mt-1">Manage and track customer orders</p>
          </div>
          <button onClick={fetchOrders} className="glass-btn-ghost">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <LocationTabs value={selectedLocation} onChange={setSelectedLocation} includeAll />

        {error ? (
          <div className="glass-card rounded-lg p-6 text-center border-red-500/20">
            <p className="text-red-400 font-medium">{error}</p>
            <button onClick={fetchOrders} className="mt-2 text-sm text-red-400 underline">Retry</button>
          </div>
        ) : loading ? (
          <div className="text-center py-12 admin-text-muted">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="glass-card rounded-lg p-12 text-center">
            <ClipboardList className="h-8 w-8 mx-auto mb-3 text-slate-600" />
            <p className="admin-text-muted font-medium">No orders yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.id} className="glass-card rounded-lg p-5">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-sm font-bold admin-text">{order.id}</span>
                      <span className={statusBadgeClass(order.status)}>
                        {order.status}
                      </span>
                    </div>
                    <p className="text-sm admin-text-muted">
                      {order.customerName} &middot; {order.customerPhone}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                      className="glass-input px-3 py-1.5 rounded-lg text-sm"
                    >
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleDeleteOrder(order.id)}
                      disabled={deletingId === order.id}
                      className="glass-input px-3 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 border-red-500/20 disabled:opacity-50 inline-flex items-center gap-1.5"
                      title="Delete order from database"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingId === order.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm admin-text-muted mb-3">
                  <span className="flex items-center gap-1">
                    {order.fulfillmentType === "delivery" ? <Truck className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                    {order.fulfillmentType === "delivery" ? "Delivery" : "Takeout"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatSlotDate(order.slotDate)} at {order.slotTime}
                  </span>
                  {order.deliveryAddress && (
                    <span className="flex items-center gap-1 min-w-0">
                      <MapPin className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{order.deliveryAddress}</span>
                    </span>
                  )}
                </div>

                <div className="border-t border-white/8 pt-3">
                  <div className="space-y-1">
                    {order.items.map((item) => (
                      <div key={item.menuItem.id} className="flex justify-between text-sm">
                        <span className="admin-text">{item.quantity}x {item.menuItem.name}</span>
                        <span className="admin-text-muted">{formatPrice(item.menuItem.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t border-white/8">
                    <span className="admin-text">Total</span>
                    <span className="admin-red">{formatPrice(order.totalAmount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
