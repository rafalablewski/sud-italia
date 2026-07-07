# Ottaviano Native — Design System Spec

> **⚠️ Stack superseded (2026-06-30).** Authored for **SwiftUI** (Dynamic Type,
> `Theme` protocol, SwiftUI previews). The apps are now **bare React Native**
> ([`native/ottaviano-rn`](../../native/ottaviano-rn)); the live design system is
> `src/theme/` (the generated `tokens.generated.ts` skins + `ThemeProvider`) and
> the `src/components/ui.tsx` primitives. Read this doc for the **token philosophy,
> the two brand skins, and accessibility gates** (all current intent); the
> SwiftUI-specific component/API examples are illustrative, not the shipped code.

> **Stage 3a.** The visual + interaction foundation both apps are built on,
> shipped as the `DesignSystem` SwiftPM package (`Packages/OttavianoKit/DesignSystem`).
> Swift in this doc is **specification source**, authored here and compiled in
> Xcode on a Mac (the web container can't build SwiftUI — see ARCHITECTURE §0).
> Companion to `ARCHITECTURE.md` and `APP-SHELL.md`.

**Owner role:** Founding iOS Staff Engineer · **Targets:** iPhone + iPad · iOS 26 · Swift 6

---

## 1. Philosophy — native, not a CSS port

The web `themes/` system (Tailwind tokens, `.glass-card`, `data-skin`) is a
**reference for intent, not a thing to translate**. We do not port `oklch()`
strings or `z-index` hacks. We rebuild on Apple's material primitives so the
result feels like the OS, not a skinned webview.

Five rules the system enforces:

1. **Dynamic Type or it doesn't ship.** No fixed `.font(.system(size: 17))` in
   feature code — only semantic roles that scale to the user's setting.
2. **Semantic color only.** Views reference `theme.color.accent`, never a hex.
   Light / dark / high-contrast and the two brand skins resolve underneath.
3. **One spacing grid.** An 8-pt scale; no magic `padding(13)`.
4. **Motion is interruptible and purposeful.** Spring-based, reversible,
   `Reduce Motion`-aware. Nothing animates just to animate.
5. **Components are small and previewed.** Every component has an Xcode Preview
   in light/dark/XXXL Dynamic Type; that gallery *is* the Storybook.

### Two brand skins (mirror the two PWAs)
| | **Ottaviano** (customer) | **OttavianoKDS** (operator) |
|---|---|---|
| Mood | warm, editorial, appetising | dark, dense, glanceable on a hot line |
| Base | cream surfaces, brand red accent | near-black surfaces, amber/green/red status |
| Default scheme | follows system (light-leaning) | dark-locked (kitchen glare / night trucks) |
| Density | comfortable | compact, large hit targets |

Same `DesignSystem` package, two `Theme` values. A feature written against the
theme protocol renders correctly in either app.

> **Shipped palette (v0.2).** The customer `Theme.ottaviano` now mirrors the web
> storefront's **V8 Tuscany** tokens (`src/app/themes/homepage/tokens.css`):
> parchment surface `#F8EFDE`, oxblood brand `#7A2B2B`, terracotta action
> `#B85C38`, basil success `#4A7C59`, ochre warning `#C9A23E`, ink text
> `#2C1810`. Headings use the system **serif** face to echo the web's
> Cormorant/Lora pairing without bundling font files. The shipped
> `Theme.Palette` is the trimmed set features actually consume —
> `accent · onAccent · brand · surface · surface2 · line · textPrimary ·
> textSecondary · success · warning · danger` — plus `BrandWordmark`,
> `TagChip`, and the primary/secondary `DSButton`. `Theme.kds` is the dark
> operator skin carried **verbatim from the web Core theme**
> (`src/app/themes/core/tokens.css`, dark) — the **BRACE** palette: warm-espresso
> `--bg #15110D` surface, ember-terracotta `--brand #E86B3E` primary (dark
> `--on-accent #2A160B`), basil/saffron/San-Marzano status — so the operator app
> matches the web Core surfaces 1:1.
>
> **Both palettes are generated, not transcribed.** `Tokens.generated.swift`
> (the `GeneratedTokens.ottaviano` / `.kds` palettes that `Theme` consumes) is
> emitted from the web token CSS by `scripts/gen-native-tokens.ts`, with a
> provenance comment per field, and CI fails on drift (`npm run check:native`).
> See `docs/native/parity/README.md`. This is why the KDS accent is the web Core
> brand (ember terracotta) rather than the earlier hand-picked ochre — the web
> token wins.

---

## 2. Tokens

Tokens are **values, resolved through a `Theme`** provided in the SwiftUI
environment — never global constants (that's how you get an un-themeable app).

### 2.1 Color — semantic, scheme- and skin-aware
```swift
public struct ColorTokens: Sendable {
    // Surfaces (back-to-front elevation ramp)
    public let surface, surface2, surface3, surfaceInverse: Color
    // Content
    public let textPrimary, textSecondary, textTertiary, textInverse: Color
    // Brand + interaction
    public let accent, accentPressed, onAccent: Color
    public let border, separator, focusRing: Color
    // Status (shared vocabulary across both apps; KDS leans on these hard)
    public let success, warning, danger, info: Color
    public let successSoft, warningSoft, dangerSoft, infoSoft: Color
    // KDS ticket lifecycle (semantic, not raw)
    public let stateNew, stateCooking, stateReady, stateLate: Color
}
```
- Defined as **asset-catalog color sets** with light / dark / **high-contrast**
  variants → free Increase Contrast support, no runtime branching.
- The **skin** picks which token *bundle* loads; the **scheme** (light/dark) is
  resolved by the asset catalog. Orthogonal axes.
- **Contrast is a gate:** every text-on-surface pair is verified ≥ WCAG AA (4.5:1
  body, 3:1 large) in a snapshot test before merge.

### 2.2 Typography — a Dynamic Type ramp
Custom display face (brand) + SF for UI/numerics. Every role is registered with a
`UIFontMetrics`/relative text style so it **scales with Dynamic Type**.
```swift
public enum TextRole { case displayXL, display, titleL, title, headline,
                            body, bodyEmphasis, callout, caption, mono }
// Usage in a View:  Text("Margherita").textRole(.title, theme)
```
- **Numerics use monospaced digits** (`.monospacedDigit()`) everywhere money,
  quantities, timers, and order numbers appear — no jitter as values tick.
- Line length, min scale factor, and truncation are role-defaults, not per-call.

### 2.3 Spacing, radius, elevation, layout
```swift
public struct SpacingTokens: Sendable {           // 8-pt grid
    public let xs=4, sm=8, md=12, lg=16, xl=24, xxl=32, xxxl=48  // (as CGFloat)
}
public struct RadiusTokens: Sendable { public let sm=8, md=12, lg=16, xl=24, pill=999 }
public struct ElevationTokens: Sendable { /* shadow color/blur/offset per level */ }
```
Elevation is **material-first** (`.regularMaterial`, `.thinMaterial`) with shadow
tokens reserved for cards that must lift off content. No 12-layer z-index stacks —
SwiftUI compositing + `.zIndex` only where overlap is real.

**Corners are always continuous (the Apple "squircle").** Every rounded surface
uses `RoundedRectangle(cornerRadius:, style: .continuous)` — circular corners read
subtly "off-platform" on iOS. This is enforced uniformly: there are **no**
`RoundedRectangle(cornerRadius:)` call sites without `style: .continuous`. Borders
default to a **hairline** (`0.5`pt) over the heavier `1`pt so cards sit flush with
the system look. Brand "pass" surfaces (the loyalty card, the storefront masthead)
layer a diagonal brand gradient + a faint top-edge white sheen + the `card`
elevation shadow, the way an Apple Wallet pass reads as pressed foil rather than a
flat fill.

### 2.4 Motion & haptics
```swift
public struct MotionTokens: Sendable {
    public let snappy   = Animation.spring(duration: 0.28, bounce: 0.18)
    public let smooth   = Animation.spring(duration: 0.42, bounce: 0.0)
    public let immediate = Animation.spring(duration: 0.18, bounce: 0.0)
}
```
- All spring-based (interruptible, reversible). **`Reduce Motion`** swaps springs
  for cross-fades via an environment-aware modifier `.dsAnimation(.snappy)`.
- **Haptics are semantic**, via `.sensoryFeedback`: `.success` on order sent,
  `.impact(.rigid)` on a POS key, `.warning` on an 86'd item, `.selection` on
  segment changes. Centralised so we never scatter raw `UIImpactFeedbackGenerator`.

---

## 3. Theming mechanism

```swift
public struct Theme: Sendable {
    public let color: ColorTokens
    public let type: TypographyTokens
    public let space: SpacingTokens
    public let radius: RadiusTokens
    public let elevation: ElevationTokens
    public let motion: MotionTokens
    public static let ottaviano  = Theme(/* warm skin */)
    public static let kds        = Theme(/* operator skin */)
}

private struct ThemeKey: EnvironmentKey { static let defaultValue = Theme.ottaviano }
public extension EnvironmentValues { var theme: Theme {
    get { self[ThemeKey.self] } set { self[ThemeKey.self] = newValue } } }

// App root: Ottaviano sets .environment(\.theme, .ottaviano); KDS sets .kds.
// A View reads:  @Environment(\.theme) private var theme
```
No `@Observable` needed — the theme is immutable per app launch; a skin change
(rare, operator setting) re-roots the environment. This keeps theme reads
zero-cost and side-effect-free.

---

## 4. Component catalog (v1)

Each is a small, reusable `View` in `DesignSystem`, with a Preview gallery. Below
are the contracts + representative sketches; full set lives in the package.

> **Shipped (v0.3).** The token foundation + first component wave are in the
> `DesignSystem` target and consumed by features:
> - **Tokens on `Theme`:** the generated two-skin `Palette` + shared **`radius`**
>   scale (generated from the web Core `--r-*`), **`elevation`** (card/pop shadow
>   tokens), **`motion`** (snappy/smooth/immediate springs), and the **`TextRole`**
>   Dynamic-Type ramp via `Text(…).textRole(.title)`. Status helpers
>   (`successSoft`/`warningSoft`/`dangerSoft`/`info`/`infoSoft`, derived to match
>   the web `*-wash` ~16%-alpha construction), the **at-risk tone** (`risk`/
>   `riskSoft` — the web KDS violet predictive tier, between warn and late), and
>   the **KDS ticket lifecycle** (`ticketState(elapsedMinutes:)` → fresh/cooking/
>   late + `ticketColor`, the no-prediction fallback). The live KDS tone is the
>   predictive model (`Order.kdsTone(nowMs:)` in `CoreModels/KDSLogic.swift`):
>   ready → late → at-risk → warn → firing/queued, 1:1 with the web `ticketTone`.
> - **Components:** `DSButton`, `BrandWordmark`, `TagChip`, `MoneyText` (existing)
>   plus **`DSCard`**, **`DSBadge`** (icon-carrying status pill), **`DSSectionHeader`**,
>   **`DSEmptyState`** (over `ContentUnavailableView`), **`DSStepper`**, **`MetricTile`**,
>   and the headline **`KDSTicket`** (age-timer ticket; `Equatable` so a lane only
>   redraws changed tickets) — now driving `KDSBoardView`.
> - **Inputs & overlays:** **`DSTextField`** (label/error/icon slots + keyboard
>   config; drives `OperatorLoginView`), **`DSToast`** (+ auto-dismiss `.dsToast`
>   modifier), and **`POSKeypad`** (grosze-exact till pad with quick-cash +
>   hardware-keyboard support; drives the POS cash-tender flow).
> - **Gallery + gate:** `#Preview` blocks render the set in both skins (the living
>   Storybook, §6). **Contrast is gated** — `tests/native-contrast.test.ts` (web
>   CI) and `Tests/DesignSystemTests/ContrastTests.swift` (iOS CI) assert WCAG on
>   the shipping tokens: the operator skin to full AA-body, the customer skin to
>   AA-body for primary text + AA-large floor elsewhere. Still pending: snapshot /
>   Dynamic-Type-XXXL image tests (need a simulator — iOS-repo CI).

### 4.1 Primitives
- **`DSButton`** — `variant: .primary | .secondary | .tonal | .ghost | .destructive`,
  `size: .sm | .md | .lg`, loading + disabled states, 44pt min target, haptic on
  press. Never a bare `Button` in feature code. Carries **`DSPressStyle`** — the
  Apple "alive" press: a quick spring dip in scale (`0.97`) + opacity while held,
  Reduce-Motion-aware (the scale drops, the dim stays). `DSPressStyle` is public so
  any branded `Button` whose label owns its background can adopt the same feel.
- **`DSCard`** — surface + radius + optional elevation; the layout unit.
- **`DSTag` / `DSBadge`** — status pills (uses status tokens); count badges.
- **`DSTextField`** — themed, with label/error/affordance slots, keyboard config.
- **`DSEmptyState`**, **`DSToast`**, **`DSSheetHeader`**, **`DSSectionHeader`**.
- **`OperatorDateField`** (`DesignSystem/DateField.swift`) — the shared Core date
  picker, the native twin of web `CoreDateField`: a `‹ day · face · ›` stepper
  whose face opens a sheet with quick chips (Today / Tomorrow / +1 week) and a
  **Monday-first** month grid; `marked` days carry a basil dot. Binds a single ISO
  `yyyy-MM-dd` string (drops straight into the facade's `date=` query). Backed by
  `CoreDay` — the one place date-only + minute-of-day math lives (`today`, `add`,
  `minutes`/`hm`, `nowMinutes`), so Book (timeline axis, now-line, Arrivals late/
  early split) and Slots share one contract. Consumers: **Service · Book**,
  **Service · Slots**.

```swift
public struct DSButton: View {
    @Environment(\.theme) private var theme
    @Environment(\.dsReduceMotion) private var reduceMotion
    let title: String; var variant: Variant = .primary; var size: Size = .md
    var isLoading = false; let action: () -> Void
    public var body: some View {
        Button(action: action) {
            ZStack {
                Text(title).textRole(size.role, theme).opacity(isLoading ? 0 : 1)
                if isLoading { ProgressView().tint(theme.color.onAccent) }
            }
            .frame(maxWidth: variant.fillsWidth ? .infinity : nil, minHeight: 44)
            .padding(.horizontal, theme.space.lg)
        }
        .buttonStyle(DSButtonStyle(theme: theme, variant: variant))
        .sensoryFeedback(.impact(weight: .light), trigger: isLoading)
        .disabled(isLoading)
    }
}
```

### 4.2 Domain components (the ones that make it feel purpose-built)
- **`MoneyText`** — formats minor-units → localized PLN, monospaced digits, never
  hand-rolled. One place currency lives.
- **`QtyStepper` / `MoneyStepper`** — large-target −/＋, hold-to-repeat, haptics.
- **`POSKeypad`** — the till numeric/amount pad: huge keys, decimal logic, quick
  cash buttons, fully keyboard-navigable on iPad with hardware keyboard.
- **`KDSTicket`** — a kitchen ticket card at 1:1 with the web `/core/kds`
  `TicketCard`: short id + channel chip (party size), a **predictive due
  countdown + SLA meter + at-risk pill** (driven by the order's `prediction`
  block, not just elapsed age), a **coursing-held** callout, **station-grouped**
  lines with **KDS-flagged modifiers** (e.g. BUFALO MOZZ) + notes, an allergen
  line, the guest note, and a bump action. The pure tone/timing/grouping logic
  lives in `CoreModels/KDSLogic.swift` (shared with the board KPIs, mirroring the
  web's shared `kds-board`/`kds-prediction`). The single most
  performance-sensitive component (hundreds on screen) — a value-driven,
  `Equatable` view that redraws only on its own data change; the per-second
  countdown ticks on an internal `TimelineView` so only the timer/meter recompute.
- **`MenuItemRow` / `MenuItemCard`**, **`OrderSummaryRow`**, **`TableChip`**,
  **`LoyaltyCard`** (the wallet-style pass), **`MetricTile`** (analytics).
- **`MetricExplainer` / `InfoButton`** (`Explainers.swift`) — the operator app's
  Rule #12 enforcement, the native twin of `src/admin-v3/ui/Explainer.tsx`. Any ⓘ
  on a KPI / metric / what-if lever opens a sheet that renders **all five
  sections, in this exact order and label**: description → **INSTITUTIONAL
  ANALYSIS** → **IN PLAIN TERMS** → **TIPS — HOW TO PUSH THIS LEVER** →
  **METHODOLOGY — HOW THIS IS DETERMINED**, each on its accent rail. All five
  inputs are **required** (no defaults), so a description-only stub won't compile.
- **`OperatorBarChart` / `OperatorDonut` / `OperatorBarRow`** (`Charts.swift`) —
  hand-rolled chart primitives (Path/Shape, not the Swift Charts framework, so
  they render identically across OS versions and add no framework surface). Used
  by the fulfilment ring and ranked rows. All colour from the active `Theme`.
- **Institutional analytics kit** (`Analytics.swift`) — the visual vocabulary that
  makes the operator boards read "institutional", the native twins of the web
  `Kpi`/`Sparkline`/`Chart` primitives (`src/admin-v3/ui/`). Same Path/Shape, no
  framework surface, all `Theme` colour, Dynamic-Type + VoiceOver aware:
  - **`TrendBadge`** — a period-over-period Δ% pill (`↑ +12%`) with good/bad tone;
    `goodWhenUp:` inverts the colour for lower-is-better metrics (cancellation,
    food cost). nil ⇒ a muted "—" (never a fabricated delta).
  - **`OperatorSparkline`** — inline line + gradient-area trend with an end dot
    (its static `points`/`line`/`area` also back the bigger chart).
  - **`OperatorKPICard`** — the executive-rail unit: icon + label + ⓘ, big value,
    `TrendBadge`, inline sparkline, caption.
  - **`OperatorAreaChart`** — full trend chart: gradient fill, reference
    gridlines, max y-axis label, leading/trailing x captions.
  - **`OperatorGauge`** — 270° radial progress with a centre readout (margin,
    share-of-target, SLA), threshold-tinted.
  - **`OperatorProgressMeter`** — linear progress-to-goal with a benchmark tick.
  - **`OperatorComparisonColumns`** — grouped two-series bars (this vs prior) + legend.
  - **`OperatorHourBars`** — hourly demand bars, peak highlighted, sparse axis labels.
  - **`OperatorHeatGrid`** — 2-D sensitivity heatmap (the Calculator's
    orders×ticket / profit-map grids), diverging profit/loss scale, baseline cell ringed.
  - **`OperatorWaterfall`** — revenue → −cost → profit cascade (running-total bars).
  - **`OperatorTornado`** — ± sensitivity bars (assumption impact on year-1 profit).
  - **`OperatorScatter`** — two-variable scatter with a median crosshair + tinted
    quadrants (the Kasavana-Smith menu-engineering matrix).
  - **`OperatorBandChart`** — a line trend over a shaded safe band, out-of-band
    points flagged red (the HACCP per-sensor temperature log).
  - **`DSSegmented`** — themed segmented control (the 7d/30d/90d period chips).
  - **`OperatorLeaderRow`** — ranked row (medal · name · magnitude bar · value · Δ).
  Live consumers: **Dashboard** (executive KPI rail + revenue area + daypart bars
  + fulfilment ring + top-seller leaderboard, range-scoped vs the prior window),
  **Reports** (range chips, KPI rail with deltas, area chart, P&L waterfall, net-
  margin gauge), **Insights** (cancellation gauge, daypart bars, seller
  leaderboards, cross-location comparison), the **Calculator** (live what-if
  levers driving a waterfall, sensitivity tornado and orders×ticket heatmap),
  **Menu engineering** (the Kasavana-Smith scatter matrix), **HACCP** (per-sensor
  band charts + flagged-rate gauge), **Cash** (variance trend + KPI rail),
  **Inventory** (on-hand-vs-par meters with a reorder tick), **Agent HQ**
  (success gauge + cost-by-agent donut + spend leaderboard), **Multi-location**
  (revenue-share donut + comparison + margin leaderboard), and the **KDS Fleet**
  (promise-accuracy gauge + per-hour pace).
  The range scaffolding (`PeriodRange` + `AnalyticsDates` window math + the
  `periodDelta` helper) lives in `Features/Operator/OperatorAnalyticsSupport.swift`
  and resolves real ISO windows the `/admin/summary?from=&to=` facade scopes on,
  plus the equal prior window so every delta is true period-over-period (Rule #1).

### 4.3 Overlays
Native `.sheet`, `.popover`, `.alert`, `.confirmationDialog`, `.inspector` (iPad).
**No custom portal layer** — the web app needed `createPortal` to escape stacking
traps; SwiftUI presents from the scene, so that whole class of bug is gone. A
`DSSheet` wrapper standardises detents, grabber, and header.

---

## 5. Accessibility — a merge gate, not a polish pass

A screen is **not done** until:
- Every interactive element has a VoiceOver **label + trait + value**; decorative
  imagery is `.accessibilityHidden(true)`.
- Layout holds at **Dynamic Type XXXL** with no clipping/overlap (snapshot-tested).
- Hit targets ≥ 44×44pt; focus order is logical; `.accessibilityElement(children:)`
  groups composite rows.
- Contrast ≥ AA in light, dark, and high-contrast.
- Works with **Reduce Motion**, **Reduce Transparency**, **Bold Text**, **VoiceOver**,
  and **Full Keyboard Access** (critical for iPad POS).
- Color is never the *only* signal — KDS states carry an icon/label too (color-blind
  line cooks exist).

**CORE (front-of-house) is the highest-stakes accessibility surface — used under
pressure, often eyes-off or one-handed. The shared CORE substrate bakes this in so
every Core screen inherits it:**
- **`KDSTicket`** speaks the **whole ticket** as one VoiceOver phrase — id · channel ·
  tone · due · *every line with its flagged modifiers + notes* · allergens · guest
  note — so a low-vision cook hears *what to make*, not just "order A-204". The
  **Bump** control is a *separate* element (its own label + hint + `DSPressStyle`),
  ≥48pt, never folded into the ticket's combined label.
- **`OperatorStatChip`** (every Core KPI strip) reads as one element — label as the
  a11y label, the number as the a11y value ("Chats, 12") — and its big number
  shrinks (`minimumScaleFactor`) instead of clipping at large Dynamic Type.
- **`DSSegmented`** (the Guest/Service hub switchers) has a full-segment hit area
  (`contentShape`, ≥36pt), per-segment labels + the `.isSelected` trait, and labels
  that scale-to-fit rather than truncate ("Concierge").
- Every tappable glyph carries a **≥44pt hit target** even when the visual is
  smaller (e.g. the POS qty steppers expand a 32pt circle to a 44pt target via an
  outer frame + `contentShape`).

---

## 6. Preview & verification

- **Gallery target** `DesignSystemGallery` — a runnable app listing every
  component in every state × scheme × Dynamic Type, the living catalog.
- **Snapshot tests** (light/dark/XXXL) for each component; contrast assertions.
- Designers review the gallery on-device; this is the sign-off surface per
  component before features consume it.

---

## 7. Mapping to the staged plan
This package is **Stage 3a**; it must land (tokens + the §4.1 primitives +
`MoneyText`/`KDSTicket`/`POSKeypad`) before Stage 4 (the app shell) can render
anything real. **Status:** tokens + the §4.1 primitives + `MoneyText` +
`KDSTicket` + `POSKeypad` + `DSTextField`/`DSToast` shipped (v0.3, see §4
"Shipped"), with WCAG contrast gated in CI. The operator POS/KDS/login features
are theme-complete; the remaining work is the design-system **adoption sweep** of
the older Operator screens (see `parity/SCREEN-AUDIT.md` action items). Feature stages (5) consume it and may *propose* new components —
which are added here, with a gallery entry + snapshot, never inline in a feature.
This is the design-system analogue of the web repo's Rule #11: the catalog is the
source of truth; a one-off component in a feature is a bug.
