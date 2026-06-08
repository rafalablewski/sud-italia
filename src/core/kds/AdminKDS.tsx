"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAdminOrdersStream } from "@/lib/useAdminOrdersStream";
import {
  Bell,
  BellOff,
  ChefHat,
  Maximize2,
  Minimize2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import type { Order, MenuCategory, OrderStatus } from "@/data/types";
import { useAdminLocation } from "@/shared/LocationContext";
import { useToast } from "@/ui/Toast";
import { AdminKdsFleet } from "./AdminKdsFleet";
import { CoreShell } from "@/core/shell/CoreShell";
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
  toneForTicket,
  totalPrepSeconds,
} from "@/core/kds/kds-board";
import { KdsCt } from "@/core/kds/KdsCt";
import { useFullscreen } from "@/core/kds/useFullscreen";
import { analyzeTruck } from "@/lib/kds-prediction";
import { buildKdsTicket, kdsShortId, type KdsTicket } from "@/lib/kds-ticket";
import { useKdsSimulator } from "@/lib/useKdsSimulator";
import type { AdminRole } from "@/lib/admin-roles";

/** One entry in the "Recall" tray — the last few tickets a cook bumped. */
type BumpEntry = { orderId: string; label: string; bumpedAt: number };

// View-aware intro banner (windowed shell only — the fullscreen kiosk wall
// stays bare for the cooks). One per KDS lens.
const KDS_INTRO: Record<"fleet" | "floor" | "chef", { h1: string; p: string }> = {
  fleet: {
    h1: "KDS · Fleet Command — every truck at a glance",
    p: "Owner Atlas lens: live throughput, at-risk & late counts, a cross-truck promise-accuracy benchmark, and per-truck panels with health, capacity and per-station pace bars — drill into any truck's Floor or Chef line.",
  },
  floor: {
    h1: "KDS · Floor — the expo board",
    p: "Three live lanes (New → Firing → Ready·Expo) with SLA-tier colouring, station-grouped lines, a cook-time progress meter, course-held hints, and one-tap bump. Stage filter + 86 up top.",
  },
  chef: {
    h1: "KDS · Chef line — your station only",
    p: "The cook's lens: a station-filtered, oversized make-queue. Big dish names + quantities readable across the line, modifiers in italic, allergen flags kept, and one full-width bump per ticket.",
  },
};

// The recall tray must survive a tablet refresh (the KDS runs all day on a
// wall-mounted screen that gets reloaded on Wi-Fi blips). We mirror the last 5
// bumps to localStorage, scoped per location, and prune anything older than the
// window where a recall is still plausibly useful so a reload doesn't resurrect
// a bump from hours ago.
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

/**
 * Role-aware KDS shell. One live-order engine, three lenses:
 *   • owner   → Fleet command (cross-truck health) by default. Drilling into
 *               a truck swaps the same window to that truck's floor board.
 *   • manager → Floor board (single location).
 *   • kitchen/staff → Floor board (the line view they've always had).
 */
