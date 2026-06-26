import SwiftUI
import OttavianoKit
import AppFeatures

// OttavianoKDS — the operator app composition root (APP-SHELL §2, §5.1). iPad-
// first NavigationSplitView shell in the dark operator theme, gated on a staff
// sign-in (unlike the customer app). A live order board + kitchen lanes prove the
// same APIClient + token flow the customer app uses.
@main
struct OttavianoKDSApp: App {
    private let deps: Dependencies
    @State private var session: OperatorSession
    @State private var router = Router()

    init() {
        let d = Dependencies.live(audience: .operatorApp)
        deps = d
        _session = State(initialValue: OperatorSession(api: d.api, tokens: d.tokens))
    }

    var body: some Scene {
        WindowGroup {
            OperatorRootView(session: session)
                .environment(\.theme, .kds)
                .environment(\.dependencies, deps)
                .environment(router)
                .tint(Theme.kds.color.accent)
                .preferredColorScheme(.dark)
                .task { await session.bootstrap() }
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
    let session: OperatorSession
    @State private var selection: OperatorSection? = .board

    var body: some View {
        switch session.state {
        case .unknown:
            ProgressView().controlSize(.large)
        case .signedOut:
            OperatorLoginView(session: session)
        case .signedIn:
            NavigationSplitView {
                List(OperatorSection.allCases, selection: $selection) { section in
                    Label(section.title, systemImage: section.icon).tag(section)
                }
                .navigationTitle("OttavianoKDS")
            } detail: {
                switch selection ?? .board {
                case .board: NavigationStack { OperatorBoardView() }
                case .kds: NavigationStack { KDSBoardView(store: KDSStore(api: deps.api, sse: deps.sse)) }
                case .account: NavigationStack { OperatorAccountView(session: session) }
                }
            }
        }
    }
}
