# Admin — People

← back to [Admin README](../README.md)

Two pages for the people who run the truck: who's on staff, who's
scheduled when.

| Page              | Code                                              | Role-gate |
| ----------------- | ------------------------------------------------- | --------- |
| `/admin/staff`    | `src/components/admin/AdminStaff.tsx`             | manager+  |
| `/admin/schedule` | `src/components/admin/AdminSchedule.tsx`          | manager+  |

## Common rules across the section

1. **One staff record = one person, chain-wide.** A staff member can
   work at multiple locations; the record lives once, scheduled per
   shift per location. Don't fork a record when someone picks up a
   Warszawa shift.
2. **Status drives visibility everywhere downstream.** `active` /
   `on-leave` / `archived` (in `AdminStaff`) — only `active` members
   appear in shift pickers, payroll, the schedule board. Archive is
   the deletion replacement (never hard-delete a person — payroll
   history depends on the record).
3. **Roles are the gating taxonomy.** `kitchen` / `front` / `manager` /
   `owner` map to the `nav.config.ts` `requiredRole` field — assigning a
   role here is what lets a person see their corner of admin.
4. **Time punches are immutable.** Once a punch is logged it can't be
   silently edited — only annotated, or voided with a reason captured
   in the audit log.
5. **Labour-hours is an estimate, not an oracle.** The 7-day labour
   total on `AdminStaff` is derived from real punches but is
   approximate (overtime rules, breaks, comp time aren't fully
   modelled). Frame it as "approximate labour hours" in the UI.

## Staff — `/admin/staff`

The roster: every person who can clock in.

- **Header:** `Staff` (h1), search input, status filter chips
  (`active` / `on-leave` / `archived`, with `all` reset), `+ Add staff
  member` primary.
- **Counts row:** active total, ~7-day labour hours (estimate), open
  shift count.
- **Table:** name + initials avatar, role badge
  (`<Badge tone={ROLE_TONE[role]}>`), status badge, default location,
  hourly rate (manager+ only), last punch timestamp, row actions
  (edit, archive / restore, view punches).
- **Role badge tones** are canonical: `kitchen → info`, `front →
  warning`, `manager → success`, `owner → brand`. Operators learn the
  colours; don't reassign.
- **Punch detail** opens in a side sheet — the 50 most recent punches
  with date, in/out, derived hours, optional reason annotation. Voiding
  a punch requires a manager note that lands in the audit log.

## Schedule — `/admin/schedule`

The week-grid shift board.

- **Header:** `Schedule` (h1), location switcher (the shared
  `LocationFilter` pill row), week navigator (← / today / →), role filter
  chips, `+ New shift` primary.
- **Body:** the 7-day grid — columns are days, rows are staff (active
  only, sorted by role then name). Each cell holds 0..n shift chips.
- **Shift chip:** time window (`9:00 – 17:00`), status badge with
  `STATUS_TONE` (`scheduled → warning`, `confirmed → info`, `worked →
  success`, `no-show → danger`), tap-to-edit.
- **Conflict detection:** the API returns `409` with a `violations`
  array when a new / edited shift overlaps an existing one or breaches
  a labour rule (max-consecutive-days, min-rest-between, role mismatch).
  The form surfaces violations inline and blocks save until resolved.
- **Quick assign:** dragging a shift chip to a different staff row
  reassigns; the API call resolves with an undo toast for misclicks.
- **Per-location.** A Kraków shift doesn't appear on the Warszawa
  schedule, but a person can have shifts on both — the chips stay with
  the schedule of the location they're worked at.

## What People is not

- It is **not** payroll — the labour-hours estimate here feeds a payroll
  export, but rates, withholdings, and pay periods are outside admin.
- It is **not** HR — onboarding documents, training records, performance
  reviews are not modelled.
- It is **not** customer-facing — guest-relationship surfaces live under
  Customers ([`customers.md`](./customers.md)) and the Core Guest hub.
- It is **not** the time clock — staff actually clock in via a dedicated
  surface (or POS / KDS station); People shows the resulting record but
  isn't where the punch happens.

People is the **operational roster and shift board** — who can do the
work, and when they're doing it.
