# iOS ⇄ Web 1:1 Mirror — Architecture Decision & Implementation Plan

> **Status: proposal / [DECISION] open.** This doc reconciles a brief that asked
> for a *WebView-driven 1:1 mirror of the web app* with the reality that the iOS
> app was **already rebuilt native** (bare React Native 0.79.5 — see
> `native/ottaviano-rn/README.md`, commits #216–#218) and the standing decision
> (`ARCHITECTURE.md` §6, `DESIGN-SYSTEM.md` §1) is **"native, not a CSS port."**
> The brief's constraints (visual fidelity #1, *let the web design drive the
> pixels*, *minimize custom native UI*, *reuse the web implementation*) pull the
> other way. Both positions are defensible; the choice is the owner's. This doc
> states the trade-off honestly and ships the reference scaffolding for the
> recommended middle path so it can be evaluated, not just argued about.

**Author role:** iOS architect (hybrid/native-web mirroring) · **Targets:** iPhone + iPad · iOS 18+ · bare RN 0.79.5

---

## 0. The tension in one paragraph

You want the iOS UI to be **visually indistinguishable** from the web and to
**stop re-implementing every screen** (drift, double maintenance). The team
already built native RN screens whose colors/radii are *generated* from the web
CSS so they can't drift on **tokens** — but **layout, component shape, spacing
rhythm, and interaction** are still hand-rebuilt per screen, so they *can* drift
there, and every new web screen is a second build. A WebView renders the
**literal web** — zero pixel drift, zero second build — but is bad at exactly the
two things this product can't compromise: an **offline-first POS** that keeps
selling when the Wi-Fi dies, and a **120 fps KDS** on a hot line. The resolution
is not "all native" or "all web" — it's **routing each surface to the renderer
that fits it.**

---

## 1. Options, compared honestly

| | **A — Status quo: all-native RN + token codegen** | **B — Hybrid: RN shell + embedded WebView surfaces (recommended)** | **C — Pure WKWebView wrapper (from scratch)** |
|---|---|---|---|
| Visual fidelity to web | Token-exact, **layout/interaction hand-rebuilt** → drifts | **Pixel-exact** on WebView surfaces (it *is* the web); native shell matches via existing token codegen | Pixel-exact everywhere |
| "Minimize custom native UI" (your constraint) | ✗ every screen is custom RN | ✓ visual surfaces are web; only shell + hardware are native | ✓✓ almost no native UI |
| "Reuse the web implementation" (your constraint) | ✗ re-implemented | ✓ reused verbatim on WebView surfaces | ✓✓ fully reused |
| Offline-first POS / KDS | ✓ native, deterministic | ✓ **kept native** (POS/KDS never go in a WebView) | ✗ WebView offline is fragile; risky for POS |
| 120 fps KDS, big lists | ✓ | ✓ (native) | ✗ DOM struggles on a 2k-ticket wall |
| Native hardware (push, BLE scale, printer) | ✓ direct | ✓ direct in shell; web calls via bridge | ⚠ all via JS bridge |
| Second-build / maintenance cost | **High** (every web screen rebuilt) | **Low** for visual surfaces, native only where it pays | Lowest |
| Throws away existing RN work | n/a | **No** — extends it | **Yes** — discards #216–#218 |
| App Store §4.2 "minimum functionality" risk | none | none (substantial native shell + hardware) | **real** — a bare web wrapper gets rejected |

