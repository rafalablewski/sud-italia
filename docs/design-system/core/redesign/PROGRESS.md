# Service OS Redesign — Living Progress Tracker

> This is the **single place to follow the redesign**. It is updated in the same commit as any redesign work.
> Legend: ☐ not started · ◐ in progress · ☑ done · ⏸ blocked/awaiting decision.
> Companion: [`README.md`](./README.md) (the design spec).

Last updated: **2026-07-04** — unified header collapsed from four rows to a single `.core-surf-toolbar` **ActionBar** (identity · controls · actions); `CoreCrumb` + `CoreSectionHead` deleted; all 11 surfaces + theme/module docs synced. See the latest decision-log entry.

---

## Phase board

| # | Phase | Status | Notes |
|---|-------|--------|-------|
| 0 | Design spec (IA + flows + patterns) | ☑ | `README.md` |
| 1 | Feature-parity ledger (nothing may be lost) | ☑ | This file, below |
| 2 | Standalone HTML sketches for sign-off | ◐ | `/tests/sketches/service-os-*.html` (Liquid Glass) |
| 2b | Responsive sketches + web⇄mobile parity showcase | ☑ | phone = bottom tab bar + dock sheet; `service-os-responsive.html` |
| 2c | Deep-dive sketches (order detail · guest journey · service/handoff · booking/delivery) | ☑ | 4 more `service-os-*.html` in glass + responsive |
| 3 | **Sign-off gate** — user accepts sketches | ☑ | Approved; glass + responsive + parity locked |
| 3b | Liquid-glass material foundation (Core skin) | ☑ | `themes/core/skins/liquid-glass.css`, default skin, frosts all surfaces; KDS wall stays dark. Build green. |
| 4 | `<ServiceCanvas>` shell + Lens Rail + Command Bar | ● | **Left Lens Rail shipped** (`CoreNav` → `.core-rail`: left, icon-only 60px, expands to labels on hover) with exactly the four spec room lenses **Floor · Line · Pass · Book** (POS→"Line", KDS→"Pass" per the spec naming). **Book promoted to a top-level lens** (`/core/book`, `CoreBook standalone`) out of the Guest sub-nav — old `/core/guest/book` 308-redirects. Orders + Guest are reached from ⌘K (not room lenses), matching the IA spec's rail. Command bar reused. **Role-shaped default lens shipped:** `/core` now redirects by session role (`getCurrentRole`) — **kitchen → Pass (KDS)**, everyone else → Floor home base (finer FOH titles collapse to the "staff" tier, so can't be split further server-side). **PressureBadge shipped:** a live command-bar load indicator on every lens (`.core-pressure` in `CoreShell` — "{n} at-risk · line {m} · {k}m wall" from `GET /api/admin/pos/pressure`, the same predictive tier the KDS colours from), pulsing on warn/risk. **⌘K palette shipped:** a global command palette (`CommandPalette` in `CoreShell`, portaled per Rule #4; opens on ⌘K/Ctrl-K or the command-bar `.core-cmdk-trigger` chip) that resolves **lenses** (Floor/POS/KDS/Book/Orders/Dispatch/Guest), **floor tables** (by number), and **menu SKUs** (by name), running each as a client nav so cross-lens selection survives; arrow/enter/esc keyboard nav. Verified live (empty→7 lenses, "marg"→3 Margherita SKUs, "3"→Table 3, screenshotted). **Core handover shipped:** a one-tap shift snapshot (`CoreHandover`, opened via ⌘K → "Shift handover") **pre-filled from live state** — seated/open + occupancy + freeing (Floor Twin), at-risk/on-line + oldest ticket (pressure), comps this shift vs cap (comp-status) — with a link to the persisted manager sign-off at `/admin/handover`. Verified live (3/5 seated, 38%, 2/2 at-risk, 78m, 0/500 zł comps, screenshotted). **W9 complete.** |
| 5 | `<ContextDock>` (peek→expand, shared across lenses) | ☑ | **Shipped:** `SelectionContext` + `CoreDock`, wired from **Floor tile**, **POS active check** (standalone only), **KDS ticket header**. **Peek→expand** shows the captured line items (no fetch — each lens hands over what it has). POS auto-refreshes on its poll; Floor/KDS are snapshots until re-tapped. Additive / no-op default — zero regression. Build + 343 tests green. |
| 6 | Floor lens (tiles + Twin urgency + radial actions) | ◐ | **TableTile shipped:** tiles are **capacity-sized** (`.core-tbl2-wrap.sz-md/.sz-lg` — 6-tops span two columns + stand taller with a bigger numeral) and show **≤3 glance-facts** — number+covers, the status/dwell line, and a **single most-urgent chip** chosen by priority (allergy → unpaid → note → paid → open), instead of stacking every chip. Verified live (Kraków floor, 6-tops enlarged, screenshotted). **Zone tabs shipped** (`.core-zonetabs` / `.core-ztab` — All + one chip per zone with counts; jumps the floor to a single zone). **RadialActions shipped:** a table tap blooms a portaled state-aware verb menu (`.core-radial`, Rule #4) at the finger — seated → Open check · Free · Edit; free/reserved → Seat · Reserve · Edit; out-of-service → Restore · Edit — each wired to a real handler; the tap also feeds the dock. **Table admin** (rename / re-seat / zone / block via out-of-service status / delete) is the radial's **Edit** → the existing `TableDialog`. **Table move shipped:** the radial's **⇄ Move** verb (seated tables) enters a two-tap move mode — the source tile dashes (`.core-tbl2.is-moving`), the next tapped table is the destination, and a new `move` action on `POST /api/admin/floor-twin` reassigns the source's active dine-in orders (`updateOrder` tableId) and swaps table statuses (source→available, target→seated). Verified live (order + party moved table 3→5, states swapped, radial verb + move-mode cue). **Combine/merge** (one party across two tables) still needs a table-**group** model (a `groupId` on `FloorTable` + a spanning check) — a real data-model addition, honestly deferred (Rule #1). |
| 7 | Line lens (POS) on the shared dock | ◐ | **Real-time 86 shipped:** sold-out items (base-unavailable OR live-86'd) are no longer filtered out — they stay on the grid **greyed + struck (`.core-prod.sold-out`, `.core-tag.off` "86 · sold out") and sink to the bottom**, non-tappable, so the line never taps a gap but always sees it. Live via a 15s poll of `/api/admin/kds/eighty-six` (the kitchen's authoritative override list) — no reload. Verified live (86'd Diavola sank + greyed, screenshotted). **★ Popular/Smart category shipped:** a frequency-ranked first category (`.core-cat.pop`, ember fill), the ~8 SKUs that are the bulk of taps zero-scroll — from real orders for the current daypart (`GET /api/admin/pos/popular`, daypart-preferred with all-recent fallback), and the default landing category. (Also fixed a skin bug it surfaced: active category labels were invisible under liquid-glass because the skin makes `--panel` translucent and the base `.core-cat.on` used it as the label colour.) Verified live (5 warszawa sellers, screenshotted). **Smart-default fire shipped:** a coursed check's primary action fires the *earliest un-fired course* (`nextUnfiredCourse` → `Fire {course} →`) instead of the whole check, so the common case is a single confirm and later courses stay held. **Fire-moment upsell shipped:** the top `getCartSuggestions` offer is docked as a slim chip (`.core-fire-upsell`, "＋ Add {item} before firing? +zł") right above the Fire button before the check is sent — one tap adds it so it fires with the course. Remaining Line-lens item: dock `<CourseSpine>` (the per-course fire spine already exists *in the ticket* — MAINS/DRINKS + per-course Fire; the compact dock mirror lands with the W8 dock work). |
| 8 | Pass lens (KDS) + pressure-adaptive density | ◐ | **Shipped:** whole-card bump + long-press recall (`.core-tk.bumpable`, `prevStatus`), **SLA-urgency column sort** (`groupTicketsByColumn(…, nowMs)` — tone → slack → age), **large danger-red allergens** (never dimmed), held courses dimmed with ⊘, and **pressure-adaptive density** (`.core-kds.dense` on live risk tier — compacts cards, keeps safety, pulsing top rail). Verified live (allergen + dense screenshotted), 343 tests green. **Course auto-fire-next** deferred to milestone 10 (coursing/W4). |
| 9 | Book lens (timeline + live conflict) | ☑ | **Shipped:** a **timeline-over-tables grid** on `CoreBook` (`.core-book-timeline` — tables as rows, 11:00–23:00 as columns) with reservation **blocks positioned by time/duration**, a **live red-hatch on overlaps** (`.core-tl-block.conflict`, driven by `findReservationConflicts` per booking), and **drag-to-reassign** (drag a block to another table row → upsert via the reservations POST with `override`, conflict re-checks live). Verified live (4 blocks, 2 conflicts hatched, Tomasz dragged 9→5 and persisted). The booking form + list remain below. 343 tests green (Rule #11 doc: modules/service or guest). |
| 10 | `<CourseSpine>` + fire-moment upsell | ☐ | |
| 10a | **Deep-dive: Order & item detail** | ☑ | POS `LineEditorDialog` already covered modifiers/notes/comp/void; added the read-only declared-allergen row to match the sketch. |
| 10b | **Deep-dive: Guest ordering journey** | ☑ | Verified already built + live: `QrOrder` (browse→customize→cart→pay) → `OrderTracker` (live SSE status + 10s poll fallback, mirrors kitchen). No net-new change needed (would be cosmetic on the homepage theme). |
| 10c | **Deep-dive: Booking** | ☑ | Verified already built: `CoreBook` — slot + table in one move, live `findReservationConflicts`, create `POST /api/admin/booking`, cancel. |
| 10d | **Deep-dive: Delivery dispatch** | ☑ | **Shipped net-new:** `/core/service/dispatch` (`CoreDispatch`) + `/api/admin/dispatch` + `assignOrderDriver` store helper. Lists active delivery orders, one-tap driver assign (delivery-group staff), advance picked-up→delivered, live KPIs, 8s poll. Audit-logged, reuses the order model. Capabilities + service.md updated. Build + 343 tests green. |
| 10e | **Deep-dive: Service/timing/expo console** | ☐ | Still net-new. Handover exists (`/admin/handover`); KDS shows at-risk; Floor shows seating recommend. A *unified* timing-alert + expo/runner console remains optional. |
| 11 | `<TenderSheet>` (split/pay/comp + guard) | ◐ | **Shipped:** split **presets** (Whole · ÷2 · ÷3 · ÷4 · By seat, clamped to covers) replacing the stepper; comp **reason-code chips** = the audit enum **Quality · Wait · Goodwill · Error**; and a **live per-shift comp-cap meter** (`GET /api/admin/pos/comp-status` → the actor's real audit-log comp total vs the `refundControls` cap) — the bar turns danger and shows a 🔒 over-cap gate when the comp would breach (owners see a "caps don't apply" note; the server still enforces in `fireTab`). Verified live (reasons + presets + owner bypass screenshotted; endpoint returns the 500 zł cap). **By-item split shipped:** the tender sheet now receives the check's lines; a **By item** preset lets you assign each line to a payer (`.core-split-item` + per-line payer chips), and per-payer amounts are the assigned lines' weight × the actual total (tip/comp distribute proportionally, payments still sum to the charge). Verified live (Slice→Guest 1 12,90 zł, Limonata→Guest 2 23,90 zł). **Manager-PIN override shipped:** the over-cap gate now takes a **manager PIN** (`.cc-pin`) → threaded as `compOverridePin` through `parseTender` → `chargeTab`, where an over-cap comp settles **only** if the PIN resolves (server-side, never client-trusted) to an active **manager+** account via `findAdminUserByPin` (the same primitive behind terminal PIN login) with `ROLE_RANK ≥ manager`; the authoriser is stamped onto the `pos.comp` audit entry (`overrideAuthorizedBy`). 343 tests green (no regression to the charge/comp suite). W6 tender/comp **complete**. Line-item comp already exists via the line editor. |
| 12 | Guest sync (QR → same check, SSE mirror) | ☑ | **Guest → same check shipped.** A guest QR order now writes to the table's OPEN POS tab as **pending lines** (`PosTabLine.guestPending`), not a parallel order: new public `POST /api/pos/guest-order` finds/creates the table's dine-in tab and appends only available menu items (never fires/charges); the POS renders each guest line with a `🛎 guest` badge (`.ln-guest`) for the server to review & fire on the one check; the guest page (`QrOrder`) posts there for table orders and shows a "Sent to your table" confirmation. Verified end-to-end (QR place → endpoint → guestPending line on the tab → POS badge → "Sent" screen). The standalone `/api/checkout` path remains for non-table orders. The **guest live-status SSE mirror** (`OrderTracker`) already existed; the **Floor** flags guest orders live (`🛎 Guest ordered`). W8 complete. | **Guest live-status mirror already exists** (`OrderTracker` — the guest phone shows live, kitchen-mirrored status over SSE; verified in milestone 10b). **New staff-awareness shipped:** the Floor now flags a table with an active guest **QR order** via the shared order stream — a blue `🛎 Guest ordered` tile chip (`.core-tguest`) + a **soft toast** ("T{n} — guest ordered · review & fire") when a new one lands. Verified live (injected QR order → Table 3 badge). **Deferred (honestly):** folding the QR order into the *same* `PosTab` as a pending course (vs a standalone order in the settle queue) is a checkout/order-model refactor that handles money — not rushed at session end (Rule #8); the guest currently contributes via the standalone-order + QR-queue path, and the mirror + floor-awareness are real. |
| 13 | Micro-interactions + optimistic reconcile | ◐ | **Recoverable reject shipped:** a rejected charge no longer dead-ends — the tender sheet now stays **open** through the request and, on reject, **shakes** (`.core-tender.shake`, `@keyframes core-shake`, reduced-motion-guarded) with a recoverable toast ("{error} — try another tender?") so the operator retries on the same sheet. Verified live (forced 400 → shake + sheet stays + toast). The optimistic-mutation/rollback/offline-outbox plumbing already existed. |
| 14 | Cross-lens selection persistence + entity event bus | ◐ | **Cross-surface "food up" shipped:** the Floor now subscribes to the shared order stream (`useAdminOrdersStream`) and a table whose ticket hits `ready` pulses basil-green with a 🔔 Food-up chip (`.core-tbl2.food-up`) — the KDS bump lights up the Floor with no polling lag, and the guest-phone SSE chain already existed. So the "event bus" is the one order stream every surface (POS → KDS → Floor → guest) now reads. Verified live (injected ready dine-in ticket → Table 1 pulsed, screenshotted). ⟶ original note below. | **Selection focus shipped:** the shared `SelectionContext` entity now *drives focus* on every lens, not just the dock — the selected table's **Floor tile**, its **Pass/KDS ticket** (via new `KdsTicket.tableId`), and its **Book picker** option ring + ember-pulse (`.is-focus`, `@keyframes core-focus-pulse`, reduced-motion-guarded, in `themes/core/index.css`). Verified live: pick a table on Floor → navigate to KDS → its ticket pulses; dock follows. Entity **event bus** (push deltas so a POS fire lights up Pass + guest in one tick) still pending — see milestone 8/12 + this file's W2. |
| 15 | Docs sync (`docs/design-system/core/**`) + Capabilities entry | ☐ | Rules #9 & #11 |

---

## Feature-Parity Ledger — NOTHING may be dropped in the redesign

Every capability that exists today MUST survive the redesign. Each row lists the current home and where it lands in
the new IA. `carried` = mapped to a redesign home; `ported` = actually re-implemented on the new shell.

### POS / Line
| Capability | Current home | Redesign home | Status |
|---|---|---|---|
| Multi-tab open checks | `CorePos.tsx` | Line lens + Context Dock tabs | carried |
| Add item / qty steppers | `CorePos.tsx` | Line lens product grid | carried |
| Modifiers (min/max, priceDelta) | `CartItem`/`ModifierGroup` | inline modifier sheet | carried |
| `flagOnKds` modifier highlight | model | Pass card danger highlight | carried |
| Special-request notes | `CartItem.notes` | line-item note field | carried |
| Dine-in coursing (`{fired, held}`) | `CorePos`/model | `<CourseSpine>` on dock | carried |
| Per-course Fire | `CorePos` | dock Fire button | carried |
| Combo deals / discounts | `getActiveComboDeals()` | dock discount row + fire chip | carried |
| Cross-sell suggestions | `getCartSuggestions()` | fire-moment upsell chip | carried |
| Operator discount (amt/%) | `CorePos` | line-item long-press | carried |
| Channel tagging (web/qr/whatsapp/pos) | model | entity metadata | carried |

### Payments / Tender
| Capability | Current home | Redesign home | Status |
|---|---|---|---|
| Split tenders (`PosPayment[]`) | model/`CorePos` | `<TenderSheet>` split presets | carried |
| Cash tendered + change | `cashTendered`/`changeGiven` | quick-tender pad | carried |
| Card / Apple Pay / Google Pay / BLIK / P24 | `PaymentsV3`/Stripe | tender method chips | carried |
| Bitcoin (off-Stripe confirm) | `PaymentsV3` | tender method chip | carried |
| Tips (presets) | `tipAmount` | tip chips in sheet | carried |
| Delivery fee | `deliveryFee` | tender line | carried |
| Manager comp (grosze + reason + note) | `compAmount`/`compReasonCode` | in-sheet + line long-press | carried |
| Refund (full/partial + reason codes) | `OrderRefund`/`OrdersV3` | line long-press → guarded | carried |
| Refund guard (per-shift cap) | `refund-guard.ts` | live cap in comp/refund flow | carried |
| Disputes | `OrderDispute` | Orders admin (unchanged) | carried |

### KDS / Pass
| Capability | Current home | Redesign home | Status |
|---|---|---|---|
| Multi-view (Fleet/Floor/Chef) | `CoreKds.tsx` | Pass lens view toggle | carried |
| Ticket build (order→ticket) | `kds-ticket.ts` | Pass card | carried |
| Item grouping by category | `kds-board.ts` | Pass card sections | carried |
| SLA countdown + tone (green→red) | `kds-board.ts` | `<SlaMeter>` | carried |
| Predicted ready-time | `kds-prediction.ts` | SLA meter prediction | carried |
| "At risk" / overdue badge | `CoreKds` | card urgency + column rail | carried |
| Coursing / held courses on KDS | `CoreKds` | dimmed `⊘` held state | carried |
| Allergen dedupe + display | `CoreKds` | large danger allergen row | carried |
| Station filtering | `CoreKds` | segmented station filter | carried |
| Bump / recall / status ladder | `kds-board.ts` | 1-tap bump / long-press recall | carried |
| Kitchen utilization tier | `floor-twin.ts` | pressure-adaptive density | carried |
| Kiosk full-screen dark wall | `.core-kiosk` | Pass kiosk mode | carried |

### Tables / Service
> **2026-07 update:** `service:floor` was renamed to **`service:tables`**
> (`/core/service/tables`, `src/core/service/CoreTables.tsx`) and scoped down to
> a **management-only** surface — zones, tables, seats. The operational Floor
> board (seat/clear/move, order lookup, unpaid glance-facts, the check-over-floor
> panel, the predictive-seating recommender, the bottleneck banner) was
> **removed** from this surface; that flow now lives in **Book's Floor lens** +
> **POS**. The `floor-twin` engine still powers Book + shift handover. Rows
> below are the original migration record; the Status column reflects where each
> capability lives today.

| Capability | Current home | Redesign home | Status |
|---|---|---|---|
| Zoned table tiles | `CoreTables.tsx` | Tables lens zones | carried |
| Seat / clear / out-of-service | `CoreBook` Floor lens / POS | radial actions | moved off Tables |
| Table CRUD (number/seats/zone/notes) | `/api/admin/floor/tables` | Tables editor | carried |
| Party size / covers | model | Book tile + seat stepper | moved off Tables |
| Service notes + allergy flag | `CoreTables` editor | tile flag + dock | carried |
| Unpaid count badge | `CoreBook` Floor lens / POS | tile glance-fact | moved off Tables |
| Table lookup (id/name/number) | `⌘K` / Book | `⌘K` search | moved off Tables |
| Floor Twin (occupancy, velocity, bottleneck) | `floor-twin.ts` | Book tile urgency + pressure | carried |
| Predictive seating recommender | `floor-twin.ts` | Book/Floor recommend | carried |
| Live orders per table (settlement) | `/api/admin/floor/orders` | Context Dock | carried |

### Book / Slots / Reservations
| Capability | Current home | Redesign home | Status |
|---|---|---|---|
| Time slots (capacity, min-spend) | `TimeSlot`/`CoreSlots` | Book lens capacity | carried |
| Demand exchange / capacity lever | `CoreSlots` demand tab | Book demand view | carried |
| Reservations (booked→seated→…) | `Reservation`/`CoreBook` | Book timeline blocks | carried |
| Conflict detection | `findReservationConflicts()` | live red-hatch overlap | carried |
| Slot + table booking in one move | `CoreBook` | Book flow | carried |

### Guest / Channels
| Capability | Current home | Redesign home | Status |
|---|---|---|---|
| QR ordering (dine-in, table-bound) | `QrOrder.tsx` | writes to same check | carried |
| Guest loyalty / tiers / wallets | `/core/guest/*` | Guest hub (read-only mirror) | carried |
| Guest concierge (MCP capabilities) | `/core/guest/concierge` | Guest hub | carried |
| WhatsApp inbox | Guest inbox | Guest hub | carried |
| Guest booking | `CoreBook` | Book lens | carried |
| Live guest order status | (new via SSE) | SSE status mirror | **new (spec'd)** |

### Cash / Ops adjacencies (unchanged surfaces, linked from canvas)
| Capability | Current home | Redesign link |
|---|---|---|
| Cash sessions / reconciliation | `CashV3.tsx` | Command Bar → Cash |
| Shift handover | `/handover` | one-tap, pre-filled |
| Orders history / refunds admin | `OrdersV3.tsx` | `⌘K` + admin |
| Menu / 86 source | `MenuV3`/inventory | feeds Line 86 state |

> **Rule for implementation:** a redesign PR may not remove a `carried` capability without either (a) porting it to
> its redesign home or (b) an explicit decision logged here with a date and reason. Anything spec'd as **new** is
> additive and must not regress an existing flow.

---

## Decision log
_(append dated entries as choices are made)_

- **2026-07-01** — Redesign adopts an entity-centric **Service Canvas** (4 lenses + persistent Context Dock) rather
  than the current app-per-surface navigation. Rationale: eliminates POS↔Floor↔KDS context switching, the root
  cause of the "features not wired together" complaint.
- **2026-07-01** — **Visual language pivot: "Liquid Glass" (2026).** The first flat sketch round read as basic /
  "Microsoft Millennium". New direction = translucent frosted-glass materials (backdrop-blur + saturate), layered
  depth, specular rim-light on edges, vibrancy, floating detached components (capsule command bar, floating rail,
  hovering dock), and fluid spring motion — while keeping the dark-first canvas + ember-terracotta accent. This
  supersedes the Core theme's current "flat, no glass" discipline **for this redesign**; the `themes/core` tokens
  will gain a glass material layer during implementation (documented per Rule #11). Build order: **all four lenses,
  one by one**. Strategy: **refactor in place** (evolve CoreShell/CorePos/CoreKds/CoreFloor).
- **2026-07-01** — **Floor brought 1:1 with the dense-console mockup**
  (`tests/sketches/core-pages/04-service-floor.html`). The tiles moved from the earlier **portrait, capacity-sized**
  design (milestone 6 — `.sz-md`/`.sz-lg` 6-tops spanning two columns) to the mockup's **uniform landscape `.core-tbl2`
  cards** with a state-tinted left accent rail (free=basil · seated=info · billing=amber · freeing=amber · reserved
  muted · oos faded), a big number + lowercase status dot, and covers/dwell/check lines. The 5-up `.core-kpi-strip`
  became a **6-up `.core-statstrip`** (seated · free · on bill · covers · occupancy · spend/hr — all live, Rule #1),
  a `.core-crumb` breadcrumb was added above the section head, and `.core-bottleneck` became the mockup's card banner
  (icon · message + seating rec · tag · route action). Rationale: the user's **"1:1, every single thing the same"**
  directive overrides the earlier capacity-sizing choice. All interactions kept (radial actions, move mode, edit,
  food-up / guest-ordered chips, cross-lens focus, docked check). 343 tests green; verified live (screenshotted).
- **2026-07-02** — **POS order panel finished to the mockup.** After a headless side-by-side exposed real gaps: the
  **channel** selector and **kitchen-timing** toggle became one labelled full-width ember segmented control each
  (`.core-oseg`/`.core-miniseg`), a density pass tightened the header/covers/segments/courses/lines, ticket lines gained
  the menu **descriptor** sub, the header title now reads **`Tab N · T{table}`** (content-sized name + `.core-th-tbl`
  suffix) with an **info-cyan** table pill (`.core-chan-aux`); the redundant channel sub was dropped (removing the
  orphan `.th-s`) while the sent-check order ref moved inline into the title (`.core-th-ord`). For the coursing states, the demo seed now **fires the starter** of one dine-in check
  via the real `fireTab` (not a faked flag) — so the panel shows served ✓ (basil) · next ⚡Fire (ember) · held ◷Hold
  (amber) like the mockup, and the fired course also seeds a real KDS ticket; cleanup deletes the spawned order via the
  tab link so re-seeds stay idempotent. Verified with repeated headless side-by-side crops. Docs synced (`modules/pos.md`).
- **2026-07-02** — **POS order-panel coursing spine brought 1:1 with the mockup.** Course labels now read in
  **Neapolitan** (`POS_COURSE_LABELS`: Antipasti · Primi · Dolci · Bevande) across POS + KDS + toasts, and each
  `.core-course-h` gained a status **dot** + contextual chip matching the mockup: basil `✓ Fired` (served), an ember
  `⚡ Fire` on the earliest un-fired course (the actionable one), and a muted amber `◷ Hold` on later courses (still
  fireable — tap to jump the queue). New CSS: `.core-course-h .cdot.{done,next,hold}` + `.fire.hold`. Verified live
  (order panel screenshotted: Antipasti ⚡Fire · Primi ◷Hold · Bevande ◷Hold). Doc synced (`modules/pos.md`, Rule #11).
- **2026-07-02** — **Made the live suite render as full as the mockup (visual parity, real data).** The demo seed
  was pinning `TODAY` to a hardcoded `2026-06-07`, which had drifted a month into the past — so slots + bookings landed
  on a dead day and **Book** / **Service · Slots** read empty against the mockup's populated boards. `TODAY` now resolves
  to the **actual current day**, so both fill in (Slots: 245/384 booked, surge banner, pace levers; Book: today's
  bookings on the timeline + slot picker). The seed also created **no open POS checks**, so **POS · Order** showed the
  "No open check" empty state instead of the mockup's live board; added `seedOpenTabs` — four open checks per location
  (three coursed dine-in tabs on tables + one takeaway), so POS now lands on the tab bar + coursed ticket
  (Starters/Mains/Drinks with per-course Fire) + combo/cross-sell offers + charge dock, matching the mockup. Book slot
  chips (`.core-pk`) now carry a `currentOrders/maxOrders` capacity `.sub` so the picker reads tinted-by-fill like the
  mockup. All from **real store rows** (Rule #1) — nothing baked into components. POS stat-strip keeps its honest live
  metrics (To pay / Open value / In kitchen / Pace) rather than the mockup's Table-turns / Sales-hr, which the till
  component has no data for and won't fabricate. WhatsApp **Inbox** left as-is: its sessions carry a 90-min TTL and the
  channel is Needs-config, so seeded convos aren't durable. Verified live (POS/Book/Slots screenshotted populated).
  Doc synced (`modules/guest.md`, seed header; Rule #11).
- **2026-07-02** — **Full live 1:1 audit of the dense-console suite.** Ran every one of the 11 suite pages
  (`/core/{pos,kds,orders,service/{floor,slots,dispatch},guest/{inbox,guests,loyalty,concierge},book}`) side-by-side
  against the uploaded mockup (byte-identical to `tests/sketches/core-dense-console-suite.html`) with a headless
  Chromium pass, authenticated as owner. Finding: the suite is **already implemented and functional 1:1** — every page
  carries the dense-console chrome (`.core-crumb`, `.core-statstrip`, glass filter/section heads, per-lens rails). The
  "empty-looking" areas are honest live-data states, **not** design gaps: POS shows no open check because the seed has
  0 open checks; Inbox is empty because no WhatsApp convos are seeded; Book lands on a day with no slots. KDS defaulting
  to **Fleet** for owners (vs the mockup's **Floor**) is the intended role-shaped default (milestone 4) — a line/kitchen
  session lands on Floor, matching the mockup. **One real divergence fixed:** the **CRM** guest inspector (`.core-drawer`)
  only rendered after a row click, whereas the mockup shows it populated by default; `CoreCrm` now **auto-selects the top
  visible guest on load** (and re-homes to the first row when the current pick is filtered out — a manual pick wins), so
  the customer book reads populated like the mockup. Verified live (inspector present on first paint, screenshotted).
  Doc synced (`modules/guest.md`, Rule #11).
- **2026-07-02** — **Orders brought 1:1** with `03-orders.html`: `.core-crumb` + a 7-up `.core-statstrip`
  (open · revenue · avg check · refunds · dine-in/takeaway/delivery %), a `.core-filterbar` (search + channel chips
  + date + refresh), a `.core-otable` HTML table (`.core-chanchip` / `.core-stpill`), and a `.core-od-track` status
  timeline in the detail modal. All figures live (Rule #1). **Slots brought 1:1** with `05-service-slots.html`:
  Manage + Demand-exchange now render **side by side** (`.core-slots-grid`, no longer tab-switched), under a `.core-crumb`,
  a 6-up `.core-statstrip` (booked · capacity · fill · surge windows · peak fill · demand price), and a
  `.core-surge-banner` when a window is ≥85% full. Manage rows are `.core-mslot` (fill bar + tier chip toggle + N/max);
  Demand rows are `.core-exrow` (tier + lever + Apply / Apply-all). All slot/demand mutations preserved. 343 tests green;
  both verified live (screenshotted).
- **2026-07-04** — **Unified header collapsed to a single ActionBar.** The
  four-row header stack (command bar → `.core-crumb` breadcrumb →
  `.core-sectionhead` title → `.core-surf-toolbar`) was reduced to **two rows**:
  the global command bar, then ONE `.core-surf-toolbar` **ActionBar**. Rationale:
  the breadcrumb only ever restated the command bar's own `core ❯ surface:tab`
  prompt, and the oversized section head restated it a second time — pure
  duplication above every surface. Both `CoreCrumb` and `CoreSectionHead` (and
  their `.core-crumb` / `.core-sectionhead` CSS) were **deleted**. The
  section-head TITLE went too — it only restated the command-bar prompt — so the
  ActionBar's far-left anchor is just the surface's uppercase-mono **context
  line** (`.core-surf-id`: date · service · location — the one thing the command
  bar does NOT carry). The view/scope switch that used to ride the section-head
  right moves to the toolbar `left` (leading the controls), and the actions stay
  in `right`. `CoreSurfToolbar`'s only identity prop is `sub`; all 11 surfaces
  (POS · Book · Tables · Slots · Dispatch · KDS fleet/floor/chef · Orders · CRM ·
  Inbox · Loyalty · Concierge) were converted. A shared `⋯` `CoreActionMenu`
  collapses occasional actions (Book: Forecast/Policy) into a portaled popover so
  the bar keeps one primary + never clips. Theme README + every module doc synced
  (Rule #11); the historical entries above are left as-dated. Typecheck green.
