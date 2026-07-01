# Service OS Redesign — Living Progress Tracker

> This is the **single place to follow the redesign**. It is updated in the same commit as any redesign work.
> Legend: ☐ not started · ◐ in progress · ☑ done · ⏸ blocked/awaiting decision.
> Companion: [`README.md`](./README.md) (the design spec).

Last updated: **2026-07-01** — sketches phase.

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
| 4 | `<ServiceCanvas>` shell + Lens Rail + Command Bar | ◐ | Bottom-nav lens switch exists; command bar reused |
| 5 | `<ContextDock>` (peek→expand, shared across lenses) | ☑ | **Shipped:** `SelectionContext` + `CoreDock`, wired from **Floor tile**, **POS active check** (standalone only), **KDS ticket header**. **Peek→expand** shows the captured line items (no fetch — each lens hands over what it has). POS auto-refreshes on its poll; Floor/KDS are snapshots until re-tapped. Additive / no-op default — zero regression. Build + 343 tests green. |
| 6 | Floor lens (tiles + Twin urgency + radial actions) | ◐ | **TableTile shipped:** tiles are **capacity-sized** (`.core-tbl2-wrap.sz-md/.sz-lg` — 6-tops span two columns + stand taller with a bigger numeral) and show **≤3 glance-facts** — number+covers, the status/dwell line, and a **single most-urgent chip** chosen by priority (allergy → unpaid → note → paid → open), instead of stacking every chip. Verified live (Kraków floor, 6-tops enlarged, screenshotted). **Zone tabs shipped** (`.core-zonetabs` / `.core-ztab` — All + one chip per zone with counts; jumps the floor to a single zone). **RadialActions shipped:** a table tap blooms a portaled state-aware verb menu (`.core-radial`, Rule #4) at the finger — seated → Open check · Free · Edit; free/reserved → Seat · Reserve · Edit; out-of-service → Restore · Edit — each wired to a real handler; the tap also feeds the dock. **Table admin** (rename / re-seat / zone / block via out-of-service status / delete) is the radial's **Edit** → the existing `TableDialog`. Table **merge/move/combine** are intentionally NOT stubbed — they need a table-assignment backend that doesn't exist yet (Rule #1, no cosmetic verbs). |
| 7 | Line lens (POS) on the shared dock | ◐ | **Real-time 86 shipped:** sold-out items (base-unavailable OR live-86'd) are no longer filtered out — they stay on the grid **greyed + struck (`.core-prod.sold-out`, `.core-tag.off` "86 · sold out") and sink to the bottom**, non-tappable, so the line never taps a gap but always sees it. Live via a 15s poll of `/api/admin/kds/eighty-six` (the kitchen's authoritative override list) — no reload. Verified live (86'd Diavola sank + greyed, screenshotted). **★ Popular/Smart category shipped:** a frequency-ranked first category (`.core-cat.pop`, ember fill), the ~8 SKUs that are the bulk of taps zero-scroll — from real orders for the current daypart (`GET /api/admin/pos/popular`, daypart-preferred with all-recent fallback), and the default landing category. (Also fixed a skin bug it surfaced: active category labels were invisible under liquid-glass because the skin makes `--panel` translucent and the base `.core-cat.on` used it as the label colour.) Verified live (5 warszawa sellers, screenshotted). **Smart-default fire shipped:** a coursed check's primary action fires the *earliest un-fired course* (`nextUnfiredCourse` → `Fire {course} →`) instead of the whole check, so the common case is a single confirm and later courses stay held. **Fire-moment upsell shipped:** the top `getCartSuggestions` offer is docked as a slim chip (`.core-fire-upsell`, "＋ Add {item} before firing? +zł") right above the Fire button before the check is sent — one tap adds it so it fires with the course. Remaining Line-lens item: dock `<CourseSpine>` (the per-course fire spine already exists *in the ticket* — MAINS/DRINKS + per-course Fire; the compact dock mirror lands with the W8 dock work). |
| 8 | Pass lens (KDS) + pressure-adaptive density | ◐ | **Shipped:** whole-card bump + long-press recall (`.core-tk.bumpable`, `prevStatus`), **SLA-urgency column sort** (`groupTicketsByColumn(…, nowMs)` — tone → slack → age), **large danger-red allergens** (never dimmed), held courses dimmed with ⊘, and **pressure-adaptive density** (`.core-kds.dense` on live risk tier — compacts cards, keeps safety, pulsing top rail). Verified live (allergen + dense screenshotted), 343 tests green. **Course auto-fire-next** deferred to milestone 10 (coursing/W4). |
| 9 | Book lens (timeline + live conflict) | ☐ | |
| 10 | `<CourseSpine>` + fire-moment upsell | ☐ | |
| 10a | **Deep-dive: Order & item detail** | ☑ | POS `LineEditorDialog` already covered modifiers/notes/comp/void; added the read-only declared-allergen row to match the sketch. |
| 10b | **Deep-dive: Guest ordering journey** | ☑ | Verified already built + live: `QrOrder` (browse→customize→cart→pay) → `OrderTracker` (live SSE status + 10s poll fallback, mirrors kitchen). No net-new change needed (would be cosmetic on the homepage theme). |
| 10c | **Deep-dive: Booking** | ☑ | Verified already built: `CoreBook` — slot + table in one move, live `findReservationConflicts`, create `POST /api/admin/booking`, cancel. |
| 10d | **Deep-dive: Delivery dispatch** | ☑ | **Shipped net-new:** `/core/service/dispatch` (`CoreDispatch`) + `/api/admin/dispatch` + `assignOrderDriver` store helper. Lists active delivery orders, one-tap driver assign (delivery-group staff), advance picked-up→delivered, live KPIs, 8s poll. Audit-logged, reuses the order model. Capabilities + service.md updated. Build + 343 tests green. |
| 10e | **Deep-dive: Service/timing/expo console** | ☐ | Still net-new. Handover exists (`/admin/handover`); KDS shows at-risk; Floor shows seating recommend. A *unified* timing-alert + expo/runner console remains optional. |
| 11 | `<TenderSheet>` (split/pay/comp + guard) | ◐ | **Shipped:** split **presets** (Whole · ÷2 · ÷3 · ÷4 · By seat, clamped to covers) replacing the stepper; comp **reason-code chips** = the audit enum **Quality · Wait · Goodwill · Error**; and a **live per-shift comp-cap meter** (`GET /api/admin/pos/comp-status` → the actor's real audit-log comp total vs the `refundControls` cap) — the bar turns danger and shows a 🔒 over-cap gate when the comp would breach (owners see a "caps don't apply" note; the server still enforces in `fireTab`). Verified live (reasons + presets + owner bypass screenshotted; endpoint returns the 500 zł cap). Remaining: **by-item** split allocation, **line-item long-press** comp entry (comp already exists via the line editor), and a real manager-**PIN override** backend (the cap is enforced server-side today; a PIN *bypass* path doesn't exist yet — not stubbed, Rule #1). |
| 12 | Guest sync (QR → same check, SSE mirror) | ☐ | |
| 13 | Micro-interactions + optimistic reconcile | ☐ | |
| 14 | Cross-lens selection persistence + entity event bus | ◐ | **Selection focus shipped:** the shared `SelectionContext` entity now *drives focus* on every lens, not just the dock — the selected table's **Floor tile**, its **Pass/KDS ticket** (via new `KdsTicket.tableId`), and its **Book picker** option ring + ember-pulse (`.is-focus`, `@keyframes core-focus-pulse`, reduced-motion-guarded, in `themes/core/index.css`). Verified live: pick a table on Floor → navigate to KDS → its ticket pulses; dock follows. Entity **event bus** (push deltas so a POS fire lights up Pass + guest in one tick) still pending — see milestone 8/12 + this file's W2. |
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

### Floor / Service
| Capability | Current home | Redesign home | Status |
|---|---|---|---|
| Zoned table tiles | `CoreFloor.tsx` | Floor lens zones | carried |
| Seat / clear / out-of-service | `CoreFloor` | radial actions | carried |
| Table CRUD (number/seats/zone/notes) | `/api/admin/floor/tables` | long-press admin | carried |
| Party size / covers | model | tile + seat stepper | carried |
| Service notes + allergy flag | `CoreFloor` | tile flag + dock | carried |
| Unpaid count badge | `CoreFloor` | tile glance-fact | carried |
| Table lookup (id/name/number) | `CoreFloor` | `⌘K` search | carried |
| Floor Twin (occupancy, velocity, bottleneck) | `floor-twin.ts` | tile urgency + pressure | carried |
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
