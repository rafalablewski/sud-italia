"use client";

import { useState, useEffect } from "react";
import { useCartStore } from "@/store/cart";
import { formatPrice } from "@/lib/utils";
import { RotateCcw, Plus, Clock, Loader2 } from "lucide-react";
import { MenuItem } from "@/data/types";

interface PastOrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

interface PastOrder {
  orderId: string;
  date: string;
  items: PastOrderItem[];
  total: number;
  locationSlug: string;
}

interface ReorderSectionProps {
  locationSlug: string;
  allMenuItems?: MenuItem[];
}

function getCustomerPhoneFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)sud-italia-customer=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function ReorderSection({ locationSlug, allMenuItems = [] }: ReorderSectionProps) {
  const [orders, setOrders] = useState<PastOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState<string | null>(null);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    const phone = getCustomerPhoneFromCookie();
    if (!phone) {
      setLoading(false);
      return;
    }

    fetch(`/api/orders/history?phone=${encodeURIComponent(phone)}`)
      .then((r) => r.json())
      .then((data) => {
        const relevant = (data.orders || []).filter(
          (o: PastOrder) => o.locationSlug === locationSlug
        );
        setOrders(relevant);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [locationSlug]);

  // Don't render anything if no cookie or no past orders
  if (loading || orders.length === 0) return null;

  const handleReorder = (order: PastOrder) => {
    const menuById = new Map(allMenuItems.map((m) => [m.id, m]));

    for (const item of order.items) {
      // Try to find the real menu item for accurate data
      const menuItem = menuById.get(item.id);
      const itemToAdd: MenuItem = menuItem || {
        id: item.id,
        name: item.name,
        description: "",
        price: item.price,
        cost: 0,
        category: "pizza",
        tags: [],
        available: true,
      };

      for (let i = 0; i < item.quantity; i++) {
        addItem(itemToAdd, locationSlug);
      }
    }

    setAdded(order.orderId);
    setTimeout(() => setAdded(null), 2000);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <RotateCcw className="h-5 w-5 text-italia-red" />
        <h3 className="font-heading font-bold text-lg text-italia-dark">
          Order Again
        </h3>
        <span className="text-xs text-italia-gray">&mdash; Your recent orders</span>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        {orders.map((order) => (
          <div
            key={order.orderId}
            className="flex-shrink-0 w-64 bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs text-italia-gray">
                <Clock className="h-3 w-3" />
                {new Date(order.date).toLocaleDateString("pl-PL", {
                  day: "numeric",
                  month: "short",
                })}
              </div>
              <span className="text-xs font-mono text-italia-gray">
                {order.orderId}
              </span>
            </div>

            <div className="space-y-1 mb-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-xs">{item.quantity}x</span>
                  <span className="text-italia-dark font-medium truncate">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <span className="font-bold text-italia-dark">
                {formatPrice(order.total)}
              </span>
              <button
                onClick={() => handleReorder(order)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all active:scale-95 ${
                  added === order.orderId
                    ? "bg-italia-green text-white"
                    : "bg-italia-red text-white hover:bg-italia-red-dark"
                }`}
              >
                {added === order.orderId ? (
                  <>Added!</>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    Reorder
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
