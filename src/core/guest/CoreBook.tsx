"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreShell } from "@/core/shell/CoreShell";
import { useSelection } from "@/core/shell/SelectionContext";
import { useCoreToast } from "@/core/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import { findReservationConflicts } from "@/lib/floor";
import type { FloorTable, Reservation, TimeSlot } from "@/data/types";
import { guestTabs } from "./guestTabs";

const DURATION_MIN = 90;
const RES_HOLDS = new Set<Reservation["status"]>(["booked", "seated"]);

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Core · Guest · Book — slot + table in one move, wired to the same engine
 * as today's /core/guest/book (shared with Service): GET slots / floor tables /
 * reservations, create via POST /api/admin/booking, cancel via DELETE
 * /api/admin/floor/reservations. Conflicts via the pure findReservationConflicts.
 */
export function CoreBook({ standalone = false }: { standalone?: boolean } = {}) {
  const toast = useCoreToast();
  const { selected } = useSelection();
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
  const [loading, setLoading] = useState(true);

  const [slotId, setSlotId] = useState<string | null>(null);
  const [partyN, setPartyN] = useState(2);
  const [tableId, setTableId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [override, setOverride] = useState(false);
  const [booking, setBooking] = useState(false);

  const load = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    try {
      const [s, t, r] = await Promise.all([
        fetch(`/api/admin/slots?location=${encodeURIComponent(loc)}&date=${date}`).then((x) => (x.ok ? x.json() : [])),
        fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`).then((x) => (x.ok ? x.json() : [])),
        fetch(`/api/admin/floor/reservations?location=${encodeURIComponent(loc)}&date=${date}`).then((x) => (x.ok ? x.json() : [])),
      ]);
      setSlots(Array.isArray(s) ? s : s.slots ?? []);
      setTables(Array.isArray(t) ? t : t.tables ?? []);
      setReservations(Array.isArray(r) ? r : r.reservations ?? []);
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

  const recommend = () => {
    const fit = tables.filter((t) => tableState(t).ok).sort((a, b) => a.seats - b.seats)[0];
    if (fit) setTableId(fit.id);
    else toast(`Nothing open for a party of ${partyN}`, "danger");
  };

  const todays = useMemo(() => [...reservations].filter((r) => RES_HOLDS.has(r.status)).sort((a, b) => a.time.localeCompare(b.time)), [reservations]);
  const tableLabel = (id?: string) => tables.find((t) => t.id === id)?.number ?? "—";
  const canBook = !!selectedSlot && !!tableId && !!name.trim() && partyN >= 1 && !booking;

  const book = async () => {
    if (!selectedSlot || !tableId) return;
    setBooking(true);
    try {
      const res = await fetch(`/api/admin/booking?location=${encodeURIComponent(loc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: selectedSlot.id, tableId, customerName: name.trim(), customerPhone: phone.trim() || undefined, partySize: partyN, durationMin: DURATION_MIN, notes: notes.trim() || undefined, override }),
      });
      if (res.ok) {
        toast(`Booked · ${name.trim()} · ${partyN}p · ${selectedSlot.time}`, "success");
        setName("");
        setPhone("");
        setNotes("");
        setTableId(null);
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

  // --- Timeline (tables × hours) ---------------------------------------
  const OPEN = 11 * 60, CLOSE = 23 * 60, SPAN = CLOSE - OPEN;
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const hours = Array.from({ length: (CLOSE - OPEN) / 60 + 1 }, (_, i) => 11 + i);
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

  return (
    <CoreShell
      eyebrow={standalone ? "Book" : "Guest Engagement"}
      tabs={standalone ? undefined : guestTabs("book")}
    >
      <div className="core-book">
        <div className="core-crumb">
          CORE — BOOK · RESERVATIONS · <b>liquid glass</b> · <span className="fix">timeline view</span>
        </div>
        <div className="core-sectionhead">
          <h1>Book · Timeline</h1>
          <span className="sub">{loc} · {date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toLowerCase() : "today"} · dinner service</span>
          <div className="core-sp" />
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
            <span className="val basil">{bookStat.upcoming}</span>
            <span className="delta">{bookStat.nextUp ? `next ${bookStat.nextUp}` : "none pending"}</span>
          </div>
          <div className="cell">
            <span className="lab">No-shows</span>
            <span className={bookStat.noShows > 0 ? "val danger" : "val"}>{bookStat.noShows}</span>
            <span className={bookStat.noShows > 0 ? "delta dn" : "delta"}>{bookStat.noShows > 0 ? "today" : "clean"}</span>
          </div>
          <div className="cell">
            <span className="lab">Fill</span>
            <span className="val amber">{bookStat.fill}<small>%</small></span>
            <span className="delta">of seats</span>
          </div>
        </div>
        {/* Date picker lives on the surface — the mockup's guest command bar
            carries the inbox tools + WhatsApp-live only, no date field. */}
        <div className="core-surf-toolbar">
          <span className="core-surf-tb-lbl">Day</span>
          <input className="core-inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ height: 32 }} />
        </div>
        {/* timeline panel (left) — the tlbar header + the tables×hours grid,
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
        <div className="core-book-timeline">
          <div className="core-tl-head">
            <div className="core-tl-corner">Tables ↓ · Hours →</div>
            <div className="core-tl-hours">
              {hours.map((h) => <div key={h} className="core-tl-hr">{h}:00</div>)}
            </div>
          </div>
          <div className="core-tl-body">
            {tables.length === 0 ? (
              <div className="core-ctx-empty pad">No tables configured.</div>
            ) : (
              tables.map((t) => (
                <div
                  key={t.id}
                  className="core-tl-row"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { const r = dayRes.find((x) => x.id === dragId); if (r) void reassign(r, t.id); setDragId(null); }}
                >
                  <div className="core-tl-label">{t.number}<span className="s">{t.seats}p</span></div>
                  <div className="core-tl-track">
                    {hours.slice(0, -1).map((h) => <div key={h} className="core-tl-cell" />)}
                    {dayRes.filter((r) => r.tableId === t.id).map((r) => {
                      const left = Math.max(0, ((toMin(r.time) - OPEN) / SPAN) * 100);
                      const width = Math.max(4, Math.min(100 - left, ((r.durationMin ?? DURATION_MIN) / SPAN) * 100));
                      return (
                        <div
                          key={r.id}
                          draggable
                          className={`core-tl-block ${r.status === "seated" ? "seated" : "confirmed"}${conflictIds.has(r.id) ? " conflict" : ""}`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          onDragStart={() => setDragId(r.id)}
                          title={`${r.customerName} · ${r.partySize}p · ${r.time}${conflictIds.has(r.id) ? " · CONFLICT" : ""}`}
                        >
                          <b>{r.customerName}</b><span>{r.partySize}p · {r.time}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        </div>{/* /core-book-tlpanel */}

        {/* new reservation — right rail (mockup) */}
        <div className="core-book-form">
          <h4 className="core-profile-h">Dine-in slot</h4>
          {loading ? (
            <div className="core-ctx-empty">Loading slots…</div>
          ) : dineInSlots.length === 0 ? (
            <div className="core-ctx-empty">No dine-in slots for this day.</div>
          ) : (
            <div className="core-pks">
              {dineInSlots.map((s) => (
                <button key={s.id} className={slotId === s.id ? "core-pk on" : "core-pk"} onClick={() => setSlotId(s.id)}>
                  {s.time}
                </button>
              ))}
            </div>
          )}

          <h4 className="core-profile-h">Party size</h4>
          <div className="core-covers" style={{ width: "fit-content" }}>
            <button onClick={() => setPartyN((n) => Math.max(1, n - 1))} aria-label="Fewer">−</button>
            <span className="mono">{partyN}</span>
            <button onClick={() => setPartyN((n) => Math.min(20, n + 1))} aria-label="More">+</button>
          </div>

          <h4 className="core-profile-h">
            Table
            <button className="core-btn ghost sm" style={{ marginLeft: "auto" }} onClick={recommend}>✨ Recommend</button>
          </h4>
          {tables.length === 0 ? (
            <div className="core-ctx-empty">No tables configured.</div>
          ) : (
            <div className="core-pks">
              {tables.map((t) => {
                const st = tableState(t);
                return (
                  <button key={t.id} className={`core-pk ${tableId === t.id ? "on" : ""} ${st.ok ? "" : "off"}${selected?.kind === "table" && selected.id === t.id ? " is-focus" : ""}`} disabled={!st.ok && !override} onClick={() => setTableId(t.id)} title={st.label}>
                    {t.number}
                    <span className="sub">{st.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <h4 className="core-profile-h">Guest</h4>
          <div className="core-book-fields">
            <input className="core-inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest name" />
            <input className="core-inp" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48…" />
            <input className="core-inp" style={{ gridColumn: "1 / -1" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="High chair, window…" />
          </div>

          <div className="core-book-actions">
            <label className="core-ov">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              Override conflicts & capacity
            </label>
            <button className="core-btn primary" disabled={!canBook} onClick={() => void book()}>
              ✓ Book slot + table
            </button>
          </div>
        </div>

        {/* today's bookings */}
        <aside className="core-book-side">
          <h4 className="core-profile-h">Booked · {todays.length}</h4>
          {todays.length === 0 ? (
            <div className="core-ctx-empty">No bookings yet for this day.</div>
          ) : (
            <div className="core-svc-list">
              {todays.map((r) => (
                <div className="core-svc-res" key={r.id}>
                  <span className="t mono">{r.time}</span>
                  <div className="m">
                    <div className="nm">{r.customerName}</div>
                    <div className="core-cust-sub">{r.partySize}p · table {tableLabel(r.tableId)}</div>
                  </div>
                  <button className="x" onClick={() => void cancel(r.id)} aria-label="Cancel">✕</button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </CoreShell>
  );
}
