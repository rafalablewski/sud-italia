"use client";

import { useState, useEffect, useCallback } from "react";
import { Order } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { fulfillmentLabel, formatPartySize } from "@/lib/fulfillment";
import { FulfillmentIcon } from "@/components/FulfillmentIcon";
import {
  CheckCircle,
  ChefHat,
  ShoppingBag,
  Clock,
  RefreshCw,
} from "lucide-react";

interface OrderTrackerProps {
  orderId: string;
  locationSlug: string;
}

type TrackerStatus = "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";

const STATUS_STEPS = [
  {
    key: "confirmed",
    label: "Confirmed",
    italian: "confermato",
    icon: CheckCircle,
    description: "Restaurant confirmed your order.",
  },
  {
    key: "preparing",
    label: "Preparing",
    italian: "in preparazione",
    icon: ChefHat,
    description: "Our pizzaiolo is making your food.",
  },
  {
    key: "ready",
    label: "Ready",
    italian: "pronto",
    icon: ShoppingBag,
    description: "Your order is hot and ready.",
  },
] as const;

function getFirstStepCopy(status: TrackerStatus): {
  label: string;
  italian: string;
  description: string;
  Icon: typeof CheckCircle;
} {
  if (status === "pending") {
    return {
      label: "Awaiting confirmation",
      italian: "in attesa",
      description: "We have your order — the restaurant will confirm it shortly.",
      Icon: Clock,
    };
  }
  return {
    label: STATUS_STEPS[0].label,
    italian: STATUS_STEPS[0].italian,
    description: STATUS_STEPS[0].description,
    Icon: STATUS_STEPS[0].icon,
  };
}

function getStepIndex(status: TrackerStatus): number {
  switch (status) {
    case "pending":
    case "confirmed":
      return 0;
    case "preparing":
      return 1;
    case "ready":
      return 2;
    case "completed":
      return 3;
    default:
      return -1;
  }
}

function getEstimatedTime(status: TrackerStatus): string {
  switch (status) {
    case "pending":
      return "Usually within a few minutes";
    case "confirmed":
      return "15-25 min";
    case "preparing":
      return "10-15 min";
    case "ready":
      return "Ready now!";
    case "completed":
      return "Completed";
    default:
      return "Processing...";
  }
}

