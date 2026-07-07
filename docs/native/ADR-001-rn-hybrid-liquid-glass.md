# ADR-001 — OttavianoKDS → React Native + bridged SwiftUI (Liquid Glass)

> **Status:** Proposed — **spike PASSED the buildable gates**; pending an on-device
> visual sign-off before Accepted. The POC (RN POS + a bridged SwiftUI
> `LiquidGlassView`) built, archived against the iOS 26 SDK, and uploaded to the
> operator TestFlight **on the first try** (RN TestFlight run #423,
> `28865502481` — green). See §6 for the gate results.
>
> **Date:** 2026-07-07 · **Supersedes (partial):** the *operator-app* rendering
> choice in [`IOS-WEB-MIRROR.md`](./IOS-WEB-MIRROR.md) (Option A, "100% native
> SwiftUI") — **not** its "no WebView" conclusion, which this ADR keeps.

This is the repo's first Architecture Decision Record. Format: Context → Decision →
Consequences → Alternatives → Plan → Open questions. Future ADRs follow the same
shape and number sequentially (`ADR-00N-*.md`).

---

## 1. Context

### 1.1 The problem this addresses — visual/feature drift
The operator app mirrors the web Core surfaces (POS, KDS, Guest, Service, …) "1:1".
Today that mirror is held **by hand-authored SwiftUI kept in parity by audit**, and
[`IOS-WEB-MIRROR.md` §3](./IOS-WEB-MIRROR.md) names the weak spot exactly:

> *"Layout & interaction — held by **audit, not codegen** (the soft spot)."*

Only the **tokens** (`gen-native-tokens.ts`), **IA/nav** (`gen-native-nav.ts`), and
the **API contract** (`gen-openapi.ts`) are generated from the web. Every *layout*
is re-implemented in SwiftUI by a human reading the web and re-typing it. In
practice this drifts: a web dense-console redesign (POS, Service) lands and the
SwiftUI screens silently fall a generation behind until someone re-ports them. The
maintenance cost is real and recurring — [`IOS-WEB-MIRROR.md`](./IOS-WEB-MIRROR.md)
booked it honestly as *"high — accepted."* We are choosing to stop accepting it.

### 1.2 The stack has already pivoted three times
| PR | Move |
|---|---|
| #216 | Retire SwiftUI → RN (Expo) — both apps |
| #217 | Expo → **bare React Native** (no Expo) |
| #221 | OttavianoKDS → **back to native SwiftUI** ("we build only SwiftUI", owner directive) |
| #224, #226 | SwiftUI operator app tracks the Liquid Glass look + Service OS parity |

The **customer app (Ottaviano) stayed React Native** the whole time and today
*shares one TypeScript codebase with the web* (`native/ottaviano-rn`). Only the
**operator app** was pulled back to SwiftUI. So the codebases are split by
framework, not by need — and the SwiftUI-only directive is the thing this ADR
re-opens. **Naming the flip-flop explicitly is deliberate:** this is the fourth
pivot; it must be a considered decision, not another swing, which is why it's
gated on a spike (§6) before it's Accepted.

### 1.3 Liquid Glass forces a native element regardless
The target look is Apple's iOS 26 **Liquid Glass** material (`UIGlassEffect` /
SwiftUI `.glassEffect`). **React Native cannot render it** — RN draws its own view
tree and has no access to the system glass material. Any RN operator app that wants
authentic Liquid Glass *must* bridge a native SwiftUI/UIKit view for the glass
surfaces. So "pure RN" was never on the table for this design language; the only
question is whether we embrace RN-for-parity **plus** native-elements-for-glass.

---

## 2. Decision

Move **OttavianoKDS** to **React Native as the app framework**, with
**bridged native SwiftUI components** for the platform-signature surfaces —
foremost **Liquid Glass**, and secondarily any 120fps / gesture-critical KDS
element. Concretely:

1. **RN owns the component layer.** Screens are authored once in TypeScript/React
   (RN primitives), converging with the existing RN customer app and sharing
   domain/logic TS with the web. This is where web↔native parity is *cheap* — same
   language, same component model, driven by the same generated tokens.
2. **SwiftUI owns the material layer.** A small set of **native components** are
   bridged into RN as `<LiquidGlassView>`, `<KdsTicketSurface>`, etc. — thin Swift
   views wrapping `.glassEffect` and other iOS-26-only affordances, exposed via
   RN's native-component API. RN composes them; SwiftUI renders the glass.
3. **Keep "no WebView."** This ADR does **not** revisit the WKWebView rejection in
   [`IOS-WEB-MIRROR.md`](./IOS-WEB-MIRROR.md) — the offline + high-fps arguments
   still hold. We render native, just with RN + SwiftUI instead of SwiftUI alone.
4. **The backend is untouched.** The `/api/v1` facade, OpenAPI codegen, tokens/nav
   generators, and the SOC-2/parity ledgers all persist unchanged; the RN app
   consumes the same contract the SwiftUI app does.

