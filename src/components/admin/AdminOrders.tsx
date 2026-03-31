"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminNav } from "./AdminNav";
import { statusBadgeClass } from "@/lib/admin-utils";
import { MapPin, Package, Truck, Clock, ClipboardList, RefreshCw } from "lucide-react";
import { locations } from "@/data/locations";
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

  return (
    <>
      <AdminNav />
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-6 stagger-1">
          <h1 className="text-2xl font-bold font-heading gradient-text">Orders</h1>
          <button
            onClick={fetchOrders}
            className="flex items-center gap-2 px-4 py-2 glass rounded-lg text-sm admin-text-muted hover:admin-text hover:bg-white/8 transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="flex items-center gap-2 mb-6 stagger-2">
          <MapPin className="h-4 w-4 admin-text-dim" />
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="glass-input px-3 py-2 rounded-lg text-sm"
          >
            <option value="">All locations</option>
            {activeLocations.map((loc) => (
              <option key={loc.slug} value={loc.slug}>{loc.city}</option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="glass-card rounded-lg p-6 text-center border-red-500/20">
            <p className="text-red-400 font-medium">{error}</p>
            <button onClick={fetchOrders} className="mt-2 text-sm text-red-400 underline">Retry</button>
          </div>
        ) : loading ? (
          <div className="text-center py-12 admin-text-muted">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="glass-card rounded-lg p-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 text-slate-600" />
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
                  <select
                    value={order.status}
                    onChange={(e) => handleStatusChange(order.id, e.target.value)}
                    className="glass-input px-3 py-1.5 rounded-lg text-sm"
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
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
                    <span className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {order.deliveryAddress}
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
