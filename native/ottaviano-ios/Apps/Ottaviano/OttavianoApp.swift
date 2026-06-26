import SwiftUI
import OttavianoKit
import FeatureMenu

// Ottaviano — the customer app composition root (APP-SHELL §2, §5.2). The @main
// builds the DI graph + router once and roots the iPhone-first TabView shell in
// the warm brand theme. Almost no logic lives here; it wires features together.
@main
struct OttavianoApp: App {
    @State private var deps = Dependencies.live(audience: .customer)
    @State private var router = Router()

    var body: some Scene {
        WindowGroup {
            CustomerRootView()
                .environment(\.theme, .ottaviano)
                .environment(\.dependencies, deps)
                .environment(router)
                .tint(Theme.ottaviano.color.accent)
        }
    }
}

struct CustomerRootView: View {
    @Environment(\.dependencies) private var deps

    // TODO: drive from a location picker; krakow is the seed default.
    private let location = "krakow"

    var body: some View {
        TabView {
            Tab("Menu", systemImage: "fork.knife") {
                NavigationStack {
                    MenuView(store: MenuStore(locationSlug: location, api: deps.api))
                }
            }
            Tab("Rewards", systemImage: "star.fill") {
                NavigationStack { ComingSoon("Soci e amici") }
            }
            Tab("Orders", systemImage: "bag.fill") {
                NavigationStack { ComingSoon("Your orders") }
            }
            Tab("Account", systemImage: "person.crop.circle") {
                NavigationStack { ComingSoon("Account") }
            }
        }
    }
}

private struct ComingSoon: View {
    let title: String
    init(_ title: String) { self.title = title }
    var body: some View {
        ContentUnavailableView(title, systemImage: "hourglass", description: Text("Next feature slice."))
            .navigationTitle(title)
    }
}
