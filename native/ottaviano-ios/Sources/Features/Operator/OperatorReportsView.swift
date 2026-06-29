import SwiftUI
import OttavianoKit

/// Reports — the native twin of web `/admin/reports` (ReportsV3). A range-scoped
/// sales / cost / profit rollup: a segmented period control (7d / 30d / 90d) that
/// re-scopes the summary on `/admin/summary?from=&to=`, an executive KPI rail with
/// sparklines + true period-over-period deltas (vs the equal prior window), the
/// revenue area chart, a P&L waterfall, a net-margin gauge, the fulfilment ring and
/// the ranked top sellers. Every KPI carries the five-section ⓘ (Rule #12), and
/// every number is real (Rule #1).
@MainActor
@Observable
final class OperatorReportsStore {
    var range: PeriodRange = .month
    var current: AdminSummary?
    var prior: AdminSummary?
    var loaded = false
    var error: String?

    private let api: APIClient
    init(api: APIClient) { self.api = api }

    func load() async {
        let w = AnalyticsDates.window(for: range)
        do {
            async let current = api.send(.adminSummary(from: w.from, to: w.to))
            async let prior = api.send(.adminSummary(from: w.priorFrom, to: w.priorTo))
            self.current = try await current
            self.prior = try await prior
            self.error = nil
        } catch let e as APIError {
            if case .api(_, let m, _) = e { error = m } else if case .transport = e { error = "You appear to be offline" }
            else { error = "Something went wrong" }
        } catch { self.error = "Something went wrong" }
        loaded = true
    }
}

public struct OperatorReportsView: View {
    @Environment(\.dependencies) private var deps
    @Environment(\.theme) private var theme
    @State private var store: OperatorReportsStore?

    public init() {}

    private let cols = [GridItem(.adaptive(minimum: 165), spacing: 12)]

