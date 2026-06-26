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
    @State private var channel = "all"
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
        .sheet(item: $detail) { order in
            OperatorOrderDetailSheet(
                order: order,
                onSettle: { await settle(order) },
                onPrint: { await printReceipt(order) }
            )
        }
    }

    /// Settle (mark paid) via POST /api/v1/orders/:id/settle, then refresh the
    /// board. Returns an error message on failure, nil on success.
    private func settle(_ order: Order) async -> String? {
        do {
            _ = try await deps.api.send(.settle(orderID: order.id))
            await load()
            return nil
        } catch let e as APIError {
            if case .api(_, let m, _) = e { return m }
            return "You appear to be offline"
        } catch { return "Something went wrong" }
    }

    /// Print/render a receipt via POST /api/v1/orders/:id/receipt. Returns the
    /// text to display (printer confirmation, or the simulated preview) or an error.
    private func printReceipt(_ order: Order) async -> Result<String, String> {
        do {
            let r = try await deps.api.send(.receipt(orderID: order.id))
            return .success(r.mode == "printed" ? "Printed to \(r.printer ?? "the printer")." : r.preview)
        } catch let e as APIError {
            if case .api(_, let m, _) = e { return .failure(m) }
            return .failure("You appear to be offline")
        } catch { return .failure("Something went wrong") }
    }

    /// Client-side filter over the loaded board — scope (current vs all) + a
    /// free-text search over id / guest / phone, mirroring the web Orders
    /// surface's filter bar (channel + paid filters await those DTO fields).
    private var shown: [Order] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return orders.filter { o in
            if !showAll, [.completed, .delivered, .pickedUp, .cancelled].contains(o.status) { return false }
            if channel != "all", (o.channel ?? "web") != channel { return false }
            if !q.isEmpty {
                let hay = "\(o.id) \(o.customerName) \(o.customerPhone)".lowercased()
                if !hay.contains(q) { return false }
            }
            return true
        }
    }

    /// Channels present on the board, for the filter menu.
    private var channels: [String] {
        var set = Set<String>()
        for o in orders { set.insert(o.channel ?? "web") }
        return ["all"] + set.sorted()
    }

    private var summary: some View {
        HStack(spacing: theme.space.md) {
            MetricTile(label: "New", value: "\(orders.filter { [.pending, .confirmed].contains($0.status) }.count)", tint: theme.color.accent)
            MetricTile(label: "Cooking", value: "\(orders.filter { $0.status == .preparing }.count)", tint: theme.color.warning)
            MetricTile(label: "Ready", value: "\(orders.filter { $0.status == .ready }.count)", tint: theme.color.success)
        }
    }

    private var filterBar: some View {
        VStack(spacing: theme.space.sm) {
            DSTextField("", text: $query, placeholder: "order id, guest or phone…",
                        systemImage: "magnifyingglass", autocapitalization: .never, autocorrect: false)
            HStack(spacing: theme.space.md) {
                Picker("Scope", selection: $showAll) {
                    Text("Current").tag(false)
                    Text("All").tag(true)
                }
                .pickerStyle(.segmented)
                Menu {
                    ForEach(channels, id: \.self) { c in
                        Button(c == "all" ? "All channels" : c.uppercased()) { channel = c }
                    }
                } label: {
                    Label(channel == "all" ? "All channels" : channel.uppercased(),
                          systemImage: "antenna.radiowaves.left.and.right")
                        .textRole(.caption)
                        .padding(.horizontal, theme.space.md).frame(minHeight: 32)
                        .background(theme.color.surface2, in: Capsule())
                        .overlay(Capsule().strokeBorder(theme.color.line, lineWidth: 1))
                }
                .foregroundStyle(theme.color.textPrimary)
            }
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

/// Order detail — the native twin of the web Orders detail dialog: inspect the
/// full ticket and **settle** (mark paid) over POST /api/v1/orders/:id/settle.
/// Print-receipt still awaits its facade endpoint (noted in-line, not faked).
private struct OperatorOrderDetailSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let order: Order
    /// Settle action injected by the board (owns the api client); nil error = ok.
    let onSettle: () async -> String?
    /// Print action — success carries the text to show (printer note or preview).
    let onPrint: () async -> Result<String, String>

    @State private var busy = false
    @State private var printing = false
    @State private var error: String?
    @State private var receipt: ReceiptDoc?

    private var isPaid: Bool { order.paidAt != nil }

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
                                DSBadge((order.channel ?? "web").uppercased())
                                DSBadge(isPaid ? "Paid" : "Unpaid",
                                        tone: isPaid ? .success : .warning,
                                        systemImage: isPaid ? "checkmark.circle.fill" : "creditcard")
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

                    VStack(spacing: theme.space.sm) {
                        if !isPaid {
                            DSButton(busy ? "Settling…" : "Mark paid") { Task { await settle() } }
                                .disabled(busy)
                        }
                        DSButton(printing ? "Printing…" : "Print receipt", prominent: false) {
                            Task { await runPrint() }
                        }
                        .disabled(printing)
                    }
                    if let error {
                        Text(error).textRole(.caption).foregroundStyle(theme.color.danger)
                    }
                }
                .padding(theme.space.lg)
            }
            .background(theme.color.surface)
            .navigationTitle("Order \(order.id)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
            .sheet(item: $receipt) { doc in ReceiptPreview(text: doc.text) }
        }
    }

    private func settle() async {
        busy = true; error = nil
        defer { busy = false }
        if let msg = await onSettle() { error = msg } else { dismiss() }
    }

    private func runPrint() async {
        printing = true; error = nil
        defer { printing = false }
        switch await onPrint() {
        case .success(let text): receipt = ReceiptDoc(text: text)
        case .failure(let msg): error = msg
        }
    }
}

private struct ReceiptDoc: Identifiable { let id = UUID(); let text: String }

/// Plain-text receipt preview (the no-printer fallback) — shareable to AirPrint /
/// a print-bridge / Notes. Monospaced so the ESC/POS layout reads true.
private struct ReceiptPreview: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let text: String

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(text).textRole(.mono)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(theme.space.lg)
            }
            .background(theme.color.surface)
            .navigationTitle("Receipt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) { ShareLink(item: text) }
            }
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
                if order.paidAt == nil {
                    Text("unpaid").font(.caption2.weight(.semibold)).foregroundStyle(theme.color.warning)
                }
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
