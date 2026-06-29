import SwiftUI
import OttavianoKit

// The live operator admin screens — each mirrors a web /admin page and renders
// real data from the bearer-authed /api/v1/admin facade. Thin projections over
// OperatorListView (state handling lives there). Dark operator skin.

// MARK: - Customers (/admin/customers)

public struct OperatorCustomersView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Customers",
            emptyText: "Customers appear here as orders come in.",
            loader: OperatorListLoader { try await api.send(.adminCustomers()) },
            header: { (items: [AdminCustomer]) in
                AnyView(HStack(spacing: theme.space.sm) {
                    OperatorStatChip("Members", "\(items.count)", tint: theme.color.accent)
                    OperatorStatChip("VIPs", "\(items.filter { $0.totalSpentGrosze >= 50000 }.count)", tint: theme.color.success)
                })
            },
            search: { [$0.name ?? "", $0.phone].joined(separator: " ") },
            detail: { c, _ in AnyView(CustomerDetailView(c: c)) },
            filters: [
                OperatorFilter("VIP", systemImage: "star.fill") { $0.totalSpentGrosze >= 50000 },
                OperatorFilter("Has points", systemImage: "gift.fill") { ($0.loyaltyPointsBalance + $0.manualPointsAdjust) > 0 },
                OperatorFilter("Lapsed", systemImage: "moon.zzz.fill") { ($0.lastOrderAt ?? "") < AnalyticsDates.window(for: .quarter).from },
            ],
            sorts: [
                OperatorSortOption("Top spend") { $0.totalSpentGrosze > $1.totalSpentGrosze },
                OperatorSortOption("Most orders") { $0.orderCount > $1.orderCount },
                OperatorSortOption("Name") { ($0.name ?? $0.phone).localizedCaseInsensitiveCompare($1.name ?? $1.phone) == .orderedAscending },
            ],
            row: { c in
                HStack(spacing: theme.space.sm) {
                    Avatar(name: c.name ?? c.phone)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(c.name ?? c.phone).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                            if c.totalSpentGrosze >= 50000 { vipChip }
                        }
                        Text(subtitle(c)).font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer(minLength: theme.space.sm)
                    VStack(alignment: .trailing, spacing: 2) {
                        MoneyText(c.totalSpentGrosze).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Label("\(c.loyaltyPointsBalance + c.manualPointsAdjust)", systemImage: "gift.fill")
                            .font(.caption2.weight(.semibold)).foregroundStyle(theme.color.accent)
                    }
                }
            }
        )
    }
    private var vipChip: some View {
        Label("VIP", systemImage: "star.fill").font(.caption2.weight(.bold))
            .padding(.horizontal, 6).padding(.vertical, 1)
            .foregroundStyle(theme.color.warning)
            .background(theme.color.warning.opacity(0.16), in: Capsule())
    }
    private func subtitle(_ c: AdminCustomer) -> String {
        var bits = ["\(c.orderCount) orders"]
        if let last = c.lastOrderAt { bits.append("last \(last.prefix(10))") }
        return bits.joined(separator: " · ")
    }
}

/// Customer profile sheet — every field the AdminCustomer DTO carries, nothing
/// invented (Rule #1). Recent-order history would need a customer-scoped orders
/// endpoint on the facade; until then the profile shows lifetime + cadence.
struct CustomerDetailView: View {
    @Environment(\.theme) private var theme
    let c: AdminCustomer
    private var points: Int { c.loyaltyPointsBalance + c.manualPointsAdjust }
    private var avg: Grosze { c.orderCount > 0 ? c.totalSpentGrosze / c.orderCount : 0 }
    var body: some View {
        OperatorDetailSheet(
            leading: .initials(c.name ?? c.phone),
            title: c.name ?? c.phone,
            badge: c.totalSpentGrosze >= 50000 ? ("VIP", .warning) : nil,
            meta: meta
        ) {
            OperatorStatBand([
                OperatorStatTile("Lifetime", MoneyText.format(c.totalSpentGrosze)),
                OperatorStatTile("Orders", "\(c.orderCount)"),
                OperatorStatTile("Points", "\(points)", sub: "redeemable", subTone: theme.color.accent),
                OperatorStatTile("Avg ticket", MoneyText.format(avg)),
            ])
            if let notes = c.notes, !notes.isEmpty {
                DSCard {
                    VStack(alignment: .leading, spacing: theme.space.xs) {
                        Text("NOTES").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
                        Text(notes).textRole(.callout).foregroundStyle(theme.color.textPrimary)
                    }
                }
            }
            if c.smsOptout || c.emailOptout {
                HStack(spacing: theme.space.sm) {
                    if c.smsOptout { DSBadge("SMS opt-out", tone: .neutral, systemImage: "bell.slash") }
                    if c.emailOptout { DSBadge("Email opt-out", tone: .neutral, systemImage: "envelope.badge") }
                }
            }
        }
    }
    private var meta: [OperatorMetaRow] {
        var m = [OperatorMetaRow("phone.fill", c.phone)]
        if let e = c.email { m.append(OperatorMetaRow("envelope.fill", e)) }
        if let first = c.firstOrderAt { m.append(OperatorMetaRow("calendar", "Member since \(first.prefix(10))")) }
        return m
    }
}