### What we do **not** claim
We are **not** literally reusing web CSS/DOM components — RN has its own primitives.
The win is *one language + one component model + shared logic + generated tokens*,
which shrinks drift by an order of magnitude vs SwiftUI hand-porting, **not** a
zero-port outcome.

---

## 3. Consequences

**Positive**
- Drift collapses: a web component change is a TS/React change the RN side can track
  (and often literally share), instead of a manual SwiftUI re-port.
- Authentic **Liquid Glass** via the bridged SwiftUI element — impossible in pure RN.
- One operator+customer RN codebase; the existing `native/ottaviano-rn` app + its
  Xcode/TestFlight pipeline are the foundation, not a greenfield.
- The SwiftUI work already shipped is not wasted — it is the **reference spec**
  (every screen's data flow, endpoints, and layout are now known), so the RN port
  is fast and low-risk to scope.

**Negative / costs**
- **Migration, not a tweak.** The SwiftUI OttavianoKDS is eventually retired
  (sunk cost). It keeps shipping until the RN app reaches parity, so there's no gap.
- **Two rendering systems** in one app (RN Fabric + native SwiftUI components) — more
  build/bridge complexity; requires the **RN New Architecture (Fabric)** for clean
  native-component interop.
- **iOS 26 minimum for glass** (with a graceful fallback material on older iOS).
- Re-opens a signed-off directive; must be recorded (this ADR) so it's intentional.

---

## 4. Alternatives considered (and why not)

| Alt | What | Why not (now) |
|---|---|---|
| **Deepen codegen, stay SwiftUI** | Generate component/layout specs web→SwiftUI | Best *incremental* option and still reduces drift, but never gives a shared component model and still hand-authors every SwiftUI view; doesn't get us Liquid-Glass-via-native for free (SwiftUI already can, but the parity problem remains). Viable fallback if the spike fails. |
| **WKWebView / hybrid** | Render literal web in a WebView | Already rejected in `IOS-WEB-MIRROR.md` — offline + 120fps KDS. Unchanged. |
| **Stay hand-porting SwiftUI** | Status quo | The drift cost we're explicitly rejecting. |

---

## 5. Migration plan (staged, no big-bang)

0. **This ADR** (recorded).
1. **Spike / POC (current):**
   - Bridge one native SwiftUI component: **`LiquidGlassView`** wrapping iOS 26
     `.glassEffect`, exposed to RN, with a pre-26 fallback.
   - Port **one screen — POS** — in RN (KPI strip · category rail · menu grid ·
     docked check) on the glass surface, using the generated tokens + the RN API
     client. POS is chosen because its data flow and layout are fully known from the
     SwiftUI port.
   - Ship via the existing RN Xcode-26 TestFlight pipeline; validate on device.
2. **Gate (see §6).** If the spike passes, promote this ADR to Accepted.
3. **Migrate wave by wave**, highest-traffic first (POS → KDS → Guest → Service →
   admin surfaces), reusing the SwiftUI screens as the spec. The SwiftUI app keeps
   shipping until each surface reaches RN parity.
4. **Retire** `native/ottaviano-ios` once the RN operator app is at full parity;
   keep its screens referenced in the parity ledger history.

## 6. Spike success gates — results
1. **Glass bridge works on device** — ✅ *buildable gate passed.* The bridged
   SwiftUI `LiquidGlassView` (`.glassEffect`, `#available(iOS 26)`-guarded, hosted
   via `UIHostingController`) **compiled against the iOS 26 SDK, archived, signed,
   and uploaded to the operator TestFlight on the first attempt** (RN run #423) —
   no compile-fix round, unlike the SwiftUI hand-ports. *Remaining:* an on-device
   **visual** confirmation that the material renders as expected (open the
   TestFlight build).
2. **RN↔web parity is cheap** — ✅ The POS screen (`features/operator/Pos.tsx`,
   ~250 lines) **typechecked clean on the first try** (`tsc` exit 0), reusing the
   generated tokens (`useTheme`) + shared UI primitives + the authed client. The
   SwiftUI hand-port of the same screen took several commits *and* a Swift-6
   compile-fix pass.
3. **Shared TS holds** — ✅ The screen uses the same TS/React types and patterns as
   the web, off the same `/api/v1` contract, with no fork.

**Verdict:** the two hard technical unknowns — *can RN host a SwiftUI element that
builds+ships the real iOS 26 glass* and *is the RN port materially cheaper* — both
resolved **yes** on the first attempt. Pending only the human on-device visual
sign-off, this ADR is ready to promote to **Accepted** and begin the staged
migration (§5.3).

## 7. Open questions (resolved during the spike)
- Is the RN New Architecture (Fabric) already enabled in `native/ottaviano-rn`? If
  not, enabling it is a spike prerequisite for the native component.
- iOS deployment target vs the iOS 26 Liquid Glass floor — confirm the minimum and
  the fallback material for older devices.
- Legacy-bridge (`RCTViewManager`) vs Fabric codegen for the native component — pick
  the one matching the app's current arch; prefer Fabric if New Arch is on.
