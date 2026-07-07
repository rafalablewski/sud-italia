# macOS target — setup + build harness (ADR-002 phase 2)

Goal: ship OttavianoKDS as a **native macOS app** via `react-native-macos`,
reusing the same JS/TS app + the responsive desktop layouts (ADR-002). The web
page is the layout spec; the runtime is native RN.

## Finding: auto-scaffold in CI is a dead end for 0.79

`react-native-macos@0.79` **removed** the old `local-cli` scaffold templates, so
`react-native-macos-init` fails with `ENOENT …/templates/macos/Podfile`. Do NOT
rely on scaffolding `macos/` in CI. Instead: scaffold once on a Mac (below),
**commit `native/ottaviano-rn/macos/`**, and CI builds the committed project (the
workflow already skips scaffold when `macos/` exists — same model as `ios/`).

## Why this was CI-driven

`react-native-macos` needs a `macos/` Xcode project, scaffolded once by
`npx react-native-macos-init`. That requires macOS. We don't scaffold + commit it
by hand from Linux — instead the **macOS CI runner scaffolds it at build time**
(`.github/workflows/mac-testflight.yml`) so we can iterate on real macOS errors
the same way we bootstrapped the iOS pipeline. Once it builds green, we commit the
generated `macos/` project and switch CI to build the committed project (faster,
reproducible) — same trajectory as `ios/`.

## Version pinning

`react-native-macos` tracks React Native core. This app is RN **0.79.5**, so use
`react-native-macos@^0.79.0`. It is installed **in-job** by the workflow (NOT added
to the shared `package.json`) so it can never break the iOS `npm install`.

## Signing / distribution

macOS apps to TestFlight/App Store need a **Mac App Distribution** certificate +
a **Mac Installer Distribution** certificate (or a Developer ID pair for outside
the store) and a macOS provisioning profile — separate from the iOS certs. Upload
uses the same App Store Connect API key (`ASC_KEY_ID` / `ASC_ISSUER_ID` /
`ASC_KEY_P8`) via `xcrun altool`/`notarytool`. Because macOS automatic signing on
a clean runner mints new certs (same cap risk as iOS), the durable path here is
**manual signing with a stored Mac Distribution cert** — worth doing before this
goes routine.

## Local path (if a Mac is available)

```sh
cd native/ottaviano-rn
npm install
npx react-native-macos-init            # scaffolds ./macos
cd macos && pod install
open Ottaviano.xcworkspace              # build the macOS scheme in Xcode
```

Then commit `native/ottaviano-rn/macos/` (minus Pods/build) and point CI at it.

## Phases (from ADR-002)

1. ✅ responsive layouts + POS desktop two-pane (works on iPad landscape today).
2. ⏳ **this** — macOS target scaffolds + builds in CI; iterate to green.
3. commit the `macos/` project; add manual signing + notarized TestFlight upload.
4. roll the desktop two-pane across the other operator surfaces.

## Open risks

- `react-native-macos-init` assumes a fresh RN project layout; our **bare** RN +
  XcodeGen `ios/` setup may need the init run with `--overwrite` and manual
  reconciliation of the shared `AppDelegate`/module name (`Ottaviano`).
- New-Architecture interop for the legacy `RCTViewManager` glass bridge may not
  compile on macOS → the JS `LiquidGlass`/`Aurora` fallback (plain views) ships
  first; AppKit glass twins are later polish.
