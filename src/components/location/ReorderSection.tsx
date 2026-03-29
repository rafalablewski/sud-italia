"use client";

import { getPastOrders, PastOrder } from "@/lib/growth-engine";
import { useCartStore } from "@/store/cart";
import { formatPrice } from "@/lib/utils";
import { RotateCcw, Plus, Clock } from "lucide-react";
import { CATEGORY_EMOJI } from "@/data/menu-images";

interface ReorderSectionProps {
  locationSlug: string;
}

export function ReorderSection({ locationSlug }: ReorderSectionProps) {
  // In production, phone comes from auth/session — here we show demo data
  const pastOrders = getPastOrders("demo");
  const addItem = useCartStore((s) => s.addItem);

  if (pastOrders.length === 0) return null;

  const relevantOrders = pastOrders.filter((o) => o.locationSlug === locationSlug);
  if (relevantOrders.length === 0) return null;

  const handleReorder = (order: PastOrder) => {
    for (const item of order.items) {
      for (let i = 0; i < item.quantity; i++) {
        addItem(
          {
            id: item.id,
            name: item.name,
            description: "",
            price: item.price,
            cost: 0,
            category: "pizza",
            tags: [],
            available: true,
          },
          locationSlug
        );
      }
    }
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
        {relevantOrders.map((order) => (
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
                  <span className="text-xs">
                    {item.quantity}x
                  </span>
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
                className="flex items-center gap-1.5 px-3 py-2 bg-italia-red text-white text-xs font-semibold rounded-xl hover:bg-italia-red-dark transition-colors active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" />
                Reorder
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
