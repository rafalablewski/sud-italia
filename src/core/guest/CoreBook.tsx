"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CoreShell } from "@/core/shell/CoreShell";
import { useSelection } from "@/core/shell/SelectionContext";
import { useCoreToast } from "@/core/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import { findReservationConflicts } from "@/lib/floor";
import type { FloorTable, Reservation, TimeSlot } from "@/data/types";
import { guestTabs } from "./guestTabs";

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
 * Core · Guest · Book — slot + table in one move, wired to the same engine
 * as today's /core/guest/book (shared with Service): GET slots / floor tables /
 * reservations, create via POST /api/admin/booking, cancel via DELETE
 * /api/admin/floor/reservations. Conflicts via the pure findReservationConflicts.
 */
export function CoreBook({ standalone = false }: { standalone?: boolean } = {}) {
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
  const [loading, setLoading] = useState(true);

  const [slotId, setSlotId] = useState<string | null>(null);
  const [partyN, setPartyN] = useState(2);
  const [tableId, setTableId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [override, setOverride] = useState(false);
  const [booking, setBooking] = useState(false);
  // The subbar's "New reservation" pill jumps focus to the guest field.
  const nameRef = useRef<HTMLInputElement>(null);

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

  const sortedTables = useMemo(() => [...tables].sort(byTableNumber), [tables]);
  const tableLabel = (id?: string) => {
    const n = tables.find((t) => t.id === id)?.number;
    return n ? tLabel(n) : "—";
  };
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

  // Best-fit table (smallest that seats the party & is free) — the row that
  // wears the ✨ Recommend tag in the pick list.
  const recTableId = useMemo(
    () => tables.filter((t) => tableState(t).ok).sort((a, b) => a.seats - b.seats)[0]?.id ?? null,
    [tables, tableState],
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
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <CoreShell
      eyebrow={standalone ? "Book" : "Guest Engagement"}
      tabs={standalone ? undefined : guestTabs("book")}
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
          <h1>Book · Timeline</h1>
          <span className="sub">{daySub} · dinner service · {loc}</span>
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
              <div className="core-bk-flab"><span>Table</span><span className="mut">{selectedSlot ? `live fit for ${partyN}` : `needs ${partyN}-top+`}</span></div>
              {tables.length === 0 ? (
                <div className="core-ctx-empty">No tables configured.</div>
              ) : (
                <div className="core-bk-tpicks">
                  {sortedTables.map((t) => {
                    const st = tableState(t);
                    const isRec = t.id === recTableId;
                    const on = tableId === t.id;
                    let tag: string;
                    let dim = false;
                    if (t.status === "out-of-service") { tag = "out of service"; dim = true; }
                    else if (t.seats < partyN) { tag = "too small"; dim = true; }
                    else if (!st.ok) { tag = selectedSlot ? `booked ${selectedSlot.time}` : "booked"; dim = true; }
                    else tag = isRec ? "✨ Recommend" : "fits";
                    const focus = selected?.kind === "table" && selected.id === t.id;
                    return (
                      <button
                        key={t.id}
                        className={`core-bk-tpick${on ? " on" : ""}${dim ? " dim" : ""}${isRec && !dim ? " rec" : ""}${focus ? " is-focus" : ""}`}
                        disabled={dim && !override}
                        onClick={() => setTableId(t.id)}
                        title={st.label}
                      >
                        <span className="tn">{tLabel(t.number)}</span>
                        <span className="tc">{t.seats}-top{t.zone ? ` · ${t.zone}` : ""}</span>
                        <span className="tfit">{tag}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="core-bk-field">
              <div className="core-bk-flab"><span>Guest</span></div>
              <input ref={nameRef} className="core-inp core-bk-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest surname — e.g. Kowalski" />
              <input className="core-inp core-bk-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone — e.g. +48 512 340 118" />
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

            <button className="core-bk-bookbtn" disabled={!canBook} onClick={() => void book()}>
              {canBook && selectedSlot ? `✓ Book table · ${selectedSlot.time} · ${tableLabel(tableId)} · ${partyN}` : "✓ Book slot + table"}
            </button>
          </div>
        </div>

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
              return (
                <div className="core-bk-brow" key={r.id} onClick={() => selectRow(r)}>
                  <span className="btm">{r.time}</span>
                  <span className="bnm">{r.customerName}</span>
                  <span className="bcov">{r.partySize} cov</span>
                  <span className="btbl">{tableLabel(r.tableId)}</span>
                  <span className={`bstat ${sm.c}`}>{sm.l}</span>
                  <button className="bcancel" onClick={(e) => { e.stopPropagation(); void cancel(r.id); }} aria-label="Cancel">✕</button>
                </div>
              );
            })
          )}
        </section>
      </div>
    </CoreShell>
  );
}
