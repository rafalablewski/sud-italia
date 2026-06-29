import SwiftUI
import OttavianoKit

// Wave 3 operator surfaces — Users, Audit log, Cash, Business costs, Compliance,
// Events, Waste, Surveys. All read-only off /api/v1/admin, dark operator skin.

// MARK: - Users & roles (/admin/users)

public struct OperatorUsersView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Users",
            emptyText: "No staff accounts yet.",
            loader: OperatorListLoader { try await api.send(.adminUsers()) },
            row: { u in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(u.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text([u.email, u.role.capitalized].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    HStack(spacing: 6) {
                        if u.mfaEnabled { tag("MFA", theme.color.success) }
                        if u.hasPasskeys { tag("Passkey", theme.color.accent) }
                        if u.status != "active" { tag(u.status.capitalized, theme.color.textSecondary) }
                    }
                }
            }
        )
    }
    private func tag(_ t: String, _ c: Color) -> some View {
        Text(t).font(.caption2.weight(.bold)).padding(.horizontal, 6).padding(.vertical, 2)
            .background(c.opacity(0.18), in: Capsule()).foregroundStyle(c)
    }
}

// MARK: - Audit log (/admin/audit-log)

public struct OperatorAuditView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Audit log",
            emptyText: "No audit entries.",
            loader: OperatorListLoader { try await api.send(.adminAuditLog()) },
            row: { e in
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(e.action).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Spacer()
                        Text(e.occurredAt.prefix(16).replacingOccurrences(of: "T", with: " "))
                            .font(.caption2.monospaced()).foregroundStyle(theme.color.textSecondary)
                    }
                    Text([e.actor, e.entityType, e.entityId].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(1)
                }
            }
        )
    }
}

// MARK: - Cash (/admin/cash)

public struct OperatorCashView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Cash",
            emptyText: "No till sessions yet.",
            loader: OperatorListLoader { try await api.send(.adminCash()) },
            header: { (items: [AdminCashSession]) in
                AnyView(HStack(spacing: theme.space.sm) {
                    OperatorStatChip("Sessions", "\(items.count)", tint: theme.color.accent)
                    OperatorStatChip("Open", "\(items.filter(\.open).count)", tint: theme.color.success)
                })
            },
            row: { s in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(s.locationSlug.capitalized) · \(s.openedBy)").font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(s.openedAt.prefix(16).replacingOccurrences(of: "T", with: " ")) · \(s.dropCount) drops")
                            .font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        MoneyText(s.dropsTotal).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        if s.open {
                            Text("OPEN").font(.caption2.weight(.bold)).foregroundStyle(theme.color.success)
                        } else if let v = s.varianceGrosze {
                            HStack(spacing: 2) {
                                Text("var").font(.caption2).foregroundStyle(theme.color.textSecondary)
                                MoneyText(v).font(.caption2.weight(.bold)).foregroundStyle(v == 0 ? theme.color.success : theme.color.danger)
                            }
                        }
                    }
                }
            }
        )
    }
}

// MARK: - Business costs (/admin/business-costs)

public struct OperatorBusinessCostsView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Business costs",
            emptyText: "No costs recorded.",
            loader: OperatorListLoader { try await api.send(.adminBusinessCosts()) },
            row: { c in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text([c.category.capitalized, c.vendor].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        MoneyText(c.amountGrosze).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text(c.frequency).font(.caption2).foregroundStyle(theme.color.textSecondary)
                    }
                }
            }
        )
    }
}

// MARK: - Compliance (/admin/compliance)

public struct OperatorComplianceView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Compliance",
            emptyText: "No compliance items.",
            loader: OperatorListLoader { try await api.send(.adminCompliance()) },
            header: { (items: [AdminComplianceItem]) in
                AnyView(HStack(spacing: theme.space.sm) {
                    OperatorStatChip("Items", "\(items.count)", tint: theme.color.accent)
                    OperatorStatChip("Expired", "\(items.filter(\.expired).count)", tint: theme.color.danger)
                })
            },
            row: { c in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.title).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(c.kind.replacingOccurrences(of: "_", with: " ").capitalized) · \(c.locationSlug.capitalized)")
                            .font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("exp \(c.expiresAt.prefix(10))").font(.caption.monospaced())
                            .foregroundStyle(c.expired ? theme.color.danger : theme.color.textSecondary)
                        if c.expired { Text("EXPIRED").font(.caption2.weight(.bold)).foregroundStyle(theme.color.danger) }
                    }
                }
            }
        )
    }
}

// MARK: - Events & bookings (/admin/events)

public struct OperatorEventsView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Events",
            emptyText: "No events booked.",
            loader: OperatorListLoader { try await api.send(.adminEvents()) },
            row: { e in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(e.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(e.date.prefix(10)) · \(e.locationSlug.capitalized)").font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        if let rev = e.actualRevenueGrosze {
                            MoneyText(rev).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        } else if let att = e.expectedAttendance {
                            Text("\(att) pax").font(.caption).foregroundStyle(theme.color.textSecondary)
                        }
                        Text(e.status.capitalized).font(.caption2).foregroundStyle(theme.color.textSecondary)
                    }
                }
            }
        )
    }
}

// MARK: - Waste log (/admin/waste)

public struct OperatorWasteView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Waste log",
            emptyText: "No wastage recorded.",
            loader: OperatorListLoader { try await api.send(.adminWaste()) },
            toolbar: { reload in AnyView(LogWasteButton(api: api, reload: reload)) },
            row: { w in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(w.item).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(w.reason.replacingOccurrences(of: "_", with: " ").capitalized) · \(w.locationSlug.capitalized)")
                            .font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(trim(w.quantity)) \(w.unit)").font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(theme.color.textPrimary)
                        if let cost = w.estimatedCostGrosze { MoneyText(cost).font(.caption2).foregroundStyle(theme.color.danger) }
                    }
                }
            }
        )
    }
    private func trim(_ d: Double) -> String { d == d.rounded() ? String(Int(d)) : String(format: "%.1f", d) }
}

// MARK: - Pulse surveys (/admin/surveys)

public struct OperatorSurveysView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Pulse surveys",
            emptyText: "No surveys configured.",
            loader: OperatorListLoader { try await api.send(.adminSurveys()) },
            row: { s in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.question).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary).lineLimit(2)
                        Text("\(s.trigger.replacingOccurrences(of: "-", with: " ").capitalized) · \(s.responseCount) responses")
                            .font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(String(format: "%.1f★", s.avgRating)).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.warning)
                        Text(s.active ? "Active" : "Off").font(.caption2)
                            .foregroundStyle(s.active ? theme.color.success : theme.color.textSecondary)
                    }
                }
            }
        )
    }
}
