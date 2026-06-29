import SwiftUI
import OttavianoKit

// Wave 4 operator surfaces — the generic Settings renderer (covers 8 config
// pages), Insights, Multi-location, Expansion, Scheduled bundles, and a static
// Welcome. All live off /api/v1/admin, dark operator skin.

// MARK: - Generic settings (covers /admin/settings, /payments, /qr-ordering,
//          /integrations, /currency, /languages, /upsell, /crosssell)

public struct OperatorSettingsView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    private let surface: String
    private let title: String
    @State private var data: SettingsSurface?
    @State private var error: String?

    public init(api: APIClient, surface: String, title: String) {
        self.api = api; self.surface = surface; self.title = title
    }

    public var body: some View {
        Group {
            if let error, data == nil {
                ContentUnavailableView("Couldn't load \(title.lowercased())", systemImage: "wifi.slash", description: Text(error))
            } else if let data {
                if data.fields.isEmpty {
                    ContentUnavailableView(data.title, systemImage: "gearshape", description: Text("Nothing configured yet."))
                } else {
                    List {
                        ForEach(Array(data.fields.enumerated()), id: \.offset) { _, f in
                            HStack(alignment: .top) {
                                Text(f.label).font(.caption).foregroundStyle(theme.color.textSecondary)
                                Spacer(minLength: theme.space.md)
                                Text(f.value).font(.subheadline).foregroundStyle(theme.color.textPrimary)
                                    .multilineTextAlignment(.trailing)
                            }
                        }
                    }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(theme.color.surface)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do { data = try await api.send(.adminSettings(surface: surface)); error = nil }
        catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { self.error = "Something went wrong" }
    }
}

// MARK: - Insights (/admin/ai)

/// Insights — the native twin of web `/admin/insights` (InsightsV3). Demand &
/// menu intelligence: a KPI rail (items/order, cancellation rate with a gauge),
/// the daypart demand bars, ranked top/worst sellers as magnitude leaderboards,
/// and a cross-location revenue comparison + per-site KPI cards. Real data only
/// (Rule #1); KPIs carry the five-section ⓘ (Rule #12).
public struct OperatorInsightsView: View {
    @Environment(\.dependencies) private var deps
    @Environment(\.theme) private var theme
    @State private var data: AdminInsights?
    @State private var error: String?

    public init() {}

    private let cols = [GridItem(.adaptive(minimum: 165), spacing: 12)]

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let error, data == nil {
                    ContentUnavailableView("Couldn't load insights", systemImage: "brain", description: Text(error))
                        .padding(.top, theme.space.xxl)
                } else if let d = data {
                    kpis(d)
                    if !d.peakHours.isEmpty { daypart(d.peakHours) }
                    sellers("Top sellers", d.topSellers, info: Self.topInfo)
                    sellers("Worst sellers", d.worstSellers, info: Self.worstInfo)
                    locations(d.locationComparison)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Insights")
        .task { await load() }
        .refreshable { await load() }
    }

    private func kpis(_ d: AdminInsights) -> some View {
        let cancelFrac = min(1, max(0, d.cancellationRate / 10)) // 10% = full danger arc
        let cancelTint: Color = d.cancellationRate <= 2 ? theme.color.success : (d.cancellationRate <= 5 ? theme.color.warning : theme.color.danger)
        return LazyVGrid(columns: cols, spacing: theme.space.md) {
            OperatorKPICard(label: "Items / order", value: String(format: "%.1f", d.avgItemsPerOrder),
                            icon: "bag.fill", tint: theme.color.accent, info: Self.itemsInfo)
            card("Cancellation rate", subtitle: "vs 10% ceiling", info: Self.cancelInfo) {
                HStack {
                    Spacer()
                    OperatorGauge(fraction: cancelFrac,
                                  centerValue: String(format: "%.0f%%", d.cancellationRate),
                                  centerLabel: "\(d.cancelledOrders) cancelled", tint: cancelTint, diameter: 116)
                    Spacer()
                }
            }
        }
    }

    private func daypart(_ hours: [AdminInsights.PeakHour]) -> some View {
        let sorted = hours.sorted { $0.hour < $1.hour }
        return card("Demand by hour", subtitle: "orders per hour", info: Self.daypartInfo) {
            OperatorHourBars(bars: sorted.map { (hour: $0.hour, value: Double($0.orderCount)) })
        }
    }

    private func sellers(_ title: String, _ items: [AdminInsights.NamedSale], info: InfoButton) -> some View {
        let maxRev = max(items.map(\.revenue).max() ?? 1, 1)
        return card(title, subtitle: "by revenue", info: info) {
            if items.isEmpty {
                Text("No sales in range.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                VStack(spacing: theme.space.sm) {
                    ForEach(Array(items.prefix(8).enumerated()), id: \.element.id) { i, s in
                        OperatorLeaderRow(rank: i + 1, name: s.name,
                                          value: MoneyText.format(s.revenue),
                                          fraction: Double(s.revenue) / Double(maxRev))
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func locations(_ rows: [AdminLocationKPI]) -> some View {
        if !rows.isEmpty {
            card("By location", subtitle: "revenue share + per-site KPIs", info: Self.locationInfo) {
                VStack(alignment: .leading, spacing: theme.space.md) {
                    OperatorComparisonColumns(
                        groups: rows.map { .init(label: $0.city, current: Double($0.revenue), prior: Double($0.profit)) },
                        currentLabel: "Revenue", priorLabel: "Profit")
                    ForEach(rows) { LocationKPIRow(kpi: $0) }
                }
            }
        }
    }

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

    private func load() async {
        do { data = try await deps.api.send(.adminInsights()); error = nil }
        catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { self.error = "Something went wrong" }
    }
}

// MARK: - Insights explainers (Rule #12 — all five sections each)

private extension OperatorInsightsView {
    static var itemsInfo: InfoButton {
        InfoButton(title: "Items per order",
            description: "Average number of line items on each settled order.",
            institutional: "Basket depth is the attach-rate proxy — the lever that grows ticket size without new guests. A pizza-led QSR healthy at 2.5–3.5 items/order; stuck near 1 means guests buy a pizza and leave, the single biggest quiet drag on AOV.",
            plain: "If 100 orders carried 280 items, that's 2.8 each. Nudge it to 3.2 by attaching a drink + dolce and every ticket grows without one extra guest walking in.",
            tips: "Prompt espresso + dolce at the pass and POS, surface combo deals, bundle sides, and train staff to suggest a second item on single-item tickets.",
            methodology: "Total items ÷ total orders over the range. Source: /admin/insights.avgItemsPerOrder.")
    }
    static var cancelInfo: InfoButton {
        InfoButton(title: "Cancellation rate",
            description: "Share of orders cancelled. Lower is better; the gauge fills toward a 10% alarm ceiling.",
            institutional: "Cancellations are pure leakage — demand captured then lost, plus wasted prep and a soured guest. Best-in-class QSR holds under 2%; above 5% signals a process fault (slot over-promising, stockouts, kitchen overload) institutions flag fast.",
            plain: "40 cancellations out of 1 000 orders is 4%. Each one is a guest who tried to buy and didn't — and often food already started. Halving it is found money.",
            tips: "Right-size slot capacity to the kitchen, keep 86'ing tight so items don't vanish mid-order, and confirm delivery addresses up front.",
            methodology: "cancelled ÷ total orders. Source: /admin/insights.cancellationRate + cancelledOrders.")
    }
    static var daypartInfo: InfoButton {
        InfoButton(title: "Demand by hour",
            description: "Orders placed in each hour, peak hour highlighted.",
            institutional: "The daypart curve is the single most actionable staffing input — labour scheduled to a flat average is wrong in both directions. The peak bar is where SLA breaks first and where an extra hand pays for itself.",
            plain: "If 19:00 towers over the rest, that's your rush — roster the line and pre-prep dough to it, and don't send people home before it lands.",
            tips: "Staff the peak bars heavier, pre-fire prep ahead of them, and push offers into the shoulder hours to flatten the spike.",
            methodology: "Order count grouped by hour. Source: /admin/insights.peakHours[].orderCount.")
    }
    static var topInfo: InfoButton {
        InfoButton(title: "Top sellers",
            description: "Highest-revenue dishes over the range, ranked.",
            institutional: "Your top sellers are the menu's load-bearing walls — concentration here is both strength and risk. The Kasavana-Smith 'stars' usually live in this list; protect their margin and availability before chasing the long tail.",
            plain: "If Margherita and Diavola drive a third of revenue, an out-of-stock San Marzano or a 2 zł cheese-cost creep on those two hits the whole P&L.",
            tips: "Guard availability and quality on the top 5, feature them, and make sure their food cost is tightest — small wins here scale hardest.",
            methodology: "Dishes ranked by settled revenue. Source: /admin/insights.topSellers.")
    }
    static var worstInfo: InfoButton {
        InfoButton(title: "Worst sellers",
            description: "Lowest-revenue dishes over the range, ranked.",
            institutional: "The bottom of the menu carries hidden cost — prep complexity, dead inventory, longer decision time. Menu engineering's 'dogs' hide here; institutions prune or re-engineer them to lift the whole mix.",
            plain: "A dish selling 3 units a week still needs its ingredients stocked and staff trained — often it costs more attention than it earns. Cutting it can raise the average.",
            tips: "Re-engineer (reprice, rename, re-plate), demote off the hero positions, or cut — and redeploy that prep capacity to the stars.",
            methodology: "Dishes ranked ascending by settled revenue. Source: /admin/insights.worstSellers.")
    }
    static var locationInfo: InfoButton {
        InfoButton(title: "By location",
            description: "Revenue (and profit) per site, side by side, with each site's KPI card.",
            institutional: "Cross-site comparison is how a chain finds its playbook — the gap between the best and worst site on the SAME metric is the value of standardisation. Lenders read site-level consistency as de-risked, scalable operations.",
            plain: "If Kraków runs 17% margin and Warszawa 11% on similar revenue, the 6-point gap is a concrete, copyable win — find what Kraków does and roll it out.",
            tips: "Rank sites on margin not just revenue, lift the laggard toward the leader's playbook, and watch for one site's growth cannibalising another.",
            methodology: "Per-location revenue + profit + margin. Source: /admin/insights.locationComparison[].")
    }
}

/// Shared per-location KPI card — used by Insights and Multi-location.
struct LocationKPIRow: View {
    @Environment(\.theme) private var theme
    let kpi: AdminLocationKPI
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(kpi.city).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                Spacer()
                Text("\(Int(kpi.profitMargin.rounded()))% margin").font(.caption).foregroundStyle(theme.color.success)
            }
            HStack(spacing: theme.space.md) {
                metric("Revenue", MoneyText.format(kpi.revenue))
                metric("Profit", MoneyText.format(kpi.profit))
                metric("Orders", "\(kpi.orderCount)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }
    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value).font(.caption.weight(.bold)).monospacedDigit().foregroundStyle(theme.color.textPrimary)
            Text(label).font(.caption2).foregroundStyle(theme.color.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Multi-location (/admin/locations)

/// Multi-location — the native twin of web `/admin/locations` (MultiLocationV3).
/// A chain-comparison board: chain KPI rail, a revenue-share donut, a
/// revenue-vs-profit comparison, a margin leaderboard, and per-site KPI cards.
/// Real data only (Rule #1); chain margin carries the five-section ⓘ (Rule #12).
public struct OperatorMultiLocationView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    @State private var rows: [AdminLocationKPI] = []
    @State private var error: String?
    @State private var loaded = false
    public init(api: APIClient) { self.api = api }

    private let cols = [GridItem(.adaptive(minimum: 120), spacing: 12)]
    private var palette: [Color] { [theme.color.success, theme.color.accent, theme.color.warning, theme.info, theme.risk, theme.color.danger] }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let error, rows.isEmpty {
                    ContentUnavailableView("Couldn't load locations", systemImage: "building.2", description: Text(error))
                        .padding(.top, theme.space.xxl)
                } else if rows.isEmpty && loaded {
                    DSEmptyState("Multi-location", systemImage: "building.2", message: "No locations to compare yet.")
                } else if !rows.isEmpty {
                    kpis
                    share
                    comparison
                    leaderboard
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Multi-location")
        .task { if !loaded { await load() } }
        .refreshable { await load() }
    }

    private var chainRevenue: Grosze { rows.reduce(0) { $0 + $1.revenue } }
    private var chainProfit: Grosze { rows.reduce(0) { $0 + $1.profit } }
    private var chainOrders: Int { rows.reduce(0) { $0 + $1.orderCount } }
    private var chainMargin: Double { chainRevenue > 0 ? Double(chainProfit) / Double(chainRevenue) * 100 : 0 }

    private var kpis: some View {
        LazyVGrid(columns: cols, spacing: theme.space.md) {
            OperatorKPICard(label: "Chain revenue", value: MoneyText.format(chainRevenue), icon: "banknote.fill", tint: theme.color.success)
            OperatorKPICard(label: "Chain orders", value: "\(chainOrders)", icon: "cart.fill", tint: theme.color.accent)
            OperatorKPICard(label: "Avg margin", value: "\(Int(chainMargin.rounded()))%", icon: "percent", tint: theme.color.success, info: Self.marginInfo)
        }
    }

    private var share: some View {
        card("Revenue share", subtitle: "by site", info: nil) {
            HStack(spacing: theme.space.xl) {
                OperatorDonut(segments: rows.enumerated().map { i, r in
                    .init(label: r.city, value: Double(r.revenue), color: palette[i % palette.count])
                }, centerValue: MoneyText.format(chainRevenue), centerLabel: "chain")
                VStack(alignment: .leading, spacing: theme.space.sm) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                        HStack(spacing: theme.space.sm) {
                            RoundedRectangle(cornerRadius: 3).fill(palette[i % palette.count]).frame(width: 11, height: 11)
                            Text(r.city).textRole(.callout).foregroundStyle(theme.color.textPrimary)
                            Spacer()
                            Text("\(chainRevenue > 0 ? Int(Double(r.revenue) / Double(chainRevenue) * 100) : 0)%")
                                .textRole(.caption).monospacedDigit().foregroundStyle(theme.color.textSecondary)
                        }
                    }
                }
            }
        }
    }

    private var comparison: some View {
        card("Revenue vs profit", subtitle: "by site", info: nil) {
            OperatorComparisonColumns(
                groups: rows.map { .init(label: $0.city, current: Double($0.revenue), prior: Double($0.profit)) },
                currentLabel: "Revenue", priorLabel: "Profit")
        }
    }

    private var leaderboard: some View {
        let ranked = rows.sorted { $0.profitMargin > $1.profitMargin }
        let maxMargin = max(ranked.map(\.profitMargin).max() ?? 1, 1)
        return card("Margin leaderboard", subtitle: "best-run sites first", info: nil) {
            VStack(spacing: theme.space.md) {
                ForEach(Array(ranked.enumerated()), id: \.element.id) { i, r in
                    OperatorLeaderRow(rank: i + 1, name: r.city, value: "\(Int(r.profitMargin.rounded()))% margin",
                                      fraction: r.profitMargin / maxMargin)
                }
                ForEach(rows) { LocationKPIRow(kpi: $0) }
            }
        }
    }

    private func card<Content: View>(_ title: String, subtitle: String?, info: InfoButton?,
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

    private func load() async {
        do { rows = try await api.send(.adminLocations()); error = nil }
        catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { self.error = "Something went wrong" }
        loaded = true
    }
}

private extension OperatorMultiLocationView {
    static var marginInfo: InfoButton {
        InfoButton(title: "Chain margin",
            description: "Net profit as a share of revenue across every site, blended.",
            institutional: "Chain margin is the headline an investor reads — but the spread BETWEEN sites is the operating story. A tight spread means a repeatable playbook (scalable, bankable); a wide spread means the chain depends on a few strong managers, a risk diligence flags.",
            plain: "If the chain runs 14% but one site does 18% and another 9%, closing that gap toward the leader is worth more than any new promotion — and you already know it's achievable.",
            tips: "Rank sites on margin (the leaderboard below), study the leader's labour + food cost, and roll its playbook to the laggard before opening anything new.",
            methodology: "Σ profit ÷ Σ revenue across sites. Source: /admin/locations (per-site revenue/profit/margin).")
    }
}

// MARK: - Expansion (/admin/expansion)

public struct OperatorExpansionView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Expansion",
            emptyText: "No expansion sites tracked.",
            loader: OperatorListLoader { try await api.send(.adminExpansion()) },
            row: { e in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(e.city ?? e.locationSlug.capitalized).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Spacer()
                        Text("\(e.done)/\(e.total) · \(e.pct)%").font(.caption).monospacedDigit().foregroundStyle(theme.color.textSecondary)
                    }
                    ProgressView(value: Double(e.pct), total: 100).tint(e.pct == 100 ? theme.color.success : theme.color.accent)
                }
            }
        )
    }
}

// MARK: - Scheduled bundles (/admin/scheduled-bundles)

public struct OperatorScheduledBundlesView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Scheduled bundles",
            emptyText: "No scheduled bundles yet.",
            loader: OperatorListLoader { try await api.send(.adminScheduledBundles()) },
            row: { b in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(b.bundleName).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(b.weekday.capitalized) \(b.readyAt) · \(b.locationSlug.capitalized) · \(b.itemCount) items")
                            .font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    Text(b.status.capitalized).font(.caption2.weight(.bold))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(tint(b.status).opacity(0.18), in: Capsule()).foregroundStyle(tint(b.status))
                }
            }
        )
    }
    private func tint(_ s: String) -> Color {
        switch s {
        case "active": theme.color.success
        case "paused": theme.color.warning
        case "cancelled": theme.color.danger
        default: theme.color.textSecondary
        }
    }
}