/// A compact initials avatar used in operator list rows.
struct Avatar: View {
    @Environment(\.theme) private var theme
    let name: String
    var body: some View {
        Text(initials)
            .font(.caption.weight(.bold)).foregroundStyle(theme.color.accent)
            .frame(width: 36, height: 36)
            .background(theme.color.accent.opacity(0.14), in: RoundedRectangle(cornerRadius: theme.radius.sm))
    }
    private var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        let i = parts.compactMap { $0.first }.map(String.init).joined()
        return i.isEmpty ? "·" : i.uppercased()
    }
}

/// Supplier detail — the AdminSupplier DTO's fields (Rule #1).
struct SupplierDetailView: View {
    @Environment(\.theme) private var theme
    let s: AdminSupplier
    var body: some View {
        OperatorDetailSheet(leading: .icon("shippingbox.and.arrow.backward.fill"), title: s.name, meta: meta) {
            if let lead = s.leadTimeDays {
                OperatorStatBand([OperatorStatTile("Lead time", "\(lead)", sub: "days")])
            }
            if let notes = s.notes, !notes.isEmpty {
                DSCard {
                    VStack(alignment: .leading, spacing: theme.space.xs) {
                        Text("NOTES").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
                        Text(notes).textRole(.callout).foregroundStyle(theme.color.textPrimary)
                    }
                }
            }
        }
    }
    private var meta: [OperatorMetaRow] {
        var r: [OperatorMetaRow] = []
        if let c = s.contactName { r.append(OperatorMetaRow("person.fill", c)) }
        if let p = s.phone { r.append(OperatorMetaRow("phone.fill", p)) }
        if let e = s.email { r.append(OperatorMetaRow("envelope.fill", e)) }
        return r
    }
}

/// Stock-item detail — the AdminStockRow DTO's fields (Rule #1) **plus** a live
/// adjust action: nudge the delta, Apply, and it POSTs an `adjust` movement
/// (`POST /api/v1/admin/inventory`), updates the on-hand in place and reloads the
/// list. Manager+ on the server; a non-manager token just gets a 403 surfaced.
struct StockDetailView: View {
    @Environment(\.theme) private var theme
    let r: AdminStockRow
    let api: APIClient
    let reload: () async -> Void
    @State private var onHand: Double
    @State private var delta: Double = 0
    @State private var busy = false
    @State private var error: String?

    init(r: AdminStockRow, api: APIClient, reload: @escaping () async -> Void) {
        self.r = r; self.api = api; self.reload = reload
        _onHand = State(initialValue: r.onHand)
    }

    private func fmt(_ d: Double) -> String { d == d.rounded() ? String(Int(d)) : String(format: "%.1f", d) }
    private var low: Bool { onHand <= r.reorderPoint }

    var body: some View {
        OperatorDetailSheet(
            leading: .icon("shippingbox.fill"),
            title: r.name,
            badge: low ? ("Low stock", .danger) : ("In stock", .success),
            meta: meta
        ) {
            OperatorStatBand([
                OperatorStatTile("On hand", "\(fmt(onHand)) \(r.unit)"),
                OperatorStatTile("Par level", "\(fmt(r.parLevel)) \(r.unit)"),
                OperatorStatTile("Reorder at", "\(fmt(r.reorderPoint)) \(r.unit)"),
            ])
            adjustCard
        }
    }