    public var body: some View {
        ScrollView {
            if let store { content(store) }
            else { ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl) }
        }
        .background(theme.color.surface)
        .navigationTitle("Reports")
        .task {
            if store == nil { store = OperatorReportsStore(api: deps.api) }
            if store?.loaded == false { await store?.load() }
        }
        .refreshable { await store?.load() }
    }

    @ViewBuilder
    private func content(_ store: OperatorReportsStore) -> some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            if let error = store.error, store.current == nil {
                ContentUnavailableView("Couldn't load reports", systemImage: "chart.bar", description: Text(error))
                    .padding(.top, theme.space.xxl)
            } else if let s = store.current {
                rangeBar(store)
                kpiRail(current: s, prior: store.prior)
                revenueChart(s)
                HStack(alignment: .top, spacing: theme.space.md) {
                    waterfallCard(s)
                    marginCard(s)
                }
                fulfilment(s)
                topItems(s)
            }
        }
        .padding(theme.space.lg)
    }

    private func rangeBar(_ store: OperatorReportsStore) -> some View {
        DSSegmented(Binding(
            get: { store.range },
            set: { store.range = $0; Task { await store.load() } }
        ), options: PeriodRange.allCases.map { (value: $0, label: $0.label) })
    }

    // MARK: KPI rail

    private func kpiRail(current s: AdminSummary, prior p: AdminSummary?) -> some View {
        let revSpark = s.dailyStats.map { Double($0.revenue) }
        let profitSpark = s.dailyStats.map { Double($0.profit) }
        let ordSpark = s.dailyStats.map { Double($0.orderCount) }
        let avgSpark = s.dailyStats.map { $0.orderCount > 0 ? Double($0.revenue) / Double($0.orderCount) : 0 }
        let costSpark = s.dailyStats.map { Double($0.revenue - $0.profit) }
        let marginSpark = s.dailyStats.map { $0.revenue > 0 ? Double($0.profit) / Double($0.revenue) * 100 : 0 }
        return LazyVGrid(columns: cols, spacing: theme.space.md) {
            OperatorKPICard(label: "Revenue", value: MoneyText.format(s.totalRevenue), icon: "banknote.fill",
                tint: theme.color.success, delta: periodDelta(Double(s.totalRevenue), Double(p?.totalRevenue ?? 0)),
                spark: revSpark, caption: "vs prior", info: Self.revenueInfo)
            OperatorKPICard(label: "Profit", value: MoneyText.format(s.totalProfit), icon: "arrow.up.forward",
                tint: theme.color.accent, delta: periodDelta(Double(s.totalProfit), Double(p?.totalProfit ?? 0)),
                spark: profitSpark, caption: "vs prior", info: Self.profitInfo)
            OperatorKPICard(label: "Margin", value: "\(Int(s.profitMargin.rounded()))%", icon: "percent",
                tint: theme.color.success, delta: periodDelta(s.profitMargin, p?.profitMargin ?? 0),
                spark: marginSpark, caption: "vs prior", info: Self.marginInfo)
            OperatorKPICard(label: "Orders", value: "\(s.totalOrders)", icon: "cart.fill",
                tint: theme.color.accent, delta: periodDelta(Double(s.totalOrders), Double(p?.totalOrders ?? 0)),
                spark: ordSpark, caption: "vs prior", info: Self.ordersInfo)
            OperatorKPICard(label: "Avg ticket", value: MoneyText.format(Int(s.avgOrderValue.rounded())), icon: "chart.bar.fill",
                tint: theme.color.textSecondary, delta: periodDelta(s.avgOrderValue, p?.avgOrderValue ?? 0),
                spark: avgSpark, caption: "vs prior", info: Self.avgInfo)
            OperatorKPICard(label: "Cost", value: MoneyText.format(s.totalCost), icon: "arrow.down.forward",
                tint: theme.color.warning, delta: periodDelta(Double(s.totalCost), Double(p?.totalCost ?? 0)),
                goodWhenUp: false, spark: costSpark, caption: "vs prior", info: Self.costInfo)
        }
    }

    // MARK: charts

    private func revenueChart(_ s: AdminSummary) -> some View {
        card("Revenue trend", subtitle: store?.range.caption, info: Self.trendInfo) {
            if s.dailyStats.isEmpty {
                Text("No sales in range.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                OperatorAreaChart(values: s.dailyStats.map { Double($0.revenue) }, tint: theme.color.success,
                    leadingLabel: store?.range.leadingLabel ?? "", trailingLabel: "today",
                    valueFormat: { MoneyText.format(Int($0)) })
            }
        }
    }

    private func waterfallCard(_ s: AdminSummary) -> some View {
        card("P&L cascade", subtitle: store?.range.caption, info: Self.waterfallInfo) {
            OperatorWaterfall(steps: [
                .init(label: "Revenue", amount: Double(s.totalRevenue), isTotal: true),
                .init(label: "Cost", amount: -Double(s.totalCost)),
                .init(label: "Profit", amount: Double(s.totalProfit), isTotal: true),
            ], valueFormat: { MoneyText.format(Int($0)) })
        }
    }

    private func marginCard(_ s: AdminSummary) -> some View {
        // Gauge fills toward a 25% top-decile ceiling so the arc reads as "how far
        // toward best-in-class", not an arbitrary 0–100.
        let frac = min(1, max(0, s.profitMargin / 25))
        let tint: Color = s.profitMargin >= 12 ? theme.color.success : (s.profitMargin >= 8 ? theme.color.warning : theme.color.danger)
        return card("Net margin", subtitle: "vs 25% top-decile", info: Self.marginInfo) {
            HStack {
                Spacer()
                OperatorGauge(fraction: frac, centerValue: "\(Int(s.profitMargin.rounded()))%",
                              centerLabel: "net margin", tint: tint, diameter: 124)
                Spacer()
            }
        }
    }

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
            RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 11, height: 11)
            Text(label).textRole(.callout).foregroundStyle(theme.color.textPrimary)
            Spacer()
            Text("\(count) · \(total > 0 ? Int(Double(count) / Double(total) * 100) : 0)%")
                .textRole(.caption).monospacedDigit().foregroundStyle(theme.color.textSecondary)
        }
    }

    private func topItems(_ s: AdminSummary) -> some View {
        let maxRev = max(s.topItems.map(\.revenue).max() ?? 1, 1)
        return card("Top sellers", subtitle: store?.range.caption, info: nil) {
            if s.topItems.isEmpty {
                Text("No sales in range.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                VStack(spacing: theme.space.sm) {
                    ForEach(Array(s.topItems.prefix(8).enumerated()), id: \.element.id) { i, item in
                        OperatorLeaderRow(rank: i + 1, name: item.name,
                                          value: MoneyText.format(item.revenue),
                                          fraction: Double(item.revenue) / Double(maxRev))
                    }
                }
            }
        }
    }

    // MARK: chrome

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
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg).strokeBorder(theme.color.line, lineWidth: 1))
    }
}

// MARK: - The Reports metric explainers (Rule #12 — all five sections each)

