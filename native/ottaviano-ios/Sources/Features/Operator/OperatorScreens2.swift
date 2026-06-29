import SwiftUI
import OttavianoKit

// Wave 2 operator surfaces — Recipes, Guest (loyalty), Alerts, Announcements,
// Schedule (read), plus Menu (86-ing) and Tasks (done) which mutate. All live off
// the /api/v1/admin facade, dark operator skin.

// MARK: - Recipes (/admin/recipes)

public struct OperatorRecipesView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Recipes",
            emptyText: "No recipes defined yet.",
            loader: OperatorListLoader { try await api.send(.adminRecipes()) },
            row: { r in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(r.dishName).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Spacer()
                        Text("yield \(r.yieldPortions)").font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Text(r.ingredients.map { "\(trim($0.quantity))\($0.unit) \($0.name)" }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(2)
                }
            }
        )
    }
    private func trim(_ d: Double) -> String { d == d.rounded() ? String(Int(d)) : String(format: "%.2f", d) }
}

// MARK: - Guest engagement / loyalty (/core/guest)

public struct OperatorGuestView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Guest",
            emptyText: "No loyalty members yet.",
            loader: OperatorListLoader { try await api.send(.adminLoyalty()) },
            header: { (items: [AdminLoyaltyMember]) in
                AnyView(OperatorStatChip("Members", "\(items.count)", tint: theme.color.accent))
            },
            row: { m in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text([m.name, m.lastName].compactMap { $0 }.joined(separator: " "))
                            .font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text(m.phone).font(.caption.monospaced()).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    if let email = m.email { Text(email).font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(1) }
                }
            }
        )
    }
}

// MARK: - Alerts (/admin/alerts)

public struct OperatorAlertsView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Alerts",
            emptyText: "All clear — no alerts.",
            loader: OperatorListLoader { try await api.send(.adminAlerts()) },
            row: { a in
                HStack(alignment: .top, spacing: theme.space.sm) {
                    Image(systemName: icon(a.type)).foregroundStyle(a.read ? theme.color.textSecondary : theme.color.warning)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(a.title).font(.subheadline.weight(a.read ? .regular : .semibold)).foregroundStyle(theme.color.textPrimary)
                        Text(a.message).font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(2)
                    }
                    Spacer()
                }
            }
        )
    }
    private func icon(_ t: String) -> String {
        switch t {
        case "new_order": "bag.fill"
        case "slot_full", "low_slots": "calendar.badge.exclamationmark"
        case "low_stock": "shippingbox.fill"
        case "dispute": "exclamationmark.bubble.fill"
        case "daily_summary": "chart.bar.fill"
        default: "bell.fill"
        }
    }
}

// MARK: - Announcements (/admin/comms/announcements)

public struct OperatorAnnouncementsView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    private let role: OperatorRole
    public init(api: APIClient, role: OperatorRole = .kitchen) { self.api = api; self.role = role }
    public var body: some View {
        OperatorListView(
            title: "Announcements",
            emptyText: "No announcements posted.",
            loader: OperatorListLoader { try await api.send(.adminAnnouncements()) },
            // Posting is owner-only (web parity); managers see the list, not the action.
            toolbar: role == .owner ? { reload in AnyView(NewAnnouncementButton(api: api, reload: reload)) } : nil,
            row: { a in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        if a.pinned { Image(systemName: "pin.fill").font(.caption2).foregroundStyle(theme.color.accent) }
                        Text(a.title).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                    }
                    Text(a.body).font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(3)
                    Text("\(a.createdByName) · \(a.readCount) read").font(.caption2).foregroundStyle(theme.color.textSecondary)
                }
            }
        )
    }
}

// MARK: - Schedule (/admin/schedule)

public struct OperatorScheduleView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Schedule",
            emptyText: "No shifts scheduled.",
            loader: OperatorListLoader { try await api.send(.adminSchedule()) },
            row: { s in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.staffName).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(s.role.capitalized) · \(s.locationSlug.capitalized)").font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(s.startAt.prefix(10)).font(.caption2.monospaced()).foregroundStyle(theme.color.textSecondary)
                        Text("\(hhmm(s.startAt))–\(hhmm(s.endAt))").font(.caption.monospaced()).foregroundStyle(theme.color.textPrimary)
                        Text(s.status).font(.caption2).foregroundStyle(theme.color.textSecondary)
                    }
                }
            }
        )
    }
    /// "HH:MM" from an ISO timestamp like 2026-06-26T18:00:00Z.
    private func hhmm(_ iso: String) -> String {
        String(iso.split(separator: "T").last?.prefix(5) ?? "")
    }
}
