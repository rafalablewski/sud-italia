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
            search: { "\($0.name ?? "") \($0.phone)" },
            detail: { c in AnyView(CustomerDetailView(c: c)) },
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

/// Stock-item detail — the AdminStockRow DTO's fields (Rule #1). On-hand vs par
/// vs reorder, with the low-stock verdict the server already computed.
struct StockDetailView: View {
    @Environment(\.theme) private var theme
    let r: AdminStockRow
    private func fmt(_ d: Double) -> String { d == d.rounded() ? String(Int(d)) : String(format: "%.1f", d) }
    var body: some View {
        OperatorDetailSheet(
            leading: .icon("shippingbox.fill"),
            title: r.name,
            badge: r.low ? ("Low stock", .danger) : ("In stock", .success),
            meta: meta
        ) {
            OperatorStatBand([
                OperatorStatTile("On hand", "\(fmt(r.onHand)) \(r.unit)", subTone: r.low ? theme.color.danger : nil),
                OperatorStatTile("Par level", "\(fmt(r.parLevel)) \(r.unit)"),
                OperatorStatTile("Reorder at", "\(fmt(r.reorderPoint)) \(r.unit)"),
            ])
        }
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
            search: { "\($0.name) \($0.role) \($0.locationSlug)" },
            detail: { s in AnyView(StaffDetailView(s: s)) },
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
            search: { "\($0.name) \($0.contactName ?? "")" },
            detail: { s in AnyView(SupplierDetailView(s: s)) },
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
            search: { "\($0.name) \($0.locationSlug)" },
            detail: { r in AnyView(StockDetailView(r: r)) },
            row: { r in
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
            }
        )
    }
    private func num(_ d: Double) -> String {
        d == d.rounded() ? String(Int(d)) : String(format: "%.1f", d)
    }
}

// MARK: - Service / Slots (/core/service/slots)

public struct OperatorSlotsView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Service",
            emptyText: "No fulfilment slots scheduled.",
            loader: OperatorListLoader { try await api.send(.adminSlots()) },
            row: { s in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(s.date) · \(s.time)").font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(s.locationSlug.capitalized) · \(s.fulfillmentTypes.joined(separator: ", "))").font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    let full = s.currentOrders >= s.maxOrders
                    Text("\(s.currentOrders)/\(s.maxOrders)").font(.subheadline.weight(.semibold)).monospacedDigit()
                        .foregroundStyle(full ? theme.color.danger : theme.color.success)
                }
            }
        )
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
