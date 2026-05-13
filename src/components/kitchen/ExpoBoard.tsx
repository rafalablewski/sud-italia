"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

interface TicketItem {
  menuItemId: string;
  name: string;
  quantity: number;
  notes?: string;
  allergens?: string[];
}

interface Ticket {
  id: string;
  orderId: string;
  stationId: string;
  locationSlug: string;
  status: "fired" | "ready" | "bumped" | "recalled";
  items: TicketItem[];
  promisedReadyAt?: string;
  firedAt: string;
  readyAt?: string;
  bumpedAt?: string;
}

interface Props {
  locationName: string;
  slug: string;
}

const POLL_MS = 3_000;
const PROMISED_WARNING_MS = 60 * 1000; // 60 s before promised → yellow
const PROMISED_OVERDUE_MS = 0; // past promised → red

/**
 * Expo screen (m2_6). Polls /api/kitchen/tickets every 3 s. Groups
 * tickets by orderId so the pass-through cook bumps an entire order
 * once every station's ticket has flipped to ready. Promised-ready
 * countdown turns yellow within 60 s and red past due.
 *
 * Phase 2's m1_10 in-process event emitter doesn't fan out to the
 * kitchen subdomain — the existing infra is per-route — so this stays
 * on polling for now. The poll cost is bounded: m2_1 indexed
 * kds_tickets table makes the per-poll cost an indexed range scan.
 */
