import SwiftUI
import OttavianoKit

/// The operator dashboard — the native twin of web `/admin` (DashboardV3). Live
/// operations on top, a range-scoped executive KPI rail (sparklines + true
/// period-over-period deltas) below, then the revenue trend, daypart demand,
/// fulfilment mix, top sellers and the live order feed. Every number is real:
/// the live strip is the order board (`GET /api/v1/orders`), the executive rail +
/// trend are the date-scoped summary (`/admin/summary?from=&to=`) compared to the
/// equal prior window, and the daypart shape is `/admin/insights` (Rule #1).
@MainActor
@Observable
final class OperatorDashboardStore {
    var range: PeriodRange = .week
    var board: [Order] = []
    var current: AdminSummary?
    var prior: AdminSummary?
    var insights: AdminInsights?
    var loaded = false
    var error: String?

    private let api: APIClient
    init(api: APIClient) { self.api = api }

    func load() async {
        let w = AnalyticsDates.window(for: range)
        do {
            async let board = api.send(.operatorBoard(location: nil))
            async let current = api.send(.adminSummary(from: w.from, to: w.to))
            async let prior = api.send(.adminSummary(from: w.priorFrom, to: w.priorTo))
            // Insights is best-effort — a missing/failed insights call shouldn't
            // blank the whole board, so it's fetched separately and tolerated.
            let insightsTry = try? await api.send(.adminInsights())
            self.board = try await board
            self.current = try await current
            self.prior = try await prior
            self.insights = insightsTry
            self.error = nil
        } catch let e as APIError {
            if case .api(_, let m, _) = e { error = m } else { error = "You appear to be offline" }
        } catch { self.error = "Something went wrong" }
        loaded = true
    }
}

public struct OperatorDashboardView: View {
    @Environment(\.dependencies) private var deps
    @Environment(\.theme) private var theme
    @State private var store: OperatorDashboardStore?

    public init() {}

    private let liveCols = [GridItem(.adaptive(minimum: 120), spacing: 12)]
    private let kpiCols = [GridItem(.adaptive(minimum: 165), spacing: 12)]

    public var body: some View {
        ScrollView {
            if let store {
                content(store)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
            }
        }
        .background(theme.color.surface)
        .navigationTitle("Dashboard")
        .task {
            if store == nil { store = OperatorDashboardStore(api: deps.api) }
            if store?.loaded == false { await store?.load() }
        }
        .refreshable { await store?.load() }
    }

