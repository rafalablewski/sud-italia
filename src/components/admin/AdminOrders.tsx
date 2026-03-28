"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminNav } from "./AdminNav";
import { MapPin, Package, Truck, Clock, ClipboardList } from "lucide-react";
import { locations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { formatSlotDate } from "@/lib/format";
import type { Order } from "@/data/types";

const activeLocations = locations.filter((l) => l.isActive);

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-orange-100 text-orange-800",
  ready: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-600",
};

const STATUS_ORDER: Order["status"][] = ["pending", "confirmed", "preparing", "ready", "completed"];

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedLocation ? `?location=${selectedLocation}` : "";
      const res = await fetch(`/api/admin/orders${params}`);
      if (res.ok) {
        setOrders(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold font-heading text-italia-dark">Orders</h1>
          <button
            onClick={fetchOrders}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 mb-6">
          <MapPin className="h-4 w-4 text-italia-gray" />
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-italia-red"
          >
            <option value="">All locations</option>
            {activeLocations.map((loc) => (
              <option key={loc.slug} value={loc.slug}>
                {loc.city}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-italia-gray">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-italia-gray font-medium">No orders yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-xl p-5 shadow-sm border border-gray-100"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-sm font-bold text-italia-dark">
                        {order.id}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || ""}`}
                      >
                        {order.status}
                      </span>
                    </div>
                    <p className="text-sm text-italia-gray">
                      {order.customerName} &middot; {order.customerPhone}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                    >
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm text-italia-gray mb-3">
                  <span className="flex items-center gap-1">
                    {order.fulfillmentType === "delivery" ? (
                      <Truck className="h-4 w-4" />
                    ) : (
                      <Package className="h-4 w-4" />
                    )}
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

                <div className="border-t border-gray-100 pt-3">
                  <div className="space-y-1">
                    {order.items.map((item) => (
                      <div key={item.menuItem.id} className="flex justify-between text-sm">
                        <span>
                          {item.quantity}x {item.menuItem.name}
                        </span>
                        <span className="text-italia-gray">
                          {formatPrice(item.menuItem.price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t border-gray-100">
                    <span>Total</span>
                    <span className="text-italia-red">{formatPrice(order.totalAmount)}</span>
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