    private var adjustCard: some View {
        DSCard {
            VStack(alignment: .leading, spacing: theme.space.md) {
                Text("ADJUST STOCK").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
                HStack(spacing: theme.space.lg) {
                    stepButton("minus") { if onHand + delta > 0 { delta -= 1 } }
                    VStack(spacing: 2) {
                        Text("\(delta >= 0 ? "+" : "")\(fmt(delta)) \(r.unit)")
                            .textRole(.title).monospacedDigit()
                            .foregroundStyle(delta == 0 ? theme.color.textSecondary : theme.color.accent)
                        Text("→ \(fmt(onHand + delta)) \(r.unit) on hand").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    .frame(maxWidth: .infinity)
                    stepButton("plus") { delta += 1 }
                }
                if let error { Text(error).textRole(.caption).foregroundStyle(theme.color.danger) }
                DSButton(busy ? "Applying…" : "Apply adjustment") { Task { await apply() } }
                    .disabled(delta == 0 || busy)
                    .opacity(delta == 0 || busy ? 0.5 : 1)
            }
        }
    }

    private func stepButton(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.headline).frame(width: 48, height: 48)
                .foregroundStyle(theme.color.accent)
                .background(theme.color.surface, in: Circle())
                .overlay(Circle().strokeBorder(theme.color.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.impact(weight: .light), trigger: delta)
    }

    private func apply() async {
        guard delta != 0 else { return }
        busy = true; error = nil
        do {
            let updated = try await api.send(.adminAdjustStock(
                ingredientId: r.ingredientId, locationSlug: r.locationSlug, delta: delta))
            onHand = updated.onHand
            delta = 0
            await reload()
        } catch let e as APIError {
            error = OperatorListLoader<AdminStockRow>.message(e)
        } catch { self.error = "Couldn't adjust stock" }
        busy = false
    }

    private var meta: [OperatorMetaRow] {
        var m = [OperatorMetaRow("tag.fill", "\(r.category.capitalized) · \(r.locationSlug.capitalized)")]
        if let c = r.lastCountedAt { m.append(OperatorMetaRow("calendar", "Last counted \(c.prefix(10))")) }
        return m
    }
}

// MARK: - Staff (/admin/staff)

public struct OperatorStaffView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Staff",
            emptyText: "No team members on the roster yet.",
            loader: OperatorListLoader { try await api.send(.adminStaff()) },
            header: { (items: [AdminStaff]) in
                AnyView(HStack(spacing: theme.space.sm) {
                    OperatorStatChip("Team", "\(items.count)", tint: theme.color.accent)
                    OperatorStatChip("Active", "\(items.filter { $0.status == "active" }.count)", tint: theme.color.success)
                })
            },
            search: { [$0.name, $0.role, $0.locationSlug].joined(separator: " ") },
            detail: { s, _ in AnyView(StaffDetailView(s: s)) },
            filters: [
                OperatorFilter("Active", systemImage: "checkmark.circle.fill") { $0.status == "active" },
                OperatorFilter("Inactive", systemImage: "pause.circle") { $0.status != "active" },
            ],
            sorts: [
                OperatorSortOption("Name") { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending },
                OperatorSortOption("Top rate") { $0.hourlyRateGrosze > $1.hourlyRateGrosze },
                OperatorSortOption("Role") { $0.role.localizedCaseInsensitiveCompare($1.role) == .orderedAscending },
            ],
            row: { s in
                HStack(spacing: theme.space.sm) {
                    Avatar(name: s.name)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(s.role.capitalized) · \(s.locationSlug.capitalized)").font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer(minLength: theme.space.sm)
                    VStack(alignment: .trailing, spacing: 2) {
                        MoneyText(s.hourlyRateGrosze).font(.caption.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        statusTag(s.status, ok: s.status == "active")
                    }
                }
            }
        )
    }
    private func statusTag(_ text: String, ok: Bool) -> some View {
        Text(text.capitalized).font(.caption2.weight(.bold))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background((ok ? theme.color.success : theme.color.textSecondary).opacity(0.18), in: Capsule())
            .foregroundStyle(ok ? theme.color.success : theme.color.textSecondary)
    }
}

/// Staff card sheet — the AdminStaff DTO's fields (Rule #1). Upcoming shifts live
/// on the Schedule endpoint, so they're shown there, not duplicated here.
struct StaffDetailView: View {
    @Environment(\.theme) private var theme
    let s: AdminStaff
    var body: some View {
        OperatorDetailSheet(
            leading: .initials(s.name),
            title: s.name,
            badge: (s.status.capitalized, s.status == "active" ? .success : .neutral),
            meta: meta
        ) {
            OperatorStatBand([
                OperatorStatTile("Rate", MoneyText.format(s.hourlyRateGrosze), sub: "/ hour"),
                OperatorStatTile("Role", s.role.capitalized),
            ])
            if let notes = s.notes, !notes.isEmpty {
                DSCard {
                    VStack(alignment: .leading, spacing: theme.space.xs) {
                        Text("NOTES").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
                        Text(notes).textRole(.callout).foregroundStyle(theme.color.textPrimary)
                    }
                }
            }
        }
    }
    private var meta: [OperatorMetaRow] {
        var m = [OperatorMetaRow("briefcase.fill", "\(s.role.capitalized) · \(s.locationSlug.capitalized)")]
        if let p = s.phone { m.append(OperatorMetaRow("phone.fill", p)) }
        if let e = s.email { m.append(OperatorMetaRow("envelope.fill", e)) }
        if let h = s.hireDate { m.append(OperatorMetaRow("calendar", "Hired \(h.prefix(10))")) }
        return m
    }
}

