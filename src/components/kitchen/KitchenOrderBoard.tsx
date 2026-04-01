"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { statusBadgeClass } from "@/lib/admin-utils";
import {
  Package,
  Truck,
  Clock,
  ClipboardList,
  RefreshCw,
  MapPin,
  LogOut,
  ChefHat,
  ShoppingBag,
} from "lucide-react";
import type { KitchenCartPresenceEntry } from "@/lib/cart-presence-kitchen";
import { formatPrice } from "@/lib/utils";
import { formatSlotDate } from "@/lib/format";
import type { Order } from "@/data/types";

type Props = {
  locationName: string;
  slug: string;
};

const STATUS_ORDER: Order["status"][] = ["pending", "confirmed", "preparing", "ready", "completed"];

function formatSeenAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function KitchenOrderBoard({ locationName, slug }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveCarts, setLiveCarts] = useState<KitchenCartPresenceEntry[]>([]);

  const fetchLiveCarts = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen/cart-presence");
      if (res.status === 401) {
        router.push(`/kitchen/${slug}/login`);
        return;
      }
      if (res.ok) {
        setLiveCarts(await res.json());
      }
    } catch {
      /* ignore */
    }
  }, [router, slug]);

  const fetchOrders = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) {
        setLoading(true);
      }
      setError("");
      try {
        const res = await fetch("/api/kitchen/orders");
        if (res.status === 401) {
          router.push(`/kitchen/${slug}/login`);
          return;
        }
        if (res.ok) {
          setOrders(await res.json());
          void fetchLiveCarts();
        } else if (!silent) {
          setError("Failed to load orders. Please try again.");
        }
      } catch {
        if (!silent) {
          setError("Network error. Please check your connection.");
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [router, slug, fetchLiveCarts]
  );

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const ac = new AbortController();
    let stopped = false;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        if (ac.signal.aborted) {
          resolve();
          return;
        }
        const t = setTimeout(resolve, ms);
        const onAbort = () => {
          clearTimeout(t);
          resolve();
        };
        ac.signal.addEventListener("abort", onAbort, { once: true });
      });

    (async () => {
      while (!stopped && !ac.signal.aborted) {
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        try {
          const res = await fetch("/api/kitchen/cart-presence/stream", {
            signal: ac.signal,
            cache: "no-store",
          });
          if (res.status === 401) {
            router.push(`/kitchen/${slug}/login`);
            return;
          }
          if (!res.ok || !res.body) {
            await fetchLiveCarts();
            await sleep(2000);
            continue;
          }
          reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!ac.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            for (;;) {
              const sep = buffer.indexOf("\n\n");
              if (sep === -1) break;
              const block = buffer.slice(0, sep);
              buffer = buffer.slice(sep + 2);
              for (const line of block.split("\n")) {
                if (!line.startsWith("data:")) continue;
                const raw = line.slice(5).trimStart();
                if (!raw) continue;
                try {
                  setLiveCarts(JSON.parse(raw) as KitchenCartPresenceEntry[]);
                } catch {
                  /* ignore */
                }
              }
            }
          }
        } catch {
          if (!ac.signal.aborted && !stopped) {
            void fetchLiveCarts();
          }
        } finally {
          try {
            await reader?.cancel();
          } catch {
            /* ignore */
          }
        }
        if (stopped || ac.signal.aborted) break;
        await sleep(1500);
      }
    })();

    return () => {
      stopped = true;
      ac.abort();
    };
  }, [router, slug, fetchLiveCarts]);

  useEffect(() => {
    const id = setInterval(() => fetchOrders({ silent: true }), 30_000);
    return () => clearInterval(id);
  }, [fetchOrders]);

  const handleStatusChange = async (orderId: string, status: string) => {
    await fetch("/api/kitchen/orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, status }),
    });
    fetchOrders();
  };

  const handleLogout = async () => {
    await fetch("/api/kitchen/logout", { method: "POST" });
    router.push(`/kitchen/${slug}/login`);
    router.refresh();
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center text-white flex-shrink-0">
              <ChefHat className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-heading font-bold admin-text truncate">{locationName}</h1>
              <p className="text-xs admin-text-dim">Order board</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void fetchOrders();
                void fetchLiveCarts();
              }}
              className="glass-btn-ghost flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="glass-btn-ghost flex items-center gap-2 text-red-300 hover:text-red-200"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {error ? (
          <div className="glass-card rounded-lg p-6 text-center border-red-500/20">
            <p className="text-red-400 font-medium">{error}</p>
            <button
              type="button"
              onClick={() => {
                void fetchOrders();
                void fetchLiveCarts();
              }}
              className="mt-2 text-sm text-red-400 underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="glass-card rounded-lg p-5 border border-cyan-500/15 bg-cyan-950/20">
              <div className="flex items-center gap-2 mb-3">
                <ShoppingBag className="h-5 w-5 text-cyan-300" />
                <h2 className="text-sm font-heading font-semibold admin-text">Live carts (website)</h2>
                <span className="text-xs admin-text-dim">· live stream</span>
              </div>
              {liveCarts.length === 0 ? (
                <p className="text-sm admin-text-muted">
                  No active carts for this location. Enable with{" "}
                  <code className="text-xs bg-black/30 px-1 rounded">NEXT_PUBLIC_ENABLE_CART_PRESENCE=true</code> on
                  the server (on by default in development).
                </p>
              ) : (
                <ul className="space-y-4">
                  {liveCarts.map((row) => (
                    <li
                      key={row.visitorId}
                      className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-xs admin-text-dim">
                          Guest {row.visitorId.slice(0, 8)}…
                        </span>
                        <span className="text-xs admin-text-dim">{formatSeenAgo(row.lastSeenAt)}</span>
                      </div>
                      <ul className="space-y-1 mb-2">
                        {row.items.map((i) => (
                          <li key={i.id} className="flex justify-between gap-2 admin-text">
                            <span>
                              {i.quantity}× {i.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex justify-between text-xs font-semibold pt-2 border-t border-white/10">
                        <span className="admin-text-muted">Subtotal</span>
                        <span className="admin-text">{formatPrice(row.totalCents)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {loading && orders.length === 0 ? (
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
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <span className="font-mono text-sm font-bold admin-text">{order.id}</span>
                      <span className={statusBadgeClass(order.status)}>{order.status}</span>
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
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    {order.status === "cancelled" && (
                      <option value="cancelled">cancelled</option>
                    )}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm admin-text-muted mb-3">
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
                    <span className="flex items-center gap-1 min-w-0">
                      <MapPin className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{order.deliveryAddress}</span>
                    </span>
                  )}
                </div>

                {order.specialInstructions && (
                  <p className="text-sm text-amber-200/90 mb-3 rounded-lg bg-amber-500/10 px-3 py-2 border border-amber-500/20">
                    <span className="font-medium">Note: </span>
                    {order.specialInstructions}
                  </p>
                )}

                <div className="border-t border-white/8 pt-3">
                  <div className="space-y-1">
                    {order.items.map((item) => (
                      <div key={item.menuItem.id} className="flex justify-between text-sm">
                        <span className="admin-text">
                          {item.quantity}x {item.menuItem.name}
                        </span>
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
          </>
        )}

        <p className="text-center text-xs admin-text-dim pb-4">
          <Link href="/kitchen" className="underline hover:admin-text">
            Switch location
          </Link>
        </p>
      </div>
    </div>
  );
}
