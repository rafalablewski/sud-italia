# ADR-002 — OttavianoKDS on macOS: react-native-macos + responsive desktop layouts

> Status: **Proposed** (layout phase in progress). Follows ADR-001 (RN + bridged
> SwiftUI Liquid Glass for the iOS operator app).

## Context

macOS was added to the Apple Developer account; we want OttavianoKDS on the Mac.
The explicit product requirement: **the macOS app must match the web page in
layout and placement of sections** — i.e., the wide desktop console (rail · menu ·
ticket side-by-side, persistent ticket, full-width KPI strip), NOT the mobile
stacked layout with a bottom-sheet cart.

Options weighed:

| Option | Layout = web page? | Native / offline | Effort |
| --- | --- | --- | --- |
| Wrap the web (WKWebView) | ✅ exact | ❌ online-only | low |
| **react-native-macos + desktop layouts** | ≈ (rebuilt to match) | ✅ | high |
| Mac Catalyst (iPad app on Mac) | ❌ mobile layout | ✅ | low |

**Decision: react-native-macos with responsive desktop layouts.** Keeps the
offline/native direction from ADR-001 and reuses the same TS/React app, the v1
data client, and the generated tokens. The web is the layout *spec*, not the
runtime (unlike the rejected WebView).

## Consequences

- One codebase renders **responsively**: the same screens lay out mobile
  (stacked + bottom sheet) at narrow widths and desktop (multi-column, persistent
  panels) at wide widths — which also upgrades **iPad landscape** for free, so the
  layout work is verifiable on the existing iOS app before the Mac target exists.
- The bridged SwiftUI elements (`LiquidGlassView`, `AuroraView`) are UIKit; on
  macOS they need AppKit/`NSViewRepresentable` twins **or** the existing graceful
  fallback (the JS `LiquidGlass`/`Aurora` already degrade to plain views when the
  native module is absent). Phase 1 ships the fallback on Mac; native glass twins
  are a later polish.
- New Architecture / interop: react-native-macos tracks RN core versions; the
  Mac target must pin the `react-native-macos` release matching RN 0.79.

## Plan (phased)

1. **Responsive layout foundation** *(in progress)* — a `useBreakpoint` hook
   (`mobile` < 700 ≤ `tablet` < 1024 ≤ `desktop`) and per-screen desktop layouts,
   starting with the flagship **POS**: full-width command bar + KPI strip on top,
   then a row of `category rail · menu grid · persistent ticket panel` — the ticket
   is a fixed right column on desktop (no bottom sheet), matching the web `CorePos`
   placement. Verified on iPad landscape.
2. **react-native-macos target** — add the `react-native-macos` dependency pinned
   to the RN 0.79 line, a `macos/` app (AppDelegate, Info.plist, entry), a macOS
   Podfile, and a `macOS` scheme in `project.yml`. Requires a Mac / CI to validate.
3. **macOS TestFlight/notarize CI** — extend `ios-testflight.yml` (or a sibling) to
   archive + notarize + upload the Mac app. macOS apps ship to TestFlight/App Store
   via the same App Store Connect key.
4. **Roll desktop layouts across the remaining operator surfaces** (KDS, Service,
   Dashboard, data collections) so every tab matches the web placement.
5. **Native glass twins for AppKit** (optional polish) once the target ships.

## Open questions

- `react-native-macos` version that matches RN 0.79.5 + our bare (no-Expo) setup.
- Whether the New-Architecture interop for the legacy `RCTViewManager` bridges
  works on macOS, or the glass stays fallback-only there.
- Keyboard/menu-bar affordances (a desktop POS wants ⌘-key shortcuts) — out of
  scope for phase 1.