export function AdminKDS() {
  const { setLocation } = useAdminLocation();
  const [role, setRole] = useState<AdminRole | null>(null);
  // Owners always land on the fleet; drilling into a truck flips this to that
  // truck's "floor" board, and the header viewswitch lets the owner flip on to
  // the "chef" line for the same truck (owner/master sees every lens, unlike a
  // scoped manager or kitchen role which is pinned to one).
  const [mode, setMode] = useState<"fleet" | "floor" | "chef">("fleet");

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

  // Drilling into a single truck's floor / chef board is a dedicated
  // kitchen-screen view, so hide the admin sidebar and let the board run
  // full-width. The fleet/landing view keeps the nav; stepping back to fleet
  // (or leaving the page) drops the class via cleanup.
  useEffect(() => {
    if (role !== "owner" || mode === "fleet") return;
    document.body.classList.add("kds-immersive");
    return () => document.body.classList.remove("kds-immersive");
  }, [role, mode]);

  // Managers + franchisees get the floor-control ops header; kitchen/staff
  // get the chef line strip (station focus + queue depth + quick 86); the
  // pre-resolve null state gets the plain board.
  const managerControls = role === "manager" || role === "franchisee";
  const chef = role === "kitchen" || role === "staff";

  // Only owners get the Atlas fleet lens. Everyone else (incl. the pre-resolve
  // null state) gets the floor board directly.
  if (role !== "owner") {
    return <AdminKDSDesktop opsHeader={managerControls} chefStrip={chef} />;
  }

  // Owner — Atlas fleet command is the default. Drilling into a truck swaps
  // this same window down to that truck's floor board; the viewswitch then
  // flips between Floor (manager ops header) and Chef (station line) for that
  // truck. The Atlas board reflows to its responsive layout on a phone.
  const floorView = (
      <AdminKDSDesktop
        opsHeader={mode === "floor"}
        chefStrip={mode === "chef"}
        fleetContext
        lens={mode === "chef" ? "chef" : "floor"}
        onLens={(l) => setMode(l)}
        onExitFleet={() => setMode("fleet")}
      />
    );

  return (
    <div>
      {mode === "fleet" ? (
        <AdminKdsFleet
          onDrillIn={(slug, lens) => {
            setLocation(slug);
            setMode(lens ?? "floor");
          }}
        />
      ) : (
        floorView
      )}
    </div>
  );
}

