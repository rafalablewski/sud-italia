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
2. **Status drives visibility everywhere downstream.** `StaffStatus` is
   `active` / `inactive` (in `AdminStaff`) — only `active` members appear
   in shift pickers, payroll, and the schedule board. Flipping someone to
   `inactive` is the soft-disable: they drop out downstream and any linked
   login is auto-disabled (see Login access). **Remove** hard-deletes the
   roster row; shift + time-punch history live in their own stores and are
   retained, and a linked login is disabled (never orphaned) so a removed
   person can't still sign in.
3. **Job titles are the hiring taxonomy; access tiers are derived.** The
   roster picks a concrete **job title** — `pizzaiolo` / `chef` / `kp` /
   `kitchen` / `waiter` / `front` / `manager` / `driver` / `courier`
   (`StaffRole` in `src/data/types.ts`). The title is mapped *once* to an
   access tier + landing surface in `src/lib/staff-roles.ts`
   (`staffRoleToAdminRole` / `landingPathForRole`): kitchen titles → the
   `kitchen` tier (lands on the **KDS**), floor + delivery → the `staff` tier
   (lands on the **POS**), manager → the `manager` tier (the dashboard).
   Never branch UI on a raw title — go through the helpers so the mapping has
   one home. `STAFF_ROLE_OPTIONS` is the grouped option list every title
   `<Select>` renders from.
4. **Time punches are immutable.** Once a punch is logged it can't be
   silently edited — only annotated, or voided with a reason captured
   in the audit log.
5. **Labour-hours is an estimate, not an oracle.** The 7-day labour
   total on `AdminStaff` is derived from real punches but is
   approximate (overtime rules, breaks, comp time aren't fully
   modelled). Frame it as "approximate labour hours" in the UI.

## Staff — `/admin/staff`

The roster: every person who can clock in — and where a manager **hires**
them and gives them a login.

- **Header:** `Staff` (h1), search input, status filter chips
  (`active` / `inactive`, with `all` reset). The primary reads **`Hire
  employee`** when the operator can provision logins (owner, or a manager
  with `staff.hire`), else `New staff member`.
- **Counts row:** active total, currently-clocked-in, ~7-day labour hours
  (estimate), 7-day labour cost.
- **Table:** name + contact, **job-title badge** (`<Badge tone={roleTone(role)}>`),
  **Login** column (`KDS` / `POS` / `Admin` chip when a login is linked, else
  `No login`), location, hourly rate, status badge, row actions (clock in /
  out, edit, remove).
- **Job-title badge tones** are derived from the title's group via
  `roleTone()` (`src/components/admin/AdminStaff.tsx`): `management → brand`,
  `kitchen → warning`, `floor → info`, `delivery → success`. The tone follows
  the group, never the individual title, so a pizzaiolo and a KP read the same
  colour.

### Login access (hire-with-login)

The hire/edit dialog carries an optional **Login access** section, shown only
when the operator holds `staff.hire` and the chosen title isn't `manager`
(manager/owner logins stay owner-only in **Users & roles**). Toggling it on
reveals: login email (defaults to the contact email), a password (min 8), and
a terminal **PIN** (4–10 digits, unique per location). On save the staff route
provisions a linked `AdminUser` via `provisionStaffLogin` — access tier and
landing surface come straight from the job title, the account is bound to the
staff member's location, and the link is written on both sides
(`AdminUser.staffId` is authoritative). A note in the section spells out the
landing surface ("lands on the Kitchen display (KDS)") so the manager sees
exactly where the new hire will end up. The server re-checks `staff.hire`,
the location scope, and the staff/kitchen tier ceiling — the UI gate is a
courtesy, not the enforcement.

When editing someone who **already** has a login, the section re-opens with
"New password / New PIN (optional)" fields — a manager resets credentials here
without involving the owner (left blank, the account re-saves unchanged). The
linked login also stays in **lock-step with roster status**: flipping a member
to `inactive` (or removing them) auto-disables their `AdminUser` so a former
employee can't sign in, and reactivating re-enables it. The account is
disabled, never deleted, so the audit trail keeps its actor.

- **Punch detail** is shown in the recent-punches list — date, in/out,
  member + title + location.

## Schedule — `/admin/schedule`

The week-grid shift board.

- **Header:** `Schedule` (h1), week navigator (← / today / →), role filter
  chips, `+ New shift` primary. (Site comes from the shell `ScopeSwitcher` in the
  topbar — no per-page location control, as of redesign Phase 2.)
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
