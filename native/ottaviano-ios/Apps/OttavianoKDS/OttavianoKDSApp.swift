import SwiftUI
import OttavianoKit
import AppFeatures

// OttavianoKDS — the operator app composition root (APP-SHELL §2, §5.1). iPad-
// first NavigationSplitView in the dark operator theme, gated on a staff sign-in.
// The sidebar mirrors the WEB operator IA exactly: the Core surfaces
// (POS/KDS/Orders/Guest/Service) plus every /admin section, role-filtered by the
// signed-in staff member's rank — owner/admin sees all, a franchise manager sees
// their scope, a chef (kitchen) sees the line. This is the "KDS has everything
// admin and core has" parity contract (see Sources/AppInfra/OperatorNav.swift).
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

struct OperatorRootView: View {
    @Environment(\.dependencies) private var deps
    @Environment(\.theme) private var theme
    let session: OperatorSession

    @State private var selection: OperatorNavItem?
    @State private var showAccount = false

    /// The staff role drives the rail — the same gate as the web admin sidebar
    /// (`filterNavForRoleV3`). Unknown/legacy roles fall to the lowest rank.
    private var role: OperatorRole { OperatorRole.from(session.user?.role) }
    private var sections: [OperatorNavSection] { filteredNav(for: role) }

    var body: some View {
        switch session.state {
        case .unknown:
            ProgressView().controlSize(.large)
        case .signedOut:
            OperatorLoginView(session: session)
        case .signedIn:
            shell
        }
    }

    private var shell: some View {
        NavigationSplitView {
            List(selection: $selection) {
                ForEach(sections) { section in
                    Section(section.label) {
                        ForEach(section.items) { item in
                            Label(item.label, systemImage: item.icon).tag(item)
                        }
                    }
                }
            }
            .navigationTitle("OttavianoKDS")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAccount = true } label: { Image(systemName: "person.crop.circle") }
                        .accessibilityLabel("Account")
                }
            }
            .sheet(isPresented: $showAccount) {
                NavigationStack { OperatorAccountView(session: session) }
            }
        } detail: {
            NavigationStack {
                detail(for: selection ?? defaultItem)
            }
        }
        .onAppear { if selection == nil { selection = defaultItem } }
    }

    /// First landing surface: the dashboard for managers+, the KDS lanes for a
    /// chef (kitchen rank has no admin reach, so the board is their home).
    private var defaultItem: OperatorNavItem {
        operatorNavItem(id: role == .kitchen ? "/core/kds" : "/admin")
            ?? sections.first!.items.first!
    }

    /// Route a nav item to its native surface. `.live` items render real data off
    /// `/api/v1`; the rest render the parity surface (Rule #1 — no fabricated data).
    @ViewBuilder
    private func detail(for item: OperatorNavItem) -> some View {
        switch item.id {
        case "/core/pos":
            OperatorPOSView(api: deps.api)
        case "/core/kds":
            KDSBoardView(store: KDSStore(api: deps.api, sse: deps.sse))
        case "/core/orders", "/admin/orders":
            OperatorBoardView()
        case "/admin":
            OperatorDashboardView()
        case "/admin/reports":
            OperatorReportsView()
        case "/admin/customers":
            OperatorCustomersView(api: deps.api)
        case "/admin/staff":
            OperatorStaffView(api: deps.api)
        case "/admin/suppliers":
            OperatorSuppliersView(api: deps.api)
        case "/admin/feedback":
            OperatorFeedbackView(api: deps.api)
        case "/admin/inventory":
            OperatorInventoryView(api: deps.api)
        case "/admin/purchase-orders":
            OperatorPurchaseOrdersView(api: deps.api)
        case "/core/service":
            OperatorSlotsView(api: deps.api)
        case "/admin/menu":
            OperatorMenuView(api: deps.api)
        case "/admin/recipes":
            OperatorRecipesView(api: deps.api)
        case "/core/guest":
            OperatorGuestView(api: deps.api)
        case "/admin/alerts":
            OperatorAlertsView(api: deps.api)
        case "/admin/comms/tasks":
            OperatorTasksView(api: deps.api)
        case "/admin/comms/announcements":
            OperatorAnnouncementsView(api: deps.api)
        case "/admin/schedule":
            OperatorScheduleView(api: deps.api)
        case "/admin/users":
            OperatorUsersView(api: deps.api)
        case "/admin/audit-log":
            OperatorAuditView(api: deps.api)
        case "/admin/cash":
            OperatorCashView(api: deps.api)
        case "/admin/business-costs":
            OperatorBusinessCostsView(api: deps.api)
        case "/admin/compliance":
            OperatorComplianceView(api: deps.api)
        case "/admin/events":
            OperatorEventsView(api: deps.api)
        case "/admin/waste":
            OperatorWasteView(api: deps.api)
        case "/admin/surveys":
            OperatorSurveysView(api: deps.api)
        case "/admin/welcome":
            OperatorWelcomeView(role: role)
        case "/admin/ai":
            OperatorInsightsView()
        case "/admin/locations":
            OperatorMultiLocationView(api: deps.api)
        case "/admin/expansion":
            OperatorExpansionView(api: deps.api)
        case "/admin/scheduled-bundles":
            OperatorScheduledBundlesView(api: deps.api)
        case "/admin/settings":
            OperatorSettingsView(api: deps.api, surface: "general", title: "Settings")
        case "/admin/payments":
            OperatorSettingsView(api: deps.api, surface: "payments", title: "Payments")
        case "/admin/qr-ordering":
            OperatorSettingsView(api: deps.api, surface: "qr", title: "QR ordering")
        case "/admin/integrations":
            OperatorSettingsView(api: deps.api, surface: "integrations", title: "Integrations")
        case "/admin/currency":
            OperatorSettingsView(api: deps.api, surface: "currency", title: "Currency")
        case "/admin/languages":
            OperatorSettingsView(api: deps.api, surface: "languages", title: "Languages")
        case "/admin/upsell":
            OperatorSettingsView(api: deps.api, surface: "upsell", title: "Upsell")
        case "/admin/crosssell":
            OperatorSettingsView(api: deps.api, surface: "upsell", title: "Cross-sell")
        case "/admin/corporate":
            OperatorCorporateView(api: deps.api)
        case "/admin/locations/manage":
            OperatorManageLocationsView(api: deps.api)
        case "/admin/growth":
            OperatorCampaignsView(api: deps.api)
        case "/admin/handover":
            OperatorHandoverView(api: deps.api)
        case "/admin/permissions":
            OperatorPermissionsView(api: deps.api)
        case "/admin/haccp":
            OperatorHaccpView(api: deps.api)
        case "/admin/menu-engineering":
            OperatorMenuEngineeringView(api: deps.api)
        case "/admin/regulatory-compliance":
            OperatorRegulatoryView(api: deps.api)
        case "/admin/simulation":
            OperatorCalculatorView(api: deps.api)
        case "/admin/ai/agent":
            OperatorAgentView(api: deps.api)
        default:
            OperatorSurfaceView(item: item)
        }
    }
}
