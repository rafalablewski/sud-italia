import SwiftUI
import OttavianoKit

/// Reports — the native twin of web `/admin/reports`. Live sales / cost / profit
/// rollup from `GET /api/v1/admin/summary`, with a 14-day revenue chart, the
/// fulfilment-mix ring and ranked top sellers. Every KPI carries the five-section
/// ⓘ explainer (Rule #12). Real data only (Rule #1).
public struct OperatorReportsView: View {
    @Environment(\.dependencies) private var deps
    @Environment(\.theme) private var theme
    @State private var summary: AdminSummary?
    @State private var error: String?
    @State private var loaded = false

    public init() {}

    private let cols = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let error, summary == nil {
                    ContentUnavailableView("Couldn't load reports", systemImage: "chart.bar", description: Text(error))
                        .padding(.top, theme.space.xxl)
                } else if let s = summary {
                    LazyVGrid(columns: cols, spacing: theme.space.md) {
                        moneyTile("Revenue", s.totalRevenue, theme.color.success, Self.revenueInfo)
                        moneyTile("Profit", s.totalProfit, theme.color.accent, Self.profitInfo)
                        moneyTile("Cost", s.totalCost, theme.color.warning, Self.costInfo)
                        tile("Orders", "\(s.totalOrders)", theme.color.accent, Self.ordersInfo)
                        moneyTile("Avg ticket", Int(s.avgOrderValue.rounded()), theme.color.textSecondary, Self.avgInfo)
                        tile("Margin", "\(Int(s.profitMargin.rounded()))%", theme.color.success, Self.marginInfo)
                    }
                    revenueChart(s)
                    fulfilment(s)
                    topItems(s)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Reports")
        .task { if !loaded { await load() } }
        .refreshable { await load() }
    }

    // MARK: cards

    private func revenueChart(_ s: AdminSummary) -> some View {
        card("Revenue — last 14 days", info: Self.trendInfo) {
            if s.dailyStats.isEmpty {
                Text("No sales in range.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                OperatorBarChart(
                    values: s.dailyStats.suffix(14).map { Double($0.revenue) },
                    leadingLabel: "14d ago", trailingLabel: "today"
                )
            }
        }
    }

