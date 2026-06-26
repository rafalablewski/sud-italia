# Ottaviano Native — Navigation & App-Shell Spec

> **Stage 3b.** How the two apps are assembled: the SwiftPM workspace, the
> composition roots, dependency injection, the typed router, the per-platform
> navigation shells, the feature-module contract, and the launch sequence.
> Swift here is **specification source** (compiled in Xcode on a Mac — see
> ARCHITECTURE §0). Companion to `ARCHITECTURE.md` and `DESIGN-SYSTEM.md`.
> Lands in the dedicated **`ottaviano-ios`** repo (§13 Decision D).

**Owner role:** Founding iOS Staff Engineer · iOS 26 · Swift 6 strict concurrency

---

## 1. Workspace & package graph

One Xcode workspace, many SwiftPM packages. App targets are **thin composition
roots** — they wire features together and own almost no logic.

```
ottaviano-ios/                              (the dedicated repo)
├── OttavianoPlatform.xcworkspace
├── Apps/
│   ├── Ottaviano/            @main, DI wiring, customer TabView shell
│   └── OttavianoKDS/         @main, DI wiring, operator SplitView shell
└── Packages/
    ├── OttavianoKit/         (umbrella library)
    │   ├── DesignSystem/     Stage 3a
    │   ├── CoreModels/       generated Codable domain types (from /api/v1 contract)
    │   ├── Networking/       APIClient (actor), auth, SSE, retry
    │   ├── Persistence/      local store + migrations
    │   ├── Sync/             write-outbox actor + conflict resolution
    │   └── AppInfra/         Router, DI container, logging, flags, errors
    └── Features/
        ├── customer: Menu, Ordering, Loyalty, Wallet, Reservations, Account
        └── operator: POS, KDS, Tables, Orders, Inventory, Reporting, Staff, Settings
```

**Dependency direction (enforced):**
`App → Features → OttavianoKit`. A feature may depend on Kit; a feature **may not
import another feature**. Cross-feature navigation goes through the `Router`
(§4). This keeps build times low and ownership clean as features multiply.

```swift
// Packages/Package.swift (sketch)
let package = Package(
  name: "OttavianoKit",
  platforms: [.iOS(.v26)],
  products: [.library(name: "OttavianoKit", targets: ["AppInfra","Networking",
             "Persistence","Sync","CoreModels","DesignSystem"])],
  targets: [
    .target(name: "DesignSystem"),
    .target(name: "CoreModels"),
    .target(name: "Networking", dependencies: ["CoreModels","AppInfra"]),
    .target(name: "Persistence", dependencies: ["CoreModels","AppInfra"]),
    .target(name: "Sync", dependencies: ["Networking","Persistence","AppInfra"]),
    .target(name: "AppInfra"),
    .testTarget(name: "SyncTests", dependencies: ["Sync"]),
  ]
)
```

---

## 2. Composition root — the only place the graph is built

```swift
@main struct OttavianoApp: App {                 // customer
    @State private var deps = Dependencies.live(app: .customer)
    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(\.theme, .ottaviano)
                .environment(deps.router)
                .environment(\.dependencies, deps)
                .task { await deps.bootstrap() }     // §6 launch sequence
        }
    }
}
```
`OttavianoKDS` is identical but `.kds` theme, `app: .operator`, and an
operator `RootView`. **All construction happens here**; nothing else calls
`.live(...)`. Tests build `Dependencies.preview(...)` or `.mock(...)`.

---

## 3. Dependency injection — compile-checked, no framework

A plain struct of `protocol`-typed services, provided through the environment.
This is testable (swap any service), traceable (one definition), and free
(no reflection).

```swift
public struct Dependencies: Sendable {
    public let api: APIClient
    public let auth: AuthService
    public let store: LocalStore
    public let sync: SyncEngine
    public let router: Router
    public let flags: FeatureFlags
    public let clock: any Clock<Duration>           // injected → deterministic tests

    public static func live(app: AppKind) -> Dependencies { /* build real graph */ }
    public static func mock(_ o: Overrides = .init()) -> Dependencies { /* fakes */ }
    public func bootstrap() async { await sync.start() }
}

private struct DependenciesKey: EnvironmentKey {
    static let defaultValue: Dependencies = .mock()   // previews get fakes for free
}
public extension EnvironmentValues { var dependencies: Dependencies {
    get { self[DependenciesKey.self] } set { self[DependenciesKey.self] = newValue } } }
```
Feature stores receive only the services they need (constructor injection), never
the whole `Dependencies` bag — so a store's dependencies are visible in its
signature and `God-object` access is impossible.

```swift
@Observable @MainActor final class POSStore {
    private let orders: OrderService          // not the whole Dependencies
    private let sync: SyncEngine
    init(orders: OrderService, sync: SyncEngine) { … }
}
```

---

## 4. The typed Router — total, testable navigation

Navigation is **data**: an enum of routes drives a `NavigationStack` path (or
SplitView selection). Deep links, state restoration, and cross-feature jumps are
all "append a `Route`."

```swift
public enum Route: Hashable, Codable, Sendable {           // exhaustive
    // customer
    case menu(locationID: ID), item(MenuItemID), cart, checkout, orderTracker(OrderID)
    case loyalty, wallet, reservation(new: Bool), account
    // operator
    case pos(tableID: ID?), kds(station: StationID), orders, orderDetail(OrderID)
    case tables, inventory, reporting(Report), staff, settings(SettingsTab)
}

@Observable @MainActor public final class Router {
    public var path = NavigationPath()
    public var sidebar: SidebarItem?           // iPad SplitView selection
    public var sheet: Route?                   // modal presentation
    public func push(_ r: Route) { path.append(r) }
    public func present(_ r: Route) { sheet = r }
    public func handle(deepLink: URL) { /* map URL → Route(s), set path */ }
    public func restore(_ snapshot: Data) { /* Codable path persistence */ }
}
```
A single `routeDestination(_:)` view-builder maps `Route → feature View`,
injecting that feature's store from `Dependencies`. **Features never construct
each other's views** — they `router.push(.orderDetail(id))` and the root resolves it.

