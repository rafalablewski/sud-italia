"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import type { Order, MenuCategory, OrderStatus } from "@/data/types";
import { useAdminLocation } from "@/shared/LocationContext";
import { useToast } from "@/ui/Toast";
import {
  ACTIVE_STATUSES,
  KDS_COLUMNS,
  STATION_FILTERS,
  fmtClock,
  fmtWallClock,
  groupTicketsByColumn,
  nextStatus,
  remainingSlaSeconds,
  ticketCategories,
  toneForTicket,
  totalPrepSeconds,
} from "@/core/kds/kds-board";
import { useFullscreen } from "@/core/kds/useFullscreen";
import { analyzeTruck, computeHealth, ticketTone, type PaceTier, type TicketTone } from "@/lib/kds-prediction";
import { buildKdsTicket, kdsShortId, type KdsTicket, type KdsTicketItem } from "@/lib/kds-ticket";
import { useKdsSimulator } from "@/lib/useKdsSimulator";
import { fulfillmentLabel } from "@/lib/fulfillment";
import { formatPricePLN } from "@/lib/utils";
import { POS_COURSE_LABELS } from "@/lib/pos-coursing";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import type { AdminRole } from "@/lib/admin-roles";

/* ────────────────────────── inline SVG icons (copied 1:1 from the mockups) ────────────────────────── */

const IcoRefresh = () => (
  <svg className="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
  </svg>
);
const IcoSoundOn = () => (
  <svg className="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
  </svg>
);
const IcoSoundOff = () => (
  <svg className="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6" />
  </svg>
);
const IcoPause = () => (
  <svg className="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 5v14M16 5v14" />
  </svg>
);
const IcoPlay = () => (
  <svg className="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4l14 8-14 8z" />
  </svg>
);
const IcoFullscreen = () => (
  <svg className="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);
const IcoMinimize = () => (
  <svg className="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3" />
  </svg>
);
const IcoTriangleStack = () => (
  <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
    <path d="M12 2 2 7l10 5 10-5zM2 12l10 5 10-5M2 17l10 5 10-5" />
  </svg>
);
const IcoAlert = () => (
  <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </svg>
);
const IcoChefHat = () => (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6z" />
    <path d="M6 17h12" />
  </svg>
);
const IcoRotate = () => (
  <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 2.6-6.4M3 4v5h5" />
  </svg>
);
const IcoFlask = () => (
  <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3h6M10 3v6.5L5 18a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-8.5V3" />
  </svg>
);

/* ────────────────────────── recall-tray persistence (identical to AdminKDS) ────────────────────────── */

type BumpEntry = { orderId: string; label: string; bumpedAt: number };
const BUMP_HISTORY_TTL_MS = 10 * 60 * 1000;
const bumpStorageKey = (loc: string) => `sud-kds-bump-history:${loc}`;

function loadBumpHistory(loc: string): BumpEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(bumpStorageKey(loc));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - BUMP_HISTORY_TTL_MS;
    return parsed
      .filter(
        (e): e is BumpEntry =>
          !!e &&
          typeof (e as BumpEntry).orderId === "string" &&
          typeof (e as BumpEntry).label === "string" &&
          typeof (e as BumpEntry).bumpedAt === "number" &&
          (e as BumpEntry).bumpedAt >= cutoff,
      )
      .slice(0, 5);
  } catch {
    return [];
  }
}

/* ────────────────────────── role-routed root (mirrors AdminKDS) ────────────────────────── */

/**
 * Core v2 KDS — a 1:1 re-skin of AdminKDS / AdminKdsFleet onto the core-suite
 * mockup markup. Full-bleed dark kiosk wall (no CoreShell), wired to the exact
 * same endpoints / hooks / libs. One live-order engine, three lenses:
 *   • owner → Fleet command (drilling into a truck swaps to its Floor board)
 *   • manager / franchisee → Floor board (ops header)
 *   • kitchen / staff → Floor board with the chef strip
 */
