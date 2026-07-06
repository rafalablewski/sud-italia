"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The shared Core **date picker** — a day *stepper* (‹ prev-day · date face ·
 * next-day ›) whose face opens a portaled sheet: the big weekday·numeral·month
 * display, **Today / Tomorrow / +1 week** quick chips, and a full month grid.
 * Drops the OS-native `<input type=date>` popup for chrome that matches the
 * theme. ONE treatment across Book + Slots.
 *
 * The sheet is portaled to the `.core` theme root (Rule #4 — same discipline as
 * `CoreActionMenu`: overlays escape the toolbar's `overflow` clip via a portal
 * and inherit core tokens, never z-index alone). Dismisses on select · outside
 * click (the scrim) · Escape · scroll/resize.
 *
 * See `docs/design-system/core/theme/README.md` → `.core-datefield` /
 * `.core-df-*`.
 */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONFULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function parseIso(s: string): Date | null {
  const [y, m, d] = (s || "").split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
/** Whole-day difference b − a (both floored to local midnight). */
const dayDiff = (aIso: string, bIso: string): number | null => {
  const a = parseIso(aIso), b = parseIso(bIso);
  return a && b ? Math.round((b.getTime() - a.getTime()) / 86_400_000) : null;
};

function ChevLeft() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden><path d="m15 18-6-6 6-6" /></svg>;
}
function ChevRight() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden><path d="m9 18 6-6-6-6" /></svg>;
}