// MARK: - Suppliers (/admin/suppliers)

public struct OperatorSuppliersView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Suppliers",
            emptyText: "No suppliers configured yet.",
            loader: OperatorListLoader { try await api.send(.adminSuppliers()) },
            search: { [$0.name, $0.contactName ?? ""].joined(separator: " ") },
            detail: { s, _ in AnyView(SupplierDetailView(s: s)) },
            sorts: [
                OperatorSortOption("Name") { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending },
                OperatorSortOption("Fastest lead") { ($0.leadTimeDays ?? .max) < ($1.leadTimeDays ?? .max) },
            ],
            row: { s in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        if let c = s.contactName { Text(c).font(.caption).foregroundStyle(theme.color.textSecondary) }
                    }
                    Spacer()
                    if let lead = s.leadTimeDays {
                        Text("\(lead)d lead").font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                }
            }
        )
    }
}

// MARK: - Feedback (/admin/feedback)

/// Feedback triage — a dedicated mutable surface (per-row write): each review
/// carries a status menu (new → reviewed → responded) that PATCHes
/// /api/v1/admin/feedback and reloads. Web `/admin/feedback` parity.
@MainActor
@Observable
public final class OperatorFeedbackStore {
    public enum State: Sendable { case loading, loaded([AdminFeedback]), failed(String) }
    public private(set) var state: State = .loading
    private let api: APIClient
    public init(api: APIClient) { self.api = api }

    public func load() async {
        state = .loading
        do { state = .loaded(try await api.send(.adminFeedback())) }
        catch let e as APIError { state = .failed(OperatorListLoader<AdminFeedback>.message(e)) }
        catch { state = .failed("Something went wrong") }
    }

    public func setStatus(_ f: AdminFeedback, _ status: String) async {
        guard f.status != status else { return }
        _ = try? await api.send(.adminSetFeedbackStatus(id: f.id, status: status))
        await load() // reconcile to server truth
    }
}

public struct OperatorFeedbackView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorFeedbackStore
    public init(api: APIClient) { _store = State(initialValue: OperatorFeedbackStore(api: api)) }

    public var body: some View {
        Group {
            switch store.state {
            case .loading:
                List { ForEach(0..<6, id: \.self) { _ in OperatorRowSkeleton() } }
            case .failed(let m):
                ContentUnavailableView("Couldn't load feedback", systemImage: "wifi.slash", description: Text(m))
            case .loaded(let items) where items.isEmpty:
                ContentUnavailableView("Feedback", systemImage: "tray", description: Text("No reviews in yet."))
            case .loaded(let items):
                List {
                    let avg = items.isEmpty ? 0 : items.reduce(0.0) { $0 + $1.overallRating } / Double(items.count)
                    HStack(spacing: theme.space.sm) {
                        OperatorStatChip("Reviews", "\(items.count)", tint: theme.color.accent)
                        OperatorStatChip("Avg", String(format: "%.1f★", avg), tint: theme.color.warning)
                        OperatorStatChip("New", "\(items.filter { $0.status == "new" }.count)", tint: theme.color.warning)
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
                    ForEach(items) { row($0) }
                }
            }
        }
        .navigationTitle("Feedback")
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.load() }
        .refreshable { await store.load() }
    }

    private func row(_ f: AdminFeedback) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(stars(f.overallRating)).foregroundStyle(theme.color.warning)
                Spacer()
                if let s = f.sentiment { sentimentTag(s) }
                statusMenu(f)
            }
            if !f.comment.isEmpty {
                Text(f.comment).font(.subheadline).foregroundStyle(theme.color.textPrimary).lineLimit(3)
            }
            Text("\(f.customerName) · \(f.locationSlug.capitalized)").font(.caption).foregroundStyle(theme.color.textSecondary)
        }
    }

    // Tap the status pill to advance triage (new → reviewed → responded).
    private func statusMenu(_ f: AdminFeedback) -> some View {
        Menu {
            ForEach(["new", "reviewed", "responded"], id: \.self) { s in
                Button {
                    Task { await store.setStatus(f, s) }
                } label: {
                    if f.status == s { Label(s.capitalized, systemImage: "checkmark") } else { Text(s.capitalized) }
                }
            }
        } label: {
            let tint = statusTint(f.status)
            Text(f.status.capitalized).font(.caption2.weight(.bold))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(tint.opacity(0.18), in: Capsule()).foregroundStyle(tint)
        }
    }

    private func statusTint(_ s: String) -> Color {
        switch s {
        case "responded": theme.color.success
        case "reviewed": theme.info
        default: theme.color.warning
        }
    }
    private func stars(_ r: Double) -> String {
        let n = max(0, min(5, Int(r.rounded())))
        return String(repeating: "★", count: n) + String(repeating: "☆", count: 5 - n)
    }
    private func sentimentTag(_ s: String) -> some View {
        let tint = s == "positive" ? theme.color.success : s == "negative" ? theme.color.danger : theme.color.textSecondary
        return Text(s.capitalized).font(.caption2.weight(.bold))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(tint.opacity(0.18), in: Capsule()).foregroundStyle(tint)
    }
}

