"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Sparkles, Users } from "lucide-react";
import type { FloorTable, Reservation, TimeSlot } from "@/data/types";
import { findReservationConflicts } from "@/lib/floor";
import { useToast } from "../v2/ui/Toast";

/**
 * Book view — the unified slot+table booking console (body inside the Service
 * CoreShell). Pick a dine-in slot (live remaining capacity) + a table (lit up
 * live for fit/conflict via the same pure findReservationConflicts the server
 * enforces), then Book → POST /api/admin/booking. See
 * docs/design-system/core/modules/service.md.
 */

const RES_HOLDS = new Set<Reservation["status"]>(["booked", "seated"]);
const DURATION_MIN = 90;

const REASONS: Record<string, string> = {
  slot_not_found: "That slot no longer exists.",
  table_not_found: "That table no longer exists.",
  slot_inactive: "That slot isn't active.",
  slot_not_dinein: "That slot doesn't accept dine-in.",
  invalid_party: "Enter a valid party size.",
  table_too_small: "That table is too small for the party.",
  table_conflict: "That table is already booked for this time — tick Override to force it.",
  slot_full: "That slot is fully booked — tick Override to force it.",
};

export function BookView({ loc, date }: { loc: string; date: string }) {
  const toast = useToast();
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  const [slotId, setSlotId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [party, setParty] = useState("2");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [override, setOverride] = useState(false);
  const [booking, setBooking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, r] = await Promise.all([
        fetch(`/api/admin/slots?location=${loc}&date=${date}`).then((x) => (x.ok ? x.json() : [])),
        fetch(`/api/admin/floor/tables?location=${encodeURIComponent(loc)}`).then((x) => (x.ok ? x.json() : [])),
        fetch(`/api/admin/floor/reservations?location=${encodeURIComponent(loc)}&date=${date}`).then((x) => (x.ok ? x.json() : [])),
      ]);
      setSlots(Array.isArray(s) ? s : []);
      setTables(Array.isArray(t) ? t : []);
      setReservations(Array.isArray(r) ? r : []);
    } finally {
      setLoading(false);
    }
  }, [loc, date]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setSlotId(null);
    setTableId(null);
  }, [loc, date]);

  const partyN = Math.max(1, Math.min(50, Math.round(Number(party) || 0)));

  const dineInSlots = useMemo(
    () =>
      slots
        .filter((s) => s.status === "active" && s.fulfillmentTypes.includes("dine-in"))
        .sort((a, b) => a.time.localeCompare(b.time)),
    [slots],
  );

  const bookedBySlot = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reservations) {
      if (r.slotId && RES_HOLDS.has(r.status)) m.set(r.slotId, (m.get(r.slotId) ?? 0) + 1);
    }
    return m;
  }, [reservations]);

  const selectedSlot = dineInSlots.find((s) => s.id === slotId) ?? null;

  const tableState = useCallback(
    (t: FloorTable): { ok: boolean; label: string } => {
      if (t.status === "out-of-service") return { ok: false, label: "out of service" };
      if (t.seats < partyN) return { ok: false, label: `${t.seats} seats — too small` };
      if (!selectedSlot) return { ok: true, label: `${t.seats} seats` };
      const conflicts = findReservationConflicts(reservations, {
        id: "new",
        locationSlug: loc,
        tableId: t.id,
        date: selectedSlot.date,
        time: selectedSlot.time,
        durationMin: DURATION_MIN,
      });
      if (conflicts.length) return { ok: false, label: "booked this time" };
      return { ok: true, label: `${t.seats} seats${t.zone ? ` · ${t.zone}` : ""}` };
    },
    [selectedSlot, partyN, reservations, loc],
  );

  const recommend = () => {
    const fit = tables.filter((t) => tableState(t).ok).sort((a, b) => a.seats - b.seats)[0];
    if (fit) setTableId(fit.id);
    else toast.error("No table fits", `Nothing open for a party of ${partyN}.`);
  };

  const canBook = !!selectedSlot && !!tableId && !!name.trim() && partyN >= 1 && !booking;

  const book = async () => {
    if (!selectedSlot || !tableId) return;
    setBooking(true);
    try {
      const res = await fetch(`/api/admin/booking?location=${encodeURIComponent(loc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          tableId,
          customerName: name.trim(),
          customerPhone: phone.trim() || undefined,
          partySize: partyN,
          durationMin: DURATION_MIN,
          notes: notes.trim() || undefined,
          override,
        }),
      });
      if (res.ok) {
        toast.success("Booked", `${name.trim()} · ${partyN}p · ${selectedSlot.time}`);
        setName("");
        setPhone("");
        setNotes("");
        setTableId(null);
        setOverride(false);
        await load();
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = REASONS[j.error ?? ""] ?? j.error ?? "Could not book";
        toast.error(res.status === 409 ? "Conflict" : "Couldn't book", msg);
      }
    } finally {
      setBooking(false);
    }
  };

  const cancel = async (id: string) => {
    const res = await fetch(`/api/admin/floor/reservations?location=${encodeURIComponent(loc)}&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Booking cancelled");
      await load();
    } else toast.error("Could not cancel");
  };

  const todays = useMemo(
    () => [...reservations].filter((r) => RES_HOLDS.has(r.status)).sort((a, b) => a.time.localeCompare(b.time)),
    [reservations],
  );
  const tableLabel = (id?: string) => tables.find((t) => t.id === id)?.number ?? "—";

  return (
    <div className="svc">
      <div className="svc-grid">
        <section className="svc-form" aria-label="New booking">
          <div className="svc-block">
            <div className="eyebrow">When · pick a slot</div>
            {dineInSlots.length === 0 ? (
              <div className="pane-msg">No dine-in slots open on {date}. Open dine-in slots in the Slots view first.</div>
            ) : (
              <div className="filters">
                {dineInSlots.map((s) => {
                  const left = s.maxOrders - (bookedBySlot.get(s.id) ?? 0);
                  const full = left <= 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`fchip${slotId === s.id ? " on" : ""}${full ? " svc-full" : ""}`}
                      aria-pressed={slotId === s.id}
                      disabled={full && !override}
                      onClick={() => setSlotId(s.id)}
                    >
                      {s.time}
                      <span className="n">{full ? "full" : `${left} left`}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="svc-block">
            <div className="svc-block-head">
              <div className="eyebrow">Where · assign a table</div>
              <button type="button" className="btn ghost svc-rec" onClick={recommend} disabled={!selectedSlot}>
                <Sparkles width={13} height={13} /> Recommend
              </button>
            </div>
            <div className="filters">
              {tables.length === 0 ? (
                <div className="pane-msg">No tables yet. Add tables in the Floor view first.</div>
              ) : (
                tables.map((t) => {
                  const st = tableState(t);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`fchip${tableId === t.id ? " on" : ""}${st.ok ? "" : " svc-full"}`}
                      aria-pressed={tableId === t.id}
                      disabled={!st.ok && !override}
                      onClick={() => setTableId(t.id)}
                      title={st.label}
                    >
                      {t.number}
                      <span className="n">{t.seats}p</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="svc-block">
            <div className="eyebrow">Who</div>
            <div className="svc-fields">
              <label className="svc-field svc-party">
                <span><Users width={13} height={13} /> Party</span>
                <input type="number" className="input" min={1} max={50} value={party} onChange={(e) => setParty(e.target.value)} />
              </label>
              <label className="svc-field">
                <span>Name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest name" />
              </label>
              <label className="svc-field">
                <span>Phone</span>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48…" />
              </label>
              <label className="svc-field svc-wide">
                <span>Notes</span>
                <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="High chair, window…" />
              </label>
            </div>
          </div>

          <div className="svc-actions">
            <label className="svc-override">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              Override conflicts &amp; capacity
            </label>
            <button type="button" className="btn primary" disabled={!canBook} onClick={() => void book()}>
              <Check width={15} height={15} />
              {booking ? "Booking…" : "Book slot + table"}
            </button>
          </div>
        </section>

        <section className="svc-side" aria-label="Today's bookings">
          <div className="svc-block-head">
            <div className="eyebrow">Booked · {todays.length}</div>
            <button type="button" className="btn ghost icon" title="Refresh" onClick={() => void load()}>
              <RefreshCw className={loading ? "crm-spin" : ""} />
            </button>
          </div>
          {loading ? (
            <div className="pane-msg">Loading…</div>
          ) : todays.length === 0 ? (
            <div className="pane-msg">No bookings yet for this day.</div>
          ) : (
            <div className="svc-list">
              {todays.map((r) => (
                <div key={r.id} className="svc-res">
                  <span className="svc-res-time mono">{r.time}</span>
                  <div className="svc-res-main">
                    <div className="svc-res-name">{r.customerName}</div>
                    <div className="svc-res-meta">{r.partySize}p · table {tableLabel(r.tableId)}</div>
                  </div>
                  <span className={`badge ${r.status === "seated" ? "success" : "info"}`}>
                    <i className="d" />
                    {r.status}
                  </span>
                  <button type="button" className="svc-res-x" title="Cancel booking" onClick={() => void cancel(r.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