export function ExpoBoard({ locationName, slug }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAlertedRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen/tickets", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = `/kitchen/${slug}/login`;
        return;
      }
      const json = (await res.json()) as { tickets: Ticket[] };
      setTickets(json.tickets);
      setError("");
    } catch {
      setError("Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  // Group tickets by orderId.
  const orderGroups = useMemo(() => {
    const groups = new Map<string, Ticket[]>();
    for (const t of tickets) {
      const list = groups.get(t.orderId) ?? [];
      list.push(t);
      groups.set(t.orderId, list);
    }
    // Sort orders by oldest fired-at first.
    return Array.from(groups.entries()).sort(([, a], [, b]) => {
      const aMin = Math.min(...a.map((t) => new Date(t.firedAt).getTime()));
      const bMin = Math.min(...b.map((t) => new Date(t.firedAt).getTime()));
      return aMin - bMin;
    });
  }, [tickets]);

  const bump = useCallback(
    async (ticketId: string) => {
      const res = await fetch(`/api/kitchen/tickets/${ticketId}/bump`, { method: "POST" });
      if (res.ok) refresh();
    },
    [refresh],
  );

  const markReady = async (ticketId: string) => {
    const res = await fetch(`/api/kitchen/tickets/${ticketId}/ready`, { method: "POST" });
    if (res.ok) refresh();
  };

  // m2_7 bump-bar hotkeys. Numeric 1-9 + 0 bump the Nth visible order
  // group ("bump all → notify customer"). Glove-friendly without a
  // physical bump-bar plugged in; landscape tablet at the pass-through
  // wins big. F1-F12 conflict with the browser/OS so we use digits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const map: Record<string, number> = {
        "1": 0, "2": 1, "3": 2, "4": 3, "5": 4,
        "6": 5, "7": 6, "8": 7, "9": 8, "0": 9,
      };
      const idx = map[e.key];
      if (idx === undefined) return;
      e.preventDefault();
      queueMicrotask(() => {
        if (idx >= orderGroups.length) return;
        const [, group] = orderGroups[idx];
        group.forEach((t) => void bump(t.id));
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderGroups, bump]);

  function statusFor(t: Ticket): "ok" | "warn" | "overdue" {
    if (!t.promisedReadyAt) return "ok";
    const promised = new Date(t.promisedReadyAt).getTime();
    if (promised - now < PROMISED_OVERDUE_MS) return "overdue";
    if (promised - now < PROMISED_WARNING_MS) return "warn";
    return "ok";
  }

  // Audible alert the first time a ticket goes overdue — once per
  // ticket per page load. The cook stays focused without false alarms.
  useEffect(() => {
    for (const t of tickets) {
      if (statusFor(t) === "overdue" && !lastAlertedRef.current.has(t.id)) {
        lastAlertedRef.current.add(t.id);
        audioRef.current?.play().catch(() => {
          /* ignore autoplay block */
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, now]);

  function countdownLabel(t: Ticket): string {
    if (!t.promisedReadyAt) return "—";
    const ms = new Date(t.promisedReadyAt).getTime() - now;
    if (ms < 0) {
      const overdueSec = Math.floor(-ms / 1000);
      return `${Math.floor(overdueSec / 60)}m ${overdueSec % 60}s late`;
    }
    const sec = Math.floor(ms / 1000);
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  }

  return (
    <main className="expo-board">
      <header className="expo-header">
        <div>
          <h1 className="expo-title">Expo · {locationName}</h1>
          <p className="expo-sub">{orderGroups.length} active {orderGroups.length === 1 ? "order" : "orders"}</p>
        </div>
        <nav className="expo-nav">
          <Link href={`/kitchen/${slug}`} className="expo-link">← KDS</Link>
        </nav>
      </header>

      {error && <div className="expo-error">{error}</div>}
      {loading && orderGroups.length === 0 && <p className="expo-empty">Loading…</p>}
      {!loading && orderGroups.length === 0 && <p className="expo-empty">No active orders.</p>}

      <div className="expo-orders">
        {orderGroups.map(([orderId, group], idx) => {
          const allReady = group.every((t) => t.status === "ready");
          // m2_7: digits 1-9 + 0 map to first 10 visible orders.
          const hotkey = idx < 9 ? String(idx + 1) : idx === 9 ? "0" : undefined;
          const worstStatus = group
            .map(statusFor)
            .reduce<"ok" | "warn" | "overdue">((acc, s) => {
              if (s === "overdue") return "overdue";
              if (s === "warn" && acc !== "overdue") return "warn";
              return acc;
            }, "ok");
          return (
            <article
              key={orderId}
              className={`expo-order expo-order-${worstStatus}`}
              data-ready={allReady ? "true" : "false"}
            >
              <header className="expo-order-header">
                <div className="expo-order-id">
                  {hotkey && <kbd className="expo-hotkey" aria-label={`Press ${hotkey} to bump all`}>{hotkey}</kbd>}
                  #{orderId}
                </div>
                <div className="expo-order-countdown">{countdownLabel(group[0])}</div>
              </header>
              <ul className="expo-order-stations">
                {group.map((t) => (
                  <li key={t.id} className={`expo-ticket expo-ticket-${t.status}`}>
                    <div className="expo-ticket-station">{t.stationId}</div>
                    <div className="expo-ticket-items">
                      {t.items.map((i) => (
                        <div key={i.menuItemId} className="expo-ticket-item">
                          <span className="expo-ticket-qty">{i.quantity}×</span>
                          <span>{i.name}</span>
                          {i.allergens && i.allergens.length > 0 && (
                            <span className="expo-allergens">
                              {i.allergens.join(" · ")}
                            </span>
                          )}
                          {i.notes && <span className="expo-notes">{i.notes}</span>}
                        </div>
                      ))}
                    </div>
                    <div className="expo-ticket-actions">
                      {t.status === "fired" && (
                        <button onClick={() => markReady(t.id)} className="expo-btn expo-btn-ready">
                          Ready
                        </button>
                      )}
                      {t.status === "ready" && (
                        <button onClick={() => bump(t.id)} className="expo-btn expo-btn-bump">
                          Bump
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {allReady && (
                <footer className="expo-order-footer">
                  <button
                    onClick={() => {
                      // Bump every ticket — last bump auto-flips order to "ready"
                      // and fires customer SMS via the outbox.
                      group.forEach((t) => void bump(t.id));
                    }}
                    className="expo-btn expo-btn-bump-all"
                  >
                    Bump all → notify customer
                  </button>
                </footer>
              )}
            </article>
          );
        })}
      </div>

      {/* Inline audio: tiny click sound for the overdue alert. */}
      <audio
        ref={audioRef}
        preload="auto"
        src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
      />
    </main>
  );
}
