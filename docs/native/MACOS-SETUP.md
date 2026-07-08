# macOS target — setup + build harness (ADR-002 phase 2)

Goal: ship OttavianoKDS as a **native macOS app** via `react-native-macos`,
reusing the same JS/TS app + the responsive desktop layouts (ADR-002). The web
page is the layout spec; the runtime is native RN.

## Finding: auto-scaffold is dead for 0.79 — hand-author the target instead

`react-native-macos@0.79` **removed** the old `local-cli` scaffold templates, so
`react-native-macos-init` fails with `ENOENT …/templates/macos/Podfile`. There is
no working init tool for this line. So we **hand-author** the macOS target the
exact same way `ios/` is authored — a reviewable `macos/project.yml` that XcodeGen
turns into `OttavianoMac.xcodeproj`, plus a `macos/Podfile` and a bare
`Ottaviano-macOS/AppDelegate.swift`. These are committed; the `.xcodeproj`,
`.xcworkspace`, `Pods/`, and `build/` are generated in CI and gitignored.

## Build flow (mirrors `ios/`)

`.github/workflows/mac-testflight.yml` on a `macos-15` runner:

1. `npm install` (RN 0.79 baseline) then `npm install --no-save --legacy-peer-deps
   react-native-macos@^0.79.0` (in-job only — never in the shared `package.json`).
2. `brew install xcodegen` → `cd macos && xcodegen generate` →
   `OttavianoMac.xcodeproj`.
3. `pod install` → `OttavianoMac.xcworkspace`.
4. `xcodebuild -workspace OttavianoMac.xcworkspace -scheme Ottaviano-macOS …`
   (`CODE_SIGNING_ALLOWED=NO` while we chase a clean compile).

Committed source of truth:

- `macos/project.yml` — XcodeGen spec (target `Ottaviano-macOS`, bundle id
  `pl.ottaviano.kds` — the SAME id as the iOS KDS app, because OttavianoKDS is
  one App Store Connect record with both iOS + macOS platforms (unified app);
  `RCT_NEW_ARCH_ENABLED=0`, RN path → `node_modules/react-native-macos`).
- `macos/Podfile` — resolves `react_native_pods.rb` from the Mac fork and points
  `use_react_native!` at the fork via the **relative** path
  `../node_modules/react-native-macos` (an absolute path makes the CLI look for
  `./Users/…/package.json`; core RN's path is missing SocketRocket's podspec).
- `macos/Ottaviano-macOS/AppDelegate.swift` — classic `RCTBridge` + `RCTRootView`
  (moduleName `Ottaviano`) in a 1360×900 `NSWindow`.
- `macos/Ottaviano-macOS/Info.plist`.
- `react-native.config.js` (app root) — registers the out-of-tree **macos**
  platform for the RN CLI (else Metro rejects `--platform macos` at the "Bundle
  React Native code and images" phase). It re-exports the fork's macos platform
  and is a **no-op on iOS** (the fork isn't installed there), so it never touches
  the iOS/Android pipeline. Needed because we `--no-save` the fork.

Manual-dispatch only for now (workflow is red until the first clean compile).
Iterate on real macOS errors the same way the iOS pipeline was bootstrapped.

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

The committed source already has everything — no init tool needed:

```sh
cd native/ottaviano-rn
npm install
npm install --no-save --legacy-peer-deps react-native-macos@^0.79.0
cd macos
xcodegen generate                       # -> OttavianoMac.xcodeproj
pod install                             # -> OttavianoMac.xcworkspace
open OttavianoMac.xcworkspace           # build the Ottaviano-macOS scheme
```

## Phases (from ADR-002)

1. ✅ responsive layouts + POS desktop two-pane (works on iPad landscape today).
2. ✅ **DONE** — hand-authored macOS target generates + builds green in CI
   (`mac-testflight.yml`, run #11: `BUILD SUCCEEDED`, ~15 min uncached, all of
   Hermes / RCT-Folly / Fabric / the pods + the JS bundle compile for macOS).
   `CODE_SIGNING_ALLOWED=NO` — a clean compile, not yet an upload.
3. ⏳ **wired** — `mac-testflight.yml` now signs, archives, exports a `.pkg`
   (App Store installer) and uploads via `altool` (`Scripts/testflight-macos.sh`).
   The app is App-Sandboxed (`Ottaviano-macOS.entitlements`, required for App
   Store). Automatic signing + the ASC API key provisions the Mac App/Installer
   Distribution certs on the fly — a clean runner mints a new cert each run (same
   cap as iOS), so a failed run on "maximum number of certificates" just needs a
   revoke + re-dispatch. First upload pending a green signing run.
4. roll the desktop two-pane across the other operator surfaces.

## Open risks

- New-Architecture interop for the legacy `RCTViewManager` glass bridge may not
  compile on macOS → the JS `LiquidGlass`/`Aurora` fallback (plain views) ships
  first; AppKit glass twins are later polish. (`RCT_NEW_ARCH_ENABLED=0` on the Mac
  target keeps us on the classic bridge until this is validated.)
- The Mac fork pins RN 0.79.6 vs our 0.79.5 — installed with `--legacy-peer-deps`;
  the core diff is negligible for bring-up but watch for API drift.