    private func fulfilment(_ s: AdminSummary) -> some View {
        let total = s.dineInCount + s.takeoutCount + s.deliveryCount
        return card("Fulfilment mix", info: nil) {
            HStack(spacing: theme.space.xl) {
                OperatorDonut(
                    segments: [
                        .init(label: "Dine-in", value: Double(s.dineInCount), color: theme.color.success),
                        .init(label: "Takeaway", value: Double(s.takeoutCount), color: theme.color.accent),
                        .init(label: "Delivery", value: Double(s.deliveryCount), color: theme.color.warning),
                    ],
                    centerValue: "\(total)", centerLabel: "orders"
                )
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
        let maxQty = max(s.topItems.map(\.quantity).max() ?? 1, 1)
        return card("Top sellers", info: nil) {
            if s.topItems.isEmpty {
                Text("No sales in range.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                VStack(spacing: theme.space.sm) {
                    ForEach(s.topItems.prefix(8)) { item in
                        HStack(spacing: theme.space.sm) {
                            Text(item.name).font(.subheadline.weight(.semibold))
                                .foregroundStyle(theme.color.textPrimary)
                                .frame(width: 130, alignment: .leading).lineLimit(1)
                            OperatorBarRow(fraction: Double(item.quantity) / Double(maxQty))
                            Text("×\(item.quantity)").textRole(.caption).monospacedDigit()
                                .foregroundStyle(theme.color.textSecondary).frame(width: 44, alignment: .trailing)
                            MoneyText(item.revenue).font(.subheadline.weight(.semibold))
                                .foregroundStyle(theme.color.textPrimary).frame(width: 72, alignment: .trailing)
                        }
                    }
                }
            }
        }
    }

    // MARK: chrome

    private func card<Content: View>(_ title: String, info: InfoButton?, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            HStack {
                Text(title).font(.headline).foregroundStyle(theme.color.textPrimary)
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

    private func tile(_ label: String, _ value: String, _ tint: Color, _ info: InfoButton?) -> some View {
        kpiTile(label, info) {
            Text(value).textRole(.titleL).monospacedDigit().foregroundStyle(theme.color.textPrimary)
        }
    }

    private func moneyTile(_ label: String, _ grosze: Grosze, _ tint: Color, _ info: InfoButton?) -> some View {
        kpiTile(label, info) {
            MoneyText(grosze).textRole(.titleL).foregroundStyle(theme.color.textPrimary)
        }
    }

    private func kpiTile<Value: View>(_ label: String, _ info: InfoButton?, @ViewBuilder value: () -> Value) -> some View {
        VStack(alignment: .leading, spacing: theme.space.xs) {
            HStack {
                Text(label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
                Spacer()
                if let info { info }
            }
            value()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func load() async {
        do { summary = try await deps.api.send(.adminSummary()); error = nil }
        catch let e as APIError {
            if case .api(_, let m, _) = e { error = m } else if case .transport = e { error = "You appear to be offline" }
            else { error = "Something went wrong" }
        } catch { self.error = "Something went wrong" }
        loaded = true
    }
}

// MARK: - The Reports metric explainers (Rule #12 — all five sections each)

private extension OperatorReportsView {
    static var revenueInfo: InfoButton {
        InfoButton(title: "Revenue",
            description: "Gross sales booked from settled orders over the selected range.",
            institutional: "Top-line is the first growth signal, but it's vanity without margin. Benchmark a single Neapolitan pizzeria at 45–70k zł/week; same-store-sales growth above inflation (>5% YoY) is the institutional gate — revenue bought with discounts that erodes margin fails it.",
            plain: "If today booked 9 800 zł across 73 orders, that's your revenue — money in, before a single cost is taken out.",
            tips: "Lift covers per slot, raise attach rate (an espresso + dolce on every pizza), open underused dayparts, and keep 86'd items low so demand is never turned away.",
            methodology: "Sum of settled order totals over the range. Source: GET /api/v1/admin/summary (totalRevenue), chain-wide.")
    }
    static var profitInfo: InfoButton {
        InfoButton(title: "Profit",
            description: "What's left after food, labour and allocated overhead.",
            institutional: "Profit — not revenue — funds expansion. A franchisee is bankable at a stable >12% net; lenders size debt service off EBITDA, so a rising profit line is what unlocks the next location.",
            plain: "On a 9 800 zł day, ~1 470 zł of profit at 15% is the cash that actually reaches the owner after paying for everything.",
            tips: "Attack the three cost blocks: food (portioning, waste, supplier terms), labour (schedule to the forecast), overhead (renegotiate rent/utilities). Each point of margin ≈ 70k zł/yr per site.",
            methodology: "revenue − (food + labour + allocated overhead) over the range. Source: summary.totalProfit.")
    }
    static var costInfo: InfoButton {
        InfoButton(title: "Cost",
            description: "Total cost of goods + labour + overhead booked against the range.",
            institutional: "Prime cost (food + labour) should land near 60% of revenue for a healthy pizzeria; drifting above 65% is the margin-killer institutions flag first. Cost discipline is what separates a scalable chain from a busy-but-broke one.",
            plain: "If you took 9 800 zł and it cost 8 330 zł to make and serve, that 8 330 zł is the cost — the gap is your profit.",
            tips: "Tighten recipe yields, cut waste (see Waste log), buy to par not to panic, and flex labour down on slow forecasts.",
            methodology: "Sum of COGS + labour + overhead over the range. Source: summary.totalCost.")
    }
    static var ordersInfo: InfoButton {
        InfoButton(title: "Orders",
            description: "Count of settled orders in the range.",
            institutional: "Order volume is the demand pulse; read it alongside ticket size to know whether growth is traffic- or basket-driven. Orders per labour-hour is the productivity gate operators are benchmarked on.",
            plain: "73 orders today is the raw count of tickets that were paid — how busy you were, regardless of how big each one was.",
            tips: "Drive frequency with loyalty, capture delivery dayparts, and cut slot rejections so demand actually converts to orders.",
            methodology: "Count of settled orders over the range. Source: summary.totalOrders.")
    }
    static var avgInfo: InfoButton {
        InfoButton(title: "Avg ticket",
            description: "Average revenue per order.",
            institutional: "Ticket size is the cheapest growth lever — no new guests required. QSR pizza benchmarks 60–110 zł; below 55 zł signals weak attach or under-priced menu, a quiet drag on every other metric.",
            plain: "73 orders making 9 800 zł is ~134 zł per order. Add a 12 zł espresso to one in three orders and the average climbs with zero new customers.",
            tips: "Cross-sell at checkout (combo deals), bundle sides, anchor-price a premium pizza, and prompt dolce + drinks at the POS.",
            methodology: "totalRevenue ÷ totalOrders. Source: summary.avgOrderValue.")
    }
    static var marginInfo: InfoButton {
        InfoButton(title: "Profit margin",
            description: "Share of every złoty of revenue left after food + labour + overhead — the headline efficiency number.",
            institutional: "A healthy quick-service pizza operation runs a 12–18% net margin; below 8% is a watch-flag, above 20% is top-decile. Investors gate follow-on capital on margin trend, not just revenue growth.",
            plain: "On a 9 800 zł day at 15% margin you keep about 1 470 zł. Push margin two points to 17% and the same day keeps 1 666 zł — roughly an extra 70 000 zł a year per location, with no new customers.",
            tips: "Trim the bottom-quartile dishes by food cost (see Menu engineering), tighten portioning on cheese + cured meats, shift labour to match the slot forecast, and move guests to higher-margin channels.",
            methodology: "margin = totalProfit ÷ totalRevenue over the range. Source: summary.profitMargin, computed chain-wide from settled orders.")
    }
    static var trendInfo: InfoButton {
        InfoButton(title: "Revenue trend",
            description: "Daily settled revenue for the last 14 days.",
            institutional: "Trend beats snapshot — a rising 14-day line de-risks the forecast, and the weekday/weekend shape drives staffing and prep. A flatline or sawtooth flags demand-capture problems a single total would hide.",
            plain: "Each bar is one day's takings. A taller Friday/Saturday is normal; a midweek dip is exactly where a promotion or event earns its keep.",
            tips: "Smooth the troughs with daypart offers, lock prep to the busiest bars, and schedule labour to the shape of the line, not a flat average.",
            methodology: "Per-day sum of settled order revenue. Source: summary.dailyStats[].revenue.")
    }
}
