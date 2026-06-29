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
                        MetricTile(label: "Live orders", value: "\(liveCount)", icon: "list.bullet", tint: theme.color.accent)
                        MetricTile(label: "In the kitchen", value: "\(cookingCount)", icon: "flame.fill", tint: theme.color.warning)
                        MetricTile(label: "Ready", value: "\(readyCount)", icon: "checkmark.circle.fill", tint: theme.color.success)
                        MetricTile(label: "Completed", value: "\(completedCount)", icon: "bag.fill", tint: theme.color.textSecondary)
                        MetricTile(label: "Revenue (board)", value: MoneyText.format(revenueGrosze), icon: "banknote.fill", tint: theme.color.success, info: Self.boardRevenueInfo)
                        MetricTile(label: "Avg ticket", value: MoneyText.format(avgTicketGrosze), icon: "chart.bar.fill", tint: theme.color.accent, info: Self.boardAvgInfo)
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
            DSSectionHeader("Latest orders")
            if loaded && orders.isEmpty {
                Text("No orders on the board yet.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            }
            ForEach(orders.prefix(8)) { OperatorOrderRow(order: $0, accent: accent(for: $0.status)) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
        } catch { self.error = "Something went wrong" }
        loaded = true
    }
}

// MARK: - Dashboard KPI explainers (Rule #12 — all five sections)

private extension OperatorDashboardView {
    static var boardRevenueInfo: InfoButton {
        InfoButton(title: "Revenue (board)",
            description: "Revenue from every order currently on the board (this service), cancelled excluded.",
            institutional: "The live board total is the shift's running till — a manager reads it against the daypart forecast to flex labour up or down in real time. A board tracking below the same-weekday pace by mid-service is the cue to push covers, not wait for the end-of-day report.",
            plain: "Add up every active order's total — if the board holds 11 orders worth 1 480 zł, that's your revenue so far this shift.",
            tips: "Turn waiting tables faster, prompt dolce + espresso at the pass, and clear the Ready lane so covers keep moving.",
            methodology: "Sum of totalAmount for board orders where status ≠ cancelled. Source: GET /api/v1/orders.")
    }
    static var boardAvgInfo: InfoButton {
        InfoButton(title: "Avg ticket (board)",
            description: "Average value of the orders currently on the board.",
            institutional: "Per-ticket value on the live board is the fastest read on whether tonight's mix is premium or thin — and it's the lever a manager can actually move within one shift via the pass, unlike menu pricing.",
            plain: "11 orders worth 1 480 zł is ~135 zł each — nudge a third of tables to add a 12 zł espresso and the average rises before close.",
            tips: "Coach the pass to suggest sides + drinks, surface the combo deals, and seat larger parties into higher-cover tables.",
            methodology: "Board revenue ÷ billable board orders (status ≠ cancelled). Source: GET /api/v1/orders.")
    }
}
