# iOS ⇄ Web 1:1 Mirror — Architecture Decision

> **Status: DECIDED — full native app.** A WebView-driven mirror (render the
> literal web inside WKWebView) and an embedded-WebView hybrid were both
> evaluated; the owner directive is a **100% native app — no WebView, no
> embedded web surfaces.** This is the same direction commits #216–#218 already
> took (SwiftUI retired → bare React Native 0.79.5). This doc records *why*, what
> full-native commits us to, and how we hold 1:1 web parity without ever
> rendering the web.

**Decision owner:** product owner · **Decided:** 2026-06-30 · **Targets:** iPhone + iPad · iOS 18+ · bare RN 0.79.5

---

## 1. Decision

**The iOS app is fully native (React Native).** Every screen — customer storefront,
operator console, POS, the KDS wall — is built from native RN components. The
backend stays the API (`/api/v1`); the app never embeds, wraps, or proxies the web
UI. Visual 1:1 fidelity to the web is achieved by **mirroring the web's design and
IA in native code**, gated against drift by codegen, **not** by hosting the web.

## 2. Options considered

| | **A — Full native (CHOSEN)** | B — RN shell + embedded WebView surfaces | C — Pure WKWebView wrapper |
|---|---|---|---|
| Renders | native RN everywhere | native shell + web in WKWebView | the literal web |
| Feels native | ✓✓ it *is* native | ✓ shell only | ✗ "a website" |
| Offline-first POS / 120fps KDS | ✓ | ✓ (native parts) | ✗ |
| App Store §4.2 risk | none | none | **rejection risk** |
| Visual fidelity to web | token-exact; **layout/interaction hand-held** (§4) | pixel-exact on web surfaces | pixel-exact |
| Second-build / maintenance cost | **high — accepted** (§4) | low | lowest |
| Keeps the RN/TestFlight investment | ✓ | ✓ | ✗ |

**Why A over B/C.** A native app is what a restaurant *runs on*: it must keep
selling with the Wi-Fi off and repaint a hot KDS line at 120fps — things a WebView
does badly. Full-native also sidesteps the App Store "minimum functionality"
(§4.2) risk a web wrapper invites, and it makes every screen feel like the OS, not
a skinned page. The accepted cost is that **fidelity to the web is something we
actively maintain** (§4), not something the renderer gives us for free.

## 3. How we hold 1:1 web parity (native, no WebView)

Three mechanisms, in order of strength:

1. **Tokens — generated, drift-gated (strongest).** `scripts/gen-native-tokens.ts`
   reads the web token CSS (`src/app/themes/{homepage,core}/tokens.css`) and
   generates the RN palettes (`tokens.generated.ts`); `npm run check:native` fails
   CI on any divergence. A web re-skin propagates to the app from one
   `npm run gen:native`. **No hex is ever hand-transcribed** (CLAUDE.md Rule #11).
2. **Information architecture — generated.** `scripts/gen-native-nav.ts` generates
   the operator IA (the 54-surface rail) from `nav.config.ts`, so the native
   console can't drift from the web admin's structure or role-gating.
3. **Layout & interaction — held by audit, not codegen (the soft spot).** Spacing
   rhythm, component shape, and motion are rebuilt in RN by hand, so they *can*
   drift. We contain that with the existing parity apparatus in
   `docs/native/parity/` — `SCREEN-AUDIT.md`, `PARITY-LEDGER.md`,
   `ONDEVICE-VERIFICATION.md` — and per-screen visual review against the web.
   **This is the real ongoing cost of going full-native; the doc names it so it
   isn't a surprise.**

## 4. The cost we accepted, and how we manage it

Full-native means **every new web screen is a second build**, and pixel parity on
layout is maintained by discipline, not by the renderer. Mitigations:

- **Codegen everything that *can* be generated** (tokens, IA, and — where the
  shape is regular — surface configs), so hand-work shrinks to genuinely visual
  decisions.
- **The parity ledger is the gate:** a screen isn't "done" until it's logged in
  `PARITY-LEDGER.md` against its web counterpart with an on-device verification
  note. No silent "looks about right."
- **Snapshot/visual tests** on the shared UI primitives (`components/ui.tsx`) in
  both skins, so a primitive change can't quietly reshape twenty screens.
- **One web change → one regen:** treat `npm run gen:native` as part of any web
  re-skin PR (the `check:native` gate enforces it).

## 5. Native hardware (unchanged by this decision — all four are native modules)

Full-native makes these *more* natural, not less — they were always going to be
native regardless of the rendering choice:

- **Receipt / kitchen printer** — ESC/POS over BLE (`react-native-ble-plx`) or LAN
  (Star/Epson SDK). The ticket layout is owned natively; printing can be triggered
  by a native KDS bump, not just an order.
- **Push** — native APNs; token POSTed to the existing web-push/notifications
  backend. New-order alerts wake `OttavianoKDS`; "order ready" wakes `Ottaviano`;
  a tap deep-links via the typed `AppRouter`.
- **BLE scale / scanner** — native CoreBluetooth (`react-native-ble-plx`); prep/
  inventory screens consume readings directly.
- **Offline** — POS/KDS are **offline-first**: local store + ordered write outbox +
  client-generated idempotency key replayed against the backend's `Idempotency-Key`
  (the spine in `ARCHITECTURE.md` §4). No screen needs a network round-trip on the
  tap path.

## 6. Responsive → iPad + iPhone, safe area

- Per-platform native layout (the web's responsive breakpoints become explicit RN
  layout): iPad operator → split/sidebar density; iPhone customer → tabs + stacks.
  Both targets are universal (`TARGETED_DEVICE_FAMILY 1,2`).
- Safe area via `react-native-safe-area-context` (`useSafeAreaInsets`), already in
  use across screens (`LaunchScreen`, etc.). The notch/home-indicator are real
  native insets, not CSS `env()` emulation.

## 7. What "full native" needs next (roadmap)

The customer order path and the operator KDS/Orders/Dashboard + many `/api/v1/admin/*`
surfaces are already live natively (`native/ottaviano-rn/README.md`). To reach full
web parity, the remaining work is **surface-by-surface native build-out** against
the parity ledger, plus wiring the four hardware modules (§5). Priority stays
operator-first (POS → remaining admin surfaces) then the customer long tail —
the revenue-critical core before the nice-to-haves.

## 8. Doc-drift cleanup (done 2026-06-30)

The sibling native specs described **superseded stacks** (SwiftUI / SwiftPM / Expo /
EAS / `native/ottaviano-ios` / `*.generated.swift`). Fixed this pass: `README.md`
and `parity/README.md` now say **bare RN, no Expo/EAS, in-repo at
`native/ottaviano-rn`**; the `gen-native-tokens.ts` / `gen-native-nav.ts` headers
point at the real `*.generated.ts` outputs; `ONDEVICE-VERIFICATION.md` /
`SCREEN-AUDIT.md` / `API-V1.md` were corrected; and `ARCHITECTURE.md` /
`DESIGN-SYSTEM.md` / `APP-SHELL.md` carry a **superseded banner** marking their
Swift mechanics as design intent (their backend/API/IA content stays current).
Their deep bodies are intentionally left as historical design records, not
rewritten.
