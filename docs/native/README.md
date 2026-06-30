# Native iOS apps — the web shell

Ottaviano (customer) and OttavianoKDS (operator) ship as **native iOS apps that
render the live web app inside a `WKWebView`.** There is no second UI: each
screen *is* the web UI, so the apps reflect the web 1:1 by construction and can
never drift.

This replaced an earlier **SwiftUI rebuild** (a parallel native implementation
of every screen, fed by a versioned `/api/v1` JSON facade). That approach had to
mirror the web by hand and constantly drift back into parity, and it could not be
compiled in the web dev container. It was **retired**: the SwiftUI sources, the
`/api/v1` facade (78 routes), its store plumbing, the OpenAPI contract, and the
native code-generators are all gone.

## Where the code lives

```
native/ottaviano-ios/
  project.yml                 XcodeGen spec → Ottaviano.xcodeproj (two app targets)
  Sources/WebShell/           the entire UI — ONE shared pure-UIKit shell
    AppDelegate.swift           @main, scene wiring
    SceneDelegate.swift         builds the window, roots the web view controller
    WebAppConfig.swift          reads the per-app Info.plist OTTWeb* keys
    WebAppViewController.swift   the WKWebView host (the whole app)
    OfflineRetryView.swift      branded offline fallback
    Support.swift               UIColor(hex:) + Bundle.shortVersion
  Apps/
    Ottaviano/                  Info.plist (start = "/") + Assets + PrivacyInfo
    OttavianoKDS/               Info.plist (start = "/operator") + Assets + PrivacyInfo
  Scripts/testflight.sh       archive → export → upload one scheme to TestFlight
```

**No SwiftUI. No SwiftPM package.** The whole iOS surface is the six WebShell
files plus the two `Info.plist`s.

## How the two apps differ

Only by **data in `Info.plist`** (read by `WebAppConfig`), so the same Swift
compiles into both:

| key                 | Ottaviano        | OttavianoKDS      |
| ------------------- | ---------------- | ----------------- |
| `OTTWebBaseURL`     | `https://ottaviano.pl` | `https://ottaviano.pl` |
| `OTTWebStartPath`   | `/`              | `/operator`       |
| `OTTAppUAToken`     | `Ottaviano`      | `OttavianoKDS`    |
| `OTTBackgroundHex`  | `#FFFFFF`        | `#070A0F`         |
| `OTTStatusBarStyle` | `dark`           | `light`           |

The base URL is overridable at launch by the `OTTAVIANO_WEB_BASE_URL` process
env (set it in the Xcode scheme to point at staging or a local `http://…` dev
server — `NSAllowsLocalNetworking` permits the latter without weakening
production transport security).

## What the shell adds over Safari

So it feels like a real app, not a browser tab:

- a **persistent** website data store — the operator/customer session survives
  relaunch;
- a `NativeWrapper` **user-agent token**, so the web hides its "Install this app"
  PWA prompt inside the already-native app
  (`src/components/pwa/InstallAppButton.tsx`);
- pull-to-refresh, swipe back/forward, a slim top progress bar;
- a **branded offline-retry screen** instead of WebKit's raw error page;
- system handling of `tel:` / `mailto:` / maps / `_blank` links.

Because it is a web wrapper it uses the **same web routes and cookie auth as the
browser** — there is no JSON API facade to build or keep in sync. Sign-in,
checkout (web Stripe), KDS SSE, everything runs through the existing web app.

## Build & ship (on a Mac / CI — this Linux container can't compile iOS)

1. `brew install xcodegen && xcodegen generate` → `Ottaviano.xcodeproj`.
2. Open in Xcode, pick a scheme (`Ottaviano` or `OttavianoKDS`), run on a
   simulator/device. `.github/workflows/ios.yml` does the simulator build in CI.
3. TestFlight: `Scripts/testflight.sh <Scheme> <BuildNumber>`, or trigger
   `.github/workflows/ios-testflight.yml` (manual dispatch or a `[testflight]`
   commit; append `(KDS)` to ship the operator app).

## Distribution notes

- **OttavianoKDS** is an internal staff tool → **Apple Business Manager**
  (custom/unlisted app), not the public App Store.
- **Ottaviano** (public App Store) still needs, before a real submission:
  Stripe checkout completing in-app, a **web customer account-deletion + export
  page** (Apple Guideline 5.1.1(v) — see the Capabilities ledger entry), an
  Apple Developer account, and App Store Connect metadata.
- Each app ships a truthful `PrivacyInfo.xcprivacy` (no tracking, no
  required-reason APIs — the WebKit data store + URLSession only).