// MARK: - Inventory (/admin/inventory)

public struct OperatorInventoryView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Inventory",
            emptyText: "No stock rows yet.",
            loader: OperatorListLoader { try await api.send(.adminInventory()) },
            header: { (items: [AdminStockRow]) in
                AnyView(HStack(spacing: theme.space.sm) {
                    OperatorStatChip("Items", "\(items.count)", tint: theme.color.accent)
                    OperatorStatChip("Low", "\(items.filter(\.low).count)", tint: theme.color.danger)
                })
            },
            search: { [$0.name, $0.locationSlug].joined(separator: " ") },
            detail: { r, reload in AnyView(StockDetailView(r: r, api: api, reload: reload)) },
            filters: [
                OperatorFilter("Low stock", systemImage: "exclamationmark.triangle.fill") { $0.low },
            ],
            sorts: [
                OperatorSortOption("Lowest first") { ($0.parLevel > 0 ? $0.onHand / $0.parLevel : 0) < ($1.parLevel > 0 ? $1.onHand / $1.parLevel : 0) },
                OperatorSortOption("Name") { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending },
            ],
            row: { r in
                // On-hand vs par as a fill, with the reorder point as a benchmark
                // tick — a glanceable "how full, how close to reordering" read.
                let frac = r.parLevel > 0 ? r.onHand / r.parLevel : 0
                let target = r.parLevel > 0 ? r.reorderPoint / r.parLevel : nil
                let tint: Color = r.low ? theme.color.danger : (frac < 0.5 ? theme.color.warning : theme.color.success)
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                            Text("\(r.locationSlug.capitalized) · par \(num(r.parLevel)) \(r.unit)").font(.caption).foregroundStyle(theme.color.textSecondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(num(r.onHand)) \(r.unit)").font(.subheadline.weight(.semibold)).monospacedDigit()
                                .foregroundStyle(r.low ? theme.color.danger : theme.color.textPrimary)
                            if r.low {
                                Text("LOW").font(.caption2.weight(.bold))
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(theme.color.danger.opacity(0.18), in: Capsule()).foregroundStyle(theme.color.danger)
                            }
                        }
                    }
                    OperatorProgressMeter(fraction: frac, tint: tint, target: target, height: 8)
                }
            }
        )
    }
    private func num(_ d: Double) -> String {
        d == d.rounded() ? String(Int(d)) : String(format: "%.1f", d)
    }
}

// MARK: - Service / Slots (/core/service/slots)

/// Service — the native twin of web `/core/service/slots`. A fulfilment-capacity
/// board: a KPI strip (slots · booked · capacity · fill rate), slots grouped by
/// day with per-day fill, and per-slot rows with a green→amber→red capacity fill
/// bar, channel chips, a min-spend badge and the active/draft status. Tapping a
/// slot opens the capacity/status editor (manager+). Real data only (Rule #1).
@MainActor
@Observable
final class OperatorSlotsStore {
    var slots: [AdminSlot] = []
    var loaded = false
    var error: String?
    private let api: APIClient
    init(api: APIClient) { self.api = api }
    func load() async {
        do { slots = try await api.send(.adminSlots()); error = nil }
        catch let e as APIError { error = OperatorListLoader<AdminSlot>.message(e) }
        catch { self.error = "Something went wrong" }
        loaded = true
    }
}

