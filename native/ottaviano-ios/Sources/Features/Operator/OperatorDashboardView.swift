import SwiftUI
import OttavianoKit

/// The operator dashboard — the native twin of `/admin`. Unlike the parity
/// scaffolds, this is **live**: every tile is computed from the real operator
/// order board (`GET /api/v1/orders`), so the kitchen lead sees true covers,
/// revenue and prep load (Rule #1 — real data, never mocked). Tapping through to
/// the full Orders board happens from the sidebar.
public struct OperatorDashboardView: View {
    @Environment(\.dependencies) private var deps
    @Environment(\.theme) private var theme
    @State private var orders: [Order] = []
    @State private var loaded = false
    @State private var error: String?

    public init() {}

    private let cols = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let error, orders.isEmpty {
                    ContentUnavailableView("Couldn't load the dashboard", systemImage: "exclamationmark.triangle", description: Text(error))
                        .padding(.top, theme.space.xxl)
                } else {
                    LazyVGrid(columns: cols, spacing: theme.space.md) {
                        tile("Live orders", "\(liveCount)", "list.bullet", theme.color.accent)
                        tile("In the kitchen", "\(cookingCount)", "flame.fill", theme.color.warning)
                        tile("Ready", "\(readyCount)", "checkmark.circle.fill", theme.color.success)
                        tile("Completed", "\(completedCount)", "bag.fill", theme.color.textSecondary)
                        tileMoney("Revenue (board)", revenueGrosze, "banknote.fill", theme.color.success)
                        tileMoney("Avg ticket", avgTicketGrosze, "chart.bar.fill", theme.color.accent)
                    }
                    recent
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Dashboard")
        .task { await load() }
        .refreshable { await load() }
    }

    private var recent: some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text("Latest orders").font(.headline).foregroundStyle(theme.color.textPrimary)
            if loaded && orders.isEmpty {
                Text("No orders on the board yet.").font(.footnote).foregroundStyle(theme.color.textSecondary)
            }
            ForEach(orders.prefix(8)) { OperatorOrderRow(order: $0, accent: accent(for: $0.status)) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func tile(_ label: String, _ value: String, _ icon: String, _ accent: Color) -> some View {
        VStack(alignment: .leading, spacing: theme.space.xs) {
            Image(systemName: icon).foregroundStyle(accent)
            Text(value).font(.system(size: 30, weight: .bold)).monospacedDigit().foregroundStyle(theme.color.textPrimary)
            Text(label).font(.caption).foregroundStyle(theme.color.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func tileMoney(_ label: String, _ grosze: Grosze, _ icon: String, _ accent: Color) -> some View {
        VStack(alignment: .leading, spacing: theme.space.xs) {
            Image(systemName: icon).foregroundStyle(accent)
            MoneyText(grosze).font(.system(size: 26, weight: .bold)).foregroundStyle(theme.color.textPrimary)
            Text(label).font(.caption).foregroundStyle(theme.color.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }

    // Derived, all from real board data.
    private var liveCount: Int { orders.filter { ![.completed, .delivered, .cancelled].contains($0.status) }.count }
    private var cookingCount: Int { orders.filter { $0.status == .preparing }.count }
    private var readyCount: Int { orders.filter { $0.status == .ready }.count }
    private var completedCount: Int { orders.filter { [.completed, .delivered, .pickedUp].contains($0.status) }.count }
    private var revenueGrosze: Grosze { orders.filter { $0.status != .cancelled }.reduce(0) { $0 + $1.totalAmount } }
    private var avgTicketGrosze: Grosze {
        let billable = orders.filter { $0.status != .cancelled }
        return billable.isEmpty ? 0 : revenueGrosze / billable.count
    }

    private func accent(for s: OrderStatus) -> Color {
        switch s {
        case .pending, .confirmed: theme.color.accent
        case .preparing: theme.color.warning
        case .ready: theme.color.success
        default: theme.color.textSecondary
        }
    }

    private func load() async {
        do {
            orders = try await deps.api.send(.operatorBoard(location: nil))
            error = nil
        } catch let e as APIError {
            if case .api(_, let m, _) = e { error = m } else { error = "You appear to be offline" }
        } catch { error = "Something went wrong" }
        loaded = true
    }
}
