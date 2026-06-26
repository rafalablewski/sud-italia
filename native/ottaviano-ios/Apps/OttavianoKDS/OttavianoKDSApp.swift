import SwiftUI
import OttavianoKit
import AppFeatures

// OttavianoKDS — the operator app composition root (APP-SHELL §2, §5.1). iPad-
// first NavigationSplitView shell in the dark operator theme. A live order board
// proves the same APIClient + token flow the customer app uses.
@main
struct OttavianoKDSApp: App {
    @State private var deps = Dependencies.live(audience: .operatorApp)
    @State private var router = Router()

    var body: some Scene {
        WindowGroup {
            OperatorRootView()
                .environment(\.theme, .kds)
                .environment(\.dependencies, deps)
                .environment(router)
                .tint(Theme.kds.color.accent)
                .preferredColorScheme(.dark)
        }
    }
}

enum OperatorSection: String, CaseIterable, Identifiable {
    case board, kds, account
    var id: String { rawValue }
    var title: String { rawValue == "kds" ? "Kitchen" : rawValue.capitalized }
    var icon: String {
        switch self {
        case .board: "list.bullet.rectangle"
        case .kds: "flame"
        case .account: "person.crop.circle"
        }
    }
}

struct OperatorRootView: View {
    @Environment(\.dependencies) private var deps
    @State private var selection: OperatorSection? = .board

    var body: some View {
        NavigationSplitView {
            List(OperatorSection.allCases, selection: $selection) { section in
                Label(section.title, systemImage: section.icon).tag(section)
            }
            .navigationTitle("OttavianoKDS")
        } detail: {
            switch selection ?? .board {
            case .board: NavigationStack { OperatorBoardView() }
            case .kds: NavigationStack { KDSBoardView(store: KDSStore(api: deps.api, sse: deps.sse)) }
            case .account: ContentUnavailableView("Account", systemImage: "person.crop.circle", description: Text("Next feature slice."))
            }
        }
    }
}

/// Minimal live board — lists recent orders off `/api/v1/orders`, proving the
/// operator auth + APIClient path. Full Kanban/KDS lands as the feature grows.
struct OperatorBoardView: View {
    @Environment(\.dependencies) private var deps
    @Environment(\.theme) private var theme
    @State private var orders: [Order] = []
    @State private var error: String?

    var body: some View {
        List(orders) { order in
            HStack {
                VStack(alignment: .leading) {
                    Text(order.id).font(.headline).foregroundStyle(theme.color.textPrimary)
                    Text(order.customerName).font(.subheadline).foregroundStyle(theme.color.textSecondary)
                }
                Spacer()
                Text(order.status.rawValue).font(.caption.weight(.bold))
                    .padding(.horizontal, theme.space.sm).padding(.vertical, theme.space.xs)
                    .background(theme.color.surface2, in: Capsule())
                    .foregroundStyle(theme.color.accent)
                MoneyText(order.totalAmount).foregroundStyle(theme.color.textPrimary)
            }
        }
        .overlay { if let error { ContentUnavailableView("Couldn't load", systemImage: "exclamationmark.triangle", description: Text(error)) } }
        .navigationTitle("Orders")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do { orders = try await deps.api.send(.operatorBoard(location: nil)); error = nil }
        catch let e as APIError { if case .api(_, let m, _) = e { error = m } else { error = "Offline" } }
        catch { error = "Something went wrong" }
    }
}
