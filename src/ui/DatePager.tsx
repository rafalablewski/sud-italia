"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export type DatePagerUnit = "day" | "week";

interface Props {
  /** ISO date string (YYYY-MM-DD). For unit="week" this should be the Monday of the week. */
  value: string;
  onChange: (next: string) => void;
  unit: DatePagerUnit;
  className?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function weekStartIso(iso: string): string {
  const d = new Date(iso);
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return isoDate(d);
}

function formatLabel(iso: string, unit: DatePagerUnit): string {
  const d = new Date(iso);
  if (unit === "day") {
    return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  }
  const end = new Date(addDays(iso, 6));
  const sameMonth = d.getMonth() === end.getMonth();
  const startStr = d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: sameMonth ? undefined : "short",
  });
  const endStr = end.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  return `Week of ${startStr} – ${endStr}`;
}

/**
 * Unified date navigation pill used on Slots, Schedule, and any future
 * admin surface that needs ◀ date ▶. Four segments share one border so the
 * group reads as a single control. Clicking the date label opens the
 * native date picker; the "Today/This week" cell highlights when the value
 * already points to the current period.
 */
export function DatePager({ value, onChange, unit, className = "" }: Props) {
  const step = unit === "day" ? 1 : 7;
  const todayIso = isoDate(new Date());
  const currentPeriodStart = unit === "week" ? weekStartIso(todayIso) : todayIso;
  const isCurrent = value === currentPeriodStart;

  const goPrev = () => onChange(addDays(value, -step));
  const goNext = () => onChange(addDays(value, step));
  const goToday = () => onChange(currentPeriodStart);
  const pickDate = (raw: string) => {
    if (!raw) return;
    onChange(unit === "week" ? weekStartIso(raw) : raw);
  };

  return (
    <div className={`v2-date-pager ${className}`.trim()} role="group" aria-label="Date navigation">
      <Button
        variant="ghost"
        leadingIcon={<ChevronLeft className="h-3.5 w-3.5" />}
        onClick={goPrev}
        aria-label={unit === "week" ? "Previous week" : "Previous day"}
      />
      <label className="v2-date-pager-label">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
        <span>{formatLabel(value, unit)}</span>
        <input
          type="date"
          value={value}
          onChange={(e) => pickDate(e.target.value)}
          aria-label={unit === "week" ? "Pick week" : "Pick date"}
        />
      </label>
      <Button
        variant="ghost"
        className={isCurrent ? "is-current" : ""}
        onClick={goToday}
        aria-current={isCurrent || undefined}
      >
        {unit === "week" ? "This week" : "Today"}
      </Button>
      <Button
        variant="ghost"
        trailingIcon={<ChevronRight className="h-3.5 w-3.5" />}
        onClick={goNext}
        aria-label={unit === "week" ? "Next week" : "Next day"}
      />
    </div>
  );
}