export function KdsV2() {
  const { setLocation } = useAdminLocation();
  const [role, setRole] = useState<AdminRole | null>(null);
  const [mode, setMode] = useState<"fleet" | "floor" | "chef">("fleet");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const r = j?.role as AdminRole | undefined;
        if (r) setRole(r);
      })
      .catch(() => {
        /* non-fatal — falls back to the floor board */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const managerControls = role === "manager" || role === "franchisee";
  const chef = role === "kitchen" || role === "staff";

  // Everyone but the owner (incl. the pre-resolve null state) lands on the floor.
  if (role !== "owner") {
    return <KdsV2Floor opsHeader={managerControls} chefStrip={chef} />;
  }

  if (mode === "fleet") {
    return (
      <KdsV2Fleet
        onDrillIn={(slug, lens) => {
          setLocation(slug);
          setMode(lens ?? "floor");
        }}
      />
    );
  }

  // Owner drilled into a truck — Floor / Chef lens with the Fleet switch back.
  return (
    <KdsV2Floor
      opsHeader={mode === "floor"}
      chefStrip={mode === "chef"}
      fleetContext
      lens={mode === "chef" ? "chef" : "floor"}
      onLens={(l) => setMode(l)}
      onExitFleet={() => setMode("fleet")}
    />
  );
}

/* ============================================================
   FLOOR  (kds.html) — also hosts the chef line (kds-chef.html)
   ============================================================ */

function KdsV2Floor({
  opsHeader = false,
  chefStrip = false,
  fleetContext = false,
  lens,
  onLens,
  onExitFleet,
}: {
  opsHeader?: boolean;
  chefStrip?: boolean;
  fleetContext?: boolean;
  lens?: "floor" | "chef";
  onLens?: (lens: "floor" | "chef") => void;
  onExitFleet?: () => void;
}) {
  const { location, activeLocations } = useAdminLocation();
  const toast = useToast();

  const locName = activeLocations.find((l) => l.slug === location)?.city || location;
  const brandLabel = fleetContext
    ? locName
      ? `Fleet command · ${locName}`
      : "Fleet command"
    : locName
      ? `${locName} · floor`
      : "Floor";

  const { enabled: simEnabled } = useKdsSimulator(location);

  const [station, setStation] = useState<MenuCategory | "all">("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [lane, setLane] = useState<OrderStatus | "all">("all");

  const { active: kiosk, enter: enterKiosk, exit: exitKiosk } = useFullscreen();

  const { orders: streamedOrders, refresh } = useAdminOrdersStream(location, { paused, includeSimulated: true });
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const pendingRef = useRef<Map<string, OrderStatus>>(new Map());

  useEffect(() => {
    const pending = pendingRef.current;
    const merged: Order[] = [];
    for (const o of streamedOrders) {
      const target = pending.get(o.id);
      const status = target ?? o.status;
      if (!ACTIVE_STATUSES.includes(status)) continue;
      merged.push(target ? { ...o, status } : o);
    }
    setOrders(merged);
    setLoading(false);
  }, [streamedOrders]);

  const [bumpHistory, setBumpHistory] = useState<BumpEntry[]>([]);
  const [loadedLocation, setLoadedLocation] = useState<string | null>(null);
  useEffect(() => {
    setBumpHistory(loadBumpHistory(location));
    setLoadedLocation(location);
  }, [location]);
  useEffect(() => {
    if (typeof window === "undefined" || loadedLocation !== location) return;
    try {
      window.localStorage.setItem(bumpStorageKey(location), JSON.stringify(bumpHistory));
    } catch {
      /* localStorage full/blocked — the tray still works in-memory this session. */
    }
  }, [bumpHistory, location, loadedLocation]);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const overdueFiredRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const overdueAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const known = knownIdsRef.current;
    const currentIds = new Set(orders.map((o) => o.id));
    if (known.size === 0) {
      knownIdsRef.current = currentIds;
      return;
    }
    let newOnes = 0;
    for (const id of currentIds) if (!known.has(id)) newOnes++;
    if (newOnes > 0 && soundOn) audioRef.current?.play().catch(() => {});
    knownIdsRef.current = currentIds;
  }, [orders, soundOn]);

  useEffect(() => {
    const fired = overdueFiredRef.current;
    const stillActive = new Set(orders.map((o) => o.id));
    for (const id of Array.from(fired)) if (!stillActive.has(id)) fired.delete(id);
    if (!soundOn) return;
    for (const o of orders) {
      if (o.status === "ready") continue;
      const remaining = remainingSlaSeconds(o);
      if (remaining === null || remaining >= 0) continue;
      if (fired.has(o.id)) continue;
      fired.add(o.id);
      overdueAudioRef.current?.play().catch(() => {});
    }
  }, [orders, soundOn, now]);

  const visibleByStatus = useMemo(() => {
    const analysis = analyzeTruck(orders, now);
    const tickets = orders.map((o) => buildKdsTicket(o, analysis.predictions.get(o.id), now));
    return groupTicketsByColumn(tickets, station);
  }, [orders, station, now]);

  const laneCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    let total = 0;
    for (const col of KDS_COLUMNS) {
      const n = (visibleByStatus.get(col.id) || []).length;
      counts[col.id] = n;
      total += n;
    }
    counts.all = total;
    return counts;
  }, [visibleByStatus]);

  const clock = useMemo(() => (mounted ? fmtWallClock(now) : "--:--:--"), [now, mounted]);

  const ticketColumnFlat = useMemo(() => {
    if (lane !== "all") return visibleByStatus.get(lane) || [];
    for (const col of KDS_COLUMNS) {
      const arr = visibleByStatus.get(col.id) || [];
      if (arr.length > 0) return arr;
    }
    return [] as KdsTicket[];
  }, [visibleByStatus, lane]);

  const advanceRef = useRef<(o: { id: string; status: OrderStatus; customerName?: string }) => Promise<void>>(
    async () => {},
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      let index = -1;
      if (e.key >= "1" && e.key <= "9") index = parseInt(e.key, 10) - 1;
      else if (e.key === "0") index = 9;
      if (index < 0) return;
      const ticket = ticketColumnFlat[index];
      if (!ticket) return;
      e.preventDefault();
      void advanceRef.current(ticket);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ticketColumnFlat]);

  const advance = useCallback(
    async (o: { id: string; status: OrderStatus; customerName?: string }) => {
      const next = nextStatus(o.status);
      if (!next) return;
      const label = `${o.customerName || "Guest"} · ${o.id.slice(-6).toUpperCase()}`;
      const original = orders.find((x) => x.id === o.id);
      const rollback = () => {
        if (next === "completed") setBumpHistory((arr) => arr.filter((e) => e.orderId !== o.id));
        if (original) {
          setOrders((arr) =>
            arr.some((x) => x.id === original.id)
              ? arr.map((x) => (x.id === original.id ? original : x))
              : [...arr, original],
          );
        }
      };
      setUpdatingId(o.id);
      pendingRef.current.set(o.id, next);
      if (next === "completed") {
        setBumpHistory((arr) =>
          [{ orderId: o.id, label, bumpedAt: Date.now() }, ...arr.filter((e) => e.orderId !== o.id)].slice(0, 5),
        );
        setOrders((arr) => arr.filter((x) => x.id !== o.id));
      } else {
        setOrders((arr) => arr.map((x) => (x.id === o.id ? { ...x, status: next } : x)));
      }
      try {
        const res = await fetch("/api/admin/orders", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: o.id, status: next }),
        });
        if (res.ok) {
          if (next === "completed") toast.success("Order bumped", label);
        } else {
          rollback();
          toast.error("Could not advance", "Put the ticket back — try again.");
          refresh();
        }
      } catch {
        rollback();
        toast.error("Could not advance", "Network error — ticket restored.");
        refresh();
      } finally {
        pendingRef.current.delete(o.id);
        setUpdatingId(null);
      }
    },
    [orders, refresh, toast],
  );

  useEffect(() => {
    advanceRef.current = advance;
  });

  const recall = useCallback(
    async (orderId: string) => {
      setUpdatingId(orderId);
      pendingRef.current.set(orderId, "ready");
      try {
        const res = await fetch(`/api/admin/orders/${orderId}/recall`, { method: "POST" });
        if (res.ok) {
          const recalled: Order = await res.json();
          setOrders((arr) => {
            const without = arr.filter((x) => x.id !== recalled.id);
            return ACTIVE_STATUSES.includes(recalled.status) ? [...without, recalled] : without;
          });
          setBumpHistory((arr) => arr.filter((e) => e.orderId !== orderId));
          toast.success("Order recalled", "Back on the expo column.");
        } else {
          const data: { error?: string } = await res.json().catch(() => ({}));
          toast.error("Could not recall", data.error || "Try again in a moment.");
        }
      } catch {
        toast.error("Could not recall", "Network error. Try again.");
      } finally {
        pendingRef.current.delete(orderId);
        setUpdatingId(null);
      }
    },
    [toast],
  );

  const viewLabel: "Floor" | "Chef" = chefStrip ? "Chef" : "Floor";
  const view = chefStrip ? "chef" : "floor";

  /* ── header bits: viewswitch + stage filter, shared across the dark wall ── */

  const viewswitch = (
    <div className="viewswitch">
      {fleetContext && onExitFleet && (
        <a onClick={onExitFleet} role="button" tabIndex={0}>
          <span>Fleet</span>
        </a>
      )}
      <a
        onClick={onLens ? () => onLens("floor") : undefined}
        role="button"
        tabIndex={0}
      >
        <span className={(onLens ? lens === "floor" : viewLabel === "Floor") ? "on" : ""}>Floor</span>
      </a>
      {(onLens || chefStrip) && (
        <a onClick={onLens ? () => onLens("chef") : undefined} role="button" tabIndex={0}>
          <span className={(onLens ? lens === "chef" : true) ? "on" : ""}>Chef</span>
        </a>
      )}
    </div>
  );

  const stage = (
    <div className="stage" role="group" aria-label="Stage focus">
      <button type="button" className={lane === "all" ? "on" : ""} onClick={() => setLane("all")}>
        All <span className="n">{laneCounts.all}</span>
      </button>
      {KDS_COLUMNS.map((col) => (
        <button key={col.id} type="button" className={lane === col.id ? "on" : ""} onClick={() => setLane(col.id)}>
          {col.label} <span className="n">{laneCounts[col.id]}</span>
        </button>
      ))}
    </div>
  );

  const controls = (
    <>
      <div className="clock">{clock}</div>
      {simEnabled && (
        <span className="badge platinum">
          <span className="d" />
          Sandbox
        </span>
      )}
      <button type="button" className="ctrl" onClick={refresh} title="Refresh now">
        <IcoRefresh />
      </button>
      <button
        type="button"
        className={`ctrl${soundOn ? " on" : ""}`}
        onClick={() => setSoundOn((s) => !s)}
        title={soundOn ? "Mute new-ticket chime" : "Enable new-ticket chime"}
      >
        {soundOn ? <IcoSoundOn /> : <IcoSoundOff />}
      </button>
      <button
        type="button"
        className={`ctrl${paused ? " on" : ""}`}
        onClick={() => setPaused((p) => !p)}
        title={paused ? "Resume" : "Pause"}
      >
        {paused ? <IcoPlay /> : <IcoPause />}
      </button>
      {kiosk ? (
        <button type="button" className="ctrl on" onClick={exitKiosk} title="Exit fullscreen (Esc)">
          <IcoMinimize />
        </button>
      ) : (
        <button type="button" className="ctrl" onClick={enterKiosk} title="Fullscreen kiosk">
          <IcoFullscreen />
        </button>
      )}
    </>
  );

  /* ── board body ── */

  const board = (
    <>
      {loading ? null : orders.length === 0 ? (
        <div className="ka-empty">Kitchen is clear — new paid orders show up here within seconds.</div>
      ) : chefStrip ? (
        <ChefQueue columns={visibleByStatus} lane={lane} nowMs={now} updatingId={updatingId} onAdvance={advance} />
      ) : (
        <FloorBoard columns={visibleByStatus} lane={lane} nowMs={now} updatingId={updatingId} onAdvance={advance} />
      )}

      <audio ref={audioRef} preload="auto" src="data:audio/wav;base64,UklGRkAAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRwAAAAAAGn/AAA7AGn/AAA7AGn/AAA7AGn/AAA7AA==" />
      <audio ref={overdueAudioRef} preload="auto" src="data:audio/wav;base64,UklGRkAAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRwAAAAAAJL/AABuAJL/AABuAJL/AABuAJL/AABuAA==" />
    </>
  );

  /* ── Floor: the kds.html wall ── */
  const floorWall = (
    <div className={`corev2 kds floor${kiosk ? "" : ""}`} data-cv2-portal>
      <div className="kds-wrap">
        <div className="kds-top">
          <div className="kds-id">
            <div className="brand-mark">SI</div>
            <div>
              <div className="nm">Kitchen</div>
              <div className="loc">{brandLabel}</div>
            </div>
          </div>
          {viewswitch}
          {stage}
          {controls}
        </div>

        {opsHeader && <FloorOpsHeader orders={orders} location={location} />}

        {board}

        <div className="footrow">
          {bumpHistory.length > 0 && (
            <div className="recall">
              <span className="lbl">Recall</span>
              {bumpHistory.slice(0, 5).map((b) => (
                <button
                  key={b.orderId}
                  type="button"
                  className="chip"
                  disabled={updatingId === b.orderId}
                  onClick={() => recall(b.orderId)}
                  title={`Recall ${b.label} to the expo column`}
                >
                  <IcoRotate />#{kdsShortId(b.orderId)}
                </button>
              ))}
            </div>
          )}
          <div className="legend">
            <span className="k">
              <span className="sw" />
              On time
            </span>
            <span className="k">
              <span className="sw" style={{ background: "var(--warn)" }} />
              Approaching SLA
            </span>
            <span className="k">
              <span className="sw" style={{ background: "var(--late)" }} />
              Late
            </span>
            <span>
              Keys <b>1–9</b> bump · <b>0</b> 10th · <b>F</b> kiosk
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Chef: the kds-chef.html wall ── */
  const chefWall = (
    <div className="corev2 kds chef" data-cv2-portal>
      <div className="wrap">
        <div className="top">
          <div className="id">
            <div className="brand-mark">SI</div>
            <div>
              <div className="nm">Chef line</div>
              <div className="loc">{brandLabel}</div>
            </div>
          </div>
          {viewswitch}
          {stage}
          {controls}
        </div>

        <ChefStrip orders={orders} station={station} onStation={setStation} location={location} nowMs={now} />

        {board}

        <div className="legend">
          Your station only · large type for the line · keys <b>1–9</b> bump the queue
        </div>
      </div>
    </div>
  );

  const wall = view === "chef" ? chefWall : floorWall;

  return (
    <>
      {kiosk ? createPortal(wall, document.body) : wall}
      {loading &&
        mounted &&
        createPortal(
          <div className="corev2 cv2-toast" data-cv2-portal>
            Loading Kitchen Display…
          </div>,
          document.body,
        )}
    </>
  );
}