---

## 5. Per-platform shells (native, not responsive-web)

### 5.1 Operator (iPad-first) — `NavigationSplitView` + command surface
```swift
struct OperatorRootView: View {
    @Environment(Router.self) private var router
    var body: some View {
        NavigationSplitView {
            OperatorSidebar(selection: $router.sidebar)          // POS · KDS · Orders · …
        } content: {
            ColumnView(for: router.sidebar)                      // list column
        } detail: {
            NavigationStack(path: $router.path) {
                DetailRoot().navigationDestination(for: Route.self, destination: routeDestination)
            }
        }
        .inspector(isPresented: $showInspector) { OrderInspector() }   // iPad inspector
        .commands { OperatorCommands(router: router) }                  // ⌘ shortcuts
        .overlay(alignment: .center) { CommandPalette() }               // ⌘K
    }
}
```
Operator essentials, all native:
- **`NavigationSplitView`** three-column on iPad, collapses gracefully on iPhone.
- **`⌘K` command palette** (fuzzy actions/navigation), full **keyboard-shortcut**
  map (`.keyboardShortcut`), **hardware-keyboard** POS entry.
- **Drag & drop** (`.draggable`/`.dropDestination`): order→table, ticket→lane.
- **`.contextMenu`**, **multi-select**, **`.inspector`** for order/line detail.
- **Multiple windows / Stage Manager**: KDS on one display, POS on another
  (`UIScene` aware; router is per-scene).

### 5.2 Customer (iPhone-first) — `TabView` + `NavigationStack`
```swift
struct CustomerRootView: View {
    @Environment(Router.self) private var router
    var body: some View {
        TabView {
            Tab("Menu", systemImage: "fork.knife") {
                NavigationStack(path: $router.path) {
                    MenuView().navigationDestination(for: Route.self, destination: routeDestination)
                }
            }
            Tab("Rewards", systemImage: "star.fill") { LoyaltyView() }
            Tab("Orders", systemImage: "bag.fill") { OrdersView() }
            Tab("Account", systemImage: "person.crop.circle") { AccountView() }
            Tab(role: .search) { SearchView() }     // native search tab
        }
        .sheet(item: $router.sheet, content: routeSheet)   // cart, item detail
    }
}
```
Customer essentials: bottom **sheets** with detents (cart, item customise),
**`.searchable`**, **swipe actions**, **`PayWithApplePayButton`**, **Live
Activities** (order tracker on Lock Screen / Dynamic Island), **App Intents**
("Reorder my usual" via Siri/Shortcuts), **Handoff** web↔app during the transition
period, **Universal Links** so QR/table codes open the app to the right route.

---

## 6. Launch sequence (deterministic, offline-tolerant)

```
@main App
  └─ build Dependencies.live  (no I/O in init)
  └─ .task { bootstrap() }
        1. AuthService.restore()        → Keychain refresh token? silent access refresh
        2. LocalStore.open()            → run migrations; UI can render from cache NOW
        3. SyncEngine.start()           → replay write-outbox, pull deltas, open SSE
        4. flags + remote config        → API base URL (Vercel-exit agility), kill-switches
  RootView renders from the LOCAL store at step 2 — the network is never on the
  first-paint path. Unauthenticated → AuthFlow; authed → role-scoped shell.
```
- **First paint reads cache**, not the network → cold-launch budget < 1s holds
  even on hotel Wi-Fi.
- **Scene/state restoration**: `Router.path` is `Codable` → relaunch lands the
  operator back on the exact order they were on.
- **Auth gate is server-truth**: client renders the role's shell for UX; every
  `/api/v1` call is still authorised server-side (reuses existing RBAC).

---

## 7. Feature-module contract

A feature package exposes exactly:
```swift
public enum MenuFeature {                       // namespace, no instances
    public static func rootView(_ deps: Dependencies) -> some View   // entry
    public static func destination(_ route: Route, _ deps: Dependencies) -> AnyView?  // its routes
    public static var commands: [AppCommand] { get }                 // ⌘K + shortcuts it contributes
    public static var deepLinks: [DeepLinkMatcher] { get }           // URLs it owns
}
```
The app shell composes features by collecting their `destination`/`commands`/
`deepLinks` — **adding a feature is registering it in one list**, not editing the
shell's internals. This is the seam that lets the platform grow to dozens of
features without the root view rotting into a God-view.

---

## 8. What this kills from the web app (by being native)
- **Portal/z-index trapping** (web Rule #4) → SwiftUI scene presentation; gone.
- **Manifest/route-group juggling for two apps** → two real app targets sharing a
  package; gone.
- **Hydration flashes / skin-boot scripts** → immutable `Theme` in environment; gone.
- **Network-on-first-paint jank** → local-store-first launch; gone.
- **Responsive-breakpoint guessing** → real per-idiom shells (`SplitView` vs `TabView`).

---

## 9. Exit criterion (Stage 4 readiness)
Both apps **launch, authenticate, and render a list that hydrates from the local
store offline**, with the router driving navigation and DI providing mockable
services — before any business feature (Stage 5) is built. At that point the
spine is proven and features become parallelisable, independently-owned work.