export function OrderTracker({ orderId }: OrderTrackerProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // `lastUpdated` is rendered as a locale time string. Guarding on a
  // mounted flag means we don't ship a date string from SSR (which the
  // client would then re-render in a slightly different second,
  // tripping React's hydration mismatch detector).
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders?orderId=${orderId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      if (data.order) {
        setOrder(data.order);
        setLastUpdated(new Date());
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // Live updates via SSE (/api/orders/stream) — the in-process order-event
  // emitter pushes status changes sub-50 ms on the common path. If the
  // browser has no EventSource or the stream errors/drops (proxy timeout,
  // backgrounding), we fall back to a 10 s REST poll so the tracker never
  // freezes. The first REST fetch still runs immediately for fast paint.
  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startFallbackPoll = () => {
      if (pollTimer || cancelled) return;
      pollTimer = setInterval(fetchOrder, 10_000);
    };
    const stopFallbackPoll = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    fetchOrder();

    if (typeof window !== "undefined" && "EventSource" in window) {
      try {
        source = new EventSource(`/api/orders/stream?orderId=${encodeURIComponent(orderId)}`);
        // On (re)connect, drop the fallback poll — the stream is live again.
        source.onopen = () => stopFallbackPoll();
        source.onmessage = (ev) => {
          if (cancelled) return;
          try {
            const data = JSON.parse(ev.data);
            if (data.order) {
              setOrder(data.order);
              setLastUpdated(new Date());
              setError(false);
            }
          } catch {
            /* ignore malformed frame */
          }
        };
        // Don't close the source — let EventSource auto-reconnect natively.
        // Poll bridges the gap meanwhile; onopen clears it on reconnect.
        source.onerror = () => startFallbackPoll();
      } catch {
        startFallbackPoll();
      }
    } else {
      startFallbackPoll();
    }

    return () => {
      cancelled = true;
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [fetchOrder, orderId]);

  const status: TrackerStatus = (order?.status as TrackerStatus) ?? "pending";
  const currentStep = getStepIndex(status);
  const estimatedTime = getEstimatedTime(status);
  const isCancelled = status === "cancelled";
  const firstStepCopy = getFirstStepCopy(status);

  const railFillPct =
    Math.min(Math.max(currentStep, 0) / Math.max(STATUS_STEPS.length - 1, 1), 1) * 100;

  return (
    <div>
      {/* Live status indicator + refresh button */}
      <div
        className={`v8-order-tracker-status${isCancelled ? " is-cancelled" : ""}`}
        role="status"
      >
        <span className="v8-order-tracker-pulse" aria-hidden="true" />
        <em>{isCancelled ? "Order cancelled · annullato" : "Live tracking · in diretta"}</em>
        <button
          type="button"
          onClick={fetchOrder}
          className="v8-order-tracker-refresh"
          title="Refresh"
          aria-label="Refresh status"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {isCancelled ? (
        <div className="v8-order-tracker-cancelled" role="alert">
          This order is <em>no longer active</em>. If you were charged in error, contact the restaurant.
        </div>
      ) : loading && !order ? (
        <p className="v8-order-tracker-loading">Loading order status…</p>
      ) : error && !order ? (
        <p className="v8-order-tracker-error">
          Couldn&apos;t load this order. Tap refresh to try again.
        </p>
      ) : (
        <>
          {/* Editorial stepper — basil dots when complete, terracotta when active */}
          <div className="v8-order-tracker-steps">
            <div className="v8-order-tracker-rail" aria-hidden="true" />
            <div
              className="v8-order-tracker-rail-fill"
              aria-hidden="true"
              style={{ height: `calc(${railFillPct}% - 0px)` }}
            />
            {STATUS_STEPS.map((step, i) => {
              const isCompleted =
                i < currentStep || (i === currentStep && status === "completed");
              const isActive = i === currentStep && status !== "completed";
              const pendingHold = status === "pending" && isActive && i === 0;
              const label = i === 0 ? firstStepCopy.label : step.label;
              const italian = i === 0 ? firstStepCopy.italian : step.italian;
              const description = i === 0 ? firstStepCopy.description : step.description;
              const StepIcon = i === 0 ? firstStepCopy.Icon : step.icon;
              const classes = [
                "v8-order-step",
                isCompleted ? "is-completed" : "",
                isActive ? "is-active" : "",
                pendingHold ? "is-pending" : "",
              ].filter(Boolean).join(" ");
              return (
                <div key={step.key} className={classes}>
                  <span className="v8-order-step-dot" aria-hidden="true">
                    <StepIcon className="h-5 w-5" />
                  </span>
                  <div className="v8-order-step-body">
                    <div className="v8-order-step-label">
                      {label} <span className="v8-order-step-it">· {italian}</span>
                      {isActive && (
                        <span className="v8-order-step-current">Current</span>
                      )}
                    </div>
                    <div className="v8-order-step-desc">{description}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Estimated time card */}
          <div className="v8-order-tracker-eta">
            <span className="v8-order-tracker-eta-icon" aria-hidden="true">
              <Clock className="h-5 w-5" />
            </span>
            <div className="v8-order-tracker-eta-body">
              <div className="v8-order-tracker-eta-label">
                Estimated · stimato
              </div>
              <div className="v8-order-tracker-eta-val">{estimatedTime}</div>
            </div>
          </div>
        </>
      )}

      {/* Order summary */}
      {order && (
        <div className="v8-order-summary">
          <div className="v8-order-summary-head">
            <span className="v8-order-section-title" style={{ margin: 0 }}>
              Your order <span className="v8-order-section-it">· il tuo ordine</span>
            </span>
            <span className="v8-order-summary-mode">
              <FulfillmentIcon type={order.fulfillmentType} className="h-3.5 w-3.5" />
              {fulfillmentLabel(order.fulfillmentType)}
              {order.fulfillmentType === "dine-in" && order.partySize
                ? ` · ${formatPartySize(order.partySize)}`
                : ""}
            </span>
          </div>
          <div>
            {order.items.map((ci) => (
              <div key={ci.menuItem.id} className="v8-order-summary-line">
                <span className="v8-order-summary-line-name">
                  <span className="num">{ci.quantity}×</span>
                  {ci.menuItem.name}
                </span>
                <span className="v8-order-summary-line-val">
                  {formatPrice(ci.menuItem.price * ci.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="v8-order-summary-total">
            <span className="v8-order-summary-total-label">
              Total <span className="v8-order-section-it">· totale</span>
            </span>
            <span className="v8-order-summary-total-val">
              {formatPrice(order.totalAmount)}
            </span>
          </div>
        </div>
      )}

      {/* Last updated — client-only so the SSR'd HTML doesn't disagree
          with the hydrated render about which second it is. */}
      {lastUpdated && (
        <p className="v8-order-tracker-updated" suppressHydrationWarning>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
