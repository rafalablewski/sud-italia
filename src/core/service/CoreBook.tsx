"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CoreShell } from "@/core/shell/CoreShell";
import { CorePos } from "@/core/pos/CorePos";
import { useSelection } from "@/core/shell/SelectionContext";
import { useCoreToast } from "@/core/ui/Toast";
import { CoreDialog } from "@/core/ui/Dialog";
import { useLocation } from "@/shared/LocationContext";
import { findReservationConflicts } from "@/lib/floor";
import { buildTableSessions } from "@/lib/table-session";
import {
  suggestTables,
  suggestJoins,
  estimateWaitMin,
  expectedTurnMin,
  POLICY_PRESETS,
  OVERRIDE_REASONS,
  type OverrideReason,
  type Suggestion,
  type JoinSuggestion,
  type SeatingPolicy,
  type StoredSeatingPolicy,
  type PolicyPreset,
  type SeatingWeights,
  type TurnModel,
  type SeatingDecisionSummary,
  type ServiceSimulation,
} from "@/lib/seating";
import { TABLE_FEATURES, type FloorTable, type Reservation, type TimeSlot, type TableFeature, type WaitlistEntry, type MenuItem } from "@/data/types";
import type { UpsellConfig } from "@/lib/upsell";
import { serviceTabs } from "./serviceTabs";

const DURATION_MIN = 90;
const RES_HOLDS = new Set<Reservation["status"]>(["booked", "seated"]);

/** Floor's shared table-label convention: prefix a bare number with "T"
 *  (matches CoreFloor's `T${n}`), leave already-named tables ("Bar 3") alone. */
function tLabel(n: string): string {
  return /^\d+$/.test(n) ? `T${n}` : n;
}
/** Timeline rows + table-pick list read T1…T12 in order (mockup), so sort by
 *  numeric table number where possible, falling back to lexical. */
