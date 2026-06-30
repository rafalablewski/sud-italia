# ottaviano-ios — native iOS apps (web shell)

> **Authored, not compiled here.** The web dev container can't compile iOS — these
> files are reviewable source. Generate the Xcode project and build on a Mac or in
> CI (`.github/workflows/ios.yml`).

Two native iOS apps — **Ottaviano** (customer) and **OttavianoKDS** (operator) —
that render the live web app inside a `WKWebView`. Each screen *is* the web UI, so
the apps reflect the web **1:1 by construction** and can never drift. Pure UIKit +
WebKit: **no SwiftUI, no SwiftPM package.**

This is the deliberate replacement for the previous SwiftUI rebuild (which mirrored
every web screen by hand against a `/api/v1` JSON facade — both now retired). See
`../../docs/native/README.md` for the full rationale.

## What's here

```
project.yml                  XcodeGen spec → Ottaviano.xcodeproj (two app targets)
Sources/WebShell/            the entire UI — ONE shared pure-UIKit shell
  AppDelegate.swift            @main + scene configuration
  SceneDelegate.swift          builds the window, roots the web view controller
  WebAppConfig.swift           reads the per-app Info.plist OTTWeb* keys (+ env override)
  WebAppViewController.swift   the WKWebView host: nav policy, progress, refresh, errors
  OfflineRetryView.swift       branded offline fallback (no raw WebKit error page)
  Support.swift                UIColor(hex:) + Bundle.shortVersion
Apps/
  Ottaviano/      Info.plist (opens "/")        + Assets.xcassets + PrivacyInfo.xcprivacy
  OttavianoKDS/   Info.plist (opens "/operator") + Assets.xcassets + PrivacyInfo.xcprivacy
Scripts/testflight.sh        archive → export → upload one scheme to TestFlight
```

The two apps share every Swift file. The **only** difference is data in each
`Apps/<App>/Info.plist` under the `OTTWeb*` keys (which URL to open, the brand
chrome) — read at launch by `WebAppConfig`. Point a build at staging/local by
setting `OTTAVIANO_WEB_BASE_URL` in the Xcode scheme.

## Build (on a Mac, or via CI)

1. `brew install xcodegen && xcodegen generate` → `Ottaviano.xcodeproj`.
2. Pick a scheme (`Ottaviano` / `OttavianoKDS`) and run on a simulator/device.
3. Ship: `Scripts/testflight.sh <Scheme> <BuildNumber>` (or the
   `ios-testflight.yml` workflow). Build number is the committed
   `CURRENT_PROJECT_VERSION` in `project.yml` — bump +1 per release.

## Targets

iOS 18+ deployment (built with the latest SDK), Swift 6. iPhone-first customer
app, iPad-first operator app; both universal. OttavianoKDS distributes via Apple
Business Manager (internal staff tool); Ottaviano targets the public App Store
(see the submission notes in `../../docs/native/README.md`).
