import SwiftUI
import OttavianoKit

// Wave 5 operator surfaces — Corporate, Manage locations, Campaigns, Handover
// (lists) and the Permissions matrix. All live off /api/v1/admin, dark skin.

// MARK: - Corporate (/admin/corporate)

public struct OperatorCorporateView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Corporate",
            emptyText: "No corporate accounts yet.",
            loader: OperatorListLoader { try await api.send(.adminCorporate()) },
            row: { c in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("/corporate/\(c.slug)").font(.caption.monospaced()).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    Text("\(c.memberCount) members").font(.caption).foregroundStyle(theme.color.textSecondary)
                }
            }
        )
    }
}

// MARK: - Manage locations (/admin/locations/manage)

public struct OperatorManageLocationsView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Manage locations",
            emptyText: "No locations configured.",
            loader: OperatorListLoader { try await api.send(.adminManageLocations()) },
            row: { l in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(l.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text(l.address).font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(1)
                    }
                    Spacer()
                    Text(l.isActive ? "Active" : "Off").font(.caption2.weight(.bold))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background((l.isActive ? theme.color.success : theme.color.textSecondary).opacity(0.18), in: Capsule())
                        .foregroundStyle(l.isActive ? theme.color.success : theme.color.textSecondary)
                }
            }
        )
    }
}

// MARK: - Campaigns (/admin/growth)

public struct OperatorCampaignsView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Campaigns",
            emptyText: "No campaigns sent yet.",
            loader: OperatorListLoader { try await api.send(.adminCampaigns()) },
            row: { c in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.template).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(c.audienceLabel) · \(c.sentCount)/\(c.total) sent\(c.failedCount > 0 ? " · \(c.failedCount) failed" : "")")
                            .font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    Text(c.status.capitalized).font(.caption2.weight(.bold))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(tint(c.status).opacity(0.18), in: Capsule()).foregroundStyle(tint(c.status))
                }
            }
        )
    }
    private func tint(_ s: String) -> Color {
        switch s { case "done": theme.color.success; case "cancelled": theme.color.danger; default: theme.color.warning }
    }
}

// MARK: - Shift handover (/admin/handover)

public struct OperatorHandoverView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Shift handover",
            emptyText: "No handovers recorded.",
            loader: OperatorListLoader { try await api.send(.adminHandover()) },
            row: { h in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text("\(h.shift.capitalized) · \(h.locationSlug.capitalized)").font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Spacer()
                        Text(h.recordedAt.prefix(10)).font(.caption.monospaced()).foregroundStyle(theme.color.textSecondary)
                    }
                    HStack(spacing: theme.space.sm) {
                        check("Temp", h.tempChecksOk)
                        check("Equip", h.equipmentOk)
                        if let v = h.cashVarianceGrosze {
                            HStack(spacing: 2) {
                                Text("cash").font(.caption2).foregroundStyle(theme.color.textSecondary)
                                MoneyText(v).font(.caption2.weight(.bold)).foregroundStyle(v == 0 ? theme.color.success : theme.color.danger)
                            }
                        }
                    }
                    if let c = h.managerComment, !c.isEmpty {
                        Text(c).font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(2)
                    }
                    Text("\(h.outgoingManager)\(h.incomingManager.map { " → \($0)" } ?? "")").font(.caption2).foregroundStyle(theme.color.textSecondary)
                }
            }
        )
    }
    private func check(_ label: String, _ ok: Bool) -> some View {
        HStack(spacing: 2) {
            Image(systemName: ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.caption2).foregroundStyle(ok ? theme.color.success : theme.color.danger)
            Text(label).font(.caption2).foregroundStyle(theme.color.textSecondary)
        }
    }
}

// MARK: - Permission matrix (/admin/permissions)

public struct OperatorPermissionsView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    @State private var data: AdminPermissionMatrix?
    @State private var error: String?
    public init(api: APIClient) { self.api = api }

    public var body: some View {
        Group {
            if let error, data == nil {
                ContentUnavailableView("Couldn't load permissions", systemImage: "wifi.slash", description: Text(error))
            } else if let d = data {
                List {
                    ForEach(d.groups) { g in
                        Section(g.label) {
                            ForEach(g.grants, id: \.role) { grant in
                                HStack {
                                    Text(grant.role.capitalized).font(.subheadline).foregroundStyle(theme.color.textPrimary)
                                    Spacer()
                                    Text("\(grant.granted)/\(g.total)").font(.caption.monospaced())
                                        .foregroundStyle(grant.granted == g.total ? theme.color.success : grant.granted == 0 ? theme.color.textSecondary : theme.color.warning)
                                }
                            }
                        }
                    }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(theme.color.surface)
        .navigationTitle("Permissions")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do { data = try await api.send(.adminPermissions()); error = nil }
        catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { error = "Something went wrong" }
    }
}
