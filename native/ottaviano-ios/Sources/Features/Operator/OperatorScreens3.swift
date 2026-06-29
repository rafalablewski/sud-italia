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
            search: { "\($0.action) \($0.actor) \($0.entityType ?? "") \($0.entityId ?? "")" },
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

/// Cash — the native twin of web `/admin/cash`. A till-reconciliation board: KPI
/// rail, a cash-variance trend across closed sessions (the signal a till is
/// drifting), and the session list with the open-till action. Real data only
/// (Rule #1); variance carries the five-section ⓘ (Rule #12).
@MainActor
@Observable
final class OperatorCashStore {
    var items: [AdminCashSession] = []
    var loaded = false
    var error: String?
    private let api: APIClient
    init(api: APIClient) { self.api = api }
    func load() async {
        do { items = try await api.send(.adminCash()); error = nil }
        catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { error = "Something went wrong" }
        loaded = true
    }
}

public struct OperatorCashView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorCashStore?
    private let api: APIClient
    public init(api: APIClient) { self.api = api }

    private let cols = [GridItem(.adaptive(minimum: 120), spacing: 12)]

    public var body: some View {
        ScrollView {
            if let store { content(store) }
            else { ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl) }
        }
        .background(theme.color.surface)
        .navigationTitle("Cash")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) {
            if let store { OpenCashButton(api: api, reload: { await store.load() }) }
        } }
        .task {
            if store == nil { store = OperatorCashStore(api: api) }
            if store?.loaded == false { await store?.load() }
        }
        .refreshable { await store?.load() }
    }

    @ViewBuilder
    private func content(_ store: OperatorCashStore) -> some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            if let error = store.error, store.items.isEmpty {
                ContentUnavailableView("Couldn't load cash", systemImage: "banknote", description: Text(error))
                    .padding(.top, theme.space.xxl)
            } else if store.items.isEmpty && store.loaded {
                DSEmptyState("Cash", systemImage: "banknote", message: "No till sessions yet.")
            } else {
                kpis(store.items)
                varianceTrend(store.items)
                sessions(store.items)
            }
        }
        .padding(theme.space.lg)
    }

    private func kpis(_ items: [AdminCashSession]) -> some View {
        let closed = items.filter { !$0.open }
        let variances = closed.compactMap { $0.varianceGrosze }
        let absVar = variances.reduce(0) { $0 + abs($1) }
        let dropsTotal = items.reduce(0) { $0 + $1.dropsTotal }
        return LazyVGrid(columns: cols, spacing: theme.space.md) {
            OperatorKPICard(label: "Sessions", value: "\(items.count)", icon: "tray.full.fill", tint: theme.color.accent)
            OperatorKPICard(label: "Open now", value: "\(items.filter(\.open).count)", icon: "lock.open.fill", tint: theme.color.success)
            OperatorKPICard(label: "Drops", value: MoneyText.format(dropsTotal), icon: "arrow.down.to.line", tint: theme.color.textSecondary)
            OperatorKPICard(label: "Abs variance", value: MoneyText.format(absVar), icon: "plusminus", tint: absVar == 0 ? theme.color.success : theme.color.warning,
                            spark: variances.isEmpty ? nil : variances.map { Double(abs($0)) }, info: Self.varianceInfo)
        }
    }

    private func varianceTrend(_ items: [AdminCashSession]) -> some View {
        let closed = items.filter { !$0.open }.sorted { $0.openedAt < $1.openedAt }
        let vals = closed.compactMap { $0.varianceGrosze }.map { Double($0) }
        return card("Variance trend", subtitle: "closed sessions · zł over/short", info: Self.varianceInfo) {
            if vals.count > 1 {
                OperatorSparkline(vals, tint: theme.color.warning, height: 90)
            } else {
                Text("Not enough closed sessions yet.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            }
        }
    }

    private func sessions(_ items: [AdminCashSession]) -> some View {
        card("Sessions", subtitle: nil, info: nil) {
            VStack(spacing: theme.space.sm) {
                ForEach(items) { s in
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
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private func card<Content: View>(_ title: String, subtitle: String?, info: InfoButton?,
                                     @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).foregroundStyle(theme.color.textPrimary)
                    if let subtitle { Text(subtitle).textRole(.caption).foregroundStyle(theme.color.textSecondary) }
                }
                Spacer()
                if let info { info }
            }
            content()
        }
        .padding(theme.space.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg).strokeBorder(theme.color.line, lineWidth: 1))
    }
}

private extension OperatorCashView {
    static var varianceInfo: InfoButton {
        InfoButton(title: "Cash variance",
            description: "The złoty difference between the counted till and what the system expected at close — over or short.",
            institutional: "Till variance is the front-line shrinkage control. Persistent shorts signal till errors, mis-keyed discounts, or theft; persistent overs signal under-ringing. Institutions hold variance inside a tight band (often ±0.5% of cash sales) and investigate every breach — it's an internal-controls gate auditors test directly.",
            plain: "If the drawer should hold 1 200 zł but counts 1 188 zł, that's −12 zł short. One bad night is noise; the same till short every shift is a problem to trace to a person or a process.",
            tips: "Reconcile every session, blind-count the drawer (count before seeing the expected), retrain on discount keys, and rotate till responsibility so variance maps to a cause.",
            methodology: "counted close − expected close, per session. Trend = closed sessions over time. Source: /admin/cash.varianceGrosze.")
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
        } catch { self.error = "Couldn't update the event" }
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
        } catch { self.error = "Couldn't renew" }
        busy = false
    }
}
