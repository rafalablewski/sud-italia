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
            search: { "\($0.dishName) \($0.ingredients.map(\.name).joined(separator: " "))" },
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
            search: { "\($0.name) \($0.lastName ?? "") \($0.phone) \($0.email ?? "")" },
            detail: { m, _ in AnyView(GuestDetailView(m: m)) },
            row: { m in
                HStack(spacing: theme.space.sm) {
                    Avatar(name: [m.name, m.lastName ?? ""].joined(separator: " "))
                    VStack(alignment: .leading, spacing: 2) {
                        Text([m.name, m.lastName].compactMap { $0 }.joined(separator: " "))
                            .font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text(m.phone).font(.caption.monospaced()).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer(minLength: theme.space.sm)
                    if let email = m.email { Text(email).font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(1) }
                }
            }
        )
    }
}

/// Loyalty member profile — the AdminLoyaltyMember DTO's fields (Rule #1). Spend
/// + points live on the Customers DTO (a different record keyed by phone), so
/// they're shown there, not invented here.
struct GuestDetailView: View {
    @Environment(\.theme) private var theme
    let m: AdminLoyaltyMember
    private var fullName: String { [m.name, m.lastName].compactMap { $0 }.joined(separator: " ") }
    var body: some View {
        OperatorDetailSheet(
            leading: .initials(fullName),
            title: fullName.isEmpty ? m.phone : fullName,
            badge: ("Member", .accent),
            meta: meta
        ) {
            OperatorStatBand([
                OperatorStatTile("Member since", String(m.signedUpAt.prefix(10))),
                OperatorStatTile("Birthday", m.dob.map { String($0.prefix(10)) } ?? "—"),
            ])
        }
    }
    private var meta: [OperatorMetaRow] {
        var r = [OperatorMetaRow("phone.fill", m.phone)]
        if let n = m.nickname, !n.isEmpty { r.append(OperatorMetaRow("person.fill", "“\(n)”")) }
        if let e = m.email { r.append(OperatorMetaRow("envelope.fill", e)) }
        return r
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
            search: { "\($0.staffName) \($0.role) \($0.locationSlug)" },
            detail: { s, reload in AnyView(ScheduleDetailView(s: s, api: api, reload: reload)) },
            row: { s in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.staffName).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(s.role.capitalized) · \(s.locationSlug.capitalized)").font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(s.startAt.prefix(10)).font(.caption2.monospaced()).foregroundStyle(theme.color.textSecondary)
                        Text("\(Self.hhmm(s.startAt))–\(Self.hhmm(s.endAt))").font(.caption.monospaced()).foregroundStyle(theme.color.textPrimary)
                        Text(s.status).font(.caption2).foregroundStyle(theme.color.textSecondary)
                    }
                }
            }
        )
    }
    /// "HH:MM" from an ISO timestamp like 2026-06-26T18:00:00Z.
    static func hhmm(_ iso: String) -> String {
        String(iso.split(separator: "T").last?.prefix(5) ?? "")
    }
}

/// Shift detail — advance a shift through its lifecycle. The status chip row
/// PATCHes `/api/v1/admin/schedule` (manager+) and reloads. Times / staff / role
/// are read-only here. Rule #1.
struct ScheduleDetailView: View {
    @Environment(\.theme) private var theme
    let s: AdminShift
    let api: APIClient
    let reload: () async -> Void
    @State private var status: String
    @State private var busy = false
    @State private var error: String?

    init(s: AdminShift, api: APIClient, reload: @escaping () async -> Void) {
        self.s = s; self.api = api; self.reload = reload
        _status = State(initialValue: s.status)
    }

    private let statuses = ["scheduled", "in-progress", "done", "missed"]
    private func tone(_ st: String) -> DSBadge.Tone {
        switch st { case "done": .success; case "in-progress": .warning; case "missed": .danger; default: .info }
    }

    var body: some View {
        OperatorDetailSheet(
            leading: .icon("person.badge.clock.fill"),
            title: s.staffName,
            badge: (status.replacingOccurrences(of: "-", with: " ").capitalized, tone(status)),
            meta: [
                OperatorMetaRow("briefcase.fill", "\(s.role.capitalized) · \(s.locationSlug.capitalized)"),
                OperatorMetaRow("clock.fill", "\(s.startAt.prefix(10)) · \(OperatorScheduleView.hhmm(s.startAt))–\(OperatorScheduleView.hhmm(s.endAt))"),
            ]
        ) {
            DSCard {
                VStack(alignment: .leading, spacing: theme.space.md) {
                    Text("STATUS").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
                    FlowStatusRow(statuses: statuses, current: status, tone: tone) { picked in
                        Task { await save(picked) }
                    }
                    if busy { ProgressView().controlSize(.small) }
                    if let error { Text(error).textRole(.caption).foregroundStyle(theme.color.danger) }
                }
            }
        }
    }

    private func save(_ next: String) async {
        guard next != status, !busy else { return }
        busy = true; error = nil
        do {
            let updated = try await api.send(.adminSetShiftStatus(id: s.id, status: next))
            status = updated.status
            await reload()
        } catch let e as APIError {
            error = OperatorListLoader<AdminShift>.message(e)
        } catch { self.error = "Couldn't update the shift" }
        busy = false
    }
}
