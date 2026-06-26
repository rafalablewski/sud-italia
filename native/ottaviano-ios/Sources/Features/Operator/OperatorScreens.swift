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

public struct OperatorFeedbackView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Feedback",
            emptyText: "No reviews in yet.",
            loader: OperatorListLoader { try await api.send(.adminFeedback()) },
            header: { (items: [AdminFeedback]) in
                let avg = items.isEmpty ? 0 : items.reduce(0.0) { $0 + $1.overallRating } / Double(items.count)
                return AnyView(HStack(spacing: theme.space.sm) {
                    OperatorStatChip("Reviews", "\(items.count)", tint: theme.color.accent)
                    OperatorStatChip("Avg", String(format: "%.1f★", avg), tint: theme.color.warning)
                })
            },
            row: { f in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(stars(f.overallRating)).foregroundStyle(theme.color.warning)
                        Spacer()
                        if let s = f.sentiment { sentimentTag(s) }
                    }
                    if !f.comment.isEmpty {
                        Text(f.comment).font(.subheadline).foregroundStyle(theme.color.textPrimary).lineLimit(3)
                    }
                    Text("\(f.customerName) · \(f.locationSlug.capitalized)").font(.caption).foregroundStyle(theme.color.textSecondary)
                }
            }
        )
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

public struct OperatorPurchaseOrdersView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Purchase orders",
            emptyText: "No purchase orders raised yet.",
            loader: OperatorListLoader { try await api.send(.adminPurchaseOrders()) },
            row: { p in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.supplierName).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(p.lineCount) lines · \(p.locationSlug.capitalized)").font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        MoneyText(p.totalCents).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text(p.status.capitalized).font(.caption2.weight(.bold))
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(statusTint(p.status).opacity(0.18), in: Capsule()).foregroundStyle(statusTint(p.status))
                    }
                }
            }
        )
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
