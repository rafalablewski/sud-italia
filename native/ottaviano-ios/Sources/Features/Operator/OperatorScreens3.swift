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
            search: { "\($0.name) \($0.email ?? "") \($0.role)" },
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
            search: { "\($0.action) \($0.actor ?? "") \($0.entityType ?? "") \($0.entityId ?? "")" },
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
            toolbar: { reload in AnyView(OpenCashButton(api: api, reload: reload)) },
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
            detail: { c, reload in AnyView(ComplianceDetailView(c: c, api: api, reload: reload)) },
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
            detail: { e, reload in AnyView(EventDetailView(e: e, api: api, reload: reload)) },
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

/// Event detail — advance the booking through its lifecycle. Tapping a status
/// chip PATCHes `/api/v1/admin/events` (manager+) and reloads. Other fields are
/// read-only here (revenue/attendance come from the run-sheet). Rule #1.
struct EventDetailView: View {
    @Environment(\.theme) private var theme
    let e: AdminEvent
    let api: APIClient
    let reload: () async -> Void
    @State private var status: String
    @State private var busy = false
    @State private var error: String?

    init(e: AdminEvent, api: APIClient, reload: @escaping () async -> Void) {
        self.e = e; self.api = api; self.reload = reload
        _status = State(initialValue: e.status)
    }

    private let statuses = ["scheduled", "live", "done", "cancelled"]
    private func tone(_ s: String) -> DSBadge.Tone {
        switch s { case "done": .success; case "live": .warning; case "cancelled": .danger; default: .info }
    }

    var body: some View {
        OperatorDetailSheet(
            leading: .icon("ticket.fill"),
            title: e.name,
            badge: (status.capitalized, tone(status)),
            meta: [OperatorMetaRow("calendar", "\(e.date.prefix(10)) · \(e.locationSlug.capitalized)")]
        ) {
            if e.expectedAttendance != nil || e.actualRevenueGrosze != nil {
                OperatorStatBand([
                    OperatorStatTile("Expected", e.expectedAttendance.map { "\($0) pax" } ?? "—"),
                    OperatorStatTile("Revenue", e.actualRevenueGrosze.map { MoneyText.format($0) } ?? "—"),
                ])
            }
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
            let updated = try await api.send(.adminSetEventStatus(id: e.id, status: next))
            status = updated.status
            await reload()
        } catch let err as APIError {
            error = OperatorListLoader<AdminEvent>.message(err)
        } catch { error = "Couldn't update the event" }
        busy = false
    }
}

/// A wrapping row of selectable status chips (the current one filled).
struct FlowStatusRow: View {
    @Environment(\.theme) private var theme
    let statuses: [String]
    let current: String
    let tone: (String) -> DSBadge.Tone
    let onPick: (String) -> Void
    var body: some View {
        HStack(spacing: theme.space.sm) {
            ForEach(statuses, id: \.self) { s in
                Button { onPick(s) } label: {
                    Text(s.capitalized)
                        .textRole(.caption).fontWeight(.semibold)
                        .padding(.horizontal, theme.space.md).padding(.vertical, theme.space.sm)
                        .frame(maxWidth: .infinity)
                        .background(
                            s == current ? toneColor(tone(s)).opacity(0.22) : theme.color.surface,
                            in: Capsule()
                        )
                        .overlay(Capsule().strokeBorder(s == current ? toneColor(tone(s)) : theme.color.line, lineWidth: 1))
                        .foregroundStyle(s == current ? toneColor(tone(s)) : theme.color.textSecondary)
                }
                .buttonStyle(.plain)
            }
        }
    }
    private func toneColor(_ t: DSBadge.Tone) -> Color {
        switch t {
        case .success: theme.color.success
        case .warning: theme.color.warning
        case .danger: theme.color.danger
        case .info: theme.info
        case .accent: theme.color.accent
        case .neutral: theme.color.textSecondary
        }
    }
}

/// Compliance detail — renew a licence/inspection. Picking a renewal term PATCHes
/// `/api/v1/admin/compliance` (manager+) with the new expiry; the server stamps
/// lastRenewedAt. Rule #1 — only the DTO's fields are shown.
struct ComplianceDetailView: View {
    @Environment(\.theme) private var theme
    let c: AdminComplianceItem
    let api: APIClient
    let reload: () async -> Void
    @State private var expiresAt: String
    @State private var lastRenewedAt: String?
    // The server's authoritative `expired` (exact-instant UTC), so the badge
    // can't disagree with the list row; refreshed from the renew response.
    @State private var expired: Bool
    @State private var busy = false
    @State private var error: String?

    init(c: AdminComplianceItem, api: APIClient, reload: @escaping () async -> Void) {
        self.c = c; self.api = api; self.reload = reload
        _expiresAt = State(initialValue: c.expiresAt)
        _lastRenewedAt = State(initialValue: c.lastRenewedAt)
        _expired = State(initialValue: c.expired)
    }

    var body: some View {
        OperatorDetailSheet(
            leading: .icon("checkmark.shield.fill"),
            title: c.title,
            badge: expired ? ("Expired", .danger) : ("Valid", .success),
            meta: [OperatorMetaRow("mappin.and.ellipse", "\(c.kind.replacingOccurrences(of: "_", with: " ").capitalized) · \(c.locationSlug.capitalized)")]
        ) {
            OperatorStatBand([
                OperatorStatTile("Expires", String(expiresAt.prefix(10)), subTone: expired ? theme.color.danger : nil),
                OperatorStatTile("Last renewed", lastRenewedAt.map { String($0.prefix(10)) } ?? "Never"),
            ])
            DSCard {
                VStack(alignment: .leading, spacing: theme.space.md) {
                    Text("RENEW UNTIL").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
                    HStack(spacing: theme.space.sm) {
                        term("+6 months", 6)
                        term("+1 year", 12)
                        term("+2 years", 24)
                    }
                    if busy { ProgressView().controlSize(.small) }
                    if let error { Text(error).textRole(.caption).foregroundStyle(theme.color.danger) }
                }
            }
        }
    }

    private func term(_ label: String, _ months: Int) -> some View {
        Button { Task { await renew(months) } } label: {
            Text(label).textRole(.caption).fontWeight(.semibold)
                .padding(.horizontal, theme.space.md).padding(.vertical, theme.space.sm)
                .frame(maxWidth: .infinity)
                .background(theme.color.accent.opacity(0.16), in: Capsule())
                .overlay(Capsule().strokeBorder(theme.color.accent.opacity(0.5), lineWidth: 1))
                .foregroundStyle(theme.color.accent)
        }
        .buttonStyle(.plain).disabled(busy)
    }

    private func renew(_ months: Int) async {
        guard !busy else { return }
        busy = true; error = nil
        let target = Calendar.current.date(byAdding: .month, value: months, to: Date()) ?? Date()
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX")
        do {
            let updated = try await api.send(.adminRenewCompliance(id: c.id, expiresAt: f.string(from: target)))
            expiresAt = updated.expiresAt
            lastRenewedAt = updated.lastRenewedAt
            expired = updated.expired
            await reload()
        } catch let e as APIError {
            error = OperatorListLoader<AdminComplianceItem>.message(e)
        } catch { error = "Couldn't renew" }
        busy = false
    }
}
