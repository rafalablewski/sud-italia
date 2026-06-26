import SwiftUI
import OttavianoKit

/// The operations board — a live, sectioned overview of every order off
/// `GET /api/v1/orders` (operator-scoped). Read-and-refresh; the bump-through
/// happens on the Kitchen lanes (`KDSBoardView`). Dark operator skin.
public struct OperatorBoardView: View {
    @Environment(\.dependencies) private var deps
    @Environment(\.theme) private var theme
    @State private var orders: [Order] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var query = ""
    @State private var showAll = false
    @State private var detail: Order?

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(spacing: theme.space.lg) {
                summary
                filterBar
                if let error, orders.isEmpty {
                    ContentUnavailableView("Couldn't load the board", systemImage: "exclamationmark.triangle", description: Text(error))
                        .padding(.top, theme.space.xxl)
                } else if loaded && shown.isEmpty {
                    ContentUnavailableView(
                        orders.isEmpty ? "No orders yet" : "No orders match",
                        systemImage: "tray",
                        description: Text(orders.isEmpty ? "New orders land here the moment they're placed." : "Try a different search or scope.")
                    )
                    .padding(.top, theme.space.xxl)
                } else {
                    section("Incoming", shown.filter { [.pending, .confirmed].contains($0.status) }, accent: theme.color.accent)
                    section("Cooking", shown.filter { $0.status == .preparing }, accent: theme.color.warning)
                    section("Ready", shown.filter { $0.status == .ready }, accent: theme.color.success)
                    if showAll {
                        section("Done", shown.filter { [.completed, .delivered, .pickedUp].contains($0.status) }, accent: theme.color.textSecondary)
                    }
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Orders")
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $detail) { OperatorOrderDetailSheet(order: $0) }
    }

    /// Client-side filter over the loaded board — scope (current vs all) + a
    /// free-text search over id / guest / phone, mirroring the web Orders
    /// surface's filter bar (channel + paid filters await those DTO fields).
    private var shown: [Order] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return orders.filter { o in
            if !showAll, [.completed, .delivered, .pickedUp, .cancelled].contains(o.status) { return false }
            if !q.isEmpty {
                let hay = "\(o.id) \(o.customerName) \(o.customerPhone)".lowercased()
                if !hay.contains(q) { return false }
            }
            return true
        }
    }

    private var summary: some View {
        HStack(spacing: theme.space.md) {
            MetricTile(label: "New", value: "\(orders.filter { [.pending, .confirmed].contains($0.status) }.count)", tint: theme.color.accent)
            MetricTile(label: "Cooking", value: "\(orders.filter { $0.status == .preparing }.count)", tint: theme.color.warning)
            MetricTile(label: "Ready", value: "\(orders.filter { $0.status == .ready }.count)", tint: theme.color.success)
        }
    }

    private var filterBar: some View {
        HStack(spacing: theme.space.md) {
            DSTextField("", text: $query, placeholder: "order id, guest or phone…",
                        systemImage: "magnifyingglass", autocapitalization: .never, autocorrect: false)
            Picker("Scope", selection: $showAll) {
                Text("Current").tag(false)
                Text("All").tag(true)
            }
            .pickerStyle(.segmented)
            .frame(width: 160)
        }
    }

    @ViewBuilder
    private func section(_ title: String, _ list: [Order], accent: Color) -> some View {
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: theme.space.sm) {
                DSSectionHeader(title) { DSBadge("\(list.count)", tone: .accent) }
                ForEach(list) { order in
                    Button { detail = order } label: {
                        OperatorOrderRow(order: order, accent: accent)
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func load() async {
        do {
            orders = try await deps.api.send(.operatorBoard(location: nil))
            error = nil
        } catch let e as APIError {
            if case .api(_, let m, _) = e { error = m } else { error = "You appear to be offline" }
        } catch { self.error = "Something went wrong" }
        loaded = true
    }
}

/// Read-only order detail — the native twin of the web Orders detail dialog
/// (inspect the full ticket). Settle (mark-paid) + print-receipt land when the
/// `/api/v1` facade exposes them; surfaced honestly here rather than faked.
private struct OperatorOrderDetailSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let order: Order

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: theme.space.lg) {
                    DSCard {
                        VStack(alignment: .leading, spacing: theme.space.xs) {
                            Text(order.customerName).textRole(.bodyEmphasis).foregroundStyle(theme.color.textPrimary)
                            Text(order.customerPhone).textRole(.caption).foregroundStyle(theme.color.textSecondary)
                            HStack(spacing: theme.space.sm) {
                                DSBadge(order.status.rawValue.capitalized, tone: .info)
                                DSBadge(order.fulfillmentType.capitalized)
                                if !order.slotTime.isEmpty { DSBadge(order.slotTime) }
                            }
                            .padding(.top, theme.space.xs)
                        }
                    }
                    DSSectionHeader("Ticket")
                    DSCard {
                        VStack(alignment: .leading, spacing: theme.space.sm) {
                            ForEach(order.items) { line in
                                HStack(alignment: .top, spacing: theme.space.sm) {
                                    Text("\(line.quantity)×").textRole(.mono).foregroundStyle(theme.color.accent)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(line.name).textRole(.body).foregroundStyle(theme.color.textPrimary)
                                        if let n = line.notes, !n.isEmpty {
                                            Text(n).textRole(.caption).italic().foregroundStyle(theme.color.warning)
                                        }
                                    }
                                    Spacer()
                                    MoneyText(line.unitPrice * line.quantity).textRole(.body).foregroundStyle(theme.color.textSecondary)
                                }
                            }
                            Divider().overlay(theme.color.line)
                            HStack {
                                Text("Total").textRole(.bodyEmphasis)
                                Spacer()
                                MoneyText(order.totalAmount).textRole(.bodyEmphasis)
                            }
                            .foregroundStyle(theme.color.textPrimary)
                        }
                    }
                    Text("Settle & print receipt land with the POS facade wave (/api/v1).")
                        .textRole(.caption).foregroundStyle(theme.color.textSecondary)
                }
                .padding(theme.space.lg)
            }
            .background(theme.color.surface)
            .navigationTitle("Order \(order.id)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
        }
    }
}