function byTableNumber(a: FloorTable, b: FloorTable): number {
  const na = parseInt(a.number, 10), nb = parseInt(b.number, 10);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.number.localeCompare(b.number);
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Core · Service · Book — slot + table in one move, a Service view alongside
 * Floor / Slots / Dispatch (`serviceTabs`). Wired to the shared engine: GET
 * slots / floor tables / reservations, create via POST /api/admin/booking,
 * cancel via DELETE /api/admin/floor/reservations. Conflicts via the pure
 * findReservationConflicts.
 */
export function CoreBook({
  menusByLocation = {},
  upsellByLocation = {},
}: {
  menusByLocation?: Record<string, MenuItem[]>;
  upsellByLocation?: Record<string, UpsellConfig | null>;
} = {}) {
  const toast = useCoreToast();
  const { selected, select } = useSelection();
  const { location, activeLocations } = useLocation();
  const loc = location || activeLocations[0]?.slug || "krakow";
  // Seed the date on the client only — todayLocal() reads the local timezone,
  // which would mismatch the server's SSR (UTC) and trip a hydration warning.
  const [date, setDate] = useState("");
  useEffect(() => {
    setDate(todayLocal());
  }, []);

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [waitName, setWaitName] = useState("");
  const [waitPartyN, setWaitPartyN] = useState(2);

  const [slotId, setSlotId] = useState<string | null>(null);
  const [partyN, setPartyN] = useState(2);
  const [tableId, setTableId] = useState<string | null>(null);
  // A selected table-join (combine several tables for a big party). Picking a
  // single table clears it; picking a join sets tableId to its primary.
  const [joinSel, setJoinSel] = useState<JoinSuggestion | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [needs, setNeeds] = useState<TableFeature[]>([]);
  // Matched returning guest (CRM) — feeds the engine's `guest` signal.
  const [guestProfile, setGuestProfile] = useState<{ prefs: { zone?: string; vip?: boolean; usualTableId?: string }; name: string | null; vip: boolean; visits: number; usualTableLabel: string | null } | null>(null);
  const [overrideReason, setOverrideReason] = useState<OverrideReason | null>(null);
  const [override, setOverride] = useState(false);
  const toggleNeed = (f: TableFeature) => setNeeds((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  const [booking, setBooking] = useState(false);
  // The subbar's "New reservation" pill jumps focus to the guest field.
  const nameRef = useRef<HTMLInputElement>(null);

  // Seating Intelligence Engine — tunable policy + learned turn-times (loaded
  // per location), plus the seat/walk-in/policy UI state.
  const [policy, setPolicy] = useState<SeatingPolicy | undefined>(undefined);
  const [storedPolicy, setStoredPolicy] = useState<StoredSeatingPolicy | undefined>(undefined);
  const [turnModel, setTurnModel] = useState<TurnModel | undefined>(undefined);
  const [turnAccuracy, setTurnAccuracy] = useState<{ n: number; maeMin: number; biasMin: number; withinBandPct: number } | null>(null);
  const [decisionSummary, setDecisionSummary] = useState<SeatingDecisionSummary | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [walkOpen, setWalkOpen] = useState(false);
  const [walkParty, setWalkParty] = useState(2);
  const [policyOpen, setPolicyOpen] = useState(false);
  // Pre-service forecast — run the book against the floor before doors open.
  const [simOpen, setSimOpen] = useState(false);
  const [sim, setSim] = useState<ServiceSimulation | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const openForecast = async () => {
    setSimOpen(true);
    setSimBusy(true);
    try {
      const r = await fetch(`/api/admin/seating/simulate?location=${encodeURIComponent(loc)}&date=${date}`);
      setSim(r.ok ? await r.json() : null);
    } catch { setSim(null); } finally { setSimBusy(false); }
  };
  // The three lenses over one shared reservation truth (concept 5): Timeline
  // (plan), Floor (spatial, live occupancy), Arrivals (the host queue).
  const [viewMode, setViewMode] = useState<"timeline" | "floor" | "arrivals">("timeline");
  // The table whose POS check is open as a docked drawer over the Floor lens
  // (same embedded CorePos the standalone Floor uses). Portaled to the .core
  // theme root so it inherits core tokens (Rule #4 — never rely on z-index).
  const [checkTableId, setCheckTableId] = useState<string | null>(null);
  const [coreRoot, setCoreRoot] = useState<Element | null>(null);
  useEffect(() => { setCoreRoot(document.querySelector(".core")); }, []);
  const openCheck = (tableId?: string) => { if (tableId) setCheckTableId(tableId); };

  const load = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    try {
      const [s, t, r, pol, tm, dec, wl] = await Promise.all([
        fetch(`/api/admin/slots?location=${encodeURIComponent(loc)}&date=${date}`).then((x) => (x.ok ? x.json() : [])),
        fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`).then((x) => (x.ok ? x.json() : [])),
        fetch(`/api/admin/floor/reservations?location=${encodeURIComponent(loc)}&date=${date}`).then((x) => (x.ok ? x.json() : [])),
        fetch(`/api/admin/seating/policy?location=${encodeURIComponent(loc)}`).then((x) => (x.ok ? x.json() : null)).catch(() => null),
        fetch(`/api/admin/seating/turn-model?location=${encodeURIComponent(loc)}`).then((x) => (x.ok ? x.json() : null)).catch(() => null),
        fetch(`/api/admin/seating/decisions?location=${encodeURIComponent(loc)}`).then((x) => (x.ok ? x.json() : null)).catch(() => null),
        fetch(`/api/admin/floor/waitlist?location=${encodeURIComponent(loc)}&date=${date}`).then((x) => (x.ok ? x.json() : null)).catch(() => null),
      ]);
      setSlots(Array.isArray(s) ? s : s.slots ?? []);
      setTables(Array.isArray(t) ? t : t.tables ?? []);
      setReservations(Array.isArray(r) ? r : r.reservations ?? []);
      setWaitlist(Array.isArray(wl?.waitlist) ? wl.waitlist : []);
      if (pol?.policy) { setPolicy(pol.policy); setStoredPolicy(pol.stored); }
      setTurnModel(tm && tm.cells ? (tm as TurnModel) : undefined);
      setTurnAccuracy(tm && tm.accuracy && typeof tm.accuracy.n === "number" ? tm.accuracy : null);
      setDecisionSummary(dec && typeof dec.n === "number" ? (dec as SeatingDecisionSummary) : null);
    } finally {
      setLoading(false);
    }
  }, [loc, date]);
  useEffect(() => {
    void load();
  }, [load]);

  const dineInSlots = useMemo(
    () => slots.filter((s) => s.status === "active" && s.fulfillmentTypes.includes("dine-in")).sort((a, b) => a.time.localeCompare(b.time)),
    [slots],
  );
  const selectedSlot = dineInSlots.find((s) => s.id === slotId) ?? null;

  const tableState = useCallback(
    (t: FloorTable): { ok: boolean; label: string } => {
      if (t.status === "out-of-service") return { ok: false, label: "out of service" };
      if (t.seats < partyN) return { ok: false, label: `${t.seats} — too small` };
      if (!selectedSlot) return { ok: true, label: `${t.seats} seats` };
      const conflicts = findReservationConflicts(reservations, { id: "new", locationSlug: loc, tableId: t.id, date: selectedSlot.date, time: selectedSlot.time, durationMin: DURATION_MIN });
      if (conflicts.length) return { ok: false, label: "booked" };
      return { ok: true, label: `${t.seats} seats${t.zone ? ` · ${t.zone}` : ""}` };
    },
    [selectedSlot, partyN, reservations, loc],
  );

  const sortedTables = useMemo(() => [...tables].sort(byTableNumber), [tables]);
  const tableLabel = (id?: string) => {
    const n = tables.find((t) => t.id === id)?.number;
    return n ? tLabel(n) : "—";
  };
  // A reservation's table label, combining any joined tables ("T5 + T6").
  const resTableLabel = (r: Reservation) =>
    [r.tableId, ...(r.joinedTableIds ?? [])].filter(Boolean).map((id) => tableLabel(id)).join(" + ") || "—";
  const canBook = !!selectedSlot && !!tableId && !!name.trim() && partyN >= 1 && !booking;

  const book = async () => {
    if (!selectedSlot || !tableId) return;
    setBooking(true);
    try {
      const res = await fetch(`/api/admin/booking?location=${encodeURIComponent(loc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: selectedSlot.id, tableId, customerName: name.trim(), customerPhone: phone.trim() || undefined, partySize: partyN, durationMin: DURATION_MIN, notes: notes.trim() || undefined, needs: needs.length ? needs : undefined, joinedTableIds: joinSel ? joinSel.tableIds.slice(1) : undefined, override }),
      });
      if (res.ok) {
        toast(`Booked · ${name.trim()} · ${partyN}p · ${selectedSlot.time}`, "success");
        // Trust loop — record recommended-vs-chosen for this seat (best-effort).
        await recordDecision(recTableId, tableId, toMin(selectedSlot.time), partyN, overrideReason);
        setName("");
        setPhone("");
        setNotes("");
        setNeeds([]);
        setGuestProfile(null);
        setTableId(null);
        setJoinSel(null);
        setOverrideReason(null);
        setOverride(false);
        await load();
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast(j.error || "Could not book", "danger");
      }
    } finally {
      setBooking(false);
    }
  };

  const cancel = async (id: string) => {
    const res = await fetch(`/api/admin/floor/reservations?location=${encodeURIComponent(loc)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      toast("Booking cancelled", "success");
      await load();
    }
  };

  // --- Timeline (tables × 30-min ticks, 17:00→23:00 dinner window) ------
  // Mockup axis: 13 tick marks (17:00, 17:30 … 23:00) laid on a fixed-width
  // grid (48px label + 64px/tick) so real blocks fill the grid, and the panel
  // scrolls horizontally rather than squishing an 11:00-start day to the right.
  const OPEN = 17 * 60, CLOSE = 23 * 60;
  const TICK_MIN = 30, LBL_W = 48, TICK_W = 64;
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const fmtHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const ticks = Array.from({ length: (CLOSE - OPEN) / TICK_MIN + 1 }, (_, i) => OPEN + i * TICK_MIN);
  const COLS = ticks.length; // 13
  const dayRes = useMemo(() => reservations.filter((r) => RES_HOLDS.has(r.status)), [reservations]);
  // Dense-console stat strip — every figure from the day's reservations (Rule #1).
  const bookStat = useMemo(() => {
    const active = reservations.filter((r) => r.status !== "cancelled");
    const covers = active.reduce((s, r) => s + (r.partySize || 0), 0);
    const seated = reservations.filter((r) => r.status === "seated").length;
    const upcoming = reservations.filter((r) => r.status === "booked").length;
    const noShows = reservations.filter((r) => r.status === "no-show").length;
    const totalSeats = tables.reduce((s, t) => s + (t.seats || 0), 0);
    const nextUp = reservations.filter((r) => r.status === "booked").map((r) => r.time).sort()[0];
    return {
      bookings: active.length,
      covers,
      seated,
      upcoming,
      noShows,
      nextUp,
      fill: totalSeats ? Math.round((covers / totalSeats) * 100) : 0,
    };
  }, [reservations, tables]);
  const conflictIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of dayRes) if (findReservationConflicts(reservations, r).length) s.add(r.id);
    return s;
  }, [dayRes, reservations]);
  const [dragId, setDragId] = useState<string | null>(null);
  const reassign = async (r: Reservation, newTableId: string) => {
    if (r.tableId === newTableId) return;
    const res = await fetch(`/api/admin/floor/reservations?location=${encodeURIComponent(loc)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, tableId: newTableId, customerName: r.customerName, customerPhone: r.customerPhone, partySize: r.partySize, date: r.date, time: r.time, durationMin: r.durationMin ?? DURATION_MIN, status: r.status, override: true }),
    });
    if (res.ok) { toast(`Moved ${r.customerName} → table ${tableLabel(newTableId)}`, "success"); await load(); }
    else toast("Could not move booking", "danger");
  };

  // Seating Intelligence Engine — rank every table for the party at the chosen
  // slot (hard filter → weighted score → explainable). Only runs once a slot
  // gives us a seating time; the recommended row wears the ✨ Recommend tag and
  // each row's tag/tooltip comes from the engine's reasons.
  const suggestions = useMemo<Suggestion[] | null>(() => {
    if (!selectedSlot) return null;
    return suggestTables({
      party: partyN,
      atMin: toMin(selectedSlot.time),
      date: selectedSlot.date,
      locationSlug: loc,
      tables,
      reservations,
      policy,
      turnModel,
      needs: needs.length ? needs : undefined,
      prefs: guestProfile?.prefs,
    });
  }, [selectedSlot, partyN, tables, reservations, loc, policy, turnModel, needs, guestProfile]);
  const suggByTable = useMemo(() => {
    const m = new Map<string, Suggestion>();
    suggestions?.forEach((s) => m.set(s.tableId, s));
    return m;
  }, [suggestions]);
  // Table-join proposals — only surface when no single table fits the party.
  const joins = useMemo<JoinSuggestion[]>(() => {
    if (!selectedSlot) return [];
    return suggestJoins({ party: partyN, atMin: toMin(selectedSlot.time), date: selectedSlot.date, locationSlug: loc, tables, reservations, policy, turnModel, needs: needs.length ? needs : undefined });
  }, [selectedSlot, partyN, tables, reservations, loc, policy, turnModel, needs]);
  // Pick a single table → drop any join selection.
  const pickTable = (id: string) => { setJoinSel(null); setTableId(id); };
  // Pick a join → seat its primary, remember the combined set.
  const pickJoin = (j: JoinSuggestion) => { setJoinSel(j); setTableId(j.tableIds[0]); };
  // The row that wears the ✨ Recommend tag: the engine's top pick when a slot
  // is chosen, else the smallest fitting-and-free table (pre-slot fallback).
  const recTableId = useMemo(
    () =>
      suggestions
        ? suggestions.find((s) => s.isRecommended)?.tableId ?? null
        : tables.filter((t) => tableState(t).ok).sort((a, b) => a.seats - b.seats)[0]?.id ?? null,
    [suggestions, tables, tableState],
  );
  // The suggestion whose signals the explainability panel shows: the chosen
  // table, else the engine's recommendation — so "why this table?" is always
  // answered with a real score breakdown, not a black box.
  const shownSug = useMemo<Suggestion | null>(
    () => (tableId ? suggByTable.get(tableId) : null) ?? (recTableId ? suggByTable.get(recTableId) : null) ?? suggestions?.find((s) => s.ok) ?? null,
    [tableId, recTableId, suggByTable, suggestions],
  );
  // Full-width booking list — everything but cancellations, chronological.
  const bookingList = useMemo(
    () => reservations.filter((r) => r.status !== "cancelled").sort((a, b) => a.time.localeCompare(b.time)),
    [reservations],
  );
  // status → list badge tone/label. The schema has no confirmed/pending split,
  // so a held (`booked`) reservation reads as "pending" (unconfirmed).
  const listStat: Record<string, { c: string; l: string }> = {
    seated: { c: "seated", l: "seated" },
    booked: { c: "pending", l: "pending" },
    "no-show": { c: "noshow", l: "no-show" },
    completed: { c: "confirmed", l: "done" },
  };
  const selectRow = (r: Reservation) => {
    const t = tables.find((x) => x.id === r.tableId);
    if (t) select({ kind: "table", id: t.id, label: `Table ${t.number}`, sub: `${r.partySize} covers${t.zone ? ` · ${t.zone}` : ""}`, status: r.status });
  };
  const daySub = (() => {
    if (!date) return "today";
    const d = new Date(`${date}T00:00:00`);
    return !isNaN(d.getTime())
      ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toLowerCase().replace(/,/g, "")
      : "today";
  })();
  const isToday = date === todayLocal();
  // Live "now" in minutes — seeded on the client only (0 during SSR + the first
  // client render so hydration matches), then it ticks every 30s so the Floor /
  // Arrivals lenses stay current without a reload.
  const [nowMin, setNowMin] = useState(0);
  useEffect(() => {
    const tick = () => setNowMin(new Date().getHours() * 60 + new Date().getMinutes());
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  // ── Seating actions — transition a booking through its lifecycle. The route
  // stamps seatedAt/completedAt; we resend the full record so nothing is lost.
  const setResStatus = async (r: Reservation, status: Reservation["status"], verb: string) => {
    setActing(r.id);
    try {
      const res = await fetch(`/api/admin/floor/reservations?location=${encodeURIComponent(loc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: r.id, customerName: r.customerName, customerPhone: r.customerPhone, partySize: r.partySize,
          date: r.date, time: r.time, durationMin: r.durationMin ?? DURATION_MIN, tableId: r.tableId,
          slotId: r.slotId, notes: r.notes, source: r.source, seatedAt: r.seatedAt, status, override: true,
        }),
      });
      if (res.ok) { toast(`${r.customerName} · ${verb}`, "success"); await load(); }
      else toast(`Could not ${verb.toLowerCase()}`, "danger");
    } finally { setActing(null); }
  };

  // ── Walk-in — the engine ranks safe tables at "now"; only ok ones seat. A
  // walk-in is an ad-hoc reservation (source: walk-in, seated immediately).
  const walkSuggestions = useMemo<Suggestion[]>(() => {
    if (!walkOpen) return [];
    return suggestTables({ party: walkParty, atMin: nowMin, date, locationSlug: loc, tables, reservations, policy, turnModel, needs: needs.length ? needs : undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkOpen, walkParty, tables, reservations, loc, date, policy, turnModel, needs]);
  const seatWalkIn = async (t: FloorTable) => {
    setActing(`walk-${t.id}`);
    try {
      const hm = `${String(Math.floor(nowMin / 60)).padStart(2, "0")}:${String(nowMin % 60).padStart(2, "0")}`;
      const res = await fetch(`/api/admin/floor/reservations?location=${encodeURIComponent(loc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: "Walk-in", partySize: walkParty, date, time: hm,
          durationMin: expectedTurnMin(walkParty, nowMin, turnModel), tableId: t.id,
          status: "seated", source: "walk-in", needs: needs.length ? needs : undefined, override: true,
        }),
      });
      if (res.ok) { toast(`Walk-in seated · ${walkParty} · ${tLabel(t.number)}`, "success"); setWalkOpen(false); await load(); }
      else toast("Could not seat walk-in", "danger");
    } finally { setActing(null); }
  };

  // ── Policy — persist a preset (clears overrides) or a full override set.
  const putPolicy = async (patch: { preset?: PolicyPreset; overrides?: StoredSeatingPolicy["overrides"] | null }) => {
    const res = await fetch(`/api/admin/seating/policy?location=${encodeURIComponent(loc)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (res.ok) { const j = await res.json(); setPolicy(j.policy); setStoredPolicy(j.stored); }
    else toast("Could not save policy", "danger");
  };
  // Selecting a preset explicitly clears any prior overrides (overrides: null).
  const setPreset = (preset: PolicyPreset) => void putPolicy({ preset, overrides: null });
  // One commit path for every weight/rule/toggle: rebuild the FULL override set
  // from the current effective policy and apply the patch, so tuning one lever
  // never silently drops another (Rule #7 — saves immediately).
  const commitPolicy = (over: Partial<NonNullable<StoredSeatingPolicy["overrides"]>>) => {
    if (!policy || !storedPolicy) return;
    void putPolicy({
      preset: storedPolicy.preset,
      overrides: {
        weights: policy.weights,
        resetBufferMin: policy.resetBufferMin,
        paceCapPer15: policy.paceCapPer15,
        largeTableSeats: policy.largeTableSeats,
        sectionCapPer15: policy.sectionCapPer15,
        protectLargeTables: policy.protectLargeTables,
        vipHoldZones: policy.vipHoldZones,
        autoSuggest: policy.autoSuggest,
        learnFromOverrides: policy.learnFromOverrides,
        shadowMode: policy.shadowMode,
        protectLargeReleaseMin: policy.protectLargeReleaseMin,
        reservedGraceMin: policy.reservedGraceMin,
        ...over,
      },
    });
  };
  const setWeight = (key: keyof SeatingWeights, val: number) => commitPolicy({ weights: { ...policy!.weights, [key]: val } });
  const setRule = (key: "resetBufferMin" | "paceCapPer15" | "largeTableSeats" | "sectionCapPer15" | "protectLargeReleaseMin" | "reservedGraceMin", val: number) => commitPolicy({ [key]: val });
  const setToggle = (key: "protectLargeTables" | "autoSuggest" | "learnFromOverrides" | "shadowMode", val: boolean) => commitPolicy({ [key]: val });
  const toggleVipZone = (zone: string) => {
    if (!policy) return;
    const has = policy.vipHoldZones.some((z) => z.toLowerCase() === zone.toLowerCase());
    commitPolicy({ vipHoldZones: has ? policy.vipHoldZones.filter((z) => z.toLowerCase() !== zone.toLowerCase()) : [...policy.vipHoldZones, zone] });
  };
  // Distinct zones on the floor — the VIP-hold picker's options.
  const zoneList = useMemo(() => {
    const s = new Set<string>();
    for (const t of tables) if (t.zone) s.add(t.zone);
    return [...s].sort();
  }, [tables]);

  // CRM lookup — when the phone has enough digits, pull the guest's seating
  // profile (usual table · zone · VIP) so the engine can honour their preference.
  // Debounced so typing a number doesn't hammer the endpoint.
  useEffect(() => {
    const p = phone.replace(/\D/g, "");
    if (p.length < 6) { setGuestProfile(null); return; }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/floor/guest-prefs?location=${encodeURIComponent(loc)}&phone=${encodeURIComponent(phone.trim())}`);
        if (!res.ok || cancelled) return;
        const j = await res.json();
        if (!cancelled) setGuestProfile(j.visits > 0 || j.vip ? j : null);
      } catch { /* non-fatal */ }
    }, 450);
    return () => { cancelled = true; clearTimeout(id); };
  }, [phone, loc]);

  // Auto-suggest — when on (and not shadow-only), pre-select the engine's pick
  // so the operator can book with one tap. Only fills an empty choice; a manual
  // pick always wins. Shadow mode is advisory, so it never auto-applies.
  useEffect(() => {
    if (policy?.autoSuggest && !policy.shadowMode && recTableId && tableId == null) setTableId(recTableId);
  }, [policy?.autoSuggest, policy?.shadowMode, recTableId, tableId]);

  // Trust loop — log what the engine recommended vs. what was booked, so the
  // override rate is real. Fires when learn-from-overrides or shadow mode is on.
  const recordDecision = async (recommendedTableId: string | null, chosenTableId: string, atMin: number, party: number, reason: OverrideReason | null) => {
    if (!policy || (!policy.learnFromOverrides && !policy.shadowMode)) return;
    const wasOverride = chosenTableId !== recommendedTableId;
    // The signal that carried the recommended pick — so the tuning loop can spot
    // a signal operators keep overriding.
    const recSug = recommendedTableId ? suggByTable.get(recommendedTableId) : undefined;
    let topSignal: keyof Suggestion["breakdown"] | undefined;
    if (recSug) {
      const b = recSug.breakdown;
      topSignal = (Object.keys(b) as (keyof Suggestion["breakdown"])[]).reduce((a, k) => (b[k] > b[a] ? k : a), "fit" as keyof Suggestion["breakdown"]);
    }
    try {
      await fetch(`/api/admin/seating/decisions?location=${encodeURIComponent(loc)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendedTableId, chosenTableId, atMin, party, override: wasOverride, shadow: policy.shadowMode, reason: wasOverride ? reason ?? undefined : undefined, topSignal }),
      });
    } catch { /* telemetry is best-effort */ }
  };

  // ── Lens-derived state — the Floor lens reads the SAME session spine the
  // legacy /core/service/floor does (buildTableSessions), so a walk-in seated
  // off-book on the floor shows here too, and a booking seated here flips the
  // floor. One truth, every lens.
  const nowHM = `${String(Math.floor(nowMin / 60)).padStart(2, "0")}:${String(nowMin % 60).padStart(2, "0")}`;
  const sessions = useMemo(
    () => buildTableSessions({ tables: sortedTables, reservations, nowMin, date, locationSlug: loc }),
    [sortedTables, reservations, nowMin, date, loc],
  );
  const seatedCount = useMemo(() => sessions.filter((s) => s.state === "seated").length, [sessions]);
  const expected = useMemo(() => reservations.filter((r) => r.status === "booked").sort((a, b) => a.time.localeCompare(b.time)), [reservations]);
  const seatedList = useMemo(() => reservations.filter((r) => r.status === "seated").sort((a, b) => a.time.localeCompare(b.time)), [reservations]);

  // ── Waitlist (the host queue) — live wait quotes from the engine. Each party's
  // quote accounts for the parties ahead of it competing for the same tables.
  const waiting = useMemo(() => waitlist.filter((w) => w.status === "waiting").sort((a, b) => a.addedAt.localeCompare(b.addedAt)), [waitlist]);
  const quoteFor = useCallback(
    (party: number, aheadCount: number, wNeeds?: TableFeature[]) =>
      estimateWaitMin({ party, atMin: nowMin, date, locationSlug: loc, tables, reservations, aheadCount, needs: wNeeds, resetBufferMin: policy?.resetBufferMin, turnModel }),
    [nowMin, date, loc, tables, reservations, policy, turnModel],
  );
  const addQuote = useMemo(() => quoteFor(waitPartyN, waiting.length), [quoteFor, waitPartyN, waiting.length]);
  const addToWaitlist = async () => {
    const nm = waitName.trim() || "Walk-in";
    setActing("wl-add");
    try {
      const res = await fetch(`/api/admin/floor/waitlist?location=${encodeURIComponent(loc)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, customerName: nm, partySize: waitPartyN, quotedMin: addQuote ?? 0 }),
      });
      if (res.ok) { toast(`${nm} added to waitlist${addQuote != null ? ` · ~${addQuote}m` : ""}`, "success"); setWaitName(""); await load(); }
      else toast("Could not add to waitlist", "danger");
    } finally { setActing(null); }
  };
  const removeFromWaitlist = async (w: WaitlistEntry, status: "seated" | "left") => {
    setActing(`wl-${w.id}`);
    try {
      const res = await fetch(`/api/admin/floor/waitlist?location=${encodeURIComponent(loc)}&id=${encodeURIComponent(w.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (res.ok) await load();
    } finally { setActing(null); }
  };
  // Seat a waiting party straight onto the engine's pick now, then close them out
  // of the queue (marked seated). Falls back to a toast if nothing is free.
  const seatFromWaitlist = async (w: WaitlistEntry) => {
    const picks = suggestTables({ party: w.partySize, atMin: nowMin, date, locationSlug: loc, tables, reservations, policy, turnModel, needs: w.needs });
    const pick = picks.find((s) => s.ok);
    if (!pick) { toast("No free table for that party yet", "danger"); return; }
    setActing(`wl-${w.id}`);
    try {
      const hm = `${String(Math.floor(nowMin / 60)).padStart(2, "0")}:${String(nowMin % 60).padStart(2, "0")}`;
      const res = await fetch(`/api/admin/floor/reservations?location=${encodeURIComponent(loc)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: w.customerName, partySize: w.partySize, date, time: hm, durationMin: expectedTurnMin(w.partySize, nowMin, turnModel), tableId: pick.tableId, status: "seated", source: "walk-in", needs: w.needs, override: true }),
      });
      if (res.ok) {
        await fetch(`/api/admin/floor/waitlist?location=${encodeURIComponent(loc)}&id=${encodeURIComponent(w.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "seated" }) });
        toast(`${w.customerName} seated · ${tLabel(pick.number)}`, "success");
        await load();
      } else toast("Could not seat", "danger");
    } finally { setActing(null); }
  };

  return (
    <CoreShell
      eyebrow="Service · Book"
      tabs={serviceTabs("book")}
    >
      <div className="core-book">
        {/* Surface sub-bar (mockup subbar): weekday label + a date chip on the
            left, a brand New-reservation pill on the right that jumps focus to
            the always-open form. Uses the shared `.core-surf-toolbar` bar so it
            reads identically to POS/KDS surface controls. */}
        <div className="core-surf-toolbar core-bk-subbar">
          <span className="core-surf-tb-lbl">{daySub}</span>
          <input
            className="core-inp core-bk-datefield"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Booking day"
          />
          <div className="core-sp" />
          <button type="button" className="core-bk-toolbtn" onClick={() => void openForecast()} title="Pre-service forecast">
            <span aria-hidden>◔</span> Forecast
          </button>
          <button type="button" className="core-bk-toolbtn" onClick={() => setPolicyOpen(true)} title="Seating engine policy">
            <span aria-hidden>⚙</span> Policy
          </button>
          <button type="button" className="core-bk-toolbtn walk" onClick={() => setWalkOpen(true)} title="Seat a walk-in">
            <span aria-hidden>+</span> Walk-in
          </button>
          <button
            type="button"
            className="core-bk-newpill"
            onClick={() => {
              nameRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
              nameRef.current?.focus();
            }}
          >
            <span aria-hidden>+</span> New reservation
          </button>
        </div>
        <div className="core-crumb">
          CORE — BOOK · RESERVATIONS · <b>liquid glass</b> · <span className="fix">timeline view</span>
        </div>
        <div className="core-sectionhead">
          <h1>Book &amp; Seat</h1>
          <span className="sub">{daySub} · dinner service · {loc}</span>
          <div className="core-sp" />
          <div className="core-bk-lenses" role="tablist" aria-label="View">
            {(["timeline", "floor", "arrivals"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={viewMode === m} className={viewMode === m ? "on" : undefined} onClick={() => setViewMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </div>
        {/* dense-console 6-up stat strip — every figure from the day's reservations (Rule #1). */}
        <div className="core-statstrip" role="group" aria-label="Booking metrics">
          <div className="cell">
            <span className="lab">Bookings today</span>
            <span className="val">{bookStat.bookings}</span>
            <span className="delta">{dineInSlots.length} slot{dineInSlots.length === 1 ? "" : "s"}</span>
          </div>
          <div className="cell">
            <span className="lab">Covers</span>
            <span className="val brand">{bookStat.covers}</span>
            <span className="delta">booked</span>
          </div>
          <div className="cell">
            <span className="lab">Seated</span>
            <span className="val info">{bookStat.seated}</span>
            <span className="delta">on the floor</span>
          </div>
          <div className="cell">
            <span className="lab">Upcoming</span>
            <span className="val">{bookStat.upcoming}</span>
            <span className="delta">{bookStat.nextUp ? `next ${bookStat.nextUp}` : "none pending"}</span>
          </div>
          <div className="cell">
            <span className="lab">No-shows</span>
            <span className={bookStat.noShows > 0 ? "val danger" : "val"}>{bookStat.noShows}</span>
            <span className={bookStat.noShows > 0 ? "delta dn" : "delta"}>{bookStat.noShows > 0 ? "today" : "clean"}</span>
          </div>
          <div className="cell">
            <span className="lab">Fill</span>
            <span className="val basil">{bookStat.fill}<small>%</small></span>
            <span className="delta">of seats</span>
          </div>
        </div>
        {viewMode === "timeline" && (
        <>
        {/* timeline panel (left) — the tlbar header + the tables×ticks grid,
            grouped so the new-reservation form can sit as a right rail. */}
        <div className="core-book-tlpanel">
        <div className="core-book-tlbar">
          <span className="t">Reservations timeline</span>
          <div className="core-tl-legend">
            <span><i className="cf" /> confirmed</span>
            <span><i className="se" /> seated</span>
            <span><i className="pe" /> pending</span>
            <span><i className="cx" /> conflict</span>
          </div>
        </div>
        <div className="core-bk-tlscroll">
          <div className="core-bk-tlcols" style={{ "--cols": COLS } as CSSProperties}>
            <div className="core-bk-hours">
              <div className="hc" />
              {ticks.map((m, i) => <div key={m} className={`hc${i % 2 === 0 ? " hh" : ""}`}>{fmtHM(m)}</div>)}
            </div>
            {tables.length === 0 ? (
              <div className="core-ctx-empty pad">No tables configured.</div>
            ) : (
              sortedTables.map((t) => {
                const rows = dayRes.filter((r) => r.tableId === t.id);
                const clashing = rows.filter((r) => conflictIds.has(r.id));
                return (
                  <div
                    key={t.id}
                    className="core-bk-row"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { const r = dayRes.find((x) => x.id === dragId); if (r) void reassign(r, t.id); setDragId(null); }}
                  >
                    <div className="lbl">{tLabel(t.number)}</div>
                    {ticks.map((m, i) => <div key={m} className={`tick${i % 2 === 0 ? " hh" : ""}`} />)}
                    {rows.map((r) => {
                      const startTick = (toMin(r.time) - OPEN) / TICK_MIN;
                      const cs = Math.max(0, startTick);
                      if (cs >= COLS) return null;
                      const spanTicks = (r.durationMin ?? DURATION_MIN) / TICK_MIN;
                      const cspan = Math.max(0.5, Math.min(COLS - cs, spanTicks - (cs - startTick)));
                      const left = LBL_W + cs * TICK_W;
                      const width = cspan * TICK_W - 4;
                      const conflict = conflictIds.has(r.id);
                      const tone = r.status === "seated" ? "seated" : "pending";
                      const elapsed = isToday && r.status === "seated" ? Math.max(0, nowMin - toMin(r.time)) : null;
                      const context = r.status === "seated" ? (elapsed != null ? `seated · ${elapsed}m` : "seated") : "pending confirm";
                      const stackCls = conflict ? (clashing.indexOf(r) % 2 === 0 ? " conflict top" : " conflict bot") : ` ${tone}`;
                      return (
                        <div
                          key={r.id}
                          draggable
                          className={`core-bk-blk${stackCls}`}
                          style={{ left: `${left}px`, width: `${width}px` }}
                          onDragStart={() => setDragId(r.id)}
                          title={`${r.customerName} · ${r.partySize} · ${r.time}${conflict ? " · CONFLICT" : ""}`}
                        >
                          {conflict ? (
                            <span className="bn">{r.customerName} · {r.partySize} · ⚠ clash</span>
                          ) : (
                            <>
                              <span className="bn">{r.customerName} · {r.partySize}</span>
                              <span className="bm">{context}</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
        </div>{/* /core-book-tlpanel */}

        {/* new reservation — right rail (mockup) */}
        <div className="core-book-form">
          <div className="core-bk-resvh">
            <div className="t">New reservation</div>
            <div className="s">{daySub} · {loc}</div>
          </div>
          <div className="core-bk-resvb">

            <div className="core-bk-field">
              <div className="core-bk-flab"><span>Slot</span><span className="mut">tinted by capacity</span></div>
              {loading ? (
                <div className="core-ctx-empty">Loading slots…</div>
              ) : dineInSlots.length === 0 ? (
                <div className="core-ctx-empty">No dine-in slots for this day.</div>
              ) : (
                <div className="core-bk-slotchips">
                  {dineInSlots.map((s) => {
                    const fill = s.maxOrders > 0 ? s.currentOrders / s.maxOrders : 0;
                    const tier = fill >= 1 ? "full" : fill >= 0.85 ? "warm" : fill >= 0.6 ? "mid" : "ok";
                    const on = slotId === s.id;
                    return (
                      <button key={s.id} className={`core-bk-slotchip ${on ? "on" : tier}`} onClick={() => setSlotId(s.id)} title={`${s.currentOrders}/${s.maxOrders} booked`}>
                        {s.time}<small>{s.currentOrders}/{s.maxOrders}</small>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="core-bk-field">
              <div className="core-bk-flab"><span>Party size</span></div>
              <div className="core-bk-partyrow">
                <div className="core-covers">
                  <button onClick={() => setPartyN((n) => Math.max(1, n - 1))} aria-label="Fewer">−</button>
                  <span className="mono">{partyN}</span>
                  <button onClick={() => setPartyN((n) => Math.min(20, n + 1))} aria-label="More">+</button>
                </div>
                <span className="hint">seats {partyN} · needs {partyN}-top+</span>
              </div>
            </div>

            <div className="core-bk-field">
              <div className="core-bk-flab"><span>Guest needs</span><span className="mut">filters tables</span></div>
              <div className="core-bk-needs">
                {TABLE_FEATURES.map((f) => (
                  <button key={f} type="button" className={`core-bk-need${needs.includes(f) ? " on" : ""}`} onClick={() => toggleNeed(f)} aria-pressed={needs.includes(f)}>
                    {f === "accessible" ? "♿ accessible" : f === "high-chair" ? "🍼 high-chair" : "▭ step-free"}
                  </button>
                ))}
              </div>
            </div>

            <div className="core-bk-field">
              <div className="core-bk-flab"><span>Table</span><span className="mut">{selectedSlot ? `live fit for ${partyN}` : `needs ${partyN}-top+`}</span></div>
              {tables.length === 0 ? (
                <div className="core-ctx-empty">No tables configured.</div>
              ) : (
                <div className="core-bk-tpicks">
                  {sortedTables.map((t) => {
                    const sug = suggByTable.get(t.id);
                    const isRec = t.id === recTableId;
                    const on = tableId === t.id;
                    let tag: string;
                    let dim = false;
                    let title: string;
                    if (sug) {
                      // engine-driven — a slot gives us a seating time to rank against
                      dim = !sug.ok;
                      tag = sug.isRecommended ? "✨ Recommend" : sug.ok ? "fits" : sug.excludedReason ?? "unavailable";
                      title = sug.ok ? `${sug.score} pts · ${sug.reasons.join(" · ")}` : sug.excludedReason ?? "unavailable";
                    } else {
                      // pre-slot fallback — plain capacity/availability check
                      const st = tableState(t);
                      if (t.status === "out-of-service") { tag = "out of service"; dim = true; }
                      else if (t.seats < partyN) { tag = "too small"; dim = true; }
                      else if (!st.ok) { tag = "booked"; dim = true; }
                      else tag = isRec ? "✨ Recommend" : "fits";
                      title = st.label;
                    }
                    const focus = selected?.kind === "table" && selected.id === t.id;
                    return (
                      <button
                        key={t.id}
                        className={`core-bk-tpick${on ? " on" : ""}${dim ? " dim" : ""}${isRec && !dim ? " rec" : ""}${focus ? " is-focus" : ""}`}
                        disabled={dim && !override}
                        onClick={() => pickTable(t.id)}
                        title={title}
                      >
                        <span className="tn">{tLabel(t.number)}</span>
                        <span className="tc">{t.seats}-top{t.zone ? ` · ${t.zone}` : ""}</span>
                        <span className="tfit">{tag}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Table joins — surfaced only when no single table fits the party.
                  Picking one seats the primary + holds the rest together. */}
              {joins.length > 0 && (
                <div className="core-bk-joins">
                  <div className="core-bk-flab" style={{ marginTop: 4 }}><span>Combine tables</span><span className="mut">no single table fits {partyN}</span></div>
                  {joins.map((j) => {
                    const on = joinSel?.tableIds.join(",") === j.tableIds.join(",");
                    return (
                      <button key={j.tableIds.join("-")} type="button" className={`core-bk-join${on ? " on" : ""}`} onClick={() => pickJoin(j)} title={j.reason}>
                        <span className="jn">{j.tableIds.map((_, i) => tLabel(j.numbers[i])).join(" + ")}</span>
                        <span className="jc">{j.seats} seats{j.zone ? ` · ${j.zone}` : ""}</span>
                        <span className="jfit">{on ? "✓ combined" : "combine"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Signals — the engine's score, laid open. Answers "why this
                  table?" with the weighted contribution of each signal + the
                  human reasons, so the pick is never a black box. */}
              {shownSug && shownSug.ok && (
                <div className="core-bk-signals">
                  <div className="sg-head">
                    <span className="sg-t">Why {tLabel(shownSug.number)}</span>
                    <span className="sg-score">{shownSug.score}<small>/100</small></span>
                    {policy?.shadowMode && <span className="sg-shadow" title="Advisory only — shadow mode is on">shadow</span>}
                  </div>
                  <div className="sg-bars">
                    {([
                      ["fit", shownSug.breakdown.fit],
                      ["runway", shownSug.breakdown.runway],
                      ["guest", shownSug.breakdown.guest],
                      ["pacing", shownSug.breakdown.pacing],
                      ["yield", shownSug.breakdown.yield],
                      ["section", shownSug.breakdown.section],
                    ] as const).map(([k, v]) => (
                      <div key={k} className="sg-bar">
                        <span className="sg-k">{k}</span>
                        <span className="sg-track"><span className={`sg-fill ${k}`} style={{ width: `${Math.min(100, Math.round(v))}%` }} /></span>
                        <span className="sg-v">{Math.round(v)}</span>
                      </div>
                    ))}
                  </div>
                  {/* Confidence + the learned turn travel WITH the pick, so the host
                      knows when to trust the engine and when to use judgement. */}
                  <div className="sg-facts">
                    <span className="sg-fact"><span className="fk">confidence</span><span className="fv">{Math.round(shownSug.confidence * 100)}%</span></span>
                    <span className="sg-fact"><span className="fk">expected turn</span><span className="fv">{shownSug.expectedTurnMin}<small>±{shownSug.turnBandMin}m</small></span></span>
                    <span className="sg-fact"><span className="fk">frees at</span><span className="fv">{String(Math.floor((shownSug.freesAtMin % 1440) / 60)).padStart(2, "0")}:{String(shownSug.freesAtMin % 60).padStart(2, "0")}</span></span>
                  </div>
                  {shownSug.reasons.length > 0 && (
                    <div className="sg-reasons">{shownSug.reasons.map((r, i) => <span key={i} className="sg-reason">{r}</span>)}</div>
                  )}
                </div>
              )}
            </div>

            <div className="core-bk-field">
              <div className="core-bk-flab"><span>Guest</span></div>
              <input ref={nameRef} className="core-inp core-bk-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest surname — e.g. Kowalski" />
              <input className="core-inp core-bk-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone — e.g. +48 512 340 118" />
              {guestProfile && (
                <div className="core-bk-guestmatch">
                  {guestProfile.vip && <span className="gm-vip">★ VIP</span>}
                  <span className="gm-txt">
                    {guestProfile.name ? `${guestProfile.name} · ` : ""}{guestProfile.visits} prior visit{guestProfile.visits === 1 ? "" : "s"}
                    {guestProfile.usualTableLabel ? ` · usual ${tLabel(guestProfile.usualTableLabel)}` : ""}
                  </span>
                  {name.trim() === "" && guestProfile.name && (
                    <button type="button" className="gm-use" onClick={() => setName(guestProfile.name!)}>use name</button>
                  )}
                </div>
              )}
              <input className="core-inp core-bk-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="High chair, window…" />
            </div>

            {selectedSlot?.minSpendGrosze ? (
              <div className="core-bk-minspend">
                <span>Slot minimum: <b>{Math.round(selectedSlot.minSpendGrosze / 100)} zł</b> to book this slot.</span>
              </div>
            ) : null}

            <label className="core-ov">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              Override conflicts & capacity
            </label>

            {/* Override reason — captured only when you pick a table the engine
                didn't recommend AND learn-from-overrides is on. Feeds the nudge. */}
            {policy?.learnFromOverrides && tableId && recTableId && tableId !== recTableId && (
              <div className="core-bk-orsn">
                <div className="core-bk-flab"><span>Why not {tableLabel(recTableId)}?</span><span className="mut">tunes the engine</span></div>
                <div className="core-bk-orsnchips">
                  {OVERRIDE_REASONS.map((rn) => (
                    <button key={rn} type="button" className={`core-bk-orsnchip${overrideReason === rn ? " on" : ""}`} onClick={() => setOverrideReason((cur) => (cur === rn ? null : rn))}>
                      {rn.replace("-", " ")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button className="core-bk-bookbtn" disabled={!canBook} onClick={() => void book()}>
              {canBook && selectedSlot ? `✓ Book table · ${selectedSlot.time} · ${tableLabel(tableId)} · ${partyN}` : "✓ Book slot + table"}
            </button>
          </div>
        </div>
        </>
        )}

        {/* FLOOR lens — spatial live occupancy from the shared TableSession
            spine: reservations AND off-book floor walk-ins, one truth. */}
        {viewMode === "floor" && (
          <section className="core-bk-floorlens">
            <div className="core-bk-floorhead">
              <span className="t">Floor · live</span>
              <span className="sm">now {nowHM} · {seatedCount} seated · tap a free table to seat a walk-in</span>
            </div>
            {tables.length === 0 ? (
              <div className="core-ctx-empty pad">No tables configured.</div>
            ) : (
              <div className="core-bk-floorgrid">
                {sessions.map((sess) => {
                  const { table: t, reservation: r } = sess;
                  const meta = <span className="ft-t">{t.seats}-top{t.zone ? ` · ${t.zone}` : ""}</span>;
                  // Seated off a booking — the party is named. Tap the tile to
                  // open its POS check; Complete clears it.
                  if (sess.state === "seated" && r) {
                    return (
                      <div key={t.id} role="button" tabIndex={0} className="core-bk-ftile seated tappable" onClick={() => openCheck(t.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCheck(t.id); } }} title="Open check">
                        <div className="ft-h"><span className="tn">{tLabel(t.number)}</span>{meta}</div>
                        <div className="ft-who">{r.customerName} · {r.partySize}</div>
                        <div className="ft-sub">seated · {sess.seatedMin ?? 0}m · {sess.source === "walk-in" ? "walk-in" : "booking"}</div>
                        <div className="ft-acts">
                          <button className="prim" onClick={(e) => { e.stopPropagation(); openCheck(t.id); }}>🧾 Check</button>
                          <button disabled={acting === r.id} onClick={(e) => { e.stopPropagation(); void setResStatus(r, "completed", "Completed"); }}>Complete</button>
                        </div>
                      </div>
                    );
                  }
                  // Seated off-book from the legacy floor — a walk-in with a POS
                  // tab but no reservation. Tap to open its check.
                  if (sess.state === "seated") {
                    return (
                      <div key={t.id} role="button" tabIndex={0} className="core-bk-ftile seated offbook tappable" onClick={() => openCheck(t.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCheck(t.id); } }} title="Open check">
                        <div className="ft-h"><span className="tn">{tLabel(t.number)}</span>{meta}</div>
                        <div className="ft-who">occupied</div>
                        <div className="ft-sub">walk-in · seated on floor</div>
                        <div className="ft-acts"><button className="prim" onClick={(e) => { e.stopPropagation(); openCheck(t.id); }}>🧾 Check</button></div>
                      </div>
                    );
                  }
                  // Booking's time has come, nobody sat them → Seat them here.
                  if (sess.state === "due" && r) {
                    return (
                      <div key={t.id} className="core-bk-ftile due">
                        <div className="ft-h"><span className="tn">{tLabel(t.number)}</span>{meta}</div>
                        <div className="ft-who">{r.customerName} · {r.partySize}</div>
                        <div className="ft-sub">due — not seated</div>
                        <div className="ft-acts">
                          <button className="prim" disabled={acting === r.id} onClick={() => void setResStatus(r, "seated", "Seated")}>Seat</button>
                        </div>
                      </div>
                    );
                  }
                  // Free but an imminent booking holds it — don't give it away.
                  if (sess.state === "held" && sess.heldBy) {
                    const h = sess.heldBy;
                    return (
                      <div key={t.id} className="core-bk-ftile held">
                        <div className="ft-h"><span className="tn">{tLabel(t.number)}</span>{meta}</div>
                        <div className="ft-who mut">free</div>
                        <div className="ft-ribbon">◷ {h.customerName} · {h.time} · in {toMin(h.time) - nowMin}m</div>
                      </div>
                    );
                  }
                  // Open — tap to seat a walk-in.
                  return (
                    <button key={t.id} type="button" className="core-bk-ftile free" onClick={() => { setWalkParty((n) => Math.min(t.seats, Math.max(2, n))); setWalkOpen(true); }} title="Seat a walk-in">
                      <div className="ft-h"><span className="tn">{tLabel(t.number)}</span>{meta}</div>
                      <div className="ft-who">free</div>
                      <div className="ft-sub">{sess.freeForMin === Infinity ? "open all night" : `open until ${fmtHM(nowMin + sess.freeForMin)}`}</div>
                      <div className="ft-acts"><span className="ft-seat">+ seat walk-in</span></div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ARRIVALS lens — the host queue: Expected · Walk-ins · Seated. */}
        {viewMode === "arrivals" && (
          <section className="core-bk-arrivals">
            <div className="acol">
              <div className="acolh"><span className="t">Expected</span><span className="c">{expected.length}</span></div>
              <div className="acolb">
                {expected.length === 0 ? <div className="core-ctx-empty pad">Nothing due.</div> : expected.map((r) => {
                  const late = isToday && toMin(r.time) < nowMin;
                  return (
                    <div key={r.id} className={`apc${late ? " late" : ""}`}>
                      <div className="r1"><span className="nm">{r.customerName} · {r.partySize}</span><span className="tm">{r.time}{late ? " · late" : ""}</span></div>
                      <div className="r2">◈ {resTableLabel(r)}{r.notes ? ` · ${r.notes}` : ""}</div>
                      <div className="aact">
                        <button className="prim" disabled={acting === r.id} onClick={() => void setResStatus(r, "seated", "Seated")}>Seat</button>
                        <button disabled={acting === r.id} onClick={() => void setResStatus(r, "no-show", "No-show")}>No-show</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="acol">
              <div className="acolh"><span className="t">Waitlist</span><span className="c">{waiting.length}</span></div>
              <div className="acolb">
                {/* Add to the queue — a live engine quote for the wait. */}
                <div className="core-bk-wladd">
                  <input className="core-inp" value={waitName} onChange={(e) => setWaitName(e.target.value)} placeholder="Name (optional)" />
                  <div className="core-covers sm">
                    <button onClick={() => setWaitPartyN((n) => Math.max(1, n - 1))} aria-label="Fewer">−</button>
                    <span className="mono">{waitPartyN}</span>
                    <button onClick={() => setWaitPartyN((n) => Math.min(20, n + 1))} aria-label="More">+</button>
                  </div>
                  <button className="core-bk-wlqbtn" disabled={acting === "wl-add"} onClick={() => void addToWaitlist()} title={addQuote == null ? "no table fits this party" : `quote ~${addQuote}m`}>
                    + {addQuote == null ? "no fit" : `wait ~${addQuote}m`}
                  </button>
                </div>
                {waiting.length === 0 ? (
                  <div className="core-ctx-empty pad">Queue empty.</div>
                ) : waiting.map((w, i) => {
                  const q = quoteFor(w.partySize, i, w.needs);
                  const canSeat = q === 0;
                  return (
                    <div key={w.id} className="apc waitc">
                      <div className="r1"><span className="nm">{w.customerName} · {w.partySize}</span><span className={`tm${canSeat ? " ready" : ""}`}>{q == null ? "no fit" : q === 0 ? "table ready" : `~${q}m`}</span></div>
                      <div className="r2">quoted ~{w.quotedMin}m · waiting {Math.max(0, nowMin - toMin(new Date(w.addedAt).toTimeString().slice(0, 5)))}m</div>
                      <div className="aact">
                        <button className="prim" disabled={acting === `wl-${w.id}` || q == null} onClick={() => void seatFromWaitlist(w)}>Seat</button>
                        <button disabled={acting === `wl-${w.id}`} onClick={() => void removeFromWaitlist(w, "left")}>Left</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="acol">
              <div className="acolh"><span className="t">Seated</span><span className="c">{seatedList.length}</span></div>
              <div className="acolb">
                {seatedList.length === 0 ? <div className="core-ctx-empty pad">Nobody seated.</div> : seatedList.map((r) => {
                  const mins = Math.max(0, nowMin - toMin(r.time));
                  return (
                    <div key={r.id} className="apc seatedc">
                      <div className="r1"><span className="nm">{r.customerName} · {r.partySize}</span><span className="tm">{resTableLabel(r)} · {mins}m</span></div>
                      <div className="r2">{r.source === "walk-in" ? "walk-in" : "from booking"}</div>
                      <div className="aact"><button disabled={acting === r.id} onClick={() => void setResStatus(r, "completed", "Completed")}>Complete</button></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* today's bookings — full-width blist */}
        <div className="core-bk-divlabel">Today&apos;s bookings — chronological · tap a row to open on the timeline</div>
        <section className="core-bk-blist">
          <div className="core-bk-blisth">
            <span className="t">Today&apos;s bookings</span>
            <span className="badge">{bookStat.bookings} total · {bookStat.upcoming} upcoming</span>
          </div>
          {bookingList.length === 0 ? (
            <div className="core-ctx-empty pad">No bookings yet for this day.</div>
          ) : (
            bookingList.map((r) => {
              const sm = listStat[r.status] ?? { c: "", l: r.status };
              const busy = acting === r.id;
              return (
                <div className="core-bk-brow" key={r.id} onClick={() => selectRow(r)}>
                  <span className="btm">{r.time}</span>
                  <span className="bnm">{r.customerName}{r.source === "walk-in" ? <span className="bwalk"> walk-in</span> : null}</span>
                  <span className="bcov">{r.partySize} cov</span>
                  <span className="btbl">{resTableLabel(r)}</span>
                  <span className={`bstat ${sm.c}`}>{sm.l}</span>
                  <span className="bacts" onClick={(e) => e.stopPropagation()}>
                    {r.status === "booked" && (
                      <>
                        <button className="bact seat" disabled={busy} onClick={() => void setResStatus(r, "seated", "Seated")}>Seat</button>
                        <button className="bact" disabled={busy} onClick={() => void setResStatus(r, "no-show", "No-show")}>No-show</button>
                      </>
                    )}
                    {r.status === "seated" && (
                      <button className="bact done" disabled={busy} onClick={() => void setResStatus(r, "completed", "Completed")}>Complete</button>
                    )}
                  </span>
                  <button className="bcancel" onClick={(e) => { e.stopPropagation(); void cancel(r.id); }} aria-label="Cancel">✕</button>
                </div>
              );
            })
          )}
        </section>

        {/* Walk-in — engine-guarded seating for a party with no booking */}
        <CoreDialog open={walkOpen} onClose={() => setWalkOpen(false)} title="Seat a walk-in">
          <div className="core-bk-walk">
            <div className="core-bk-flab"><span>Party size</span><span className="mut">now {String(Math.floor(nowMin / 60)).padStart(2, "0")}:{String(nowMin % 60).padStart(2, "0")}</span></div>
            <div className="core-bk-partyrow">
              <div className="core-covers">
                <button onClick={() => setWalkParty((n) => Math.max(1, n - 1))} aria-label="Fewer">−</button>
                <span className="mono">{walkParty}</span>
                <button onClick={() => setWalkParty((n) => Math.min(20, n + 1))} aria-label="More">+</button>
              </div>
              <span className="hint">engine ranks safe tables · reserved-soon guarded</span>
            </div>
            <div className="core-bk-flab" style={{ marginTop: 12 }}><span>Table</span><span className="mut">live fit for {walkParty}</span></div>
            {tables.length === 0 ? (
              <div className="core-ctx-empty">No tables configured.</div>
            ) : (
              <div className="core-bk-tpicks">
                {walkSuggestions.map((s) => (
                  <button
                    key={s.tableId}
                    className={`core-bk-tpick${!s.ok ? " dim" : ""}${s.isRecommended ? " rec" : ""}`}
                    disabled={!s.ok || acting === `walk-${s.tableId}`}
                    onClick={() => { const t = tables.find((x) => x.id === s.tableId); if (t) void seatWalkIn(t); }}
                    title={s.ok ? `${s.score} pts · ${s.reasons.join(" · ")}` : s.excludedReason}
                  >
                    <span className="tn">{tLabel(s.number)}</span>
                    <span className="tc">{s.seats}-top{s.zone ? ` · ${s.zone}` : ""}</span>
                    <span className="tfit">{s.isRecommended ? "✨ Recommend" : s.ok ? "fits" : s.excludedReason}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CoreDialog>

        {/* Pre-service forecast — the book run against the floor before doors open */}
        <CoreDialog open={simOpen} onClose={() => setSimOpen(false)} title="Pre-service forecast">
          {simBusy ? (
            <div className="core-ctx-empty pad">Running the book…</div>
          ) : !sim ? (
            <div className="core-ctx-empty pad">Could not run the forecast.</div>
          ) : (
            <div className="core-bk-sim">
              <div className="core-bk-simkpis">
                <div className="cell"><span className="v">{sim.bookings}</span><span className="k">bookings</span></div>
                <div className="cell"><span className="v">{sim.covers}</span><span className="k">covers</span></div>
                <div className="cell"><span className={sim.peakOccupancyPct >= 90 ? "v danger" : "v"}>{sim.peakOccupancyPct}<small>%</small></span><span className="k">peak{sim.peakAtMin != null ? ` · ${String(Math.floor(sim.peakAtMin / 60)).padStart(2, "0")}:${String(sim.peakAtMin % 60).padStart(2, "0")}` : ""}</span></div>
                <div className="cell"><span className={sim.atRisk.length ? "v danger" : "v basil"}>{sim.atRisk.length}</span><span className="k">at risk</span></div>
              </div>
              <div className="core-bk-simhead">Table occupancy through service</div>
              <div className="core-bk-simchart">
                {sim.buckets.map((b) => (
                  <div key={b.atMin} className="simcol" title={`${b.label} · ${b.occupancyPct}% · ${b.occupiedTables} tables`}>
                    <div className="simbar-track"><div className={`simbar${b.occupancyPct >= 90 ? " hot" : b.occupancyPct >= 70 ? " warm" : ""}`} style={{ height: `${Math.max(2, b.occupancyPct)}%` }} /></div>
                    <span className="simx">{b.label.endsWith(":00") ? b.label.slice(0, 2) : ""}</span>
                  </div>
                ))}
              </div>
              <div className="core-bk-simhead">At-risk bookings {sim.atRisk.length === 0 && <span className="ok">— all clear ✓</span>}</div>
              {sim.atRisk.length > 0 && (
                <div className="core-bk-simrisks">
                  {sim.atRisk.map((a) => (
                    <div key={a.id} className="simrisk">
                      <span className="rt">{a.time}</span>
                      <span className="rn">{a.customerName} · {a.partySize}</span>
                      <span className="rr">{a.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CoreDialog>

        {/* Seating engine policy — manager-tunable weights + rules (Rule #7: saves immediately) */}
        <CoreDialog open={policyOpen} onClose={() => setPolicyOpen(false)} title="Seating engine policy">
          {policy && storedPolicy ? (
            <div className="core-bk-policy">
              <div className="core-bk-flab"><span>Preset</span><span className="mut">{turnModel && Object.keys(turnModel.cells).length ? "learning turn-times ✓" : "default turn-times"}</span></div>
              {turnAccuracy && turnAccuracy.n > 0 && (
                <div className="core-bk-turnacc">
                  Turn model over {turnAccuracy.n} closes: <b>±{turnAccuracy.maeMin}m</b> avg error · {turnAccuracy.withinBandPct}% in band · {turnAccuracy.biasMin === 0 ? "no bias" : `${turnAccuracy.biasMin > 0 ? "+" : ""}${turnAccuracy.biasMin}m ${turnAccuracy.biasMin > 0 ? "longer" : "shorter"} than predicted`}
                </div>
              )}
              <div className="core-bk-presets">
                {(Object.keys(POLICY_PRESETS) as PolicyPreset[]).map((p) => (
                  <button key={p} className={`core-bk-preset${storedPolicy.preset === p && !storedPolicy.overrides ? " on" : ""}`} onClick={() => setPreset(p)}>{p.replace(/-/g, " ")}</button>
                ))}
              </div>
              <div className="core-bk-flab" style={{ marginTop: 16 }}><span>Weights</span><span className="mut">relative · auto-normalised</span></div>
              {(["fit", "runway", "guest", "pacing", "yield", "section"] as (keyof SeatingWeights)[]).map((k) => (
                <label key={k} className="core-bk-slider">
                  <span className="sl-k">{k}</span>
                  <input type="range" min={0} max={0.5} step={0.02} value={policy.weights[k]} onChange={(e) => setWeight(k, Number(e.target.value))} />
                  <span className="sl-v">{Math.round(policy.weights[k] * 100)}%</span>
                </label>
              ))}
              <div className="core-bk-flab" style={{ marginTop: 16 }}><span>Rules</span></div>
              <div className="core-bk-rules">
                <label>Reset buffer<input className="core-inp" type="number" min={0} max={60} value={policy.resetBufferMin} onChange={(e) => setRule("resetBufferMin", Number(e.target.value))} /><span>min</span></label>
                <label>Pace cap<input className="core-inp" type="number" min={1} max={20} value={policy.paceCapPer15} onChange={(e) => setRule("paceCapPer15", Number(e.target.value))} /><span>/15m</span></label>
                <label>Large table<input className="core-inp" type="number" min={3} max={20} value={policy.largeTableSeats} onChange={(e) => setRule("largeTableSeats", Number(e.target.value))} /><span>seats</span></label>
                <label>Section cap<input className="core-inp" type="number" min={0} max={20} value={policy.sectionCapPer15} onChange={(e) => setRule("sectionCapPer15", Number(e.target.value))} /><span>/zone/15m</span></label>
                <label>Reserved grace<input className="core-inp" type="number" min={0} max={60} value={policy.reservedGraceMin} onChange={(e) => setRule("reservedGraceMin", Number(e.target.value))} /><span>min past</span></label>
                <label>Big-table release<input className="core-inp" type="number" min={0} max={120} value={policy.protectLargeReleaseMin} onChange={(e) => setRule("protectLargeReleaseMin", Number(e.target.value))} /><span>min before</span></label>
              </div>

              <div className="core-bk-flab" style={{ marginTop: 16 }}><span>Guards</span><span className="mut">tap to toggle · saves instantly</span></div>
              <div className="core-bk-toggles">
                {([
                  ["protectLargeTables", "Protect large tables", "small parties never take a big top when a smaller one is free"],
                  ["autoSuggest", "Auto-suggest", "pre-select the engine's pick so you book in one tap"],
                  ["learnFromOverrides", "Learn from overrides", "log recommended-vs-chosen to measure the override rate"],
                  ["shadowMode", "Shadow mode", "advisory only — the engine recommends but never auto-applies"],
                ] as const).map(([k, label, hint]) => (
                  <button key={k} type="button" className={`core-bk-toggle${policy[k] ? " on" : ""}`} onClick={() => setToggle(k, !policy[k])} aria-pressed={policy[k]}>
                    <span className="tg-sw" aria-hidden><span className="tg-dot" /></span>
                    <span className="tg-txt"><span className="tg-l">{label}</span><span className="tg-h">{hint}</span></span>
                  </button>
                ))}
              </div>

              <div className="core-bk-flab" style={{ marginTop: 16 }}><span>VIP hold</span><span className="mut">zones kept for VIPs</span></div>
              {zoneList.length === 0 ? (
                <div className="core-ctx-empty">No zones on the floor to hold.</div>
              ) : (
                <div className="core-bk-vipzones">
                  {zoneList.map((z) => {
                    const on = policy.vipHoldZones.some((v) => v.toLowerCase() === z.toLowerCase());
                    return (
                      <button key={z} type="button" className={`core-bk-vipzone${on ? " on" : ""}`} onClick={() => toggleVipZone(z)} aria-pressed={on}>
                        {on ? "★ " : ""}{z}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Trust loop — the real override rate, so shadow mode can prove the
                  engine before it drives. No fabricated numbers (Rule #1). */}
              <div className="core-bk-flab" style={{ marginTop: 16 }}><span>Trust loop</span><span className="mut">recommended vs. chosen</span></div>
              <div className="core-bk-trust">
                {decisionSummary && decisionSummary.n > 0 ? (
                  <>
                    <div className="tr-cell"><span className="tr-v">{Math.round(decisionSummary.agreeRate * 100)}<small>%</small></span><span className="tr-k">agreement</span></div>
                    <div className="tr-cell"><span className="tr-v">{decisionSummary.n}</span><span className="tr-k">seats logged</span></div>
                    <div className="tr-cell"><span className="tr-v">{decisionSummary.overrides}</span><span className="tr-k">overrides</span></div>
                    {decisionSummary.shadow > 0 && <div className="tr-cell"><span className="tr-v">{decisionSummary.shadow}</span><span className="tr-k">in shadow</span></div>}
                  </>
                ) : (
                  <div className="core-ctx-empty" style={{ margin: 0 }}>No seats logged yet — turn on Learn from overrides, then book to build trust.</div>
                )}
              </div>
              {decisionSummary?.topReason && (
                <div className="core-bk-trustnote">Most overrides: <b>{decisionSummary.topReason.reason.replace("-", " ")}</b> ({decisionSummary.topReason.count})</div>
              )}
              {decisionSummary?.nudge && (
                <div className="core-bk-nudge">
                  <span aria-hidden>◇</span> Operators override the engine on <b>{decisionSummary.nudge.signal}</b> {Math.round(decisionSummary.nudge.share * 100)}% of the time — consider lowering its weight.
                </div>
              )}
            </div>
          ) : (
            <div className="core-ctx-empty pad">Loading policy…</div>
          )}
        </CoreDialog>
      </div>

      {/* The table's POS check, docked over the Floor lens — the same embedded
          CorePos the standalone Floor uses. Portaled to the .core root so the
          fixed panel escapes any stacking context (Rule #4). */}
      {checkTableId && coreRoot && createPortal(
        <div
          className="core-check-overlay"
          role="dialog"
          aria-label="Table check"
          onClick={(e) => { if (e.target === e.currentTarget) setCheckTableId(null); }}
        >
          <div className="core-check-panel">
            <CorePos
              embedded
              menusByLocation={menusByLocation}
              upsellByLocation={upsellByLocation}
              initialTableId={checkTableId}
              onClose={() => { setCheckTableId(null); void load(); }}
            />
          </div>
        </div>,
        coreRoot,
      )}
    </CoreShell>
  );
}
