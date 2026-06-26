import SwiftUI
import OttavianoKit
import AppFeatures

// Ottaviano — the customer app composition root (APP-SHELL §2, §5.2). The @main
// builds the DI graph + session once and roots the iPhone-first shell in the warm
// Tuscany brand theme. Storefront-first: NOT gated on sign-in (Rule #6) — anyone
// can browse and order; identity is only requested for Rewards / your Orders.
@main
struct OttavianoApp: App {
    private let deps: Dependencies
    @State private var session: CustomerSession
    @State private var router = Router()

    init() {
        let d = Dependencies.live(audience: .customer)
        deps = d
        _session = State(initialValue: CustomerSession(api: d.api, tokens: d.tokens))
    }

    var body: some Scene {
        WindowGroup {
            CustomerRootView(session: session)
                .environment(\.theme, .ottaviano)
                .environment(\.dependencies, deps)
                .environment(router)
                .tint(Theme.ottaviano.color.accent)
                .task { await session.bootstrap() }
        }
    }
}

struct CustomerRootView: View {
    @Environment(\.dependencies) private var deps
    let session: CustomerSession

    // TODO: drive from a location picker; krakow is the seed default.
    private let location = "krakow"

    var body: some View {
        TabView {
            Tab("Menu", systemImage: "fork.knife") {
                NavigationStack { MenuView(store: MenuStore(locationSlug: location, api: deps.api)) }
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
        }
    }
}