struct OperatorOrderRow: View {
    @Environment(\.theme) private var theme
    let order: Order
    let accent: Color

    var body: some View {
        HStack(alignment: .top, spacing: theme.space.md) {
            RoundedRectangle(cornerRadius: 2).fill(accent).frame(width: 4)
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(order.id).font(.subheadline.weight(.bold)).foregroundStyle(theme.color.textPrimary)
                    Text(order.fulfillmentType.capitalized).font(.caption).foregroundStyle(theme.color.textSecondary)
                }
                Text(order.customerName).font(.caption).foregroundStyle(theme.color.textSecondary)
                Text(order.items.map { "\($0.quantity)× \($0.name)" }.joined(separator: ", "))
                    .font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(2)
            }
            Spacer(minLength: theme.space.sm)
            VStack(alignment: .trailing, spacing: 4) {
                MoneyText(order.totalAmount).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                Text(order.status.rawValue.capitalized)
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, theme.space.sm).padding(.vertical, 3)
                    .background(accent.opacity(0.18), in: Capsule())
                    .foregroundStyle(accent)
                if !order.slotTime.isEmpty {
                    Text(order.slotTime).font(.caption2).foregroundStyle(theme.color.textSecondary)
                }
            }
        }
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }
}

/// Account / session surface for the operator app — identity + sign out.
public struct OperatorAccountView: View {
    @Environment(\.theme) private var theme
    private let session: OperatorSession
    public init(session: OperatorSession) { self.session = session }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let user = session.user {
                    VStack(alignment: .leading, spacing: theme.space.sm) {
                        Text(user.name ?? "Owner").font(.title2.weight(.bold)).foregroundStyle(theme.color.textPrimary)
                        if let email = user.email { row("Email", email) }
                        row("Role", user.role.capitalized)
                        row("Locations", user.scope == "*" ? "All locations" : user.scope)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(theme.space.lg)
                    .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
                    .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
                }
                DSButton("Sign out", prominent: false) { Task { await session.signOut() } }
                Spacer()
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Account")
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundStyle(theme.color.textSecondary)
            Spacer()
            Text(value).font(.subheadline.weight(.medium)).foregroundStyle(theme.color.textPrimary)
        }
    }
}