private extension OperatorReportsView {
    static var revenueInfo: InfoButton {
        InfoButton(title: "Revenue",
            description: "Gross sales booked from settled orders over the selected window.",
            institutional: "Top-line is the first growth signal, but it's vanity without margin. Benchmark a single Neapolitan pizzeria at 45–70k zł/week; same-store-sales growth above inflation (>5% YoY) is the institutional gate — revenue bought with discounts that erodes margin fails it.",
            plain: "If the last 30 days booked 268 000 zł across 2 010 orders, that's your revenue — money in, before a single cost is taken out. The sparkline shows the daily shape.",
            tips: "Lift covers per slot, raise attach rate (an espresso + dolce on every pizza), open underused dayparts, and keep 86'd items low so demand is never turned away.",
            methodology: "Sum of settled order totals over from…to vs the equal prior window. Source: /admin/summary.totalRevenue.")
    }
    static var profitInfo: InfoButton {
        InfoButton(title: "Profit",
            description: "What's left after food, labour and allocated overhead over the window.",
            institutional: "Profit — not revenue — funds expansion. A franchisee is bankable at a stable >12% net; lenders size debt service off EBITDA, so a rising profit line is what unlocks the next location.",
            plain: "On a 268 000 zł month, ~40 000 zł of profit at 15% is the cash that actually reaches the owner after paying for everything.",
            tips: "Attack the three cost blocks: food (portioning, waste, supplier terms), labour (schedule to the forecast), overhead (renegotiate rent/utilities). Each point of margin ≈ 70k zł/yr per site.",
            methodology: "revenue − (food + labour + allocated overhead) over from…to vs prior. Source: /admin/summary.totalProfit.")
    }
    static var costInfo: InfoButton {
        InfoButton(title: "Cost",
            description: "Total cost of goods + labour + overhead booked against the window. Lower is better.",
            institutional: "Prime cost (food + labour) should land near 60% of revenue for a healthy pizzeria; drifting above 65% is the margin-killer institutions flag first. Cost discipline separates a scalable chain from a busy-but-broke one.",
            plain: "If you took 268 000 zł and it cost 228 000 zł to make and serve, that 228 000 zł is the cost — the gap is your profit. A rising cost line on flat revenue is the alarm.",
            tips: "Tighten recipe yields, cut waste (see Waste log), buy to par not to panic, and flex labour down on slow forecasts.",
            methodology: "Sum of COGS + labour + overhead over from…to vs prior. Source: /admin/summary.totalCost.")
    }
    static var ordersInfo: InfoButton {
        InfoButton(title: "Orders",
            description: "Count of settled orders in the window.",
            institutional: "Order volume is the demand pulse; read it alongside ticket size to know whether growth is traffic- or basket-driven. Orders per labour-hour is the productivity gate operators are benchmarked on.",
            plain: "2 010 orders this month is the raw count of paid tickets — how busy you were, regardless of how big each one was.",
            tips: "Drive frequency with loyalty, capture delivery dayparts, and cut slot rejections so demand actually converts to orders.",
            methodology: "Count of settled orders over from…to vs prior. Source: /admin/summary.totalOrders.")
    }
    static var avgInfo: InfoButton {
        InfoButton(title: "Avg ticket",
            description: "Average revenue per order over the window.",
            institutional: "Ticket size is the cheapest growth lever — no new guests required. QSR pizza benchmarks 60–110 zł; below 55 zł signals weak attach or under-priced menu, a quiet drag on every other metric.",
            plain: "2 010 orders making 268 000 zł is ~133 zł per order. Add a 12 zł espresso to one in three orders and the average climbs with zero new customers.",
            tips: "Cross-sell at checkout (combo deals), bundle sides, anchor-price a premium pizza, and prompt dolce + drinks at the POS.",
            methodology: "totalRevenue ÷ totalOrders over from…to vs prior. Source: /admin/summary.avgOrderValue.")
    }
    static var marginInfo: InfoButton {
        InfoButton(title: "Profit margin",
            description: "Share of every złoty of revenue left after food + labour + overhead — the headline efficiency number. The gauge fills toward a 25% top-decile ceiling.",
            institutional: "A healthy quick-service pizza operation runs a 12–18% net margin; below 8% is a watch-flag, above 20% is top-decile. Investors gate follow-on capital on margin trend, not just revenue growth.",
            plain: "On a 268 000 zł month at 15% margin you keep about 40 000 zł. Push margin two points to 17% and the same month keeps ~45 500 zł — roughly an extra 70 000 zł a year per location, with no new customers.",
            tips: "Trim the bottom-quartile dishes by food cost (see Menu engineering), tighten portioning on cheese + cured meats, shift labour to match the slot forecast, and move guests to higher-margin channels.",
            methodology: "margin = totalProfit ÷ totalRevenue over from…to vs prior. Source: /admin/summary.profitMargin.")
    }
    static var trendInfo: InfoButton {
        InfoButton(title: "Revenue trend",
            description: "Daily settled revenue across the selected window.",
            institutional: "Trend beats snapshot — a rising line de-risks the forecast, and the weekday/weekend shape drives staffing and prep. A flatline or sawtooth flags demand-capture problems a single total would hide.",
            plain: "Each point is one day's takings. A taller Friday/Saturday is normal; a midweek dip is exactly where a promotion or event earns its keep.",
            tips: "Smooth the troughs with daypart offers, lock prep to the busiest days, and schedule labour to the shape of the line, not a flat average.",
            methodology: "Per-day sum of settled revenue (dailyStats[].revenue) over from…to. Source: /admin/summary.")
    }
    static var waterfallInfo: InfoButton {
        InfoButton(title: "P&L cascade",
            description: "How revenue becomes profit: the total revenue bar, the cost drawn down, and the profit that remains.",
            institutional: "The waterfall is how a CFO reads a P&L at a glance — it makes the cost wedge visible, not just the endpoints. When the red cost step grows faster than the revenue bar across periods, margin is leaking even while the top line looks healthy.",
            plain: "Start at revenue (268 000 zł), subtract everything it cost to make and serve (228 000 zł), and what's left standing is profit (40 000 zł). The taller the red step, the less reaches the owner.",
            tips: "Shrink the cost step: portion control + waste discipline on food, schedule labour to the forecast, and renegotiate the biggest overhead lines. Every złoty off cost lands directly on the profit bar.",
            methodology: "Revenue (total) → −Cost → Profit (total) over the window. Source: /admin/summary totalRevenue / totalCost / totalProfit.")
    }
}
