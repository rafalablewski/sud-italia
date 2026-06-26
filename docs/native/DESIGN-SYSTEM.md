# Ottaviano Native — Design System Spec

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

### 4.1 Primitives
- **`DSButton`** — `variant: .primary | .secondary | .tonal | .ghost | .destructive`,
  `size: .sm | .md | .lg`, loading + disabled states, 44pt min target, haptic on
  press. Never a bare `Button` in feature code.
- **`DSCard`** — surface + radius + optional elevation; the layout unit.
- **`DSTag` / `DSBadge`** — status pills (uses status tokens); count badges.
- **`DSTextField`** — themed, with label/error/affordance slots, keyboard config.
- **`DSEmptyState`**, **`DSToast`**, **`DSSheetHeader`**, **`DSSectionHeader`**.

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
- **`KDSTicket`** — a kitchen ticket card: order #, items + mods, age timer that
  shifts `stateNew → stateCooking → stateLate` by elapsed time, bump/recall
  actions, drag handle for lane moves. The single most performance-sensitive
  component (hundreds on screen) — it's a value-driven, equatable view that
  redraws only on its own data change.
- **`MenuItemRow` / `MenuItemCard`**, **`OrderSummaryRow`**, **`TableChip`**,
  **`LoyaltyCard`** (the wallet-style pass), **`MetricTile`** (analytics).

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
anything real. Feature stages (5) consume it and may *propose* new components —
which are added here, with a gallery entry + snapshot, never inline in a feature.
This is the design-system analogue of the web repo's Rule #11: the catalog is the
source of truth; a one-off component in a feature is a bug.
