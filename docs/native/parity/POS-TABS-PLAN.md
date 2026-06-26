# POS Tabs + Coursing — build plan

> The Tabs **spine** is shipped: the `/api/v1/admin/pos/tabs` CRUD facade (list /
> open / edit / void, location-scoped, prices server-resolved) and a native Tabs
> surface (open several checks, load one into the working ticket, save it back,
> void it; charge reuses the counter-sale path). This doc scopes the **one
> remaining piece** — *coursing* (fire a sit-down service course-by-course) — which
> needs a server refactor and a Mac to build/verify iteratively, so it's planned
> here rather than rushed in blind.

## What "coursing" is (web behaviour, resolved)
From `src/core/pos/CorePos.tsx` + `src/lib/pos-coursing.ts`:
- A dine-in tab's lines each carry a **course** (`starter` / `main` / `dessert` /
  `drink`), defaulted from the item category (`defaultCourseForCategory`).
- `coursed` toggles per-tab: dine-in fires **course-by-course** (starters away,
  mains held); takeaway/delivery fires everything at once.
- **Fire a course** sends only that course's lines to the KDS; the linked Order is
  rebuilt from the **union of fired courses**, so held courses never hit the line.
  `firedCourses` (server-owned) tracks what's been fired.

## The server gap (the real work)
The web fires via `POST /api/admin/pos/orders` — a large handler that builds the
Order from the tab + live menu (prices, combo deals, manual discount,
idempotency, synthetic walk-in slot) and **filters lines to the fired courses**.
The v1 counter-sale (`/api/v1/admin/pos/order`) sends a *flat* item list with no
tab/course awareness.

**Recommended:** extract the tab→Order actuator into one shared function, then
call it from both the web route and a new v1 route:

1. `src/lib/pos/fireTab.ts` — `fireTab({ tabId, locationSlug, courses? })`:
   read the tab (source of truth) → resolve prices/discount/combos off the live
   menu → filter lines to `courses` (or all when omitted / not coursed) → reuse
   the existing order build + `linkPosTabOrder` + `firedCourses` update + KDS fire.
   This is a *pure relocation* of the logic already in
   `/api/admin/pos/orders` POST, so the web route becomes a thin caller and there's
   no second implementation to drift (Rule #1/#8).
2. `POST /api/v1/admin/pos/tabs/:id/fire` `{ courses?: PosCourse[] }` → calls
   `fireTab`, returns the updated `{ tab, order }`. Bearer + staff + scoped.
3. `POST /api/v1/admin/pos/tabs/:id/charge` → ensure-order + settle + close tab
   (can reuse the new `/orders/:id/settle` once the tab has an `orderId`).

## The native gap
- `PosTabLine.course` is already decoded; `PosTabSaveBody.Line` already carries
  `course`. Add a course picker per line in the ticket (segmented or context menu),
  defaulting from the item's `category` via a native `defaultCourseForCategory`.
- A `coursed` toggle on the tab (dine-in only).
- "Fire course" buttons (starter → main → …) calling the new `/fire` endpoint;
  show `firedCourses` as done. "Charge" calls `/charge`.
- `APIClient`: add `posTabFire(id:courses:)` + `posTabCharge(id:)` (the
  `Endpoint.Method` enum already has POST).

## Why staged this way
The CRUD spine + load/save/charge gives operators **multi-check juggling today**
on a verified backend. Coursing is a contained follow-up gated on the `fireTab`
extraction — the only part that needs careful server refactoring and on-device
iteration. Split-bill is explicitly **out of scope** (the web POS doesn't do it).
