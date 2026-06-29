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
            sorts: [
                OperatorSortOption("Name") { $0.dishName.localizedCaseInsensitiveCompare($1.dishName) == .orderedAscending },
                OperatorSortOption("Most ingredients") { $0.ingredients.count > $1.ingredients.count },
                OperatorSortOption("Top yield") { $0.yieldPortions > $1.yieldPortions },
            ],
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

/// Guest — the native twin of web `/core/guest` (loyalty members). A KPI strip
/// (members · new this month · birthdays this month · contactable), search + sort,
/// and member cards. Spend + points live on the Customers DTO (a different record
/// keyed by phone), so they're shown there — never invented here (Rule #1).
@MainActor
@Observable
final class OperatorGuestStore {
    var members: [AdminLoyaltyMember] = []
    var loaded = false
    var error: String?
    private let api: APIClient
    init(api: APIClient) { self.api = api }
    func load() async {
        do { members = try await api.send(.adminLoyalty()); error = nil }
        catch let e as APIError { error = OperatorListLoader<AdminLoyaltyMember>.message(e) }
        catch { error = "Something went wrong" }
        loaded = true
    }
}

public struct OperatorGuestView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorGuestStore?
    @State private var selected: AdminLoyaltyMember?
    @State private var search = ""
    @State private var sort: GuestSort = .recent
    private let api: APIClient
    public init(api: APIClient) { self.api = api }

    enum GuestSort: Hashable { case recent, name }
    private let cols = [GridItem(.adaptive(minimum: 120), spacing: 12)]

    public var body: some View {
        ScrollView {
            if let store { content(store) }
            else { ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl) }
        }
        .background(theme.color.surface)
        .navigationTitle("Guest")
        .task {
            if store == nil { store = OperatorGuestStore(api: api) }
            if store?.loaded == false { await store?.load() }
        }
        .refreshable { await store?.load() }
        .sheet(item: $selected) { m in GuestDetailView(m: m) }
    }

    @ViewBuilder
    private func content(_ store: OperatorGuestStore) -> some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            if let error = store.error, store.members.isEmpty {
                ContentUnavailableView("Couldn't load guests", systemImage: "person.2", description: Text(error))
                    .padding(.top, theme.space.xxl)
            } else if store.members.isEmpty && store.loaded {
                DSEmptyState("Guest", systemImage: "person.2", message: "No loyalty members yet.")
            } else {
                kpis(store.members)
                controls
                let rows = filtered(store.members)
                if rows.isEmpty {
                    Text("No members match.").textRole(.callout).foregroundStyle(theme.color.textSecondary)
                } else {
                    VStack(spacing: theme.space.sm) { ForEach(rows) { memberCard($0) } }
                }
            }
        }
        .padding(theme.space.lg)
    }

    private func kpis(_ members: [AdminLoyaltyMember]) -> some View {
        let cutoff = AnalyticsDates.window(for: .month).from
        let new30 = members.filter { String($0.signedUpAt.prefix(10)) >= cutoff }.count
        let month = String(AnalyticsDates.iso(Date()).dropFirst(5).prefix(2))
        let bdays = members.filter { ($0.dob.map { String($0.dropFirst(5).prefix(2)) } ?? "") == month }.count
        let contactable = members.filter { $0.email?.isEmpty == false }.count
        return LazyVGrid(columns: cols, spacing: theme.space.md) {
            OperatorKPICard(label: "Members", value: "\(members.count)", icon: "person.2.fill", tint: theme.color.accent, info: Self.membersInfo)
            OperatorKPICard(label: "New (30d)", value: "\(new30)", icon: "person.badge.plus", tint: theme.color.success)
            OperatorKPICard(label: "Birthdays", value: "\(bdays)", icon: "gift.fill", tint: theme.color.warning, caption: "this month", info: Self.birthdayInfo)
            OperatorKPICard(label: "Contactable", value: "\(contactable)", icon: "envelope.fill", tint: theme.color.textSecondary, caption: "have email")
        }
    }

    private var controls: some View {
        HStack(spacing: theme.space.sm) {
            HStack(spacing: theme.space.sm) {
                Image(systemName: "magnifyingglass").foregroundStyle(theme.color.textSecondary)
                TextField("Search members", text: $search).textFieldStyle(.plain).foregroundStyle(theme.color.textPrimary)
            }
            .padding(.horizontal, theme.space.md).frame(height: 38)
            .background(theme.color.surface2, in: Capsule())
            .overlay(Capsule().strokeBorder(theme.color.line, lineWidth: 1))
            DSSegmented($sort, options: [(value: .recent, label: "Recent"), (value: .name, label: "A–Z")])
                .frame(width: 150)
        }
    }

    private func memberCard(_ m: AdminLoyaltyMember) -> some View {
        let fullName = [m.name, m.lastName].compactMap { $0 }.joined(separator: " ")
        return Button { selected = m } label: {
            HStack(spacing: theme.space.sm) {
                Avatar(name: fullName.isEmpty ? m.phone : fullName)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(fullName.isEmpty ? m.phone : fullName)
                            .font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary).lineLimit(1)
                        if let n = m.nickname, !n.isEmpty {
                            Text("“\(n)”").font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(1)
                        }
                    }
                    Text("\(m.phone) · member since \(String(m.signedUpAt.prefix(10)))")
                        .font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(1)
                }
                Spacer(minLength: theme.space.sm)
                if let email = m.email, !email.isEmpty {
                    Image(systemName: "envelope.fill").font(.caption).foregroundStyle(theme.color.textSecondary)
                }
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(theme.color.textSecondary)
            }
            .padding(theme.space.md)
            .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.md))
            .overlay(RoundedRectangle(cornerRadius: theme.radius.md).strokeBorder(theme.color.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func filtered(_ members: [AdminLoyaltyMember]) -> [AdminLoyaltyMember] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        let matched = members.filter { m in
            q.isEmpty || "\(m.name) \(m.lastName ?? "") \(m.phone) \(m.email ?? "") \(m.nickname ?? "")".lowercased().contains(q)
        }
        switch sort {
        case .recent: return matched.sorted { $0.signedUpAt > $1.signedUpAt }
        case .name: return matched.sorted { ($0.name + ($0.lastName ?? "")).lowercased() < ($1.name + ($1.lastName ?? "")).lowercased() }
        }
    }
}