public struct OperatorSlotsView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorSlotsStore?
    @State private var selected: AdminSlot?
    private let api: APIClient
    public init(api: APIClient) { self.api = api }

    private let cols = [GridItem(.adaptive(minimum: 120), spacing: 12)]

    public var body: some View {
        ScrollView {
            if let store { content(store) }
            else { ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl) }
        }
        .background(theme.color.surface)
        .navigationTitle("Service")
        .task {
            if store == nil { store = OperatorSlotsStore(api: api) }
            if store?.loaded == false { await store?.load() }
        }
        .refreshable { await store?.load() }
        .sheet(item: $selected) { s in
            SlotDetailView(s: s, api: api, reload: { await store?.load() })
        }
    }

    @ViewBuilder
    private func content(_ store: OperatorSlotsStore) -> some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            if let error = store.error, store.slots.isEmpty {
                ContentUnavailableView("Couldn't load service", systemImage: "calendar.badge.clock", description: Text(error))
                    .padding(.top, theme.space.xxl)
            } else if store.slots.isEmpty && store.loaded {
                DSEmptyState("Service", systemImage: "calendar.badge.clock", message: "No fulfilment slots scheduled.")
            } else {
                kpis(store.slots)
                ForEach(days(store.slots), id: \.date) { day in
                    dayCard(day)
                }
            }
        }
        .padding(theme.space.lg)
    }

    private func kpis(_ slots: [AdminSlot]) -> some View {
        let booked = slots.reduce(0) { $0 + $1.currentOrders }
        let capacity = slots.reduce(0) { $0 + $1.maxOrders }
        let fill = capacity > 0 ? Double(booked) / Double(capacity) : 0
        let active = slots.filter { $0.status == "active" }.count
        return LazyVGrid(columns: cols, spacing: theme.space.md) {
            OperatorKPICard(label: "Slots", value: "\(slots.count)", icon: "calendar", tint: theme.color.accent,
                            caption: "\(active) active", info: Self.slotsInfo)
            OperatorKPICard(label: "Booked", value: "\(booked)", icon: "person.fill.checkmark", tint: theme.color.success)
            OperatorKPICard(label: "Capacity", value: "\(capacity)", icon: "gauge.with.dots.needle.50percent", tint: theme.color.textSecondary)
            card("Fill rate", subtitle: "booked ÷ capacity", info: Self.fillInfo) {
                HStack { Spacer()
                    OperatorGauge(fraction: fill, centerValue: "\(Int(fill * 100))%", centerLabel: "filled",
                                  tint: fillTint(fill), diameter: 110)
                    Spacer() }
            }
        }
    }

    private struct DayGroup { let date: String; let slots: [AdminSlot] }
    private func days(_ slots: [AdminSlot]) -> [DayGroup] {
        let dates = Array(Set(slots.map(\.date))).sorted()
        return dates.map { d in DayGroup(date: d, slots: slots.filter { $0.date == d }.sorted { $0.time < $1.time }) }
    }

    private func dayCard(_ day: DayGroup) -> some View {
        let booked = day.slots.reduce(0) { $0 + $1.currentOrders }
        let cap = day.slots.reduce(0) { $0 + $1.maxOrders }
        return card(day.date, subtitle: "\(booked)/\(cap) booked · \(day.slots.count) slots", info: nil) {
            VStack(spacing: theme.space.sm) {
                ForEach(day.slots) { slotRow($0) }
            }
        }
    }

    private func slotRow(_ s: AdminSlot) -> some View {
        let fill = s.maxOrders > 0 ? Double(s.currentOrders) / Double(s.maxOrders) : 0
        return Button { selected = s } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(s.time).font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle(theme.color.textPrimary)
                    statusPill(s.status)
                    Spacer()
                    Text("\(s.currentOrders)/\(s.maxOrders)").font(.subheadline.weight(.semibold)).monospacedDigit()
                        .foregroundStyle(fill >= 1 ? theme.color.danger : theme.color.textPrimary)
                }
                OperatorProgressMeter(fraction: fill, tint: fillTint(fill), height: 8)
                HStack(spacing: 6) {
                    ForEach(s.fulfillmentTypes, id: \.self) { t in
                        Text(channelLabel(t)).font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(theme.color.surface, in: Capsule())
                            .overlay(Capsule().strokeBorder(theme.color.line, lineWidth: 1))
                            .foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    if let ms = s.minSpendGrosze, ms > 0 {
                        Label(MoneyText.format(ms), systemImage: "creditcard")
                            .font(.caption2.weight(.semibold)).foregroundStyle(theme.color.warning)
                    }
                }
            }
            .padding(theme.space.md)
            .background(theme.color.surface, in: RoundedRectangle(cornerRadius: theme.radius.md))
            .overlay(RoundedRectangle(cornerRadius: theme.radius.md).strokeBorder(theme.color.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func statusPill(_ s: String) -> some View {
        let active = s == "active"
        return Text(s.capitalized).font(.caption2.weight(.bold))
            .padding(.horizontal, 6).padding(.vertical, 1)
            .background((active ? theme.color.success : theme.color.textSecondary).opacity(0.18), in: Capsule())
            .foregroundStyle(active ? theme.color.success : theme.color.textSecondary)
    }

    private func fillTint(_ f: Double) -> Color {
        f >= 0.85 ? theme.color.danger : (f >= 0.7 ? theme.color.warning : theme.color.success)
    }
    private func channelLabel(_ t: String) -> String {
        switch t {
        case "dine-in", "dine_in": "Dine-in"
        case "takeout", "takeaway": "Takeaway"
        case "delivery": "Delivery"
        default: t.capitalized
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

private extension OperatorSlotsView {
    static var slotsInfo: InfoButton {
        InfoButton(title: "Service slots",
            description: "Bookable fulfilment windows across the day, with their booked-vs-capacity load.",
            institutional: "Slot capacity is the throttle that protects the kitchen from a demand spike it can't plate — the institutional balance is filling revenue-bearing slots without breaching the line's promise time. Empty active slots are lost revenue; over-full ones are late tickets and refunds.",
            plain: "If the 19:00 slot is 18/20 it's nearly full — open another or raise its cap only if the kitchen can keep promise time. A 2/20 lunch slot is capacity you're paying staff for but not selling.",
            tips: "Raise caps on slots that fill early IF the kitchen can hold pace; promote slow slots with a daypart offer; draft slots you can't staff so demand routes elsewhere.",
            methodology: "Slots + booked + capacity from /admin/slots; active = status == active.")
    }
    static var fillInfo: InfoButton {
        InfoButton(title: "Fill rate",
            description: "Booked covers as a share of total slot capacity. The gauge turns amber past 70% and red past 85%.",
            institutional: "Fill rate is the yield-management read on service capacity — the same lever airlines and hotels manage. Persistently low fill means over-provisioned capacity (wasted labour); persistently maxed fill means you're turning away demand or risking the kitchen's promise.",
            plain: "120 booked against 200 capacity is 60% — healthy headroom. At 90% you're one rush from late tickets; that's the cue to add capacity only if the line can keep up.",
            tips: "Push offers into low-fill dayparts, protect kitchen promise on high-fill ones, and use demand-based caps so price rises into the busiest windows.",
            methodology: "Σ currentOrders ÷ Σ maxOrders across slots. Source: /admin/slots.")
    }
}

/// Service-slot detail — capacity + status, with live edits. The capacity stepper
/// can't go below the slot's already-booked count; the status toggle flips
/// draft⇄active. Both PATCH `/api/v1/admin/slots` (manager+) and reload. Rule #1.
struct SlotDetailView: View {
    @Environment(\.theme) private var theme
    let s: AdminSlot
    let api: APIClient
    let reload: () async -> Void
    @State private var maxOrders: Int
    @State private var status: String
    // Last-saved baseline (not the immutable prop) so `dirty` settles back to
    // false after a successful save — the prop `s` never updates.
    @State private var baseMax: Int
    @State private var baseStatus: String
    @State private var busy = false
    @State private var error: String?

    init(s: AdminSlot, api: APIClient, reload: @escaping () async -> Void) {
        self.s = s; self.api = api; self.reload = reload
        _maxOrders = State(initialValue: s.maxOrders)
        _status = State(initialValue: s.status)
        _baseMax = State(initialValue: s.maxOrders)
        _baseStatus = State(initialValue: s.status)
    }

    private var dirty: Bool { maxOrders != baseMax || status != baseStatus }
    private var free: Int { max(0, maxOrders - s.currentOrders) }

    var body: some View {
        OperatorDetailSheet(
            leading: .icon("calendar.badge.clock"),
            title: "\(s.date) · \(s.time)",
            badge: (status.capitalized, status == "active" ? .success : .neutral),
            meta: [OperatorMetaRow("mappin.and.ellipse", "\(s.locationSlug.capitalized) · \(s.fulfillmentTypes.joined(separator: ", "))")]
        ) {
            OperatorStatBand([
                OperatorStatTile("Capacity", "\(maxOrders)"),
                OperatorStatTile("Booked", "\(s.currentOrders)"),
                OperatorStatTile("Free", "\(free)", subTone: free == 0 ? theme.color.danger : nil),
            ])
            DSCard {
                VStack(alignment: .leading, spacing: theme.space.md) {
                    Text("CAPACITY").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
                    HStack(spacing: theme.space.lg) {
                        cap("minus") { if maxOrders > s.currentOrders { maxOrders -= 1 } }
                        Text("\(maxOrders)").textRole(.titleL).monospacedDigit().foregroundStyle(theme.color.textPrimary).frame(maxWidth: .infinity)
                        cap("plus") { if maxOrders < 1000 { maxOrders += 1 } }
                    }
                    Text("Can't drop below the \(s.currentOrders) already booked.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                    Toggle("Active (accepting orders)", isOn: Binding(
                        get: { status == "active" },
                        set: { status = $0 ? "active" : "draft" }
                    ))
                    .tint(theme.color.accent)
                    if let error { Text(error).textRole(.caption).foregroundStyle(theme.color.danger) }
                    DSButton(busy ? "Saving…" : "Save changes") { Task { await save() } }
                        .disabled(!dirty || busy).opacity(!dirty || busy ? 0.5 : 1)
                }
            }
        }
    }

    private func cap(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.headline).frame(width: 48, height: 48)
                .foregroundStyle(theme.color.accent)
                .background(theme.color.surface, in: Circle())
                .overlay(Circle().strokeBorder(theme.color.line, lineWidth: 1))
        }
        .buttonStyle(.plain).sensoryFeedback(.impact(weight: .light), trigger: maxOrders)
    }

    private func save() async {
        busy = true; error = nil
        do {
            _ = try await api.send(.adminUpdateSlot(
                id: s.id,
                maxOrders: maxOrders != baseMax ? maxOrders : nil,
                status: status != baseStatus ? status : nil))
            // Adopt what we just persisted as the new baseline so the Save button
            // returns to disabled and a second save doesn't re-send.
            baseMax = maxOrders; baseStatus = status
            await reload()
        } catch let e as APIError {
            error = OperatorListLoader<AdminSlot>.message(e)
        } catch { self.error = "Couldn't save the slot" }
        busy = false
    }
}

// MARK: - Purchase orders (/admin/purchase-orders)

/// Purchase orders — a dedicated mutable surface (per-row write): each PO carries
/// a status menu (draft → sent → received → cancelled) that PATCHes
/// /api/v1/admin/purchase-orders and reloads. Marking "received" posts the
/// receive stock movements server-side. Web `/admin/purchase-orders` parity.
@MainActor
@Observable
public final class OperatorPurchaseOrdersStore {
    public enum State: Sendable { case loading, loaded([AdminPurchaseOrder]), failed(String) }
    public private(set) var state: State = .loading
    private let api: APIClient
    public init(api: APIClient) { self.api = api }

    public func load() async {
        state = .loading
        do { state = .loaded(try await api.send(.adminPurchaseOrders())) }
        catch let e as APIError { state = .failed(OperatorListLoader<AdminPurchaseOrder>.message(e)) }
        catch { state = .failed("Something went wrong") }
    }

    public func setStatus(_ p: AdminPurchaseOrder, _ status: String) async {
        guard p.status != status else { return }
        _ = try? await api.send(.adminSetPurchaseOrderStatus(id: p.id, status: status))
        await load()
    }
}

public struct OperatorPurchaseOrdersView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorPurchaseOrdersStore
    public init(api: APIClient) { _store = State(initialValue: OperatorPurchaseOrdersStore(api: api)) }

    public var body: some View {
        Group {
            switch store.state {
            case .loading:
                List { ForEach(0..<6, id: \.self) { _ in OperatorRowSkeleton() } }
            case .failed(let m):
                ContentUnavailableView("Couldn't load purchase orders", systemImage: "wifi.slash", description: Text(m))
            case .loaded(let items) where items.isEmpty:
                ContentUnavailableView("Purchase orders", systemImage: "tray", description: Text("No purchase orders raised yet."))
            case .loaded(let items):
                List { ForEach(items) { row($0) } }
            }
        }
        .navigationTitle("Purchase orders")
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.load() }
        .refreshable { await store.load() }
    }

    private func row(_ p: AdminPurchaseOrder) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(p.supplierName).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                Text("\(p.lineCount) lines · \(p.locationSlug.capitalized)").font(.caption).foregroundStyle(theme.color.textSecondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                MoneyText(p.totalCents).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                statusMenu(p)
            }
        }
    }

    // Tap the status pill to advance the PO (draft → sent → received → cancelled).
    private func statusMenu(_ p: AdminPurchaseOrder) -> some View {
        Menu {
            ForEach(["draft", "sent", "received", "cancelled"], id: \.self) { s in
                Button {
                    Task { await store.setStatus(p, s) }
                } label: {
                    if p.status == s { Label(s.capitalized, systemImage: "checkmark") } else { Text(s.capitalized) }
                }
            }
        } label: {
            Text(p.status.capitalized).font(.caption2.weight(.bold))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(statusTint(p.status).opacity(0.18), in: Capsule()).foregroundStyle(statusTint(p.status))
        }
    }

    private func statusTint(_ s: String) -> Color {
        switch s {
        case "received": theme.color.success
        case "sent": theme.color.warning
        case "cancelled": theme.color.danger
        default: theme.color.textSecondary
        }
    }
}
