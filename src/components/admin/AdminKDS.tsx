"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import {
  Bell,
  BellOff,
  ChefHat,
  ChevronLeft,
  Flame,
  MapPin,
  Maximize2,
  Minimize2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Timer,
} from "lucide-react";
import type { Order, MenuCategory, OrderStatus } from "@/data/types";
import dynamic from "next/dynamic";
import { useAdminLocation } from "./v2/LocationContext";
import { useIsMobile } from "./v2/mobile";
import { useToast } from "./v2/ui/Toast";
import { Badge, Button, Card, CardBody, Select } from "./v2/ui";
import { AdminKdsFleet } from "./AdminKdsFleet";
import {
  ACTIVE_STATUSES,
  KDS_COLUMNS,
  KdsBoard,
  KdsLane,
  STATION_FILTERS,
  fmtClock,
  fmtWallClock,
  groupTicketsByColumn,
  nextStatus,
  remainingSlaSeconds,
  ticketCategories,
  totalPrepSeconds,
} from "./kds-board";
import { KdsStatGrid, type KdsStat } from "./kds/KdsStatGrid";
import { analyzeTruck } from "@/lib/kds-prediction";
import { buildKdsTicket, type KdsTicket } from "@/lib/kds-ticket";
import { useKdsSimulator } from "@/lib/useKdsSimulator";
import type { AdminRole } from "@/lib/admin-roles";

const MobileKDS = dynamic(
  () => import("./mobile/MobileKDS").then((m) => m.MobileKDS),
  { ssr: false },
);

/**
 * Role-aware KDS shell. One live-order engine, three lenses:
 *   • owner   → Fleet command (cross-truck health) by default. Drilling into
 *               a truck swaps the same window to that truck's floor board, with
 *               a single "Back to fleet" control to step back out.
 *   • manager → Floor board (single location).
 *   • kitchen/staff → Floor board (the line view they've always had).
 * Mobile keeps the dedicated MobileKDS regardless of role.
 */
export function AdminKDS() {
  const { isMobile, ready } = useIsMobile();
  const { setLocation } = useAdminLocation();
  const [role, setRole] = useState<AdminRole | null>(null);
  // Owners always land on the fleet; the only way to a single-location floor
  // board is drilling into a truck, which flips this to "floor" for that truck.
  const [mode, setMode] = useState<"fleet" | "floor">("fleet");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const r = j?.role as AdminRole | undefined;
        if (!r) return;
        setRole(r);
      })
      .catch(() => {
        /* non-fatal — falls back to the floor board */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Managers + franchisees get the floor-control ops header; kitchen/staff
  // get the chef line strip (station focus + queue depth + quick 86); the
  // pre-resolve null state gets the plain board.
  const managerControls = role === "manager" || role === "franchisee";
  const chef = role === "kitchen" || role === "staff";

  // Only owners get the Atlas fleet lens. Everyone else (incl. the pre-resolve
  // null state) gets the floor board directly: the dedicated mobile KDS on a
  // phone, the desktop floor board otherwise.
  if (role !== "owner") {
    if (ready && isMobile) {
      return <MobileKDS />;
    }
    return <AdminKDSDesktop opsHeader={managerControls} chefStrip={chef} />;
  }

  // Owner — Atlas fleet command is the default. Drilling into a truck swaps
  // this same window down to that truck's floor board (a "Back to fleet"
  // control steps back out). The Atlas board reflows to its responsive layout
  // on a phone; its floor view is the dedicated mobile KDS there and the
  // desktop floor board otherwise.
  const floorView = ready && isMobile ? <MobileKDS /> : <AdminKDSDesktop opsHeader />;

  return (
    <div>
      {mode === "floor" && (
        <div style={{ display: "flex", gap: 8, padding: "16px 20px 0" }}>
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<ChevronLeft className="h-3.5 w-3.5" />}
            onClick={() => setMode("fleet")}
          >
            Back to fleet
          </Button>
        </div>
      )}
      {mode === "fleet" ? (
        <AdminKdsFleet
          onDrillIn={(slug) => {
            setLocation(slug);
            setMode("floor");
          }}
        />
      ) : (
        floorView
      )}
    </div>
  );
}