private extension OperatorGuestView {
    static var membersInfo: InfoButton {
        InfoButton(title: "Loyalty members",
            description: "Guests enrolled in the loyalty programme (phone-based auto-enrolment, zero-friction).",
            institutional: "The loyalty roster is the chain's owned audience — the one marketing channel that doesn't rent attention from a platform. Members visit more often and spend more; growing this base is the cheapest durable lever on lifetime value, and lenders read a large engaged list as de-risked future revenue.",
            plain: "Every enrolled phone is a guest you can bring back without paying an ad platform. 400 members who each visit once more a month is real, repeatable revenue.",
            tips: "Auto-enrol at the POS on phone capture, collect email for a second channel, and trigger birthday + win-back offers off this list.",
            methodology: "Enrolled members. Source: /admin/loyalty.")
    }
    static var birthdayInfo: InfoButton {
        InfoButton(title: "Birthdays this month",
            description: "Members whose birthday falls in the current month.",
            institutional: "Birthday outreach is among the highest-converting lifecycle messages in hospitality — a personal, time-bound reason to visit. Operationalising it turns a known date into predictable incremental covers at near-zero cost.",
            plain: "If 30 members have a birthday this month, a simple 'free dolce on us' message is 30 warm reasons to book a table — far cheaper than winning a new guest.",
            tips: "Automate a birthday offer to this list, make it dine-in to drive a full party, and time it a few days before the date.",
            methodology: "Members whose dob month == current month. Source: /admin/loyalty.dob.")
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
            search: { "\($0.title) \($0.message) \($0.type)" },
            filters: [
                OperatorFilter("Unread", systemImage: "circle.fill") { !$0.read },
            ],
            sorts: [
                OperatorSortOption("Recent") { $0.createdAt > $1.createdAt },
            ],
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
            search: { "\($0.title) \($0.body) \($0.createdByName)" },
            filters: [
                OperatorFilter("Pinned", systemImage: "pin.fill") { $0.pinned },
            ],
            sorts: [
                OperatorSortOption("Recent") { $0.createdAt > $1.createdAt },
                OperatorSortOption("Most read") { $0.readCount > $1.readCount },
            ],
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
            filters: [
                OperatorFilter("Scheduled", systemImage: "calendar") { $0.status == "scheduled" },
                OperatorFilter("In progress", systemImage: "play.circle") { $0.status == "in-progress" || $0.status == "in_progress" },
                OperatorFilter("Done", systemImage: "checkmark.circle") { $0.status == "done" || $0.status == "completed" },
            ],
            sorts: [
                OperatorSortOption("Start time") { $0.startAt < $1.startAt },
                OperatorSortOption("Staff") { $0.staffName.localizedCaseInsensitiveCompare($1.staffName) == .orderedAscending },
            ],
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
