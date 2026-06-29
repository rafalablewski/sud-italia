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
            row: { c in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.name ?? c.phone).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(c.orderCount) orders · \(c.loyaltyPointsBalance + c.manualPointsAdjust) pts")
                            .font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    MoneyText(c.totalSpentGrosze).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                }
            }
        )
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
            row: { s in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(s.role.capitalized) · \(s.locationSlug.capitalized)").font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
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
