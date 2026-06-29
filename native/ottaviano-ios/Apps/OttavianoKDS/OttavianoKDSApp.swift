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
    /// Free-text jump bar over the whole IA — an operator app with 54 surfaces
    /// is unusable without one. Filters sections by label + purpose blurb.
    @State private var query = ""

    /// The staff role drives the rail — the same gate as the web admin sidebar
    /// (`filterNavForRoleV3`). Unknown/legacy roles fall to the lowest rank.
    private var role: OperatorRole { OperatorRole.from(session.user?.role) }
    private var sections: [OperatorNavSection] { filteredNav(for: role) }

    /// The rail the sidebar actually renders: every section the role unlocks,
    /// narrowed live by the search query (matched on label + blurb). Empty
    /// sections drop out so the result list stays tight.
    private var visibleSections: [OperatorNavSection] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return sections }
        return sections.compactMap { section in
            let hits = section.items.filter {
                $0.label.localizedCaseInsensitiveContains(q) || $0.blurb.localizedCaseInsensitiveContains(q)
            }
            return hits.isEmpty ? nil : OperatorNavSection(section.id, section.label, hits)
        }
    }

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
                identityCard
                    .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 12, trailing: 12))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)

                if visibleSections.isEmpty {
                    ContentUnavailableView.search(text: query)
                        .listRowBackground(Color.clear)
                } else {
                    ForEach(visibleSections) { section in
                        Section {
                            ForEach(section.items) { item in
                                OperatorNavRow(item: item).tag(item)
                            }
                        } header: {
                            Text(section.label)
                                .textRole(.caption).fontWeight(.bold)
                                .tracking(0.6)
                                .foregroundStyle(theme.color.textSecondary)
                        }
                    }
                }
            }
            .listStyle(.sidebar)
            .scrollContentBackground(.hidden)
            .background(theme.color.surface)
            .navigationTitle("OttavianoKDS")
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search \(surfaceCount) surfaces")
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

    /// Total surfaces the signed-in role can reach — drives the search prompt so
    /// the operator knows the rail's true breadth ("Search 41 surfaces").
    private var surfaceCount: Int { sections.reduce(0) { $0 + $1.items.count } }

    /// The sidebar identity header: brand mark + signed-in operator + role badge,
    /// tappable to open the account sheet. Replaces a bare wordmark — the rail now
    /// states *who's on shift and what they can reach* the moment it opens.
    private var identityCard: some View {
        Button { showAccount = true } label: {
            HStack(spacing: theme.space.sm) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(theme.color.onAccent)
                    .frame(width: 44, height: 44)
                    .background(theme.color.accent, in: RoundedRectangle(cornerRadius: theme.radius.md))
                VStack(alignment: .leading, spacing: 3) {
                    Text(session.user?.name ?? "OttavianoKDS")
                        .textRole(.bodyEmphasis).foregroundStyle(theme.color.textPrimary)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        Circle().fill(theme.color.success).frame(width: 6, height: 6)
                        Text(role.displayName)
                            .textRole(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(theme.color.textSecondary)
            }
            .padding(theme.space.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg))
            .overlay(RoundedRectangle(cornerRadius: theme.radius.lg).strokeBorder(theme.color.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Account — signed in as \(session.user?.name ?? "operator"), \(role.displayName)")
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
            KDSBoardView(store: KDSStore(api: deps.api, sse: deps.sse), api: deps.api, role: role)
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
            OperatorServiceView(api: deps.api)
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
            OperatorAnnouncementsView(api: deps.api, role: role)
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
        case "/admin/agent-hq":
            OperatorAgentHQView(api: deps.api)
        default:
            OperatorSurfaceView(item: item)
        }
    }
}

/// One row in the operator rail — an icon chip + label, mirroring the web admin
/// sidebar's glyph-led items. Scaffold surfaces (data pending `/api/v1`) carry a
/// subtle wrench so the operator can tell live from layout-parity at a glance.
struct OperatorNavRow: View {
    @Environment(\.theme) private var theme
    let item: OperatorNavItem
    var body: some View {
        HStack(spacing: theme.space.sm) {
            Image(systemName: item.icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(theme.color.accent)
                .frame(width: 28, height: 28)
                .background(theme.color.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: theme.radius.sm))
            Text(item.label).textRole(.body).foregroundStyle(theme.color.textPrimary)
            Spacer(minLength: 0)
            if item.kind == .scaffold {
                Image(systemName: "wrench.adjustable")
                    .font(.caption2)
                    .foregroundStyle(theme.color.textSecondary.opacity(0.55))
                    .accessibilityLabel("Layout-parity scaffold")
            }
        }
        .padding(.vertical, 2)
    }
}