/* ────────────────────────── Floor board (3 columns / single lane) ────────────────────────── */

function FloorBoard({
  columns,
  lane,
  nowMs,
  updatingId,
  onAdvance,
}: {
  columns: Map<OrderStatus, KdsTicket[]>;
  lane: OrderStatus | "all";
  nowMs: number;
  updatingId: string | null;
  onAdvance: (t: KdsTicket) => void;
}) {
  if (lane !== "all") {
    const tickets = [...(columns.get(lane) || [])].sort((a, b) => a.paidAtMs - b.paidAtMs);
    if (tickets.length === 0) return <div className="kds-empty">No tickets in this lane.</div>;
    return (
      <div className="board" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {tickets.map((t) => (
          <Tk key={t.id} t={t} now={nowMs} updatingId={updatingId} onAdvance={onAdvance} />
        ))}
      </div>
    );
  }
  return (
    <div className="board">
      {KDS_COLUMNS.map((col) => {
        const tickets = columns.get(col.id) || [];
        const active = col.id === "preparing";
        return (
          <div key={col.id} className={`col${active ? " active" : ""}`}>
            <div className="col-head">
              <span className="lbl">{col.label}</span>
              <span className="cnt">{tickets.length}</span>
              <span className="rule" />
            </div>
            <div className="col-body">
              {tickets.length === 0 ? (
                <div className="kds-empty" style={{ padding: 20 }}>
                  No tickets here.
                </div>
              ) : (
                tickets.map((t) => (
                  <Tk key={t.id} t={t} now={nowMs} updatingId={updatingId} onAdvance={onAdvance} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const NEXT_LABEL: Record<string, string> = {
  confirmed: "Start prep",
  preparing: "Mark ready",
  ready: "Bump · Done",
};
const CATEGORY_ORDER = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function mmss(seconds: number): string {
  const a = Math.abs(Math.round(seconds));
  return `${Math.floor(a / 60)}:${pad(a % 60)}`;
}

/** Floor ticket — the kds.html `.tk` card. */
function Tk({
  t,
  now,
  updatingId,
  onAdvance,
}: {
  t: KdsTicket;
  now: number;
  updatingId: string | null;
  onAdvance: (t: KdsTicket) => void;
}) {
  const tone = toneForTicket(t, now);
  const advancing = updatingId === t.id;
  const elapsed = Math.max(0, (now - t.paidAtMs) / 1000);
  const slaRem = t.promisedReadyAtMs !== null ? (t.promisedReadyAtMs - now) / 1000 : null;
  const predRem = Math.max(0, (t.predictedReadyAtMs - now) / 1000);

  const toneClass =
    t.status === "ready" ? "ready" : tone === "late" ? "late" : tone === "risk" ? "risk" : tone === "warn" ? "warn" : "";

  let slaPct: number;
  if (t.status === "ready" || (slaRem !== null && slaRem < 0)) {
    slaPct = 100;
  } else if (slaRem !== null && t.promisedReadyAtMs !== null) {
    const window = Math.max(60, (t.promisedReadyAtMs - t.paidAtMs) / 1000);
    slaPct = Math.min(100, Math.max(0, Math.round((1 - slaRem / window) * 100)));
  } else {
    slaPct = Math.min(95, Math.round((elapsed / Math.max(60, predRem + elapsed)) * 100));
  }

  const etaLbl =
    t.status === "ready"
      ? "Ready for expo"
      : slaRem !== null && slaRem < 0
        ? `Over promise · ${mmss(slaRem)}`
        : tone === "risk"
          ? `At risk · ~${mmss(predRem)}`
          : `Ready in ~${mmss(predRem)}`;

  const timerText = t.status === "ready" ? "plated" : mmss(elapsed);

  const groups = new Map<string, KdsTicketItem[]>();
  for (const it of t.items) {
    const arr = groups.get(it.category) ?? [];
    arr.push(it);
    groups.set(it.category, arr);
  }
  const sortedGroups = [...groups.entries()].sort(
    (a, b) =>
      (CATEGORY_ORDER.indexOf(a[0]) < 0 ? 99 : CATEGORY_ORDER.indexOf(a[0])) -
      (CATEGORY_ORDER.indexOf(b[0]) < 0 ? 99 : CATEGORY_ORDER.indexOf(b[0])),
  );

  const allergens = Array.from(new Set(t.items.flatMap((i) => i.allergens))).filter(Boolean);

  return (
    <div className={`tk ${toneClass}`} style={t.simulated ? { borderStyle: "dashed" } : undefined}>
      {t.simulated && (
        <div className="tk-coursehint" style={{ color: "var(--platinum)", paddingTop: 8 }}>
          <IcoFlask /> SIMULATION — not a real order
        </div>
      )}
      <div className="tk-h">
        <span className="tk-id">#{t.shortId}</span>
        <span className="tk-type">{fulfillmentLabel(t.fulfillmentType)}</span>
        {tone === "risk" && t.status !== "ready" && <span className="tk-course">At risk</span>}
        <span className="tk-timer">{timerText}</span>
      </div>

      {t.coursing && t.coursing.held.length > 0 && (
        <div className="tk-coursehint">
          <IcoTriangleStack />
          Coursed · {t.coursing.held.map((c) => POS_COURSE_LABELS[c]).join(", ")} held
        </div>
      )}

      <div className="tk-items">
        {sortedGroups.map(([cat, items]) => (
          <Fragment key={cat}>
            <div className="tk-grp">{items[0].categoryLabel}</div>
            {items.map((i, idx) => (
              <div className="tk-it" key={`${i.name}-${idx}`}>
                <span className="tk-q">{i.quantity}×</span>
                <div>
                  <div className="tk-nm">{i.name}</div>
                  {i.modifiers.map((m, mi) => (
                    <div className="tk-mod" key={mi}>
                      {m.label}
                    </div>
                  ))}
                  {i.notes && <div className="tk-mod">{i.notes}</div>}
                </div>
              </div>
            ))}
          </Fragment>
        ))}
      </div>

      {allergens.length > 0 && (
        <div className="tk-alrg">
          <IcoAlert /> Allergens: {allergens.join(" · ")}
        </div>
      )}

      {t.specialInstructions && (
        <div className="tk-notes">
          <b>Note:</b> {t.specialInstructions}
        </div>
      )}

      <div className="tk-f">
        <div className="tk-eta">
          <span className="lbl">{etaLbl}</span>
          <div className="sla">
            <i style={{ width: `${slaPct}%` }} />
          </div>
        </div>
        <button
          type="button"
          className="bump"
          disabled={advancing}
          onClick={(e) => {
            e.stopPropagation();
            onAdvance(t);
          }}
        >
          {NEXT_LABEL[t.status] ?? "Advance"}
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────── Chef queue + card (kds-chef.html) ────────────────────────── */

function ChefQueue({
  columns,
  lane,
  nowMs,
  updatingId,
  onAdvance,
}: {
  columns: Map<OrderStatus, KdsTicket[]>;
  lane: OrderStatus | "all";
  nowMs: number;
  updatingId: string | null;
  onAdvance: (t: KdsTicket) => void;
}) {
  const tickets =
    lane === "all" ? KDS_COLUMNS.flatMap((c) => columns.get(c.id) ?? []) : columns.get(lane) ?? [];
  const sorted = [...tickets].sort((a, b) => a.paidAtMs - b.paidAtMs);

  if (sorted.length === 0) return <div className="kds-empty queue">No tickets on this station.</div>;
  return (
    <div className="queue">
      {sorted.map((t) => (
        <Ct key={t.id} t={t} now={nowMs} updatingId={updatingId} onAdvance={onAdvance} />
      ))}
    </div>
  );
}

/** Chef-line ticket — the kds-chef.html `.ct` card. */
function Ct({
  t,
  now,
  updatingId,
  onAdvance,
}: {
  t: KdsTicket;
  now: number;
  updatingId: string | null;
  onAdvance: (t: KdsTicket) => void;
}) {
  const tone = toneForTicket(t, now);
  const advancing = updatingId === t.id;
  const elapsed = Math.max(0, (now - t.paidAtMs) / 1000);
  const toneClass =
    t.status === "ready" ? "ready" : tone === "late" ? "late" : tone === "risk" ? "risk" : tone === "warn" ? "warn" : "";
  const timerText = t.status === "ready" ? "plated" : mmss(elapsed);
  const allergens = Array.from(new Set(t.items.flatMap((i) => i.allergens))).filter(Boolean);

  return (
    <div className={`ct ${toneClass}`} style={t.simulated ? { borderStyle: "dashed" } : undefined}>
      {t.simulated && (
        <div className="ct-sim">
          <IcoFlask /> SIMULATION — not a real order
        </div>
      )}
      <div className="ct-h">
        <span className="ct-id">#{t.shortId}</span>
        <span className="ct-type">{fulfillmentLabel(t.fulfillmentType)}</span>
        {tone === "risk" && t.status !== "ready" && <span className="ct-course">At risk</span>}
        <span
          className="ct-timer"
          style={
            t.status === "ready"
              ? { color: "var(--ready)", fontSize: 14, fontFamily: "var(--ui)", fontWeight: 600, letterSpacing: ".02em", textTransform: "uppercase" }
              : undefined
          }
        >
          {timerText}
        </span>
      </div>

      {t.coursing && t.coursing.held.length > 0 && (
        <div className="ct-coursehint">
          <IcoTriangleStack />
          Coursed · {t.coursing.held.map((c) => POS_COURSE_LABELS[c]).join(", ")} held
        </div>
      )}

      {t.items.map((i, idx) => (
        <div className="ct-it" key={`${i.name}-${idx}`}>
          <span className="ct-q">{i.quantity}×</span>
          <div>
            <div className="ct-nm">{i.name}</div>
            {i.modifiers.map((m, mi) => (
              <div className="ct-mod" key={mi}>
                {m.label}
              </div>
            ))}
            {i.notes && <div className="ct-mod">{i.notes}</div>}
          </div>
        </div>
      ))}

      {allergens.length > 0 && (
        <div className="ct-alrg">
          <IcoAlert /> Allergens: {allergens.join(" · ")}
        </div>
      )}

      {t.specialInstructions && (
        <div className="ct-notes">
          <b>Note:</b> {t.specialInstructions}
        </div>
      )}

      <div className="ct-f">
        <button
          type="button"
          className="bump"
          disabled={advancing}
          onClick={(e) => {
            e.stopPropagation();
            onAdvance(t);
          }}
        >
          {NEXT_LABEL[t.status] ?? "Advance"}
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────── Manager ops header (kds.html .ops) ────────────────────────── */

interface FloorOps {
  locationSlug: string;
  menuSlug: string;
  throughputLastHour: number;
  onShift: number;
  menu: { id: string; name: string; category: string; available: boolean }[];
}

function FloorOpsHeader({ orders, location }: { orders: Order[]; location: string }) {
  const toast = useToast();
  const [ops, setOps] = useState<FloorOps | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pick, setPick] = useState("");

  const load = useCallback(async () => {
    const qs = location ? `?location=${encodeURIComponent(location)}` : "";
    try {
      const res = await fetch(`/api/admin/kds/floor-ops${qs}`);
      if (res.ok) setOps((await res.json()) as FloorOps);
    } catch {
      /* non-fatal */
    }
  }, [location]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const setAvailability = useCallback(
    async (id: string, available: boolean) => {
      setBusyId(id);
      try {
        const res = await fetch("/api/admin/menu", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, available }),
        });
        if (!res.ok) {
          toast.error("Could not update availability");
          return;
        }
        toast.success(available ? "Item restored" : "Item 86'd");
        await load();
      } finally {
        setBusyId(null);
        setPick("");
      }
    },
    [load, toast],
  );

  let late = 0;
  let soon = 0;
  let oldest = 0;
  let ageSum = 0;
  for (const o of orders) {
    const age = totalPrepSeconds(o);
    ageSum += age;
    if (age > oldest) oldest = age;
    if (o.status === "ready") continue;
    const rem = remainingSlaSeconds(o);
    if (rem !== null && rem < 0) late++;
    else if (rem !== null && rem < 180) soon++;
  }
  const avg = orders.length > 0 ? Math.round(ageSum / orders.length) : 0;

  const eightySixed = (ops?.menu ?? []).filter((m) => !m.available);
  const availableItems = (ops?.menu ?? []).filter((m) => m.available);

  return (
    <div className="ops">
      <div className="ops-stats">
        <div className="ostat">
          <div className="l">Open</div>
          <div className="v">{orders.length}</div>
        </div>
        <div className={`ostat${late > 0 ? " alert" : ""}`}>
          <div className="l">Late</div>
          <div className="v">{late}</div>
        </div>
        <div className={`ostat${soon > 0 ? " warn" : ""}`}>
          <div className="l">Due &lt;3m</div>
          <div className="v">{soon}</div>
        </div>
        <div className="ostat">
          <div className="l">Oldest</div>
          <div className="v">{orders.length > 0 ? fmtClock(oldest) : "—"}</div>
        </div>
        <div className="ostat">
          <div className="l">Avg age</div>
          <div className="v">{orders.length > 0 ? fmtClock(avg) : "—"}</div>
        </div>
        <div className="ostat good">
          <div className="l">Done/hr</div>
          <div className="v">{ops ? ops.throughputLastHour : "…"}</div>
        </div>
        <div className="ostat">
          <div className="l">On shift</div>
          <div className="v">{ops ? ops.onShift : "…"}</div>
        </div>
      </div>
      <div className="eighty-six">
        <span className="lbl">86&apos;d</span>
        {eightySixed.length === 0 ? (
          <span style={{ color: "var(--faint)", fontSize: 12 }}>Nothing — full menu</span>
        ) : (
          eightySixed.map((m) => (
            <button
              key={m.id}
              type="button"
              className="restore"
              disabled={busyId === m.id}
              onClick={() => setAvailability(m.id, true)}
              title={`Restore ${m.name}`}
            >
              <span className="dot" />
              {m.name}
              <span className="x">restore</span>
            </button>
          ))
        )}
        <select
          className="btn86"
          aria-label="86 an item"
          value={pick}
          onChange={(e) => {
            if (e.target.value) void setAvailability(e.target.value, false);
          }}
        >
          <option value="">86 an item…</option>
          {availableItems.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ────────────────────────── Chef strip (kds-chef.html .chefstrip) ────────────────────────── */

function ChefStrip({
  orders,
  station,
  onStation,
  location,
  nowMs,
}: {
  orders: Order[];
  station: MenuCategory | "all";
  onStation: (s: MenuCategory | "all") => void;
  location: string;
  nowMs: number;
}) {
  const toast = useToast();
  const [eightySixed, setEightySixed] = useState<{ id: string; name: string }[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pick, setPick] = useState("");

  const load = useCallback(async () => {
    const qs = location ? `?location=${encodeURIComponent(location)}` : "";
    try {
      const res = await fetch(`/api/admin/kds/eighty-six${qs}`);
      if (res.ok) setEightySixed((await res.json()).eightySixed ?? []);
    } catch {
      /* non-fatal */
    }
  }, [location]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const toggle = useCallback(
    async (id: string, available: boolean) => {
      setBusyId(id);
      try {
        const qs = location ? `?location=${encodeURIComponent(location)}` : "";
        const res = await fetch(`/api/admin/kds/eighty-six${qs}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, available }),
        });
        if (!res.ok) {
          toast.error("Could not update availability");
          return;
        }
        toast.success(available ? "Item restored" : "Item 86'd");
        await load();
      } finally {
        setBusyId(null);
        setPick("");
      }
    },
    [load, location, toast],
  );

  void nowMs;
  const focused = orders.filter((o) => station === "all" || ticketCategories(o).includes(station as MenuCategory));
  let oldest = 0;
  for (const o of focused) {
    const age = totalPrepSeconds(o);
    if (age > oldest) oldest = age;
  }

  const stationCounts = new Map<MenuCategory | "all", number>();
  for (const o of orders) {
    for (const cat of ticketCategories(o)) {
      stationCounts.set(cat, (stationCounts.get(cat) ?? 0) + 1);
    }
  }
  const stationChips = STATION_FILTERS.filter(
    (s) => s.id === "all" || (stationCounts.get(s.id) ?? 0) > 0 || s.id === station,
  );

  const eightySixedIds = new Set(eightySixed.map((e) => e.id));
  const candidates = new Map<string, string>();
  for (const o of orders) {
    for (const ci of o.items) {
      if (station !== "all" && ci.menuItem.category !== station) continue;
      if (!eightySixedIds.has(ci.menuItem.id)) candidates.set(ci.menuItem.id, ci.menuItem.name);
    }
  }

  return (
    <div className="chefstrip">
      <div className="stations">
        {stationChips.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`station${station === s.id ? " on" : ""}`}
            onClick={() => onStation(s.id)}
          >
            {s.id === "all" ? <IcoChefHat /> : null}
            {s.id === "all" ? "All" : MENU_CATEGORY_LABELS[s.id as MenuCategory] ?? s.label}
            <span className="n">{s.id === "all" ? orders.length : stationCounts.get(s.id) ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="qdepth">
        <div className="qd">
          <div className="l">In queue</div>
          <div className="v">{focused.length}</div>
        </div>
        <div className={`qd${oldest >= 480 ? " warn" : ""}`}>
          <div className="l">Oldest</div>
          <div className="v">{focused.length > 0 ? fmtClock(oldest) : "—"}</div>
        </div>
      </div>
      <div className="chef-86">
        {eightySixed.length === 0 ? (
          <span style={{ color: "var(--faint)", fontSize: 12 }}>Nothing 86&apos;d</span>
        ) : (
          eightySixed.map((m) => (
            <button
              key={m.id}
              type="button"
              className="restore"
              disabled={busyId === m.id}
              onClick={() => toggle(m.id, true)}
              title={`Restore ${m.name}`}
            >
              <span className="dot" />
              {m.name}
              <span className="x">restore</span>
            </button>
          ))
        )}
        <select
          className="btn86"
          aria-label="86 an item you've run out of"
          value={pick}
          onChange={(e) => {
            if (e.target.value) void toggle(e.target.value, false);
          }}
        >
          <option value="">86 an item…</option>
          {[...candidates.entries()].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ============================================================
   FLEET  (kds-fleet.html)
   ============================================================ */

interface WireStation {
  id: MenuCategory;
  label: string;
  currentLoad: number;
  forecast: number;
  demand: number;
  capacity: number;
  pct: number;
  tier: PaceTier;
}
type WireTicket = KdsTicket;
interface WireTile {
  slug: string;
  name: string;
  counts: { active: number; ready: number; late: number; risk: number; newCount: number; preparing: number };
  health: number;
  healthState: string;
  healthClass: "good" | "warn" | "risk" | "alert";
  onShift: number;
  throughputHr: number;
  coversHr: number;
  revenueHr: number;
  completedToday: number;
  revenueToday: number;
  promiseAccuracy: number;
  throughputSeries: number[];
  stations: WireStation[];
  bottleneck: { id: MenuCategory; label: string; pct: number; tier: PaceTier } | null;
  tickets: WireTicket[];
}
interface FleetPayload {
  generatedAt: string;
  paceWindowMin: number;
  promiseTarget: number;
  totals: { active: number; late: number; risk: number; ready: number; throughputHr: number; coversHr: number; revenueHr: number };
  benchmark: { fleetAccuracy: number; leader: string | null; lagger: string | null; gap: number };
  tiles: WireTile[];
}

const POLL_MS = 6000;
const TONE_ORDER: Record<TicketTone, number> = { late: 0, risk: 1, warn: 2, firing: 3, queued: 4, ready: 5 };

function zl(grosze: number): string {
  const z = grosze / 100;
  if (Math.abs(z) >= 1000) {
    const k = z / 1000;
    return `${k.toFixed(k >= 10 ? 0 : 1).replace(".", ",")}k zł`;
  }
  return formatPricePLN(grosze);
}
function mmssF(seconds: number): string {
  const a = Math.abs(Math.round(seconds));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}
function paceClass(tier?: PaceTier | null): string {
  return tier === "risk" ? "riskp" : tier === "warn" ? "warnp" : "calm";
}

/** Health ring — the kds-fleet.html SVG ring (port of KdsTicketCard's Ring). */
function Ring({ size, frac, color, strokeW }: { size: number; frac: number; color: string; strokeW: number }) {
  const r = (size - strokeW) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(Math.max(frac, 0), 1);
  const off = c * (1 - f);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeW} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
      />
    </svg>
  );
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (!points || points.length < 2) return <span className="sparkbox" aria-hidden />;
  const w = 64;
  const h = 26;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const pts = points.map((p, i) => `${(i * step).toFixed(1)} ${(h - 2 - ((p - min) / span) * (h - 6)).toFixed(1)}`);
  const line = `M${pts.join(" L ")}`;
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg className="sparkbox" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path d={area} fill={color} fillOpacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function KdsV2Fleet({ onDrillIn }: { onDrillIn?: (slug: string, lens?: "floor" | "chef") => void }) {
  const toast = useToast();
  const { enabled: simEnabled } = useKdsSimulator(null);
  const [data, setData] = useState<FleetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [now, setNow] = useState(() => Date.now());
  const { active: fullscreen, enter: enterFs, exit: exitFs } = useFullscreen();
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/admin/kds/fleet?includeSimulated=1");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData((await res.json()) as FleetPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const advance = useCallback(
    async (t: WireTicket) => {
      const next = nextStatus(t.status);
      if (!next) return;
      setAdvancingId(t.id);
      try {
        const res = await fetch("/api/admin/orders", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: t.id, status: next }),
        });
        if (!res.ok) {
          toast.error("Could not advance", "Try refreshing the fleet.");
          return;
        }
        setData((d) => {
          if (!d) return d;
          return {
            ...d,
            tiles: d.tiles.map((tile) => ({
              ...tile,
              tickets:
                next === "completed"
                  ? tile.tickets.filter((x) => x.id !== t.id)
                  : tile.tickets.map((x) => (x.id === t.id ? { ...x, status: next } : x)),
            })),
          };
        });
        void load();
      } finally {
        setAdvancingId(null);
      }
    },
    [load, toast],
  );
  void advance;

  const toneOf = useCallback(
    (t: WireTicket): TicketTone =>
      ticketTone({
        status: t.status,
        promisedReadyAtMs: t.promisedReadyAtMs,
        predictedReadyAtMs: t.predictedReadyAtMs,
        nowMs: now,
      }),
    [now],
  );

  const clock = useMemo(() => (mounted ? fmtWallClock(now) : "--:--:--"), [now, mounted]);

  const viewswitch = (
    <div className="viewswitch">
      <span className="on">Fleet</span>
      <a
        onClick={() => data?.tiles[0] && onDrillIn?.(data.tiles[0].slug, "floor")}
        role="button"
        tabIndex={0}
      >
        <span>Floor</span>
      </a>
      <a
        onClick={() => data?.tiles[0] && onDrillIn?.(data.tiles[0].slug, "chef")}
        role="button"
        tabIndex={0}
      >
        <span>Chef</span>
      </a>
    </div>
  );

  const board = (
    <>
      {data && <FleetBar data={data} toneOf={toneOf} />}
      {loading && !data ? null : error && !data ? (
        <div className="fleet-empty">Couldn’t load fleet — {error}</div>
      ) : data && data.tiles.length === 0 ? (
        <div className="fleet-empty">No active trucks. Activate a location to see it here.</div>
      ) : (
        <div className="trucks">
          {data?.tiles.map((tile) => (
            <TruckBoard
              key={tile.slug}
              tile={tile}
              now={now}
              paceWindowMin={data.paceWindowMin}
              toneOf={toneOf}
              advancingId={advancingId}
              onDrillIn={onDrillIn}
            />
          ))}
        </div>
      )}
    </>
  );

  const wall = (
    <div className="corev2 kds fleet" data-cv2-portal>
      <div className="wrap">
        <div className="top">
          <div className="id">
            <div className="brand-mark">SI</div>
            <div>
              <div className="nm">Fleet Command</div>
              <div className="loc">Atlas · all trucks</div>
            </div>
          </div>
          {viewswitch}
          {simEnabled && (
            <span className="badge platinum">
              <span className="d" />
              Sandbox
            </span>
          )}
          <div className="clock">{clock}</div>
          <button type="button" className="ctrl" onClick={() => void load()} title="Refresh now">
            <IcoRefresh />
          </button>
          {fullscreen ? (
            <button type="button" className="ctrl on" onClick={exitFs} title="Exit fullscreen (Esc)">
              <IcoMinimize />
            </button>
          ) : (
            <button type="button" className="ctrl" onClick={enterFs} title="Fullscreen fleet wall">
              <IcoFullscreen />
            </button>
          )}
        </div>
        {board}
      </div>
    </div>
  );

  return (
    <>
      {fullscreen ? createPortal(wall, document.body) : wall}
      {loading &&
        !data &&
        mounted &&
        createPortal(
          <div className="corev2 cv2-toast" data-cv2-portal>
            Loading Kitchen Display…
          </div>,
          document.body,
        )}
    </>
  );
}

function FleetBar({ data, toneOf }: { data: FleetPayload; toneOf: (t: WireTicket) => TicketTone }) {
  let active = 0;
  let late = 0;
  let risk = 0;
  let ready = 0;
  for (const tile of data.tiles) {
    for (const t of tile.tickets) {
      const tone = toneOf(t);
      if (tone === "ready") {
        ready++;
        continue;
      }
      active++;
      if (tone === "late") late++;
      else if (tone === "risk") risk++;
    }
  }
  const { totals, benchmark, promiseTarget } = data;

  return (
    <>
      <div className="cmdbar">
        <div className="cstat">
          <div className="l">Active</div>
          <div className="v">{active}</div>
          <div className="s">{ready} ready for expo</div>
        </div>
        <div className="cstat risk">
          <div className="l">At risk</div>
          <div className="v">{risk}</div>
          <div className="s">predicted miss</div>
        </div>
        <div className="cstat late">
          <div className="l">Late</div>
          <div className="v">{late}</div>
          <div className="s">over SLA</div>
        </div>
        <div className="cstat ready">
          <div className="l">Ready</div>
          <div className="v">{ready}</div>
          <div className="s">for expo</div>
        </div>
        <div className="cstat">
          <div className="l">Throughput</div>
          <div className="v">
            {totals.throughputHr}
            <span className="u">/hr</span>
          </div>
          <div className="s">last 60 min</div>
        </div>
        <div className="cstat">
          <div className="l">Covers</div>
          <div className="v">
            {totals.coversHr}
            <span className="u">/hr</span>
          </div>
        </div>
        <div className="cstat">
          <div className="l">Revenue</div>
          <div className="v">
            {zl(totals.revenueHr)}
            <span className="u">/hr</span>
          </div>
        </div>
      </div>

      <div className="bench">
        <div className="h">
          <span className="ttl">Promise-accuracy · cross-truck benchmark</span>
          <span className="sub">
            fleet <b>{benchmark.fleetAccuracy}%</b> · target {promiseTarget}%
          </span>
        </div>
        {data.tiles.map((t) => {
          const isLeader = t.name === benchmark.leader && data.tiles.length > 1 && benchmark.gap > 0;
          const color =
            t.promiseAccuracy >= promiseTarget
              ? "var(--ready)"
              : t.promiseAccuracy >= promiseTarget - 5
                ? "var(--warn)"
                : "var(--late)";
          return (
            <div className="brow" key={t.slug}>
              <span className="city">
                {t.name}
                {isLeader && <span className="lead">Lead</span>}
              </span>
              <span className="btrack">
                <i style={{ width: `${t.promiseAccuracy}%`, background: color }} />
                <span className="mark" style={{ left: `${promiseTarget}%` }} title={`target ${promiseTarget}%`} />
              </span>
              <span className="pct">{t.promiseAccuracy}%</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function TruckBoard({
  tile,
  now,
  paceWindowMin,
  toneOf,
  advancingId,
  onDrillIn,
}: {
  tile: WireTile;
  now: number;
  paceWindowMin: number;
  toneOf: (t: WireTicket) => TicketTone;
  advancingId: string | null;
  onDrillIn?: (slug: string, lens?: "floor" | "chef") => void;
}) {
  void advancingId;
  let late = 0;
  let risk = 0;
  let ready = 0;
  let activeCount = 0;
  for (const t of tile.tickets) {
    const tone = toneOf(t);
    if (tone === "ready") {
      ready++;
      continue;
    }
    activeCount++;
    if (tone === "late") late++;
    else if (tone === "risk") risk++;
  }
  const liveHealth = computeHealth({ late, risk, promiseAcc: tile.promiseAccuracy });
  const healthColor =
    liveHealth.cls === "alert"
      ? "var(--late)"
      : liveHealth.cls === "risk"
        ? "var(--risk)"
        : liveHealth.cls === "warn"
          ? "var(--warn)"
          : "var(--ready)";

  const visible = [...tile.tickets].sort((a, b) => {
    const d = TONE_ORDER[toneOf(a)] - TONE_ORDER[toneOf(b)];
    if (d !== 0) return d;
    return (a.promisedReadyAtMs ?? Infinity) - (b.promisedReadyAtMs ?? Infinity);
  });

  const maxUtil = Math.max(1.5, ...tile.stations.map((s) => (Number.isFinite(s.pct) ? s.pct / 100 : 1.5)));
  const markLeft = (1 / maxUtil) * 100;
  const bottleneck = tile.bottleneck;

  return (
    <div className="truck">
      <div className="thead">
        <button
          type="button"
          className="thead-open"
          onClick={onDrillIn ? () => onDrillIn(tile.slug, "floor") : undefined}
          title={onDrillIn ? `Open ${tile.name}'s floor board` : undefined}
        >
          <div className="ring">
            <Ring size={54} frac={liveHealth.health / 100} color={healthColor} strokeW={4} />
            <span className="sc">
              <b style={{ color: healthColor }}>{liveHealth.health}</b>
            </span>
          </div>
          <div>
            <div className="city">{tile.name}</div>
            <div className="open">
              Open · {activeCount} active ·{" "}
              <span className="health-state" style={{ color: healthColor }}>
                {liveHealth.state}
              </span>
            </div>
          </div>
          {onDrillIn && <span className="drill">Open floor →</span>}
        </button>
        {onDrillIn && (
          <button
            type="button"
            className="drill-chef"
            onClick={() => onDrillIn(tile.slug, "chef")}
            title={`Open ${tile.name}'s chef line`}
          >
            <IcoChefHat />
            Chef line →
          </button>
        )}
      </div>

      <div className="trow2">
        <div className="tcell">
          <div className="l">Active</div>
          <div className="v">{activeCount}</div>
        </div>
        <div className={`tcell${risk ? " risk" : ""}`}>
          <div className="l">At risk</div>
          <div className="v">{risk}</div>
        </div>
        <div className={`tcell${late ? " late" : ""}`}>
          <div className="l">Late</div>
          <div className="v">{late}</div>
        </div>
        <div className={`tcell${ready ? " ready" : ""}`}>
          <div className="l">Ready</div>
          <div className="v">{ready}</div>
        </div>
        <div className="tcell">
          <div className="l">On shift</div>
          <div className="v">{tile.onShift}</div>
        </div>
      </div>

      <div className="pacehead">
        <div className="met">
          <div className="l">Covers / hr</div>
          <div className="v">{tile.coversHr}</div>
        </div>
        <div className="met">
          <div className="l">Revenue / hr</div>
          <div className="v">{zl(tile.revenueHr)}</div>
        </div>
        <Sparkline points={tile.throughputSeries} color={healthColor} />
        <div className="capmeter">
          <div className="lbl">
            <span>Capacity · {bottleneck ? bottleneck.label : "within capacity"}</span>
            <span className="hint">{bottleneck ? `${bottleneck.pct}%` : ""}</span>
          </div>
          <div className={`cmtrack ${paceClass(bottleneck?.tier)}`}>
            <i style={{ width: `${bottleneck ? Math.min(100, (bottleneck.pct / 100 / maxUtil) * 100) : 0}%` }} />
            <span className="m100" style={{ left: `${markLeft}%` }} title="100% capacity" />
          </div>
        </div>
      </div>

      <div className="gauges">
        <div className="gh">Pace · next {paceWindowMin}m</div>
        {tile.stations.map((s) => {
          const util = Number.isFinite(s.pct) ? s.pct / 100 : maxUtil;
          return (
            <div className="grow" key={s.id}>
              <span className="gn">{s.label}</span>
              <span className={`gtrack ${paceClass(s.tier)}`}>
                <i style={{ width: `${Math.min(100, (util / maxUtil) * 100)}%` }} />
                <span className="m100" style={{ left: `${markLeft}%` }} />
              </span>
              <span className="gf">
                {s.demand}/{s.capacity} · +{s.forecast}
              </span>
            </div>
          );
        })}
      </div>

      <div className="stack">
        {visible.length === 0 ? (
          <div className="fleet-empty" style={{ padding: 20 }}>
            No tickets in this view.
          </div>
        ) : (
          visible.map((t) => {
            const tone = toneOf(t);
            const mt = t.status === "ready" ? "ready" : tone === "late" ? "late" : tone === "risk" ? "risk" : tone === "warn" ? "warn" : "firing";
            const elapsed = Math.max(0, (now - t.paidAtMs) / 1000);
            return (
              <div className={`mt ${mt}`} key={t.id}>
                <span className="mid">#{t.shortId}</span>
                <span className="mty">{fulfillmentLabel(t.fulfillmentType)}</span>
                {tone === "risk" && t.status !== "ready" ? (
                  <span className="riskpill">at risk</span>
                ) : (
                  <span className="mnm">{t.items[0]?.name ?? t.customerName}</span>
                )}
                <span className="mtimer" style={t.status === "ready" ? { color: "var(--ready)" } : undefined}>
                  {t.status === "ready" ? "done" : mmssF(elapsed)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