// MARK: - Welcome (/admin/welcome)

public struct OperatorWelcomeView: View {
    @Environment(\.theme) private var theme
    private let role: OperatorRole
    public init(role: OperatorRole) { self.role = role }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                VStack(alignment: .leading, spacing: theme.space.sm) {
                    Text("Benvenuto").font(.system(.largeTitle, design: .serif).weight(.bold)).foregroundStyle(theme.color.accent)
                    Text("OttavianoKDS — kitchen & operations").font(.subheadline).foregroundStyle(theme.color.textSecondary)
                }
                card("You're signed in as", role.displayName, "person.crop.circle")
                VStack(alignment: .leading, spacing: theme.space.sm) {
                    Text("Where to start").font(.headline).foregroundStyle(theme.color.textPrimary)
                    bullet("flame.fill", "Kitchen Display", "Bump tickets live as they come off the line.")
                    bullet("list.clipboard.fill", "Orders", "Every live order across fulfilment types.")
                    bullet("rectangle.3.group.fill", "Dashboard", "Covers, revenue and prep load at a glance.")
                    bullet("chart.bar.fill", "Reports", "Sales, cost and profit for any range.")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(theme.space.lg)
                .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
                .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Welcome")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func card(_ label: String, _ value: String, _ icon: String) -> some View {
        HStack(spacing: theme.space.md) {
            Image(systemName: icon).font(.title2).foregroundStyle(theme.color.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.caption).foregroundStyle(theme.color.textSecondary)
                Text(value).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
            }
            Spacer()
        }
        .padding(theme.space.lg)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func bullet(_ icon: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: theme.space.md) {
            Image(systemName: icon).foregroundStyle(theme.color.accent).frame(width: 24)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                Text(detail).font(.caption).foregroundStyle(theme.color.textSecondary)
            }
        }
    }
}
