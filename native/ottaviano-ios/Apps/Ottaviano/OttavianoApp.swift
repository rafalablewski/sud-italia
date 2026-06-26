import SwiftUI
import OttavianoKit
import AppFeatures

// Ottaviano — the customer app composition root (APP-SHELL §2, §5.2). The @main
// builds the DI graph + session once and roots the iPhone-first shell in the warm
// brand theme. Gated on sign-in; almost no logic here — it wires features.
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
        switch session.state {
        case .unknown:
            ProgressView()
        case .signedOut:
            AuthView(session: session)
        case .signedIn:
            TabView {
                Tab("Menu", systemImage: "fork.knife") {
                    NavigationStack { MenuView(store: MenuStore(locationSlug: location, api: deps.api)) }
                }
                Tab("Rewards", systemImage: "star.fill") {
                    NavigationStack { LoyaltyCardView(session: session) }
                }
                Tab("Orders", systemImage: "bag.fill") {
                    NavigationStack {
                        OrdersListView(store: OrdersStore(api: deps.api), api: deps.api, sse: deps.sse)
                    }
                }
            }
        }
    }
}
