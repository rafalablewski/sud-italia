# Core v2 — the clean-room rebuild

The literal `/core-v2/` parallel build of the Core operating system: a
ground-up redesign that will replace today's `/core` (the `suite.css`
theme) once every surface is ported. Built alongside the current Core so
nothing breaks during the migration; the **swap** (delete `/core`,
promote `/core-v2` → `/core`) is the final step.

> **Why a clean room.** Today's Core works but drifted — three CSS layers
> (`base/index.css` → `core/index.css` → `core/suite.css`), old-theme
> threads still backing Mobile KDS + WhatsApp dialogs, and dialogs/fonts
> leaning on the Admin layer. Core v2 starts from **one** theme, owns its
> own shell, and shares only the neutral `src/ui` kit — so "Core ≠ Admin"
> is true at every layer.

## Status — design phase

Locked the **design language** as standalone mockups first (the repo's
proven redesign path: mockup → port). No theme code yet; these tokens
become `src/app/themes/core-v2/` at scaffold time.

- **Design language + POS hero** — `tests/sketches/core-v2-design-language.html`
- **All four surfaces, switchable** — `tests/sketches/core-v2-all-surfaces.html`
  (POS · KDS · Guest · Service, dark-default with a light toggle)

## The design language

A deliberately **distinct** look from today's `/core` (dark warm-charcoal
+ Fraunces serif + glass-adjacent). The decisions, locked:

| Axis | Decision | Why |
| --- | --- | --- |
| **Mode** | **Dark-first**, light optional. KDS is **always** dark. | Night trucks + kitchen glare. Light is there for bright daytime POS. |
| **Display type** | **Bricolage Grotesque** (all-sans, optical size) | Drops the Fraunces serif — reads as an *operating system*, not a menu. |
| **UI / mono** | Inter (UI) · JetBrains Mono (figures) | Neutral, dense, legible at a glance across a busy line. |
| **Brand** | Neapolitan burgundy, refined (`--brand`) | Same brand DNA, cleaner. One brand red + disciplined semantics. |
| **Material** | **Flat** — 1px hairlines, crisp small shadows | No glass, no gradient, no glow. Admin owns glass; Core stays crisp. |
| **Layout** | Top **command bar** + segmented surface switcher + context **subbar** | One chrome shared by all four surfaces; no sidebar. |
| **Radius** | 7 / 10 / 14 / 20 px | Softer than Admin, tighter than a consumer app. |

### Tokens (mockup → `themes/core-v2/`)

Defined per-mode on `:root[data-theme="dark|light"]`. Canonical names:

- **Surfaces** — `--bg` · `--panel` · `--panel-2` · `--panel-3` · `--hover`
- **Ink** — `--ink` · `--ink-2` · `--ink-3`
- **Lines** — `--line` · `--line-2`
- **Brand** — `--brand` · `--brand-bright` · `--brand-ink` · `--brand-wash`
- **Semantic** — `--basil` (+`-wash`) · `--amber` (+`-wash`) · `--info`
  (+`-wash`) · `--danger` (+`-wash`)
- **Elevation** — `--sh-1` · `--sh-2` · `--sh-pop`
- **Type** — `--display` · `--ui` · `--mono`
- **Radius** — `--r-sm` · `--r-md` · `--r-lg` · `--r-xl` · `--pill`
- **Motion** — `--fast`

KDS overrides the surface/ink tokens to a fixed dark wall regardless of
the app theme (the `.kds` scope in the mockup).

## Surfaces (parity target — keep ALL functionality)

Core v2 must keep every functionality + data wire of today's Core. The
four surfaces and their views:

- **POS** (`/core-v2/pos`) — category rail · text-forward menu cards ·
  multi-tab open checks · dine-in coursing (Fire per course) · combo +
  cross-sell offers · capacity-true pace steering · Charge → Tender.
- **KDS** (`/core-v2/kds`) — Fleet · **Floor** (New → Firing → Ready·Expo
  lanes, SLA tiers, cook-meters, bump) · Chef. Always-dark wall;
  fullscreen kiosk drops the chrome.
- **Guest** (`/core-v2/guest`) — Inbox (WhatsApp 3-pane + live order
  context + NBA) · Guests (CRM) · Loyalty · Concierge · Book.
- **Service** (`/core-v2/service`) — **Floor** (zoned table tiles, status,
  turn time) · Slots (capacity fill + demand surge).

## Build plan

1. ✅ Design language locked (mockups).
2. Scaffold `themes/core-v2/` (tokens → CSS) + `src/core-v2/` shell +
   `/core-v2` route + layout — rendering live.
3. **POS** ported, wired to the real store/APIs.
4. **KDS** (dark wall).
5. **Guest** hub (Inbox · CRM · Loyalty · Concierge · Book).
6. **Service** (Floor · Slots).
7. **Swap** — delete `/core`, promote `/core-v2` → `/core`, retire
   `suite.css` + the old `index.css` threads.

Each step is a commit + a live mockup / standalone HTML.

## Layout of this folder

```
core-v2/
├── README.md          ← you are here (overview + locked design language)
├── theme/             ← tokens, type, material, components (filled at scaffold)
└── modules/           ← per-surface anatomy: pos · kds · guest · service
```

`theme/` and `modules/` land in the same commits as the code they
document (Rule #11). Until the code exists, this README is the single
source of truth for the locked direction.

## Rules that still apply

Core v2 is held to the same project rules as everything else — real data
only (no mock/hardcoded), serverless-safe store access, no server imports
in client components, portals for overlays, five-part metric explainers,
chain-wide recipes, and **design-system docs ship with the code**. See
the root `CLAUDE.md`.
