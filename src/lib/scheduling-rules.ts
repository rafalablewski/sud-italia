import type { Location, Shift, StaffMember } from "@/data/types";

export type ViolationSeverity = "error" | "warning";

export const SCHEDULING_VIOLATIONS = [
  "double_booking",
  "weekly_hours_cap",
  "under_18_alcohol",
  "missing_dob",
  "back_to_back",
] as const;

export type ViolationKind = (typeof SCHEDULING_VIOLATIONS)[number];

export interface SchedulingViolation {
  kind: ViolationKind;
  severity: ViolationSeverity;
  message: string;
  /** IDs of any related shifts (e.g. the conflicting shift for a double-booking). */
  relatedShiftIds?: string[];
}

/** EU 2003/88/EC Article 6: max 48 h/week including overtime, on average over 4 months.
 *  We use a single-week threshold as a soft-stop because the codebase has no quarterly
 *  rollup yet — that's a follow-up enhancement. */
const WEEKLY_HOURS_CAP = 48;

/** Polish Labor Code §190 ranges. Minors (<18) can't work in alcohol-serving
 *  hours and have a per-day cap. Stricter rules apply <16 but we treat the
 *  whole <18 group with one warning for now. */
const UNDER_18_DAILY_HOURS_CAP = 6;

/** "Back-to-back" warning: less than 11 h between consecutive shifts violates
 *  the standard EU rest rule. Important for retail / hospitality scheduling. */
const MIN_REST_HOURS = 11;

function ageInYearsOn(dobIso: string, ref: Date): number {
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return Number.NaN;
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const before =
    ref.getUTCMonth() < dob.getUTCMonth() ||
    (ref.getUTCMonth() === dob.getUTCMonth() && ref.getUTCDate() < dob.getUTCDate());
  if (before) age--;
  return age;
}

/** Number of hours a shift's [startAt, endAt] interval covers. Defensive
 *  against bad input — negative ranges return 0. */
function shiftHours(s: { startAt: string; endAt: string }): number {
  const a = new Date(s.startAt).getTime();
  const b = new Date(s.endAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return (b - a) / (1000 * 60 * 60);
}

function intervalsOverlap(a: { startAt: string; endAt: string }, b: { startAt: string; endAt: string }): boolean {
  return (
    new Date(a.startAt).getTime() < new Date(b.endAt).getTime() &&
    new Date(b.startAt).getTime() < new Date(a.endAt).getTime()
  );
}

/** ISO week start (Monday 00:00 UTC) — used to group shifts for the 48 h cap. */
function isoWeekStart(d: Date): number {
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = u.getUTCDay(); // 0 = Sun, 1 = Mon, …, 6 = Sat
  const offset = day === 0 ? -6 : 1 - day;
  u.setUTCDate(u.getUTCDate() + offset);
  return u.getTime();
}

/**
 * Validate a proposed shift against every existing shift, the staff record,
 * and the location's hours. Returns the list of violations (empty = clean).
 *
 * `error`-severity violations block scheduling; `warning`-severity ones are
 * surfaced to the manager but don't gate the API. This split keeps the
 * legal-liability cases hard (under-18 in alcohol hours, double-booking)
 * while staying flexible on softer recommendations (rest period).
 */
export function validateShift(
  proposed: Shift,
  existingShifts: Shift[],
  staff: StaffMember[],
  locations: Location[],
): SchedulingViolation[] {
  const violations: SchedulingViolation[] = [];
  const member = staff.find((s) => s.id === proposed.staffId);
  if (!member) {
    return [
      {
        kind: "missing_dob",
        severity: "error",
        message: `Staff member ${proposed.staffId} not found.`,
      },
    ];
  }

  // --- Double-booking: any existing shift for the same staffId that overlaps
  // and is not the same row (when updating in place).
  const sameStaffOthers = existingShifts.filter(
    (s) => s.staffId === proposed.staffId && s.id !== proposed.id,
  );
  const overlaps = sameStaffOthers.filter((s) => intervalsOverlap(s, proposed));
  if (overlaps.length > 0) {
    violations.push({
      kind: "double_booking",
      severity: "error",
      message: `${member.name} is already scheduled for an overlapping shift.`,
      relatedShiftIds: overlaps.map((s) => s.id),
    });
  }

  // --- Weekly hours cap: sum proposed + same-week existing.
  const weekStart = isoWeekStart(new Date(proposed.startAt));
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  let weeklyHours = shiftHours(proposed);
  for (const s of sameStaffOthers) {
    const t = new Date(s.startAt).getTime();
    if (t >= weekStart && t < weekEnd) {
      weeklyHours += shiftHours(s);
    }
  }
  if (weeklyHours > WEEKLY_HOURS_CAP) {
    violations.push({
      kind: "weekly_hours_cap",
      severity: "warning",
      message: `${member.name} would be scheduled for ${weeklyHours.toFixed(1)} h this week — over the EU 2003/88/EC 48 h cap.`,
    });
  }

  // --- Back-to-back rest period.
  for (const s of sameStaffOthers) {
    const aStart = new Date(proposed.startAt).getTime();
    const aEnd = new Date(proposed.endAt).getTime();
    const bStart = new Date(s.startAt).getTime();
    const bEnd = new Date(s.endAt).getTime();
    const gap =
      aStart > bEnd
        ? (aStart - bEnd) / (1000 * 60 * 60)
        : bStart > aEnd
          ? (bStart - aEnd) / (1000 * 60 * 60)
          : null;
    if (gap !== null && gap < MIN_REST_HOURS) {
      violations.push({
        kind: "back_to_back",
        severity: "warning",
        message: `${member.name} would have only ${gap.toFixed(1)} h rest between shifts (EU recommends ≥${MIN_REST_HOURS} h).`,
        relatedShiftIds: [s.id],
      });
      break;
    }
  }

  // --- Under-18 + alcohol-serving location.
  const location = locations.find((l) => l.slug === proposed.locationSlug);
  if (location?.servesAlcohol) {
    if (!member.dob) {
      violations.push({
        kind: "missing_dob",
        severity: "warning",
        message: `${member.name} has no date of birth on file; can't verify compliance with Polish Labor Code §190 for alcohol-serving hours.`,
      });
    } else {
      const age = ageInYearsOn(member.dob, new Date(proposed.startAt));
      if (Number.isFinite(age) && age < 18) {
        violations.push({
          kind: "under_18_alcohol",
          severity: "error",
          message: `${member.name} is ${age} — Polish Labor Code §190 prohibits under-18s during alcohol-serving hours.`,
        });
      } else if (Number.isFinite(age) && age < 18 && shiftHours(proposed) > UNDER_18_DAILY_HOURS_CAP) {
        violations.push({
          kind: "under_18_alcohol",
          severity: "error",
          message: `${member.name} is ${age} and this shift is ${shiftHours(proposed).toFixed(1)} h — minors are capped at ${UNDER_18_DAILY_HOURS_CAP} h/day.`,
        });
      }
    }
  }

  return violations;
}

/** Convenience: split a violation list into blocking and warning groups. */
export function partitionViolations(list: SchedulingViolation[]): {
  errors: SchedulingViolation[];
  warnings: SchedulingViolation[];
} {
  const errors: SchedulingViolation[] = [];
  const warnings: SchedulingViolation[] = [];
  for (const v of list) (v.severity === "error" ? errors : warnings).push(v);
  return { errors, warnings };
}