function AdminKDSDesktop({
  opsHeader = false,
  chefStrip = false,
  fleetContext = false,
  lens,
  onLens,
  onExitFleet,
}: {
  opsHeader?: boolean;
  chefStrip?: boolean;
  /** True when an owner reached this board by drilling in from the fleet wall —
   *  the header keeps the "Fleet command" identity, scoped to the location. */
  fleetContext?: boolean;
  /** Owner-only: the active drilled-in lens, so the viewswitch can highlight
   *  Floor vs Chef. Absent for scoped (manager / kitchen) roles. */
  lens?: "floor" | "chef";
  /** Owner-only: switch the drilled-in lens (Floor ↔ Chef). When provided the
   *  viewswitch becomes interactive; absent = role-pinned, decorative. */
  onLens?: (lens: "floor" | "chef") => void;
  /** Owner-only: jump back to the Atlas fleet wall (the viewswitch "Fleet" tab). */
  onExitFleet?: () => void;
}) {
  const { location, activeLocations } = useAdminLocation();
  const toast = useToast();

  // Proper-cased location name for the header (slug → city), so the drilled-in
  // board reads "Fleet command · Kraków" rather than the raw "krakow" slug.
  const locName = activeLocations.find((l) => l.slug === location)?.city || location;
  const brandLabel = fleetContext
    ? locName
      ? `Fleet command · ${locName}`
      : "Fleet command"
    : locName
      ? `${locName} · floor`
      : "Floor";

  // When the owner-only simulator toggle is on, the board streams marked
  // SIMULATION tickets and flags itself with a Sandbox tag next to the wordmark.
  const { enabled: simEnabled } = useKdsSimulator(location);

  // Station focus. The floor + manager boards always show every station
  // ("all"); the chef line lets the cook narrow the queue to their station
  // (Pizza / Pasta / Cold …) via the chip rail in the chef strip — real
  // category filtering off `ticketCategories`, not a cosmetic toggle.
  const [station, setStation] = useState<MenuCategory | "all">("all");

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
  const { active: kiosk, enter: enterKiosk, exit: exitKiosk } = useFullscreen();

  // Live order stream — SSE with REST fallback. Replaces the old 5 s polling
  // loop. We mirror the stream into a local copy so optimistic updates from
  // advance/recall feel instant; the next SSE frame reconciles either way.
  const { orders: streamedOrders, refresh } = useAdminOrdersStream(location, { paused, includeSimulated: true });
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  // Gate the loading-pill portal on a client mount so the SSR pass (where
  // `loading` is true but `document` doesn't exist) doesn't reach for
  // document.body, and so the first client render matches the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Optimistic-advance overrides keyed by order id. While an advance/recall PUT
  // is in flight, the SSE stream can still carry the pre-change status; we
  // re-apply the operator's intent on top of each frame so the board never
  // rubber-bands back to the old lane. Cleared the moment the request resolves —
  // after that the store is authoritative and frames are already fresh.
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
  // Cooks bump tickets by mistake constantly. We keep the last 5 bumps in
  // memory so a "Recall" tray on the right side can put one back on the
  // expo column in a single click — within the 60 s window where this is
  // most useful. Older bumps quietly fall out of the list.
  // Starts empty so server and first client render match (no hydration
  // mismatch); the mount effect below rehydrates it from localStorage.
  const [bumpHistory, setBumpHistory] = useState<BumpEntry[]>([]);

  // Reload the recall tray from storage on mount and when the operator switches
  // trucks, and persist it on every change so a refresh keeps the last bumps
  // recallable. `loadedLocation` tracks which truck the in-state tray belongs to
  // so the persist effect can't clobber a freshly hydrated tray before it has
  // caught up to the new location (and avoids the state-bailout edge case a
  // skip-flag had when the loaded history was empty).
  const [loadedLocation, setLoadedLocation] = useState<string | null>(null);
  useEffect(() => {
    setBumpHistory(loadBumpHistory(location));
    setLoadedLocation(location);
  }, [location]);
  useEffect(() => {
    if (typeof window === "undefined" || loadedLocation !== location) return;
    try {
      window.localStorage.setItem(
        bumpStorageKey(location),
        JSON.stringify(bumpHistory),
      );
    } catch {
      // localStorage full/blocked — the tray still works in-memory this session.
    }
  }, [bumpHistory, location, loadedLocation]);

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
  // Gate the wall clock on mount: `now` seeds from Date.now(), which differs
  // server↔client, so render a stable placeholder for SSR to avoid a hydration
  // text mismatch, then fill in the live time after mount.
  const clock = useMemo(() => (mounted ? fmtWallClock(now) : "--:--:--"), [now, mounted]);

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
    const label = `${o.customerName || "Guest"} · ${o.id.slice(-6).toUpperCase()}`;
    // Snapshot so a failed PUT can put the exact ticket back rather than relying
    // on a refresh that might be slow/offline (which would leave the line
    // staring at a vanished order).
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
    // Optimistic — move the ticket the instant the cook taps so the board never
    // stalls on the network round-trip (the old await-first path cost ~2 s a
    // bump). The override above keeps stale SSE frames from snapping it back
    // mid-flight; the PUT persists in the background and a failure rolls back.
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
  };

  // Keep the hotkey ref pointing at the latest closure so it always
  // resolves to the current state when the cook taps a number key.
  useEffect(() => {
    advanceRef.current = advance;
  });

  const recall = async (orderId: string) => {
    setUpdatingId(orderId);
    // Hold the ticket on the expo column even if a pre-recall SSE frame (still
    // showing it completed) lands while the request is in flight.
    pendingRef.current.set(orderId, "ready");
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
      pendingRef.current.delete(orderId);
      setUpdatingId(null);
    }
  };

  const viewLabel = chefStrip ? "Chef" : "Floor";

  // Viewswitch (Fleet / Floor / Chef) + stage filter — the same nodes ride the
  // shared CoreShell header (windowed) and the dark kiosk wall, just under
  // different parent classes (.viewnav / .seg vs .kds-viewswitch / .kds-stage).
  const viewswitchNodes = (
    <>
      {fleetContext && onExitFleet && (
        <button type="button" onClick={onExitFleet}>
          Fleet
        </button>
      )}
      <button
        type="button"
        className={(onLens ? lens === "floor" : viewLabel === "Floor") ? "on" : ""}
        onClick={onLens ? () => onLens("floor") : undefined}
      >
        Floor
      </button>
      {(onLens || chefStrip) && (
        <button
          type="button"
          className={(onLens ? lens === "chef" : true) ? "on" : ""}
          onClick={onLens ? () => onLens("chef") : undefined}
        >
          Chef
        </button>
      )}
    </>
  );

  const stageNodes = (
    <>
      <button type="button" className={lane === "all" ? "on" : ""} onClick={() => setLane("all")}>
        All <span className="n">{laneCounts.all}</span>
      </button>
      {KDS_COLUMNS.map((col) => (
        <button
          key={col.id}
          type="button"
          className={lane === col.id ? "on" : ""}
          onClick={() => setLane(col.id)}
        >
          {col.label} <span className="n">{laneCounts[col.id]}</span>
        </button>
      ))}
    </>
  );

  // The dark kitchen board + chime audio + legend/recall footrow — shared by
  // the windowed shell body and the fullscreen kiosk wall. The manager/chef
  // sub-headers are windowed-only (the kiosk wall maximises ticket space).
  const boardBody = (
    <>
      <div className="ka-floor-body" style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          // The loading pill is portaled to <body> below (rule #4); the body
          // stays empty while we load rather than flashing a false "clear".
          null
        ) : orders.length === 0 ? (
          <div className="ka-empty">Kitchen is clear — new paid orders show up here within seconds.</div>
        ) : chefStrip ? (
          <KdsChefQueue columns={visibleByStatus} lane={lane} nowMs={now} updatingId={updatingId} onAdvance={advance} />
        ) : lane === "all" ? (
          <KdsBoard columns={visibleByStatus} stationFilter={station} nowMs={now} updatingId={updatingId} onAdvance={advance} />
        ) : (
          <KdsLane tickets={visibleByStatus.get(lane) || []} stationFilter={station} nowMs={now} updatingId={updatingId} onAdvance={advance} />
        )}
      </div>

      {/* Chime audio — bundled WAV data-URIs so deployment never 404s. */}
      <audio ref={audioRef} preload="auto" src="data:audio/wav;base64,UklGRkAAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRwAAAAAAGn/AAA7AGn/AAA7AGn/AAA7AGn/AAA7AA==" />
      <audio ref={overdueAudioRef} preload="auto" src="data:audio/wav;base64,UklGRkAAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRwAAAAAAJL/AABuAJL/AABuAJL/AABuAJL/AABuAA==" />

      <div className="kds-footrow">
        {!chefStrip && bumpHistory.length > 0 && (
          <div className="kds-recall">
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
                <RotateCcw className="h-3 w-3" />#{kdsShortId(b.orderId)}
              </button>
            ))}
          </div>
        )}
        <div className="kds-legend">
          <span className="k"><span className="sw" />On time</span>
          <span className="k"><span className="sw" style={{ background: "var(--warn)" }} />Approaching SLA</span>
          <span className="k"><span className="sw" style={{ background: "var(--late)" }} />Late</span>
          <span>
            Keys <b>1–9</b> bump · <b>F</b> kiosk
          </span>
        </div>
      </div>
    </>
  );

  // Windowed: the unified Core shell (light header, no sidebar, same nav as
  // POS / Guest / Service) over the dark kitchen body. The KDS controls live in
  // the shared header slots so every Core surface's chrome sits in one place.
  const windowed = (
    <CoreShell
      bleed
      eyebrow={`Kitchen · ${brandLabel}`}
      viewnav={viewswitchNodes}
      subRight={
        <>
          <div className="seg kds-stage-seg" role="group" aria-label="Stage focus">
            {stageNodes}
          </div>
          {simEnabled && (
            <span className="badge platinum">
              <span className="d" />
              Sandbox
            </span>
          )}
        </>
      }
      right={
        <>
          <span className="core-clock">{clock}</span>
          <button type="button" className="btn icon" onClick={refresh} title="Refresh now">
            <RefreshCw />
          </button>
          <button
            type="button"
            className={`btn icon${soundOn ? " on" : ""}`}
            onClick={() => setSoundOn((s) => !s)}
            title={soundOn ? "Mute new-ticket chime" : "Enable new-ticket chime"}
          >
            {soundOn ? <Bell /> : <BellOff />}
          </button>
          <button
            type="button"
            className={`btn icon${paused ? " on" : ""}`}
            onClick={() => setPaused((p) => !p)}
            title={paused ? "Resume" : "Pause"}
          >
            {paused ? <PlayCircle /> : <PauseCircle />}
          </button>
          <button type="button" className="btn icon" onClick={enterKiosk} title="Fullscreen kiosk">
            <Maximize2 />
          </button>
        </>
      }
    >
      <div className="kds-core in-shell">
        <div className="kds-wrap">
          <div className="intro intro-slim kds-intro">
            <h1>{KDS_INTRO[chefStrip ? "chef" : "floor"].h1}</h1>
            <p>{KDS_INTRO[chefStrip ? "chef" : "floor"].p}</p>
          </div>
          {opsHeader && <KdsManagerOpsHeader orders={orders} location={location} />}
          {chefStrip && (
            <KdsChefStrip orders={orders} station={station} onStation={setStation} location={location} />
          )}
          {boardBody}
        </div>
      </div>
    </CoreShell>
  );

  // Kiosk: the bare dark wall, portaled to <body> so the edge-to-edge display
  // escapes any stacking context (rule #4). Its own dark header carries the
  // same controls. The subtree stays mounted, so SSE / hotkeys / timers keep
  // running. The loading pill lands on `#admin-portal-root` (an ancestor of the
  // stacking trap that still holds the `--font-admin-*` vars), falling back to
  // <body> defensively.
  const kioskPage = (
    <div className="kds-core is-fullscreen">
      <div className="kds-wrap">
        <div className="kds-top">
          <div className="kds-id">
            <div className="brand-mark">SI</div>
            <div>
              <div className="nm">Kitchen</div>
              <div className="loc">{brandLabel}</div>
            </div>
          </div>
          <div className="kds-viewswitch">{viewswitchNodes}</div>
          <div className="kds-stage" role="group" aria-label="Stage focus">
            {stageNodes}
          </div>
          <div className="kds-clock">{clock}</div>
          {simEnabled && (
            <span className="kds-badge platinum">
              <span className="d" />
              Sandbox
            </span>
          )}
          <button type="button" className="kds-ctrl" onClick={refresh} title="Refresh now">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`kds-ctrl${soundOn ? " on" : ""}`}
            onClick={() => setSoundOn((s) => !s)}
            title={soundOn ? "Mute new-ticket chime" : "Enable new-ticket chime"}
          >
            {soundOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </button>
          <button
            type="button"
            className={`kds-ctrl${paused ? " on" : ""}`}
            onClick={() => setPaused((p) => !p)}
            title={paused ? "Resume" : "Pause"}
          >
            {paused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
          </button>
          <button type="button" className="kds-ctrl on" onClick={exitKiosk} title="Exit fullscreen (Esc)">
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
        {boardBody}
      </div>
    </div>
  );

  return (
    <>
      {kiosk ? createPortal(kioskPage, document.getElementById("admin-portal-root") ?? document.body) : windowed}
      {loading &&
        mounted &&
        createPortal(
          <div className="v2-page-loading">Loading Kitchen Display…</div>,
          document.getElementById("admin-portal-root") ?? document.body,
        )}
    </>
  );
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

  return (
    <div className="kds-ops">
      <div className="kpi-dark k7c">
        <div className="kc"><div className="l">Open</div><div className="v">{orders.length}</div></div>
        <div className="kc"><div className="l">Late</div><div className={`v${late > 0 ? " late" : ""}`}>{late}</div></div>
        <div className="kc"><div className="l">Due &lt;3m</div><div className={`v${soon > 0 ? " warn" : ""}`}>{soon}</div></div>
        <div className="kc"><div className="l">Oldest</div><div className="v">{orders.length > 0 ? fmtClock(oldest) : "—"}</div></div>
        <div className="kc"><div className="l">Avg age</div><div className="v">{orders.length > 0 ? fmtClock(avg) : "—"}</div></div>
        <div className="kc"><div className="l">Done/hr</div><div className="v good">{ops ? ops.throughputLastHour : "…"}</div></div>
        <div className="kc"><div className="l">On shift</div><div className="v">{ops ? ops.onShift : "…"}</div></div>
      </div>
      <div className="kds-86">
        <span className="lbl">86&apos;d</span>
        {eightySixed.length === 0 ? (
          <span style={{ color: "var(--faint)", fontSize: 12 }}>Nothing — full menu</span>
        ) : (
          eightySixed.map((m) => (
            <button
              key={m.id}
              type="button"
              className="kds-restore"
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
          className="kds-btn86"
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
  onStation,
  location,
}: {
  orders: Order[];
  station: MenuCategory | "all";
  onStation: (s: MenuCategory | "all") => void;
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

  // Station chip rail: "All" plus every station that actually has a ticket on
  // the line right now, with its live depth. Tapping a chip narrows the queue
  // to that station (real category filter), so the cook sees only their pass.
  const stationCounts = new Map<MenuCategory | "all", number>();
  for (const o of orders) {
    for (const cat of ticketCategories(o)) {
      stationCounts.set(cat, (stationCounts.get(cat) ?? 0) + 1);
    }
  }
  const stationChips = STATION_FILTERS.filter(
    (s) => s.id === "all" || (stationCounts.get(s.id) ?? 0) > 0 || s.id === station,
  );

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
    <div className="kds-chefstrip">
      <div className="kds-stations">
        {stationChips.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`kds-station${station === s.id ? " on" : ""}`}
            onClick={() => onStation(s.id)}
          >
            {s.id === "all" ? <ChefHat className="h-4 w-4" /> : null}
            {s.label}
            <span className="n">{s.id === "all" ? orders.length : stationCounts.get(s.id) ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="kds-qdepth">
        <div className="kds-qd"><div className="l">In queue</div><div className="v">{focused.length}</div></div>
        <div className={`kds-qd${oldest >= 480 ? " warn" : ""}`}>
          <div className="l">Oldest</div>
          <div className="v">{focused.length > 0 ? fmtClock(oldest) : "—"}</div>
        </div>
      </div>
      <div className="kds-chef-86">
        <span className="lbl">86&apos;d</span>
        {eightySixed.length === 0 ? (
          <span style={{ color: "var(--faint)", fontSize: 12 }}>Nothing 86&apos;d</span>
        ) : (
          eightySixed.map((m) => (
            <button
              key={m.id}
              type="button"
              className="kds-restore"
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
          className="kds-btn86"
          aria-label="86 an item you've run out of"
          value={pick}
          onChange={(e) => {
            if (e.target.value) void toggle(e.target.value, false);
          }}
        >
          <option value="">Out of an item? 86 it…</option>
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

/**
 * Chef-line queue — the dense, large-type `.kds-queue` of `.ct` cards
 * (kds-chef.html). One flat grid sized for reading across the line, oldest
 * ticket first, honouring the stage filter from the header. Distinct from the
 * 3-column floor board: the line cook works a single station, not the whole
 * floor, so there are no status columns here.
 */
function KdsChefQueue({
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

  if (sorted.length === 0) {
    return <div className="kds-empty">No tickets on this station.</div>;
  }
  return (
    <div className="kds-queue">
      {sorted.map((t) => (
        <KdsCt
          key={t.id}
          t={t}
          now={nowMs}
          tone={toneForTicket(t, nowMs)}
          advancing={updatingId === t.id}
          onAdvance={onAdvance}
        />
      ))}
    </div>
  );
}
