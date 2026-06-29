# OttavianoKDS — on-device verification runbook

> **Why this exists.** Everything upstream of the SwiftUI pixels is verified in
> the backend repo: the `/api/v1` facade is **smoke-tested live** (every admin GET
> 200s for an appropriately-roled token; owner-only surfaces 403 a manager and
> 200 an owner; a kitchen token is 403'd from manager surfaces), the parity gates
> (`check:native`, `api-v1-openapi`) are green, and the Swift is consistency-checked
> (every new endpoint method + detail/toolbar view resolves). **SwiftUI itself
> can't run in the Linux container** — this is the one step that needs a Mac/iPad.
> Walk it side-by-side with `npm run dev` (web) on a second screen.

## 0 · Setup
1. Backend: `npm run dev` in this repo (filesystem store seeds Kraków + Warszawa).
2. App: open the extracted `ottaviano-ios` repo in Xcode (or `xcodegen` here),
   set `OTTAVIANO_API_BASE_URL` to your dev host's `…/api/v1`.
3. Run **OttavianoKDS** on an iPad simulator; sign in as an **owner** (sees all 54
   surfaces) — then repeat key checks as **manager** and **kitchen** to confirm
   the rail role-gate.

## 1 · Shell (every screen)
- [ ] Identity header shows the signed-in name + role + on-shift dot; tap → Account sheet.
- [ ] Search bar filters the rail live on label **and** blurb; prompt counts reachable surfaces.
- [ ] Nav rows show the icon chip; **SOC 2** + **Capabilities** carry the scaffold wrench.
- [ ] **Role-gate:** as kitchen the rail collapses to ~3 surfaces; as manager the owner sections (Users, Multi-location, Permissions, Regulatory, Expansion, Manage locations) disappear.

## 2 · Detail drill-in (tap a row → sheet)
| Surface | Expect in the sheet |
|---|---|
| Customers | VIP chip + recency + points on the row; sheet: lifetime/orders/points/avg tiles, contact, member-since, notes, opt-out badges |
| Staff | rate/role tiles, contact, hire date, status badge |
| Guest | identity + contact + signed-up / birthday tiles |
| Suppliers | contact + lead-time tile + notes |
| Stock | on-hand/par/reorder tiles + **adjust** (below) |

## 3 · Write actions (the data must change + the list refresh)
- [ ] **Stock adjust** (Stock → row): ± the stepper, "→ N on hand" preview tracks; **Apply** → row's on-hand changes, sheet stays correct. (Manager+; a kitchen token surfaces a 403 message.)
- [ ] **Slot capacity/status** (Service → row): capacity stepper floored at the booked count; Active toggle flips draft⇄active; **Save** persists.
- [ ] **Event status** (Events → row): tap a status chip (scheduled→live→done→cancelled); badge + list update.
- [ ] **Compliance renew** (Compliance → row): tap +6mo/+1yr/+2yr; Expires + Last-renewed update; an expired item flips to Valid.
- [ ] **Schedule status** (Schedule → row): tap a status chip; persists.
- [ ] **New handover** (Shift handover → toolbar +): location · shift segmented · managers · the safety toggles · comment → **Record** → appears at the top of the list.
- [ ] Existing writes still work: HACCP/Waste/Cash/Announcements (toolbar create), Feedback/Purchase-orders/Tasks/Menu-86 (per-row).

## 4 · Analytics + ⓘ explainers (Rule #12)
- [ ] **Reports**: 14-day revenue **bar chart**, fulfilment **ring + legend**, top-seller **bars**.
- [ ] Each KPI's **ⓘ** opens a sheet with **all five** sections in order: description → **INSTITUTIONAL ANALYSIS** → **IN PLAIN TERMS** → **TIPS — HOW TO PUSH THIS LEVER** → **METHODOLOGY — HOW THIS IS DETERMINED**.
- [ ] **Dashboard** money KPIs (board revenue, avg ticket) carry the same ⓘ.

## 5 · KDS sound + kiosk (the hardware step)
- [ ] **Chime**: with the toolbar **sound** on, create an order (web checkout or POS) → the board rings once on the new ticket + a haptic (on a device that has one). Toggle sound off → silence. Opening the board with N tickets does **not** burst-ring (chimeArmed).
- [ ] **Mute respects the hardware switch** (system sound).
- [ ] **Kiosk**: toolbar **Kiosk** → nav bar + status bar + home indicator hide, board goes full-bleed, the floating ✕ exits. Screen **stays awake** while kiosk is on (idle timer disabled), and idle timer is restored on exit / leaving the screen.

## 6 · Regression sanity (already-live surfaces)
- [ ] KDS three lanes + bump + recall + pause + 86 sheet + Fleet (owner) still render.
- [ ] POS counter sale + tabs + coursing + charge; Orders board scope/channel/search + settle + print.

---
**Record results inline** (check the boxes, note any drift vs. the web route).
Anything that fails here is a SwiftUI-layer bug to fix in the `ottaviano-ios`
repo; the data/contract layer is already green in this repo's CI.