    @ViewBuilder
    private func content(_ store: OperatorDashboardStore) -> some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            if let error = store.error, store.current == nil {
                ContentUnavailableView("Couldn't load the dashboard", systemImage: "exclamationmark.triangle", description: Text(error))
                    .padding(.top, theme.space.xxl)
            } else {
                rangeBar(store)
                liveStrip(store.board)
                if let s = store.current {
                    executiveRail(current: s, prior: store.prior)
                    revenueTrend(s)
                    if let ins = store.insights, !ins.peakHours.isEmpty { daypart(ins.peakHours) }
                    fulfilment(s)
                    topSellers(s)
                }
                recent(store.board, loaded: store.loaded)
            }
        }
        .padding(theme.space.lg)
    }

    // MARK: - Range

    private func rangeBar(_ store: OperatorDashboardStore) -> some View {
        HStack(spacing: theme.space.md) {
            DSSegmented(Binding(
                get: { store.range },
                set: { store.range = $0; Task { await store.load() } }
            ), options: PeriodRange.allCases.map { (value: $0, label: $0.label) })
            .frame(maxWidth: 220)
            Spacer()
            Label("Live", systemImage: "dot.radiowaves.left.and.right")
                .textRole(.caption).foregroundStyle(theme.color.success)
        }
    }

    // MARK: - Live now (board)

    private func liveStrip(_ orders: [Order]) -> some View {
        let live = orders.filter { ![.completed, .delivered, .cancelled, .pickedUp].contains($0.status) }
        let cooking = orders.filter { $0.status == .preparing }.count
        let ready = orders.filter { $0.status == .ready }.count
        let boardRevenue = orders.filter { $0.status != .cancelled }.reduce(0) { $0 + $1.totalAmount }
        return VStack(alignment: .leading, spacing: theme.space.sm) {
            DSSectionHeader("Live now", subtitle: "on the line this service")
            LazyVGrid(columns: liveCols, spacing: theme.space.md) {
                MetricTile(label: "Live orders", value: "\(live.count)", icon: "list.bullet", tint: theme.color.accent)
                MetricTile(label: "In kitchen", value: "\(cooking)", icon: "flame.fill", tint: theme.color.warning)
                MetricTile(label: "Ready", value: "\(ready)", icon: "checkmark.circle.fill", tint: theme.color.success)
                MetricTile(label: "Board total", value: MoneyText.format(boardRevenue), icon: "banknote.fill",
                           tint: theme.color.success, info: Self.boardRevenueInfo)
            }
        }
    }

    // MARK: - Executive rail (range summary vs prior)

    private func executiveRail(current s: AdminSummary, prior p: AdminSummary?) -> some View {
        let revSpark = s.dailyStats.map { Double($0.revenue) }
        let ordSpark = s.dailyStats.map { Double($0.orderCount) }
        let avgSpark = s.dailyStats.map { $0.orderCount > 0 ? Double($0.revenue) / Double($0.orderCount) : 0 }
        let marginSpark = s.dailyStats.map { $0.revenue > 0 ? Double($0.profit) / Double($0.revenue) * 100 : 0 }
        return VStack(alignment: .leading, spacing: theme.space.sm) {
            DSSectionHeader("Executive overview", subtitle: store?.range.caption ?? "")
            LazyVGrid(columns: kpiCols, spacing: theme.space.md) {
                OperatorKPICard(
                    label: "Revenue", value: MoneyText.format(s.totalRevenue), icon: "banknote.fill",
                    tint: theme.color.success,
                    delta: periodDelta(Double(s.totalRevenue), Double(p?.totalRevenue ?? 0)),
                    spark: revSpark, caption: "vs prior", info: Self.revenueInfo)
                OperatorKPICard(
                    label: "Orders", value: "\(s.totalOrders)", icon: "cart.fill",
                    tint: theme.color.accent,
                    delta: periodDelta(Double(s.totalOrders), Double(p?.totalOrders ?? 0)),
                    spark: ordSpark, caption: "vs prior", info: Self.ordersInfo)
                OperatorKPICard(
                    label: "Avg ticket", value: MoneyText.format(Int(s.avgOrderValue.rounded())), icon: "chart.bar.fill",
                    tint: theme.color.accent,
                    delta: periodDelta(s.avgOrderValue, p?.avgOrderValue ?? 0),
                    spark: avgSpark, caption: "vs prior", info: Self.avgInfo)
                OperatorKPICard(
                    label: "Margin", value: "\(Int(s.profitMargin.rounded()))%", icon: "percent",
                    tint: theme.color.success,
                    delta: periodDelta(s.profitMargin, p?.profitMargin ?? 0),
                    spark: marginSpark, caption: "vs prior", info: Self.marginInfo)
            }
        }
    }

    // MARK: - Revenue trend

    private func revenueTrend(_ s: AdminSummary) -> some View {
        card("Revenue trend", subtitle: store?.range.caption, info: Self.trendInfo) {
            if s.dailyStats.isEmpty {
                Text("No sales in range.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                OperatorAreaChart(
                    values: s.dailyStats.map { Double($0.revenue) },
                    tint: theme.color.success,
                    leadingLabel: store?.range.leadingLabel ?? "", trailingLabel: "today",
                    valueFormat: { MoneyText.format(Int($0)) })
            }
        }
    }

    // MARK: - Daypart demand

    private func daypart(_ hours: [AdminInsights.PeakHour]) -> some View {
        let sorted = hours.sorted { $0.hour < $1.hour }
        return card("Demand by hour", subtitle: "orders per hour", info: Self.daypartInfo) {
            OperatorHourBars(bars: sorted.map { (hour: $0.hour, value: Double($0.orderCount)) })
        }
    }

    // MARK: - Fulfilment mix

    private func fulfilment(_ s: AdminSummary) -> some View {
        let total = s.dineInCount + s.takeoutCount + s.deliveryCount
        return card("Fulfilment mix", subtitle: store?.range.caption, info: nil) {
            HStack(spacing: theme.space.xl) {
                OperatorDonut(segments: [
                    .init(label: "Dine-in", value: Double(s.dineInCount), color: theme.color.success),
                    .init(label: "Takeaway", value: Double(s.takeoutCount), color: theme.color.accent),
                    .init(label: "Delivery", value: Double(s.deliveryCount), color: theme.color.warning),
                ], centerValue: "\(total)", centerLabel: "orders")
                VStack(alignment: .leading, spacing: theme.space.sm) {
                    legend("Dine-in", s.dineInCount, total, theme.color.success)
                    legend("Takeaway", s.takeoutCount, total, theme.color.accent)
                    legend("Delivery", s.deliveryCount, total, theme.color.warning)
                }
            }
        }
    }

    private func legend(_ label: String, _ count: Int, _ total: Int, _ color: Color) -> some View {
        HStack(spacing: theme.space.sm) {
            RoundedRectangle(cornerRadius: 3, style: .continuous).fill(color).frame(width: 11, height: 11)
            Text(label).textRole(.callout).foregroundStyle(theme.color.textPrimary)
            Spacer()
            Text("\(count) · \(total > 0 ? Int(Double(count) / Double(total) * 100) : 0)%")
                .textRole(.caption).monospacedDigit().foregroundStyle(theme.color.textSecondary)
        }
    }

    // MARK: - Top sellers

    private func topSellers(_ s: AdminSummary) -> some View {
        let maxRev = max(s.topItems.map(\.revenue).max() ?? 1, 1)
        return card("Top sellers", subtitle: store?.range.caption, info: nil) {
            if s.topItems.isEmpty {
                Text("No sales in range.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                VStack(spacing: theme.space.sm) {
                    ForEach(Array(s.topItems.prefix(6).enumerated()), id: \.element.id) { i, item in
                        OperatorLeaderRow(rank: i + 1, name: item.name,
                                          value: MoneyText.format(item.revenue),
                                          fraction: Double(item.revenue) / Double(maxRev))
                    }
                }
            }
        }
    }

    // MARK: - Latest orders (board)

    private func recent(_ orders: [Order], loaded: Bool) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            DSSectionHeader("Latest orders")
            if loaded && orders.isEmpty {
                Text("No orders on the board yet.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            }
            ForEach(orders.prefix(8)) { OperatorOrderRow(order: $0, accent: accent(for: $0.status)) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func accent(for s: OrderStatus) -> Color {
        switch s {
        case .pending, .confirmed: theme.color.accent
        case .preparing: theme.color.warning
        case .ready: theme.color.success
        default: theme.color.textSecondary
        }
    }

    // MARK: - Card chrome

    private func card<Content: View>(_ title: String, subtitle: String? = nil, info: InfoButton?,
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
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
    }
}

// MARK: - Dashboard KPI explainers (Rule #12 — all five sections each)

private extension OperatorDashboardView {
    static var boardRevenueInfo: InfoButton {
        InfoButton(title: "Board total",
            description: "Revenue from every order currently on the board (this service), cancelled excluded.",
            institutional: "The live board total is the shift's running till — read against the daypart forecast it tells a manager whether to flex labour up or down NOW, not at end-of-day. A board pacing below the same-weekday line by mid-service is the cue to push covers.",
            plain: "Add up every active order's total — 11 orders worth 1 480 zł means 1 480 zł booked so far this shift.",
            tips: "Turn tables faster, prompt dolce + espresso at the pass, and clear the Ready lane so covers keep moving.",
            methodology: "Sum of totalAmount for board orders where status ≠ cancelled. Source: GET /api/v1/orders (live).")
    }
    static var revenueInfo: InfoButton {
        InfoButton(title: "Revenue",
            description: "Gross sales booked from settled orders over the selected window.",
            institutional: "Top-line is the first growth signal but vanity without margin. Benchmark a single Neapolitan pizzeria at 45–70k zł/week; same-store-sales growth above inflation (>5% YoY) is the institutional gate — revenue bought with margin-eroding discounts fails it.",
            plain: "If the last 7 days booked 64 000 zł, that's revenue — money in, before any cost. The sparkline shows whether the daily line is climbing.",
            tips: "Lift covers per slot, raise attach rate (espresso + dolce on every pizza), open underused dayparts, and keep 86'd items low so demand is never turned away.",
            methodology: "Sum of settled order totals over from…to vs the equal prior window. Source: /admin/summary.totalRevenue.")
    }
    static var ordersInfo: InfoButton {
        InfoButton(title: "Orders",
            description: "Count of settled orders over the selected window.",
            institutional: "Order volume is the demand pulse; read alongside ticket size to know whether growth is traffic- or basket-driven. Orders per labour-hour is the productivity gate operators are benchmarked on.",
            plain: "480 orders this week is the raw count of paid tickets — how busy you were, regardless of how big each ticket was.",
            tips: "Drive frequency with loyalty, capture delivery dayparts, and cut slot rejections so demand actually converts to orders.",
            methodology: "Count of settled orders over from…to vs the prior window. Source: /admin/summary.totalOrders.")
    }
    static var avgInfo: InfoButton {
        InfoButton(title: "Avg ticket",
            description: "Average revenue per order over the window.",
            institutional: "Ticket size is the cheapest growth lever — no new guests required. QSR pizza benchmarks 60–110 zł; below 55 zł signals weak attach or under-priced menu, a quiet drag on every other metric.",
            plain: "480 orders making 64 000 zł is ~133 zł each. Add a 12 zł espresso to one in three orders and the average climbs with zero new customers.",
            tips: "Cross-sell at checkout (combo deals), bundle sides, anchor-price a premium pizza, and prompt dolce + drinks at the POS.",
            methodology: "totalRevenue ÷ totalOrders over the window vs prior. Source: /admin/summary.avgOrderValue.")
    }
    static var marginInfo: InfoButton {
        InfoButton(title: "Profit margin",
            description: "Share of every złoty of revenue left after food + labour + overhead.",
            institutional: "A healthy quick-service pizza operation runs 12–18% net; below 8% is a watch-flag, above 20% top-decile. Investors gate follow-on capital on margin trend, not revenue growth.",
            plain: "On 64 000 zł at 15% you keep ~9 600 zł. Push two points to 17% and the same week keeps ~10 880 zł — roughly +70 000 zł a year per site, no new customers.",
            tips: "Trim bottom-quartile dishes by food cost (Menu engineering), tighten portioning on cheese + cured meats, schedule labour to the slot forecast.",
            methodology: "totalProfit ÷ totalRevenue over the window vs prior. Source: /admin/summary.profitMargin.")
    }
    static var trendInfo: InfoButton {
        InfoButton(title: "Revenue trend",
            description: "Daily settled revenue across the selected window.",
            institutional: "Trend beats snapshot — a rising line de-risks the forecast, and the weekday/weekend shape drives staffing + prep. A flatline or sawtooth flags demand-capture problems a single total hides.",
            plain: "Each point is one day's takings. A taller Friday/Saturday is normal; a midweek dip is exactly where a promotion earns its keep.",
            tips: "Smooth the troughs with daypart offers, lock prep to the busiest days, and schedule labour to the shape of the line, not a flat average.",
            methodology: "Per-day sum of settled revenue (dailyStats[].revenue) over from…to. Source: /admin/summary.")
    }
    static var daypartInfo: InfoButton {
        InfoButton(title: "Demand by hour",
            description: "Orders placed in each hour of the day, peak hour highlighted.",
            institutional: "The daypart curve is the single most actionable staffing input — labour scheduled to a flat average is wrong in both directions. The peak-hour bar is where SLA breaks first and where an extra hand pays for itself.",
            plain: "If 19:00 towers over the rest, that's your rush — roster the line and pre-prep dough to it, and don't send people home before it lands.",
            tips: "Staff the peak bars heavier, pre-fire prep ahead of them, and push offers into the shoulder hours to flatten the spike.",
            methodology: "Order count grouped by hour. Source: /admin/insights.peakHours[].orderCount.")
    }
}
