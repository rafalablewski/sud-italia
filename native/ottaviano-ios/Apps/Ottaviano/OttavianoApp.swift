import SwiftUI
import OttavianoKit
import AppFeatures

// Ottaviano — the customer app composition root (APP-SHELL §2, §5.2). The @main
// builds the DI graph + session + cart once and roots the iPhone-first shell in
// the warm Tuscany brand theme. Storefront-first: NOT gated on sign-in (Rule #6) —
// anyone can browse, build a cart and check out as a guest; identity is only
// requested for Rewards / your Orders. The tabs mirror the web customer IA:
// Order (menu + cart) · Rewards (loyalty) · Orders (history + live tracking) ·
// More (famiglia / soci / locations / account).
@main
struct OttavianoApp: App {
    private let deps: Dependencies
    @State private var session: CustomerSession
    @State private var locations: LocationsStore
    @State private var cart: CartStore
    @State private var router = Router()

    init() {
        let d = Dependencies.live(audience: .customer)
        deps = d
        _session = State(initialValue: CustomerSession(api: d.api, tokens: d.tokens))
        _locations = State(initialValue: LocationsStore(api: d.api))
        _cart = State(initialValue: CartStore(locationSlug: "krakow"))
    }

    var body: some Scene {
        WindowGroup {
            CustomerRootView(session: session, locations: locations, cart: cart)
                .environment(\.theme, .ottaviano)
                .environment(\.dependencies, deps)
                .environment(router)
                .environment(cart)
                .tint(Theme.ottaviano.color.accent)
                .task { await session.bootstrap() }
        }
    }
}

struct CustomerRootView: View {
    @Environment(\.dependencies) private var deps
    let session: CustomerSession
    let locations: LocationsStore
    let cart: CartStore

    /// The restaurant the storefront is showing. Switching it clears the cart
    /// (prices/availability are per-location) and rebuilds the menu via `.id`.
    @State private var location = "krakow"

    var body: some View {
        TabView {
            Tab("Order", systemImage: "fork.knife") {
                NavigationStack {
                    MenuView(
                        store: MenuStore(locationSlug: location, api: deps.api),
                        locations: locations,
                        selectedLocation: $location,
                        session: session,
                        api: deps.api
                    )
                    .id(location)   // rebuild the menu when the location changes
                }
            }
            Tab("Rewards", systemImage: "star.fill") {
                NavigationStack {
                    SignInGate(
                        session: session,
                        title: "Your loyalty card",
                        message: "Collect a point for every złoty and climb the tiers. Join with just your phone number.",
                        icon: "star.circle.fill"
                    ) {
                        LoyaltyCardView(session: session)
                    }
                    .navigationTitle("Rewards")
                }
            }
            Tab("Orders", systemImage: "bag.fill") {
                NavigationStack {
                    SignInGate(
                        session: session,
                        title: "Track your orders",
                        message: "See live status and your order history once you sign in with your phone.",
                        icon: "bag.circle.fill"
                    ) {
                        OrdersListView(store: OrdersStore(api: deps.api), api: deps.api, sse: deps.sse)
                    }
                    .navigationTitle("Orders")
                }
            }
            Tab("More", systemImage: "ellipsis.circle") {
                NavigationStack { AccountView(session: session, locations: locations) }
            }
        }
        .onChange(of: location) { _, new in cart.setLocation(new) }
    }
}
