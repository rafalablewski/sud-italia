"use client";

import { useState, useEffect, useCallback } from "react";
import { Order } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import {
  CheckCircle,
  ChefHat,
  ShoppingBag,
  Clock,
  Package,
  Truck,
  RefreshCw,
} from "lucide-react";

interface OrderTrackerProps {
  orderId: string;
  locationSlug: string;
}

const STATUS_STEPS = [
  { key: "confirmed", label: "Confirmed", icon: CheckCircle, description: "We received your order" },
  { key: "preparing", label: "Preparing", icon: ChefHat, description: "Our chef is making your food" },
  { key: "ready", label: "Ready", icon: ShoppingBag, description: "Your order is ready!" },
] as const;

type TrackerStatus = "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";

function getStepIndex(status: TrackerStatus): number {
  switch (status) {
    case "confirmed": return 0;
    case "preparing": return 1;
    case "ready": return 2;
    case "completed": return 3;
    default: return -1;
  }
}

function getEstimatedTime(status: TrackerStatus): string {
  switch (status) {
    case "confirmed": return "15-25 min";
    case "preparing": return "10-15 min";
    case "ready": return "Ready now!";
    case "completed": return "Completed";
    default: return "Processing...";
  }
}

export function OrderTracker({ orderId, locationSlug }: OrderTrackerProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders?orderId=${orderId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      if (data.order) {
        setOrder(data.order);
        setLastUpdated(new Date());
        setError(false);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // Poll every 10 seconds for status updates
  useEffect(() => {
    fetchOrder();
    const interval = setInterval(fetchOrder, 10000);
    return () => clearInterval(interval);
  }, [fetchOrder]);

  const status: TrackerStatus = order?.status || "confirmed";
  const currentStep = getStepIndex(status);
  const estimatedTime = getEstimatedTime(status);

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Live status indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-italia-green opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-italia-green" />
        </span>
        <span className="text-sm font-medium text-italia-green">
          Live tracking
        </span>
        <button
          onClick={fetchOrder}
          className="ml-2 p-1 rounded-full hover:bg-gray-100 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5 text-italia-gray" />
        </button>
      </div>

      {/* Progress steps */}
      <div className="relative mb-8">
        {/* Connection line */}
        <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gray-200" />
        <div
          className="absolute left-6 top-8 w-0.5 bg-italia-green transition-all duration-1000 ease-out"
          style={{
            height: `${Math.min(currentStep / (STATUS_STEPS.length - 1), 1) * 100}%`,
            maxHeight: "calc(100% - 4rem)",
          }}
        />

        <div className="space-y-6">
          {STATUS_STEPS.map((step, i) => {
            const isCompleted = i < currentStep || (i === currentStep && status === "completed");
            const isActive = i === currentStep && status !== "completed";
            const isPending = i > currentStep;

            return (
              <div key={step.key} className="flex items-start gap-4 relative">
                <div
                  className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center z-10 transition-all duration-500 ${
                    isCompleted
                      ? "bg-italia-green text-white shadow-md shadow-italia-green/20"
                      : isActive
                        ? "bg-italia-green text-white shadow-lg shadow-italia-green/30 animate-pulse-soft"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="pt-1.5">
                  <p
                    className={`font-semibold text-sm ${
                      isCompleted || isActive
                        ? "text-italia-dark"
                        : "text-gray-400"
                    }`}
                  >
                    {step.label}
                    {isActive && (
                      <span className="ml-2 text-xs font-normal text-italia-green">
                        Current
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-italia-gray mt-0.5">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Estimated time card */}
      <div className="bg-gradient-to-r from-italia-cream to-white rounded-2xl p-4 border border-italia-gold/15">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-italia-red/10 flex items-center justify-center">
            <Clock className="h-5 w-5 text-italia-red" />
          </div>
          <div>
            <p className="text-xs text-italia-gray font-medium">
              Estimated time
            </p>
            <p className="text-lg font-heading font-bold text-italia-red">
              {estimatedTime}
            </p>
          </div>
        </div>
      </div>

      {/* Order details */}
      {order && (
        <div className="mt-4 p-4 bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-italia-gray font-medium uppercase tracking-wide">
              Order summary
            </p>
            <div className="flex items-center gap-1.5 text-xs text-italia-gray">
              {order.fulfillmentType === "delivery" ? (
                <Truck className="h-3.5 w-3.5" />
              ) : (
                <Package className="h-3.5 w-3.5" />
              )}
              {order.fulfillmentType === "delivery" ? "Delivery" : "Takeout"}
            </div>
          </div>
          <div className="space-y-2">
            {order.items.map((ci) => (
              <div
                key={ci.menuItem.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-italia-dark">
                  {ci.quantity}x {ci.menuItem.name}
                </span>
                <span className="text-italia-gray font-medium">
                  {formatPrice(ci.menuItem.price * ci.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 mt-3 pt-3 flex items-center justify-between">
            <span className="font-semibold text-italia-dark">Total</span>
            <span className="font-bold text-italia-red">
              {formatPrice(order.totalAmount)}
            </span>
          </div>
        </div>
      )}

      {/* Last updated */}
      <p className="text-center text-[10px] text-italia-gray/60 mt-4">
        Last updated: {lastUpdated.toLocaleTimeString()}
      </p>
    </div>
  );
}