**Recommendation: B.** It is the only option that satisfies *both* the brief's
"don't fight the web design / reuse the web" constraints **and** the product's
non-negotiable offline-first POS/KDS — by **assigning surfaces to renderers**
instead of picking one renderer for everything. It also preserves the entire
RN/TestFlight investment (#216–#218) and the token-codegen parity gate.

### The routing rule (the heart of option B)

```
Render in the embedded WebView  ── high visual fidelity matters, perf/offline don't:
  • Customer storefront: menu browse, item detail, marketing/seasonal, loyalty card,
    rewards, account, reservations, order confirmation pages
  • Operator long-tail admin: Reports, Reviews/Feedback, Settings, Compliance,
    Capabilities, Audit log, Locations, any "read a table / fill a form" surface

Render native (RN, as today)  ── offline-first or high-frequency or hardware-bound:
  • POS / order entry (must sell offline; sub-16ms add-to-cart)
  • KDS wall (120 fps, 2k tickets, SSE at <250ms)
  • Live order tracker (frequent SSE repaint)
  • Anything that drives a printer / BLE scale / scanner directly
```

The split is **stable and legible**: "if it must work with the network off, or
repaints many times a second, it stays native; otherwise the web renders it."

---

## 2. How the web is injected into the iOS container (option B)

The RN app stays the host. We add **one** new RN component — `WebSurface` — that
wraps [`react-native-webview`](https://github.com/react-native-webview/react-native-webview)
and is dropped into the existing React Navigation tree wherever the routing rule
says "web." Reference implementation:

- `native/ottaviano-rn/src/web/WebSurface.tsx` — the host view.
- `native/ottaviano-rn/src/web/bridge.ts` — the JS ⇄ native message contract +
  the `injectedJavaScriptBeforeContentLoaded` that defines `window.OttavianoNative`.

`WebSurface` loads `${API origin}/<path>` (e.g. `/menu`, `/admin/reports`) from
the **same Next.js deployment the web uses** — there is only ever one copy of the
UI. It threads three things into the page before first paint:

1. **`window.OttavianoNative`** — the capability bridge (§3).
2. **Theme + safe-area CSS variables** — so the web honors the native skin and
   notch (§5, §6).
3. **An auth handoff** — the RN Keychain session (`secureStore`) is posted to the
   page so the WebView is signed in without a second login (§3, "auth").

### Why not WKWebView directly?

Because the host is RN, `react-native-webview` *is* `WKWebView` under the hood —
you get the same engine plus a first-class `onMessage`/`injectedJavaScript`
bridge and RN lifecycle integration, without writing a `WKScriptMessageHandler`
by hand. If the host were native Swift, the §3 contract maps 1:1 onto
`WKUserContentController.add(_:name:)` + `evaluateJavaScript` — see §9.4.

---

## 3. The communication bridge (JS ⇄ Native)

One typed, promise-based channel. The web calls `window.OttavianoNative.<cap>()`
and gets a `Promise`; native pushes unsolicited events (push tap, scale reading)
the web subscribes to. Full schema in `bridge.ts`; shape:

```jsonc
// web → native (request)            // native → web (reply)             // native → web (event, unsolicited)
{ "id":"u1", "type":"print",         { "id":"u1", "ok":true,             { "event":"scale:reading",
  "payload":{ "orderId":"…" } }        "result":{ "jobId":"…" } }          "payload":{ "grams":342 } }
```

| Capability | Direction | Backed by (native module to add) | v1 status |
|---|---|---|---|
| `getContext` | web→native | host info: app, skin, insets, OS, online | **wired** (transport only) |
| `auth:getSession` | web→native | `react-native-keychain` (`secureStore`) | **wired** |
| `print` | web→native | ESC/POS over BLE/LAN (`react-native-ble-plx` or a Star/Epson SDK) | handler stub — needs native module |
| `scale:subscribe` / `scale:reading` | both | CoreBluetooth via `react-native-ble-plx` | handler stub |
| `scan` | web→native | camera/QR (`react-native-vision-camera`) | handler stub |
| `push:register` / `push:token` | both | APNs (`@react-native-firebase/messaging` or bare `PushNotificationIOS`) | handler stub |
| `haptic` | web→native | `react-native-haptic-feedback` | handler stub |
| `share`, `openExternal` | web→native | RN `Share` / `Linking` | trivial |

**Honest scope (Rule #1):** the bridge *transport* is real and works end-to-end
today; each hardware capability is a **registered handler** the app supplies.
Handlers that need a native module that isn't installed yet return a typed
`{ ok:false, error:"UNAVAILABLE" }` — never a fake success. The web feature-detects
(`window.OttavianoNative?.print`) and degrades to its existing web behavior (e.g.
browser print / web-push) when a capability is absent, so the same page still
works in a desktop browser. This is the "no cosmetic implementations" rule applied
to the bridge.

### Auth handoff (no double login)

The RN shell already owns the session (Keychain refresh token, `OperatorSession`/
`CustomerSession`). On `WebSurface` mount we inject the access token + a flag so
the page's `fetch` to `/api/v1` is bearer-authed and the web **skips its own login
screen**. The token refresh stays single-flighted **in native** (the bridge
exposes `auth:getFreshToken`), so we never run two refresh loops.

---

## 4. Hardware capabilities (your four must-haves)

- **Receipt / kitchen printer** — native. ESC/POS bytes built natively; transport
  BLE (`react-native-ble-plx`) or LAN socket (Star/Epson). Web POS calls
  `OttavianoNative.print({orderId})`; native fetches the order from `/api/v1`,
  renders the ticket, and prints — so the **paper layout is owned natively** (it
  must work even if that print is triggered from a native KDS bump, not the web).
- **Push** — native APNs registration; token POSTed to the existing web-push /
  notifications backend. New-order alerts wake `OttavianoKDS`; "order ready" wakes
  `Ottaviano`. A push tap deep-links via the bridge `push:tap` event → native
  navigates (KDS native) or `WebSurface` loads the right path (web surfaces).
- **BLE scale / scanner** — native CoreBluetooth (`react-native-ble-plx`); the web
  prep/inventory screen `scale:subscribe`s and receives `scale:reading` events.
- **Offline** — **POS/KDS are native and offline-first** (local store + write
  outbox + idempotency key, exactly as `ARCHITECTURE.md` §4 specifies); the
  WebView surfaces are the ones that *tolerate* being online-only. `WebSurface`
  caches its last good HTML/asset shell and shows the native offline state (§7)
  when a web surface is opened with no network, rather than a dead white page.

---

## 5. Theming synchronization (don't change a single hex)

The pipeline that already prevents token drift is reused — **nothing new to keep
in sync.** `scripts/gen-native-tokens.ts` is the single source of truth:

- **Native shell** keeps consuming `tokens.generated.ts` (today's behavior).
- **WebView surfaces** are *literally the web*, so they already use the web CSS —
  no translation needed. The only sync concern is the *boundary chrome* (nav bar,
  loading/error states) drawn by RN around the WebView; those read the same
  `useTheme()` palette, which is generated from the same CSS. So a web re-skin
  propagates to **both** sides from one `npm run gen:native`, and
  `npm run check:native` still gates drift.

**Dark mode:** the operator skin is dark-locked (kitchen glare) and the customer
skin follows system — both already encoded in the two skins. `WebSurface` injects
`data-skin` / `color-scheme` so the page renders the correct web skin to match the
shell it's embedded in (operator WebView → web Core dark skin; customer WebView →
web homepage skin). One injected line, in `bridge.ts`.

---

## 6. Responsive → iPad + iPhone, safe area / notch

- The web is already responsive (Tailwind). Inside `WebSurface` it lays out to the
  WebView's bounds, so iPad gets the web's wide layout and iPhone the narrow one —
  **for free**, no native breakpoint logic.
- **Notch/safe-area:** RN reads `useSafeAreaInsets()` and injects them as
  `--safe-top/-right/-bottom/-left` CSS variables into the page (the web already
  uses `env(safe-area-inset-*)` per `layout.tsx`'s `viewport-fit=cover`; we map
  ours onto the same custom props so a page works identically embedded or in
  Safari). The RN nav bar / tab bar occupy the unsafe regions natively; the
  WebView gets the safe rect.
- **iPad multitasking / split view:** the WebView reflows with its container, so
  Slide Over / Split View just resize the web — another thing native breakpoints
  would otherwise have to replicate.

---

## 7. Loading & error states that match the web

A WebView's worst look is the **white flash** before first paint. `WebSurface`:

1. Renders a **native skeleton** painted in `useTheme()` colors (so it's the brand
   surface, not white) until the page signals ready.
2. The page calls `OttavianoNative.ready()` after hydration; only then do we
   cross-fade the WebView in. No FOUC, no white flash.
3. On `onError` / `onHttpError` / offline, we show a **native** retry state in the
   brand palette (matching the web's own error styling via the shared tokens),
   never the system "cannot open page" sheet.

---

## 8. Performance, caching, preloading, offline

- **Warm pool:** keep the customer storefront `WebSurface` mounted (hidden) so the
  first tap is instant; React Navigation's `lazy`/`detachInactiveScreens` tuned so
  hot surfaces stay warm and cold ones release memory.
- **Asset caching:** the web ships a service worker already (`ServiceWorkerRegistrar`,
  `StandaloneClass` in `layout.tsx`) — inside `WKWebView` the SW + HTTP cache do
  the heavy lifting; set `cacheEnabled` and a sane `WKWebsiteDataStore`. Pre-warm
  by loading the shell URL at app launch.
- **Preload bridge:** inject `window.OttavianoNative` via
  `injectedJavaScriptBeforeContentLoaded` so the page can call native on its very
  first effect without a race.
- **Older devices:** the native KDS/POS path means the perf-critical surfaces never
  touch the DOM, so an old iPad on the line isn't rendering a 2k-row web table.
  Budgets in `ARCHITECTURE.md` §9 still apply to the native surfaces.

---

## 9. Sample code

### 9.1 `WebSurface` (RN host) — see `native/ottaviano-rn/src/web/WebSurface.tsx`
Full, theme-aware, safe-area-aware, with native skeleton + error state and the
bridge wired. (Committed alongside this doc.)

### 9.2 The bridge contract — see `native/ottaviano-rn/src/web/bridge.ts`
Typed request/reply/event schema, the `injectedJavaScriptBeforeContentLoaded`
that defines `window.OttavianoNative`, and the native-side dispatcher with a
pluggable handler registry. (Committed alongside this doc.)

### 9.3 Web-side usage (drop into the Next app when you adopt this)

```ts
// A tiny ambient type so the web app can call native type-safely.
// (Lives in the WEB repo, e.g. src/types/native-bridge.d.ts — kept out of this
//  commit so it doesn't ship as an un-wired capability; paste it when adopting.)
declare global {
  interface Window {
    OttavianoNative?: {
      getContext(): Promise<{ app: "customer" | "operator"; skin: string;
        insets: { top: number; right: number; bottom: number; left: number };
        os: string; online: boolean }>;
      print(p: { orderId: string }): Promise<{ ok: boolean; jobId?: string; error?: string }>;
      haptic(kind?: "light" | "success" | "warning"): void;
      ready(): void; // call after hydration to dismiss the native skeleton
      // …scale:subscribe, scan, push:register — see bridge.ts
    };
  }
}
export {};
```

```tsx
// Feature-detect; degrade to web behavior off-device. NEVER assume native exists.
async function printReceipt(orderId: string) {
  const n = typeof window !== "undefined" ? window.OttavianoNative : undefined;
  if (n?.print) {
    const r = await n.print({ orderId });
    if (!r.ok) toast(`Print failed: ${r.error}`);
  } else {
    window.print(); // desktop browser / web fallback
  }
}
```

### 9.4 If you ever host in native Swift instead of RN
The §3 contract is transport-agnostic. In a `WKWebView` host:

```swift
let cfg = WKWebViewConfiguration()
cfg.userContentController.add(self, name: "ottaviano")     // web → native
let webView = WKWebView(frame: .zero, configuration: cfg)
webView.scrollView.contentInsetAdjustmentBehavior = .never // we drive safe area
// inject bridge + theme + insets in a WKUserScript at .atDocumentStart
// reply/events: webView.evaluateJavaScript("window.__ottavianoReply(\(json))")
```
`userContentController(_:didReceive:)` decodes the same `{id,type,payload}`;
replies/events call back via `evaluateJavaScript`. So the web side is identical
whether the host is RN or Swift — the bridge is the firewall.

---

## 10. Pitfalls & how to avoid them

- **App Store §4.2 ("minimum functionality").** A *pure* web wrapper gets
  rejected. Option B is safe because the app has a substantial native shell, push,
  BLE, printing, and offline POS — it's a native app that embeds web *views*, not
  a website in a chrome. Keep at least one genuinely native, hardware-using flow
  per target. (Option C is the one at risk — another reason to avoid it.)
- **CSS rendering deltas.** WKWebView ≠ desktop Chrome: `100vh` includes the URL
  bar quirk (use `100dvh` / the injected safe-area vars), `position: sticky` in
  scroll containers, momentum-scroll rubber-banding, `-webkit-fill-available`,
  tap-highlight (`-webkit-tap-highlight-color: transparent`), and 16px-min input
  font to stop zoom-on-focus. The web already targets iOS Safari (PWA), so most are
  handled — verify the embedded surfaces specifically.
- **Double scroll / nested scroll jank.** Don't wrap the WebView in a RN
  ScrollView; let the page scroll. `bounces`/`overScrollMode` tuned per surface.
- **The white flash.** Solved by the native skeleton + `ready()` handshake (§7) —
  do **not** ship without it; it's the #1 "feels like a webview" tell.
- **Auth races.** Single-flight refresh stays in native; web asks for a fresh
  token via the bridge instead of refreshing itself. Two refresh loops = random
  401s.
- **Memory on the KDS iPad.** Never put the KDS wall in a WebView; a long-lived DOM
  with 2k tickets leaks. The routing rule (§1) keeps it native.
- **Deep-link / back-button sync.** Map the web's `history` to RN navigation:
  intercept `onNavigationStateChange`, and let hardware/edge-swipe back pop the
  WebView history first, then the RN stack (§ navigation sync in `WebSurface`).
- **Offline white page.** A web surface opened offline must show the **native**
  offline state, not a dead WKWebView (§7).

---

## 11. Migration path (incremental, low-risk)

1. Land `react-native-webview` + `WebSurface` + `bridge.ts` (this commit's
   scaffolding). No behavior change yet.
2. Pick **one** low-risk customer surface (e.g. Rewards or Reservations), swap its
   native screen for a `WebSurface` pointed at the web path. Compare side-by-side.
3. Roll the routing rule (§1) surface-by-surface for the customer app; measure.
4. Do the operator long-tail admin surfaces (Reports, Settings, Compliance, …).
5. **Stop at the line.** POS, KDS, live tracker, and any printer/BLE-driving screen
   stay native — permanently.

Each step is reversible (flip the route back to the native screen), so this is a
dial, not a one-way door.

---

## 12. Doc-drift note (for maintainers)

While writing this I found the sibling native specs partly describe **superseded
stacks**: `ARCHITECTURE.md` / `DESIGN-SYSTEM.md` / `APP-SHELL.md` and the header of
`scripts/gen-native-tokens.ts` still speak of **SwiftUI / SwiftPM / `Tokens.generated.swift`
/ `native/ottaviano-ios`**, and `docs/native/README.md` says **"React Native +
Expo + expo-router / EAS"** — but the shipped app is **bare RN (no Expo, no EAS)**
generating **`tokens.generated.ts`**. That's pre-existing drift, out of scope for
this doc, but worth a cleanup pass so the specs match the code (CLAUDE.md Rule #11
spirit). Flagging, not silently rewriting historical specs.