const KDS_STATION_KEY = "sud-kds-station";

function AdminKDSDesktop({ opsHeader = false, chefStrip = false }: { opsHeader?: boolean; chefStrip?: boolean }) {
  const { location } = useAdminLocation();
  const toast = useToast();

  // When the owner-only toggle is on, the board shows manual Add 1 / Add 5 /
  // Purge all controls (in the simulation banner) for staging a training rush.
  const { enabled: simEnabled, busy: simBusy, addOrders, purgeAll } = useKdsSimulator(location);

  const [station, setStation] = useState<MenuCategory | "all">("all");

  // Remember the cook's station across reloads — a line cook works one
  // station all shift and shouldn't re-pick it every refresh.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KDS_STATION_KEY);
      if (saved && STATION_FILTERS.some((s) => s.id === saved)) {
        setStation(saved as MenuCategory | "all");
      }
    } catch {
      /* storage may be blocked */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KDS_STATION_KEY, station);
    } catch {
      /* non-fatal */
    }
  }, [station]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Stage focus: "all" shows the three-column board; a single status focuses
  // that lane into a dense full-width grid (the "switch between came-in / in
  // prep / done" the floor asked for).
  const [lane, setLane] = useState<OrderStatus | "all">("all");

  // Fullscreen kitchen-display (kiosk) mode. Flips the board into an
  // edge-to-edge, dedicated dark high-contrast surface and requests native
  // browser fullscreen so a wall-mounted screen reads cleanly across the line.
  const [kiosk, setKiosk] = useState(false);

  const enterKiosk = useCallback(() => {
    setKiosk(true);
    // Best-effort native fullscreen — the immersive layout stands on its own
    // if the browser denies it (sandboxed iframe, kiosk policy, etc.).
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  const exitKiosk = useCallback(() => {
    setKiosk(false);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  }, []);

  // Keep React state in lock-step with the browser: pressing Esc (or the
  // browser's own control) leaving native fullscreen drops us out of kiosk.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setKiosk(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Lock body scroll while the kiosk overlay covers the viewport, and let Esc
  // exit even when native fullscreen was denied (no fullscreenchange to catch).
  useEffect(() => {
    if (!kiosk) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitKiosk();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [kiosk, exitKiosk]);

  // Live order stream — SSE with REST fallback. Replaces the old 5 s polling
  // loop. We mirror the stream into a local copy so optimistic updates from
  // advance/recall feel instant; the next SSE frame reconciles either way.
  const { orders: streamedOrders, refresh } = useAdminOrdersStream(location, { paused, includeSimulated: true });
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setOrders(streamedOrders.filter((o) => ACTIVE_STATUSES.includes(o.status)));
    setLoading(false);
  }, [streamedOrders]);
  // Cooks bump tickets by mistake constantly. We keep the last 5 bumps in
  // memory so a "Recall" tray on the right side can put one back on the
  // expo column in a single click — within the 60 s window where this is
  // most useful. Older bumps quietly fall out of the list.
  const [bumpHistory, setBumpHistory] = useState<
    { orderId: string; label: string; bumpedAt: number }[]
  >([]);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const overdueFiredRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const overdueAudioRef = useRef<HTMLAudioElement | null>(null);

  // Tick every second for live timers
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Audio chime on new ticket
  useEffect(() => {
    const known = knownIdsRef.current;
    const currentIds = new Set(orders.map((o) => o.id));
    if (known.size === 0) {
      knownIdsRef.current = currentIds;
      return;
    }
    let newOnes = 0;
    for (const id of currentIds) if (!known.has(id)) newOnes++;
    if (newOnes > 0 && soundOn) {
      audioRef.current?.play().catch(() => {});
    }
    knownIdsRef.current = currentIds;
  }, [orders, soundOn]);

  // Audio chime on SLA breach — once per ticket. The first time a
  // ticket crosses 0 seconds remaining we play a more urgent chime,
  // then remember the id so we don't loop. The set is cleared if the
  // ticket leaves the active list (bumped/recalled both work).
  useEffect(() => {
    const fired = overdueFiredRef.current;
    const stillActive = new Set(orders.map((o) => o.id));
    for (const id of Array.from(fired)) {
      if (!stillActive.has(id)) fired.delete(id);
    }
    if (!soundOn) return;
    for (const o of orders) {
      if (o.status === "ready") continue;
      const remaining = remainingSlaSeconds(o);
      if (remaining === null || remaining >= 0) continue;
      if (fired.has(o.id)) continue;
      fired.add(o.id);
      overdueAudioRef.current?.play().catch(() => {});
    }
    // `now` keeps this effect ticking each second so the cross-zero
    // moment fires the chime even if the underlying orders array
    // hasn't changed.
  }, [orders, soundOn, now]);

  // Build the shared KDS tickets from the live orders + the predictive engine
  // (the same analyzeTruck the Atlas fleet board runs), then group into lanes.
  // The cards and their tones are now identical to Fleet.
  const visibleByStatus = useMemo(() => {
    const analysis = analyzeTruck(orders, now);
    const tickets = orders.map((o) => buildKdsTicket(o, analysis.predictions.get(o.id), now));
    return groupTicketsByColumn(tickets, station);
  }, [orders, station, now]);

  // Per-lane ticket counts (after the station filter) for the stage switcher.
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

  // Wall-clock shown in the kiosk header — a glanceable institutional touch.
  // Keyed off `now` so it ticks with the live timers already running.
  const clock = useMemo(() => fmtWallClock(now), [now]);

  // Bump-bar hotkeys (audit §3 — "button-click only" was costing ~3s
  // per bump at rush). Number keys 1-9 advance the corresponding
  // ticket in the leftmost column with tickets (the "next action"
  // column). 0 advances the 10th. Plain digit only — no modifier —
  // matching how commercial bump-bars wire to a USB number pad.
  // Ignored while an input/textarea is focused so admins can still
  // type into search boxes etc.
  const ticketColumnFlat = useMemo(() => {
    // When a single stage is focused, the number keys act on that lane's
    // visible tickets; otherwise the leftmost non-empty column ("next action").
    if (lane !== "all") return visibleByStatus.get(lane) || [];
    for (const col of KDS_COLUMNS) {
      const arr = visibleByStatus.get(col.id) || [];
      if (arr.length > 0) return arr;
    }
    return [] as KdsTicket[];
  }, [visibleByStatus, lane]);
  const orderById = useMemo(() => {
    const m = new Map<string, Order>();
    for (const o of orders) m.set(o.id, o);
    return m;
  }, [orders]);

  // Keyboard handler — kept stable so the listener attaches once.
  // advanceRef points at the latest `advance` closure so the hotkey
  // always uses fresh state (orders, updatingId).
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
  void orderById;

  const advance = async (o: { id: string; status: OrderStatus; customerName?: string }) => {
    const next = nextStatus(o.status);
    if (!next) return;
    setUpdatingId(o.id);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: o.id, status: next }),
      });
      if (res.ok) {
        if (next === "completed") {
          toast.success("Order bumped", `${o.customerName || "Guest"} · ${o.id.slice(-6).toUpperCase()}`);
          setBumpHistory((arr) =>
            [
              {
                orderId: o.id,
                label: `${o.customerName || "Guest"} · ${o.id.slice(-6).toUpperCase()}`,
                bumpedAt: Date.now(),
              },
              ...arr.filter((e) => e.orderId !== o.id),
            ].slice(0, 5),
          );
          setOrders((arr) => arr.filter((x) => x.id !== o.id));
        } else {
          setOrders((arr) => arr.map((x) => (x.id === o.id ? { ...x, status: next } : x)));
        }
      } else {
        toast.error("Could not advance", "Try refreshing the queue.");
      }
    } finally {
      setUpdatingId(null);
    }
  };

  // Keep the hotkey ref pointing at the latest closure so it always
  // resolves to the current state when the cook taps a number key.
  useEffect(() => {
    advanceRef.current = advance;
  });

  const recall = async (orderId: string) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/recall`, {
        method: "POST",
      });
      if (res.ok) {
        const recalled: Order = await res.json();
        // Reinsert into the active list so it shows up on the expo column
        // again; the next polling tick would catch it anyway but this keeps
        // the UI feeling instant.
        setOrders((arr) => {
          const without = arr.filter((x) => x.id !== recalled.id);
          return ACTIVE_STATUSES.includes(recalled.status)
            ? [...without, recalled]
            : without;
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
      setUpdatingId(null);
    }
  };

  const page = (
    <div className={`kds-atlas kds-floor-dark${kiosk ? " is-fullscreen" : ""}`}>
      {/* Atlas chrome — same shell, chips and lane switcher the fleet board uses. */}
      <header className="ka-head">
        <div className="ka-brand">
          <span className="ka-wordmark">SUD ITALIA</span>
          <span className="ka-kd-label">{location ? `${location} · floor` : "Floor"}</span>
          {simEnabled && <span className="ka-sandbox">Sandbox</span>}
        </div>
        <div className="ka-filters" role="group" aria-label="Station filter">
          {STATION_FILTERS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="ka-chip"
              aria-pressed={s.id === station}
              onClick={() => setStation(s.id as MenuCategory | "all")}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="ka-lines" role="group" aria-label="Stage focus">
          <button type="button" className="ka-line" aria-pressed={lane === "all"} onClick={() => setLane("all")}>
            <span>All</span>
            <span className="ka-lcount tabular">{laneCounts.all}</span>
          </button>
          {KDS_COLUMNS.map((col) => (
            <button
              key={col.id}
              type="button"
              className="ka-line"
              data-line={col.id === "ready" ? "ready" : col.id === "preparing" ? "prep" : "new"}
              aria-pressed={lane === col.id}
              onClick={() => setLane(col.id)}
            >
              <span>{col.label}</span>
              <span className="ka-lcount tabular">{laneCounts[col.id]}</span>
            </button>
          ))}
        </div>
        <div className="ka-spacer" />
        <button
          type="button"
          className="ka-fsbtn"
          aria-pressed={kiosk}
          onClick={kiosk ? exitKiosk : enterKiosk}
          title={kiosk ? "Exit fullscreen kitchen display (Esc)" : "Open fullscreen kitchen display"}
        >
          {kiosk ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          <span>{kiosk ? "Exit" : "Fullscreen"}</span>
        </button>
        <button type="button" className="ka-fsbtn" onClick={refresh} title="Refresh now">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </button>
        <div className="ka-clock tabular">{clock}</div>
      </header>

      {/* Board controls — sound / pause (and sandbox sim) live on a thin strip
          under the header so the header keeps just refresh, fullscreen + clock. */}
      <div className="ka-subbar" role="group" aria-label="Board controls">
        <button
          type="button"
          className="ka-fsbtn"
          aria-pressed={soundOn}
          onClick={() => setSoundOn((s) => !s)}
          title={soundOn ? "Mute new-ticket chime" : "Enable new-ticket chime"}
        >
          {soundOn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          <span>{soundOn ? "Sound" : "Muted"}</span>
        </button>
        <button type="button" className="ka-fsbtn" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          {paused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
          <span>{paused ? "Resume" : "Pause"}</span>
        </button>
        {simEnabled && (
          <>
            <span className="ka-subbar-sep" />
            <button type="button" className="ka-fsbtn" disabled={simBusy} onClick={() => void addOrders(1).then(() => refresh())}>
              Add 1
            </button>
            <button type="button" className="ka-fsbtn" disabled={simBusy} onClick={() => void addOrders(5).then(() => refresh())}>
              Add 5
            </button>
            <button type="button" className="ka-fsbtn" disabled={simBusy} onClick={() => void purgeAll().then(() => refresh())}>
              Purge
            </button>
          </>
        )}
      </div>

      {!kiosk && opsHeader && <KdsManagerOpsHeader orders={orders} location={location} />}

      {!kiosk && chefStrip && <KdsChefStrip orders={orders} station={station} location={location} />}

      {!kiosk && bumpHistory.length > 0 && (
        <div className="ka-recall" role="region" aria-label="Recently bumped">
          <span className="ka-recall-lab">
            <RotateCcw className="h-3.5 w-3.5" /> Just bumped:
          </span>
          {bumpHistory.map((entry) => (
            <button
              key={entry.orderId}
              type="button"
              className="ka-fsbtn"
              disabled={updatingId === entry.orderId}
              onClick={() => recall(entry.orderId)}
              title={`Recall ${entry.label} to the expo column`}
            >
              {entry.label} · Recall
            </button>
          ))}
        </div>
      )}

      <div className="ka-floor-body">
        {loading ? (
          <div className="ka-loading">Loading queue…</div>
        ) : orders.length === 0 ? (
          <div className="ka-empty">Kitchen is clear — new paid orders show up here within seconds.</div>
        ) : lane === "all" ? (
          <KdsBoard
            columns={visibleByStatus}
            stationFilter={station}
            nowMs={now}
            updatingId={updatingId}
            onAdvance={advance}
          />
        ) : (
          <KdsLane
            tickets={visibleByStatus.get(lane) || []}
            stationFilter={station}
            nowMs={now}
            updatingId={updatingId}
            onAdvance={advance}
          />
        )}
      </div>

      {/* Chime audio. Public-domain short bell — bundled in /public if available,
          otherwise falls back to a data: WAV so the file does not 404. */}
      <audio ref={audioRef} preload="auto" src="data:audio/wav;base64,UklGRkAAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRwAAAAAAGn/AAA7AGn/AAA7AGn/AAA7AGn/AAA7AA==" />
      {/* Second, more attention-grabbing chime fired once per ticket
          when it crosses the promised-ready deadline. Same data-URI
          fallback so deployment doesn't depend on shipping an mp3. */}
      <audio ref={overdueAudioRef} preload="auto" src="data:audio/wav;base64,UklGRkAAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRwAAAAAAJL/AABuAJL/AABuAJL/AABuAJL/AABuAA==" />
    </div>
  );

  // Kiosk renders through a portal to document.body so the edge-to-edge
  // display escapes the admin shell's stacking context (CLAUDE.md rule #4);
  // the component subtree — and all its state, hooks and context — stays
  // mounted, so the SSE stream, hotkeys and timers keep running uninterrupted.
  return kiosk ? createPortal(page, document.body) : page;
}

interface FloorOps {
  locationSlug: string;
  menuSlug: string;
  throughputLastHour: number;
  onShift: number;
  menu: { id: string; name: string; category: string; available: boolean }[];
}

/**
 * Manager floor-control header. Sits above the board for managers /
 * franchisees (and owners drilled into a truck). Reuses the active orders
 * the board already streams to surface live open / late / soon / oldest /
 * average-age signals, and pulls throughput + on-shift staff + the menu
 * availability list from /api/admin/kds/floor-ops so the manager can read
 * the floor and 86 / restore items without leaving the board.
 */
function KdsManagerOpsHeader({ orders, location }: { orders: Order[]; location: string }) {
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

  // Live SLA roll-up from the active orders the board holds.
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

  const stats: KdsStat[] = [
    { label: "Open", value: orders.length, sub: "active tickets" },
    { label: "Late", value: late, sub: "over SLA", tone: late > 0 ? "alert" : "good" },
    { label: "Due soon", value: soon, sub: "< 3 min", tone: soon > 0 ? "warn" : undefined },
    { label: "Oldest", value: orders.length > 0 ? fmtClock(oldest) : "—", sub: "ticket age" },
    { label: "Avg age", value: orders.length > 0 ? fmtClock(avg) : "—", sub: "per ticket" },
    { label: "Done", value: ops ? ops.throughputLastHour : "…", sub: "last hr" },
    { label: "On shift", value: ops ? ops.onShift : "…", sub: "staff" },
  ];

  return (
    <Card padding="compact" className="v2-kds-ops">
      <CardBody>
        <div className="ka-fb-eyebrow">
          <span className="ka-fb-brandline">
            <MapPin className="h-3 w-3" /> Floor command
          </span>
          <span className="ka-fb-sep" />
          <span className="ka-fb-trucks">
            <b>{orders.length}</b> open
          </span>
        </div>
        <KdsStatGrid stats={stats} />

        <div className="v2-kds-ops-86">
          <span className="v2-kds-ops-86-label">86&apos;d</span>
          {eightySixed.length === 0 ? (
            <span className="v2-kds-ops-86-empty">Nothing — full menu available</span>
          ) : (
            eightySixed.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant="ghost"
                disabled={busyId === m.id}
                onClick={() => setAvailability(m.id, true)}
                title={`Restore ${m.name}`}
              >
                <Badge tone="danger" variant="soft">{m.name}</Badge>
                <span style={{ marginLeft: 6 }}>Restore</span>
              </Button>
            ))
          )}
          <div className="v2-kds-ops-86-pick">
            <Select
              aria-label="86 an item"
              value={pick}
              placeholder="86 an item…"
              onChange={(e) => { if (e.target.value) void setAvailability(e.target.value, false); }}
              options={availableItems.map((m) => ({ value: m.id, label: m.name }))}
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function OpsStat({ icon, value, label, tone }: { icon: React.ReactNode; value: string; label: string; tone?: "danger" | "warning" }) {
  return (
    <div className={`v2-kds-ops-stat${tone ? ` is-${tone}` : ""}`}>
      <span className="v2-kds-ops-stat-icon">{icon}</span>
      <span className="v2-kds-ops-stat-text">
        <span className="v2-kds-ops-stat-value tabular">{value}</span>
        <span className="v2-kds-ops-stat-label">{label}</span>
      </span>
    </div>
  );
}

/**
 * Chef line strip. Shown to kitchen / staff on the board. Surfaces the
 * cook's focused-station queue depth (how many tickets hit their station and
 * how old the oldest is) and a quick 86 control: declare an item you've run
 * out of (options are the items actually on the active tickets, so it's one
 * tap mid-cook) and restore items that are currently 86'd. Uses the
 * kitchen-permitted /api/admin/kds/eighty-six endpoint.
 */
function KdsChefStrip({
  orders,
  station,
  location,
}: {
  orders: Order[];
  station: MenuCategory | "all";
  location: string;
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

  // Focused-station queue depth from the active tickets.
  const focused = orders.filter((o) => station === "all" || ticketCategories(o).includes(station as MenuCategory));
  let oldest = 0;
  for (const o of focused) {
    const age = totalPrepSeconds(o);
    if (age > oldest) oldest = age;
  }
  const stationLabel = STATION_FILTERS.find((s) => s.id === station)?.label ?? "All stations";

  // Items currently on the active tickets (optionally narrowed to the
  // focused station) — the chef's one-tap 86 candidates.
  const eightySixedIds = new Set(eightySixed.map((e) => e.id));
  const candidates = new Map<string, string>();
  for (const o of orders) {
    for (const ci of o.items) {
      if (station !== "all" && ci.menuItem.category !== station) continue;
      if (!eightySixedIds.has(ci.menuItem.id)) {
        candidates.set(ci.menuItem.id, ci.menuItem.name);
      }
    }
  }

  return (
    <Card padding="compact" className="v2-kds-chef">
      <CardBody>
        <div className="v2-kds-ops-stats v2-kds-chef-row">
          <span className="v2-kds-chef-station">
            <ChefHat className="h-4 w-4" />
            <span>{stationLabel}</span>
          </span>
          {station === "all" ? (
            <span className="v2-kds-ops-86-empty">Pick your station above to focus your queue.</span>
          ) : (
            <>
              <OpsStat icon={<Flame className="h-4 w-4" />} value={String(focused.length)} label="In your queue" />
              <OpsStat icon={<Timer className="h-4 w-4" />} value={focused.length > 0 ? fmtClock(oldest) : "—"} label="Oldest" />
            </>
          )}
          <div className="v2-kds-ops-86-pick">
            <Select
              aria-label="86 an item you've run out of"
              value={pick}
              placeholder="Out of an item? 86 it…"
              onChange={(e) => { if (e.target.value) void toggle(e.target.value, false); }}
              options={[...candidates.entries()].map(([id, name]) => ({ value: id, label: name }))}
            />
          </div>
        </div>
        {eightySixed.length > 0 && (
          <div className="v2-kds-ops-86">
            <span className="v2-kds-ops-86-label">86&apos;d</span>
            {eightySixed.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant="ghost"
                disabled={busyId === m.id}
                onClick={() => toggle(m.id, true)}
                title={`Restore ${m.name}`}
              >
                <Badge tone="danger" variant="soft">{m.name}</Badge>
                <span style={{ marginLeft: 6 }}>Restore</span>
              </Button>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