export function CoreDateField({
  value,
  onChange,
  ariaLabel = "Date",
  display,
  markedDates,
}: {
  /** ISO `yyyy-mm-dd`. */
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  /** Override the formatted display (defaults to `Sun 5 Jul`). */
  display?: string;
  /** ISO days to flag with a basil dot in the grid (e.g. days that carry
   *  bookings). Omit for a plain grid — never synthesise these. */
  markedDates?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [root, setRoot] = useState<Element | null>(null);
  // `today` is timezone-dependent, so seed it on the client only — a server
  // (UTC) value would mismatch the first client render and trip hydration. Held
  // as a Date (with the ISO derived) so the handlers don't re-parse a string.
  const [today, setToday] = useState<Date | null>(null);
  const todayIso = useMemo(() => (today ? toIso(today) : ""), [today]);
  // The month the grid shows; re-seeded from the value each time the sheet opens.
  const [month, setMonth] = useState<Date>(() => startOfMonth(parseIso(value) ?? new Date(2000, 0, 1)));
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRoot(document.querySelector(".core") ?? document.body);
    setToday(new Date());
  }, []);

  const sel = parseIso(value);
  const shown =
    display ??
    (sel ? sel.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "—");
  // Relative label for the collapsed face ("today" · "+2d") — only once the
  // client clock has seeded, so SSR and the first paint stay identical.
  const rel = useMemo(() => {
    if (!todayIso || !value) return "";
    const n = dayDiff(todayIso, value);
    if (n === null) return "";
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    if (n === -1) return "yesterday";
    return n > 0 ? `+${n}d` : `${n}d`;
  }, [todayIso, value]);

  const marked = useMemo(() => new Set(markedDates ?? []), [markedDates]);

  const step = (n: number) => {
    const base = sel ?? today ?? new Date();
    onChange(toIso(addDays(base, n)));
  };
  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };
  const jump = (offset: number) => {
    const base = today ?? new Date();
    pick(toIso(addDays(base, offset)));
  };

  const place = useCallback(() => {
    const b = wrapRef.current?.getBoundingClientRect();
    if (!b) return;
    const W = 300; // sheet width (matches --core-df-w)
    const left = Math.max(8, Math.min(b.left, window.innerWidth - W - 8));
    setPos({ top: b.bottom + 8, left });
  }, []);
  const toggle = () => {
    if (!open) {
      setMonth(startOfMonth(sel ?? today ?? new Date()));
      place();
    }
    setOpen((o) => !o);
  };

  // While open: Escape / scroll / resize dismiss (a fixed popover would drift).
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  // Keep the grid on the selected date's month when the value moves — e.g. the
  // header day-step arrows crossing a month boundary while the sheet is open.
  // Month-only browsing (the `.core-df-mbtn` arrows change `month`, not `value`)
  // doesn't trip this, so a browse is never yanked back.
  useEffect(() => {
    const d = parseIso(value);
    if (d) setMonth(startOfMonth(d));
  }, [value]);

  // 6×7 grid, Monday-first, for the shown month.
  const cells = useMemo(() => {
    const first = startOfMonth(month);
    const startPad = (first.getDay() + 6) % 7;
    const gridStart = addDays(first, -startPad);
    return Array.from({ length: 42 }, (_, i) => {
      const d = addDays(gridStart, i);
      return { iso: toIso(d), day: d.getDate(), out: d.getMonth() !== month.getMonth() };
    });
  }, [month]);

  const QUICK = [
    { label: "Today", off: 0 },
    { label: "Tomorrow", off: 1 },
    { label: "+1 week", off: 7 },
  ];

  return (
    <div ref={wrapRef} className="core-datefield core-datefield-pick" data-open={open || undefined}>
      <button type="button" className="core-df-step" onClick={() => step(-1)} aria-label="Previous day">
        <ChevLeft />
      </button>
      <button type="button" className="core-df-face" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-label={`${ariaLabel} — ${shown}`} title="Change date">
        <svg className="cal" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M8 2v4M16 2v4M3 8h18M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
        </svg>
        <span className="dv">{shown}</span>
        {rel && <span className="rel">{rel}</span>}
        <svg className="chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <button type="button" className="core-df-step" onClick={() => step(1)} aria-label="Next day">
        <ChevRight />
      </button>

      {open && root && pos &&
        createPortal(
          <div className="core-ovf-scrim" onMouseDown={() => setOpen(false)}>
            <div
              role="dialog"
              aria-label={ariaLabel}
              className="core-df-pop"
              style={{ top: pos.top, left: pos.left }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* stepper header */}
              <div className="core-df-head">
                <button type="button" className="core-df-nav" onClick={() => step(-1)} aria-label="Previous day"><ChevLeft /></button>
                <div className="core-df-disp">
                  <div className="dow">{sel ? DOW[sel.getDay()] : "—"}</div>
                  <div className="num">{sel ? sel.getDate() : "—"}</div>
                  <div className="mon">{sel ? `${MONFULL[sel.getMonth()]} ${sel.getFullYear()}` : ""}</div>
                </div>
                <button type="button" className="core-df-nav" onClick={() => step(1)} aria-label="Next day"><ChevRight /></button>
              </div>

              {/* quick chips */}
              <div className="core-df-chips">
                {QUICK.map((q) => {
                  const on = today && value === toIso(addDays(today, q.off));
                  return (
                    <button key={q.label} type="button" className={on ? "core-df-chip on" : "core-df-chip"} onClick={() => jump(q.off)}>
                      {q.label}
                    </button>
                  );
                })}
              </div>

              <div className="core-df-rule" />

              {/* month grid */}
              <div className="core-df-calhead">
                <span className="mlabel">{MONFULL[month.getMonth()]} {month.getFullYear()}</span>
                <div className="core-df-mnav">
                  <button type="button" className="core-df-mbtn" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month"><ChevLeft /></button>
                  <button type="button" className="core-df-mbtn" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month"><ChevRight /></button>
                </div>
              </div>
              <div className="core-df-grid" role="grid">
                {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => <div key={w} className="wd">{w}</div>)}
                {cells.map((c) => {
                  const cls = ["cell"];
                  if (c.out) cls.push("out");
                  if (c.iso === todayIso) cls.push("today");
                  if (c.iso === value) cls.push("sel");
                  return (
                    <button key={c.iso} type="button" className={cls.join(" ")} onClick={() => pick(c.iso)} aria-label={c.iso} aria-current={c.iso === value ? "date" : undefined}>
                      {c.day}
                      {marked.has(c.iso) && !c.out && <span className="bk" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          root,
        )}
    </div>
  );
}
