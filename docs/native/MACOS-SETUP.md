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
3. ✅ **DONE — shipping to TestFlight.** `mac-testflight.yml` signs, archives,
   exports a `.pkg` (App Store installer) and uploads via `altool`
   (`Scripts/testflight-macos.sh`). Run #14: `UPLOAD SUCCEEDED with no errors`.
   What it took:
   - App Sandbox entitlements (`Ottaviano-macOS.entitlements`) — App Store
     rejects un-sandboxed macOS uploads; `network.client` so the POS reaches the API.
   - `LSApplicationCategoryType` (`public.app-category.business`) in Info.plist —
     required by App Store validation.
   - A full macOS `AppIcon` set (16→1024, RGB / no alpha) generated from the iOS
     1024 icon, wired via `ASSETCATALOG_COMPILER_APPICON_NAME`.
   - **Unified app record:** the Mac target ships under the SAME bundle id as iOS
     (`pl.ottaviano.kds`) so it attaches to the existing OttavianoKDS App Store
     Connect record's macOS platform (one app, iOS + macOS).
   Automatic signing + the ASC API key provisions the Mac App/Installer
   Distribution certs on the fly (a clean runner mints a new cert each run — same
   cap as iOS; on "maximum number of certificates", revoke one and re-dispatch).
   The `altool` step fails the job on any error (altool exits 0 even on validation
   failures), so a green run means the build genuinely uploaded.
   - **Export retry:** `xcodebuild -exportArchive` calls the App Store Connect
     API to resolve the distribution profile, and that call intermittently fails
     with `error: exportArchive The request expected results but none were found`
     (an empty ASC-API response) even when the archive is perfect — a prior run
     uploaded the identical config fine. It's transient, so
     `Scripts/testflight-macos.sh` retries the export up to 3× with backoff
     (clearing `exportPath` each attempt) rather than throwing away the ~15-min
     archive over one bad API round-trip.
4. roll the desktop two-pane across the other operator surfaces.

## Runtime: blank window fix (first launch)

The signed build launched to a **blank window** — the title bar read
`OttavianoKDS` but the content was the empty dark `RCTRootView` background, not
the Launcher's warm `#f8efde` surface. Nothing in the React tree rendered.

Cause: `SafeAreaProvider` (in `App.tsx`) renders `null` for its children until
the **native** side reports insets via `onInsetsChange`. On react-native-macos
that callback never fires — desktop has no notch/safe-area, and the module
autolinks against core RN rather than the Mac fork — so the provider held the
entire tree at `null` and the window stayed blank indefinitely.

Fix: seed `SafeAreaProvider` with `initialMetrics` so it renders on the first
frame instead of waiting for a native callback that never comes. We pass
`initialWindowMetrics` (populated on iOS/Android) with a macOS fallback of zero
insets — correct for desktop — and the current window bounds as the frame.
Zero-cost on iOS/Android (they already have real metrics); the guard is what
un-blanks the Mac window.

## Open risks

- New-Architecture interop for the legacy `RCTViewManager` glass bridge may not
  compile on macOS → the JS `LiquidGlass`/`Aurora` fallback (plain views) ships
  first; AppKit glass twins are later polish. (`RCT_NEW_ARCH_ENABLED=0` on the Mac
  target keeps us on the classic bridge until this is validated.)
- The Mac fork pins RN 0.79.6 vs our 0.79.5 — installed with `--legacy-peer-deps`;
  the core diff is negligible for bring-up but watch for API drift.
- `RootNavigator` uses `@react-navigation/native-stack` (react-native-screens
  native views). The pod compiles for macOS, but if a surface still renders blank
  *after* the SafeAreaProvider fix above, suspect screens next — swap the offending
  navigator to the JS `@react-navigation/stack`, or set `enableScreens(false)`.
