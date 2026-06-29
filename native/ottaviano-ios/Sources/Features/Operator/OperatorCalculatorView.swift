import SwiftUI
import OttavianoKit

// MARK: - What-if model

/// The saved-scenario baseline (server truth, from `projectTwelveMonths`) the
/// local what-if is anchored to. Revenue, COGS, card fees and the variable
/// "other" bucket flex with the exposed levers; labour + fixed overhead are held
/// at the saved baseline (the engine's labour/fixed drivers aren't exposed over
/// the read-only facade — so the sandbox is honest about what it can and can't
/// move). At baseline levers the model reproduces the server's year-1 numbers
/// exactly (Rule #1 — no fabricated math).
struct CalcBaseline {
    let revenue: Double, cogs: Double, labor: Double, fixed: Double, payment: Double, netProfit: Double
    let ordersPerDay: Double, avgTicket: Double, daysOpen: Double, cogsPct: Double, paymentPct: Double

    var cogsRate: Double { revenue > 0 ? cogs / revenue : 0 }
    var paymentBaseline: Double { revenue * paymentPct }
    /// Everything the server P&L books that isn't COGS/labour/fixed/card or
    /// profit (waste, refund, loyalty, packaging, marketing CAC, D&A, interest,
    /// CIT). Derived as the residual so the baseline net reproduces exactly.
    var otherRate: Double {
        revenue > 0 ? (revenue - cogs - labor - fixed - paymentBaseline - netProfit) / revenue : 0
    }
}

struct CalcLevers: Equatable {
    var ordersPerDay: Int
    var daysOpen: Int
    var avgTicketGrosze: Int
    var cogsPct: Double
    var paymentPct: Double
}

struct CalcResult {
    let revenue: Double, cogs: Double, labor: Double, fixed: Double, payment: Double, other: Double, net: Double
    var margin: Double { revenue > 0 ? net / revenue * 100 : 0 }
}

enum CalcEngine {
    /// Project the year-1 P&L from levers, anchored to the saved baseline.
    static func project(_ b: CalcBaseline, _ l: CalcLevers) -> CalcResult {
        let volRatio = (Double(l.ordersPerDay) / max(b.ordersPerDay, 1))
            * (Double(l.avgTicketGrosze) / max(b.avgTicket, 1))
            * (Double(l.daysOpen) / max(b.daysOpen, 1))
        let revenue = b.revenue * volRatio
        let cogs = b.cogsPct > 0 ? revenue * b.cogsRate * (l.cogsPct / b.cogsPct) : revenue * l.cogsPct
        let payment = revenue * l.paymentPct
        let other = revenue * b.otherRate
        let net = revenue - cogs - b.labor - b.fixed - payment - other
        return CalcResult(revenue: revenue, cogs: cogs, labor: b.labor, fixed: b.fixed,
                          payment: payment, other: other, net: net)
    }
}

/// The Calculator (/admin/simulation) — the native twin of the web what-if P&L
/// (CalculatorV3). A LIVE sandbox: drag the levers and the year-1 P&L, the
/// cascade, the sensitivity tornado and the orders×ticket heatmap all recompute
/// in real time, anchored to the saved scenario served by the same
/// `projectTwelveMonths` engine the web uses. Local-only — it never writes the
/// saved scenario (Rule #1 — the baseline is real, the what-if is transparent).
public struct OperatorCalculatorView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    @State private var data: AdminSimulation?
    @State private var levers: CalcLevers?
    @State private var error: String?

    public init(api: APIClient) { self.api = api }

    private let cols = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let error, data == nil {
                    ContentUnavailableView("Couldn't load the calculator", systemImage: "function", description: Text(error))
                        .padding(.top, theme.space.xxl)
                } else if let d = data, let baseline = baseline(d) {
                    let l = levers ?? defaultLevers(d)
                    let result = CalcEngine.project(baseline, l)
                    sandboxNote(dirty: l != defaultLevers(d))
                    kpis(result, baseline: baseline)
                    leversCard(d, baseline: baseline)
                    waterfall(result)
                    tornado(baseline: baseline, levers: l)
                    heatmap(baseline: baseline, levers: l)
                    monthly(d.months)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Calculator")
        .task { await load() }
        .refreshable { await load() }
    }

    // MARK: derive baseline / defaults

    private func baseline(_ d: AdminSimulation) -> CalcBaseline? {
        let a = d.assumptions
        return CalcBaseline(
            revenue: Double(d.year1.revenue), cogs: Double(d.year1.cogs), labor: Double(d.year1.labor),
            fixed: Double(d.year1.fixed), payment: Double(d.year1.payment), netProfit: Double(d.year1.netProfit),
            ordersPerDay: Double(a.ordersPerDay), avgTicket: Double(a.avgTicketGrosze),
            daysOpen: Double(a.daysOpenPerMonth), cogsPct: a.cogsPct, paymentPct: a.paymentProcessorPct ?? 0)
    }
    private func defaultLevers(_ d: AdminSimulation) -> CalcLevers {
        let a = d.assumptions
        return CalcLevers(ordersPerDay: a.ordersPerDay, daysOpen: a.daysOpenPerMonth,
                          avgTicketGrosze: a.avgTicketGrosze, cogsPct: a.cogsPct,
                          paymentPct: a.paymentProcessorPct ?? 0)
    }

    // MARK: sandbox note

    private func sandboxNote(dirty: Bool) -> some View {
        HStack(spacing: theme.space.sm) {
            Image(systemName: "slider.horizontal.3").foregroundStyle(theme.color.accent)
            Text(dirty ? "What-if sandbox — modelling unsaved levers." : "What-if sandbox — showing the saved scenario.")
                .textRole(.caption).foregroundStyle(theme.color.textSecondary)
            Spacer()
            if dirty, let d = data {
                Button("Reset") { levers = defaultLevers(d) }
                    .font(.caption.weight(.semibold)).foregroundStyle(theme.color.accent)
            }
        }
    }

    // MARK: KPIs

    private func kpis(_ r: CalcResult, baseline b: CalcBaseline) -> some View {
        LazyVGrid(columns: cols, spacing: theme.space.md) {
            OperatorKPICard(label: "Year-1 revenue", value: MoneyText.format(Int(r.revenue.rounded())),
                tint: theme.color.success, delta: periodDelta(r.revenue, b.revenue), caption: "vs saved", info: Self.revenueInfo)
            OperatorKPICard(label: "Year-1 net profit", value: MoneyText.format(Int(r.net.rounded())),
                tint: r.net >= 0 ? theme.color.success : theme.color.danger,
                delta: periodDelta(r.net, b.netProfit), caption: "vs saved", info: Self.netInfo)
            OperatorKPICard(label: "Net margin", value: "\(Int(r.margin.rounded()))%",
                tint: theme.color.success, info: Self.marginInfo)
            OperatorKPICard(label: "Year-1 COGS", value: MoneyText.format(Int(r.cogs.rounded())),
                tint: theme.color.warning, info: Self.cogsInfo)
            OperatorKPICard(label: "Labour + fixed", value: MoneyText.format(Int((r.labor + r.fixed).rounded())),
                tint: theme.color.textSecondary, caption: "held at saved", info: Self.fixedInfo)
            OperatorKPICard(label: "Card fees", value: MoneyText.format(Int(r.payment.rounded())),
                tint: theme.color.textSecondary, info: Self.cardInfo)
        }
    }

    // MARK: levers

    private func leversCard(_ d: AdminSimulation, baseline b: CalcBaseline) -> some View {
        let binding = leverBinding(d)
        return card("What-if levers", subtitle: "drag to model — recomputes live", info: Self.leverInfo) {
            VStack(spacing: theme.space.md) {
                stepperRow("Orders / day", value: binding.ordersPerDay, range: 0...600,
                           display: "\(binding.ordersPerDay.wrappedValue)")
                stepperRow("Days open / month", value: binding.daysOpen, range: 0...31,
                           display: "\(binding.daysOpen.wrappedValue)")
                sliderRow("Avg ticket", value: Binding(
                    get: { Double(binding.avgTicketGrosze.wrappedValue) },
                    set: { binding.avgTicketGrosze.wrappedValue = Int(($0 / 100).rounded()) * 100 }),
                    in: 2000...30000, display: MoneyText.format(binding.avgTicketGrosze.wrappedValue))
                sliderRow("Food cost", value: binding.cogsPct, in: 0.10...0.65,
                          display: String(format: "%.0f%%", binding.cogsPct.wrappedValue * 100))
                sliderRow("Card processor", value: binding.paymentPct, in: 0...0.05,
                          display: String(format: "%.1f%%", binding.paymentPct.wrappedValue * 100))
            }
        }
    }

    private func leverBinding(_ d: AdminSimulation) -> (ordersPerDay: Binding<Int>, daysOpen: Binding<Int>,
                                                        avgTicketGrosze: Binding<Int>, cogsPct: Binding<Double>,
                                                        paymentPct: Binding<Double>) {
        let base = Binding(get: { levers ?? defaultLevers(d) }, set: { levers = $0 })
        return (
            ordersPerDay: Binding(get: { base.wrappedValue.ordersPerDay }, set: { base.wrappedValue.ordersPerDay = $0 }),
            daysOpen: Binding(get: { base.wrappedValue.daysOpen }, set: { base.wrappedValue.daysOpen = $0 }),
            avgTicketGrosze: Binding(get: { base.wrappedValue.avgTicketGrosze }, set: { base.wrappedValue.avgTicketGrosze = $0 }),
            cogsPct: Binding(get: { base.wrappedValue.cogsPct }, set: { base.wrappedValue.cogsPct = $0 }),
            paymentPct: Binding(get: { base.wrappedValue.paymentPct }, set: { base.wrappedValue.paymentPct = $0 })
        )
    }

    private func stepperRow(_ label: String, value: Binding<Int>, range: ClosedRange<Int>, display: String) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundStyle(theme.color.textPrimary)
            Spacer()
            Text(display).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(theme.color.accent)
                .frame(minWidth: 64, alignment: .trailing)
            DSStepper(value: value, range: range)
        }
    }

    private func sliderRow(_ label: String, value: Binding<Double>, in range: ClosedRange<Double>, display: String) -> some View {
        VStack(spacing: 2) {
            HStack {
                Text(label).font(.subheadline).foregroundStyle(theme.color.textPrimary)
                Spacer()
                Text(display).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(theme.color.accent)
            }
            Slider(value: value, in: range).tint(theme.color.accent)
        }
    }

    // MARK: waterfall

    private func waterfall(_ r: CalcResult) -> some View {
        card("P&L cascade", subtitle: "year 1", info: Self.waterfallInfo) {
            OperatorWaterfall(steps: [
                .init(label: "Rev", amount: r.revenue, isTotal: true),
                .init(label: "COGS", amount: -r.cogs),
                .init(label: "Labour", amount: -r.labor),
                .init(label: "Fixed", amount: -r.fixed),
                .init(label: "Card", amount: -r.payment),
                .init(label: "Other", amount: -r.other),
                .init(label: "Net", amount: r.net, isTotal: true),
            ], valueFormat: { compact($0) })
        }
    }

    // MARK: tornado

    private func tornado(baseline b: CalcBaseline, levers l: CalcLevers) -> some View {
        let base = CalcEngine.project(b, l).net
        func swing(_ mutate: (inout CalcLevers, Double) -> Void) -> (low: Double, high: Double) {
            var up = l; mutate(&up, 1.1)
            var dn = l; mutate(&dn, 0.9)
            let a = CalcEngine.project(b, up).net - base
            let c = CalcEngine.project(b, dn).net - base
            return (low: min(a, c), high: max(a, c))
        }
        let orders = swing { lv, f in lv.ordersPerDay = Int((Double(lv.ordersPerDay) * f).rounded()) }
        let ticket = swing { lv, f in lv.avgTicketGrosze = Int((Double(lv.avgTicketGrosze) * f).rounded()) }
        let days = swing { lv, f in lv.daysOpen = Int((Double(lv.daysOpen) * f).rounded()) }
        let cogs = swing { lv, f in lv.cogsPct = lv.cogsPct * f }
        let cardFee = swing { lv, f in lv.paymentPct = lv.paymentPct * f }
        return card("Sensitivity", subtitle: "year-1 net profit swing on ±10%", info: Self.tornadoInfo) {
            OperatorTornado(drivers: [
                .init(label: "Avg ticket ±10%", low: ticket.low, high: ticket.high),
                .init(label: "Orders/day ±10%", low: orders.low, high: orders.high),
                .init(label: "Days open ±10%", low: days.low, high: days.high),
                .init(label: "Food cost ±10%", low: cogs.low, high: cogs.high),
                .init(label: "Card fees ±10%", low: cardFee.low, high: cardFee.high),
            ], valueFormat: { compact($0) })
        }
    }

    // MARK: heatmap

    private func heatmap(baseline b: CalcBaseline, levers l: CalcLevers) -> some View {
        let ordSteps = [0.8, 0.9, 1.0, 1.1, 1.2]
        let ticketSteps = [1.2, 1.1, 1.0, 0.9, 0.8] // rows top→bottom = higher ticket first
        let colLabels = ordSteps.map { "\(Int((Double(l.ordersPerDay) * $0).rounded()))" }
        // Compact złoty (integer, no symbol) keeps the 44pt row gutter legible.
        let rowLabels = ticketSteps.map { "\(Int((Double(l.avgTicketGrosze) * $0 / 100).rounded())) zł" }
        return card("Profit map", subtitle: "net profit · orders/day × avg ticket", info: Self.heatInfo) {
            OperatorHeatGrid(rowLabels: rowLabels, colLabels: colLabels, baseline: (row: 2, col: 2)) { r, c in
                var lv = l
                lv.ordersPerDay = Int((Double(l.ordersPerDay) * ordSteps[c]).rounded())
                lv.avgTicketGrosze = Int((Double(l.avgTicketGrosze) * ticketSteps[r]).rounded())
                let net = CalcEngine.project(b, lv).net
                return (value: net, display: compact(net))
            }
        }
    }

    // MARK: 12-month (saved scenario)

    private func monthly(_ months: [AdminSimulation.MonthRow]) -> some View {
        card("12-month projection", subtitle: "saved scenario · net profit", info: Self.monthlyInfo) {
            if months.isEmpty {
                Text("No projection.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                VStack(alignment: .leading, spacing: theme.space.sm) {
                    OperatorAreaChart(values: months.map { Double($0.netProfit) }, tint: theme.color.accent,
                        leadingLabel: months.first?.month ?? "", trailingLabel: months.last?.month ?? "",
                        valueFormat: { compact($0) })
                    ForEach(months) { m in
                        HStack {
                            Text(m.month).font(.caption.monospaced()).foregroundStyle(theme.color.textSecondary).frame(width: 60, alignment: .leading)
                            Spacer()
                            MoneyText(m.revenue).font(.caption).foregroundStyle(theme.color.textSecondary)
                            MoneyText(m.netProfit).font(.subheadline.weight(.semibold))
                                .foregroundStyle(m.netProfit >= 0 ? theme.color.success : theme.color.danger)
                                .frame(minWidth: 80, alignment: .trailing)
                        }
                        .padding(.vertical, 1)
                    }
                }
            }
        }
    }

    // MARK: chrome

    /// Compact złoty for dense chart labels: 40 000 zł → "40k".
    private func compact(_ grosze: Double) -> String {
        let zl = grosze / 100
        if abs(zl) >= 1000 { return String(format: "%.0fk", zl / 1000) }
        return String(format: "%.0f", zl)
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
        do {
            let d = try await api.send(.adminSimulation())
            data = d
            if levers == nil { levers = defaultLevers(d) } // adopt saved scenario once
            error = nil
        }
        catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { self.error = "Something went wrong" }
    }
}

// MARK: - Calculator explainers (Rule #12 — all five sections each)

private extension OperatorCalculatorView {
    static var revenueInfo: InfoButton {
        InfoButton(title: "Year-1 revenue",
            description: "Modelled first-year revenue from the current levers, vs the saved scenario.",
            institutional: "Revenue is the projection's volume×price engine — but a business case lives or dies on whether the cost lines below scale with it. Lenders stress this line ±20% to size downside before committing site capital.",
            plain: "200 orders/day × 130 zł × 26 days × 12 months ≈ 8.1M zł a year. Slide orders or ticket and watch every downstream number move with it.",
            tips: "The two biggest revenue levers are orders/day (traffic) and avg ticket (basket). Model both — small ticket gains often beat hard-won traffic.",
            methodology: "baseline revenue × (orders/orders₀)×(ticket/ticket₀)×(days/days₀). Baseline: /admin/simulation year1, from projectTwelveMonths.")
    }
    static var netInfo: InfoButton {
        InfoButton(title: "Year-1 net profit",
            description: "Modelled first-year profit after every cost line, vs the saved scenario.",
            institutional: "Net profit is the only number that funds the next location. A site that can't model a path to >12% net at realistic volumes isn't bankable — this is the figure the investment committee reads first.",
            plain: "If the levers land net profit at 1.1M zł on 8.1M revenue, that's ~14% — bankable. Drag food cost up two points and watch how fast it erodes.",
            tips: "Profit is most sensitive to ticket and food cost (see Sensitivity). Protect both before chasing raw volume that drags labour with it.",
            methodology: "revenue − COGS − labour − fixed − card − other. Labour + fixed held at the saved baseline; other (waste/CIT/etc.) scales with revenue at the baseline rate.")
    }
    static var marginInfo: InfoButton {
        InfoButton(title: "Net margin",
            description: "Modelled net profit as a share of modelled revenue.",
            institutional: "Margin normalises the scenario — it's how you compare a busy low-margin model to a lean premium one. 12–18% is healthy QSR; below 8% the model is fragile to any cost shock.",
            plain: "1.1M profit on 8.1M revenue is ~14 zł kept per 100 zł sold. Margin, not revenue, tells you if the model is actually any good.",
            tips: "Lift margin by raising ticket or cutting food cost — both flow straight to the bottom line because labour + fixed are roughly flat here.",
            methodology: "net ÷ revenue from the current levers.")
    }
    static var cogsInfo: InfoButton {
        InfoButton(title: "Year-1 COGS",
            description: "Modelled cost of goods — ingredients — for the year at the current food-cost lever.",
            institutional: "Food cost is the most controllable big lever in a pizzeria. The Neapolitan benchmark is 28–34%; each point off COGS is roughly a point onto net margin, dollar-for-dollar.",
            plain: "At 30% food cost on 8.1M revenue, ingredients run ~2.4M. Tighten to 28% and ~160k zł drops to profit with no extra sales.",
            tips: "Tighten portioning on cheese + cured meats, negotiate supplier terms, cut waste, and re-engineer the worst-margin dishes.",
            methodology: "revenue × baseline-COGS-rate × (foodCost lever ÷ saved foodCost). Source: /admin/simulation.cogsPct.")
    }
    static var fixedInfo: InfoButton {
        InfoButton(title: "Labour + fixed",
            description: "Labour and fixed overhead, HELD at the saved scenario while the other levers move.",
            institutional: "Holding labour + fixed constant is the conservative way to read a what-if at this exposure: it shows contribution from volume/price/cost changes without pretending you can flex staff perfectly. The engine's full labour-flex model lives server-side.",
            plain: "If staff + rent + utilities run 2.6M/yr in the saved plan, the sandbox keeps that fixed — so a revenue jump flows mostly to profit, the cautious read.",
            tips: "To model labour properly (it flexes with volume on the server), edit the saved scenario on the web Calculator. Here, treat labour + fixed as your committed cost base.",
            methodology: "year1.labor + year1.fixed from the saved projection, held constant in the sandbox.")
    }
    static var cardInfo: InfoButton {
        InfoButton(title: "Card fees",
            description: "Payment-processor fees, modelled as a share of revenue at the current card lever.",
            institutional: "Processor fees are a small but pure-leakage line — invisible per-order, material per-year. At scale, 0.3pp off the rate is a real negotiation worth having with the acquirer.",
            plain: "At 1.7% on 8.1M revenue, card fees are ~138k zł a year. Negotiate to 1.4% and ~24k drops straight to profit.",
            tips: "Negotiate the processor rate at volume, steer to lower-cost rails where guests are happy to, and keep chargebacks low.",
            methodology: "revenue × card-processor lever. Source: /admin/simulation.paymentProcessorPct.")
    }
    static var leverInfo: InfoButton {
        InfoButton(title: "What-if levers",
            description: "The five exposed drivers — drag them and every chart recomputes live, locally.",
            institutional: "A what-if sandbox is how operators pressure-test a plan before committing capital or labour. The discipline is to move ONE lever at a time and read the sensitivity, not to hand-tune to a flattering answer.",
            plain: "Push orders/day from 200 to 240 and watch revenue and profit jump; then drag food cost up and watch profit give it back. That trade-off IS the insight.",
            tips: "Model realistic ranges (±10–20%), check the Sensitivity tornado to see which lever matters most, then take the winning lever to the team as a target.",
            methodology: "Levers seed from the saved scenario assumptions; changes stay local (never written). Reset restores the saved values.")
    }
    static var waterfallInfo: InfoButton {
        InfoButton(title: "P&L cascade",
            description: "How modelled revenue becomes profit, one cost step at a time.",
            institutional: "The waterfall is the CFO's read of a business model — it exposes which cost wedge is eating the plan. The biggest red step is where the next margin point is cheapest to win.",
            plain: "Start at revenue, knock off COGS, labour, fixed, card and other in turn, and what's left standing is net profit. The tallest red bar is your priority.",
            tips: "Attack the largest cost step first — usually COGS or labour. A point off the biggest wedge beats two off the smallest.",
            methodology: "Revenue → −COGS → −Labour → −Fixed → −Card → −Other → Net, from the current levers.")
    }
    static var tornadoInfo: InfoButton {
        InfoButton(title: "Sensitivity",
            description: "How far year-1 net profit swings when each lever moves ±10%, ranked by impact.",
            institutional: "Sensitivity analysis is risk management — it tells you which assumption to get right and which barely matters. The widest bar is the lever that most deserves diligence before you commit.",
            plain: "If 'avg ticket ±10%' swings profit by ±450k but 'card fees ±10%' only ±14k, then nailing your pricing matters 30× more than the processor rate.",
            tips: "Focus operational effort on the widest bars; treat the narrow ones as noise. Re-run after each plan change — sensitivities shift as the model does.",
            methodology: "net(lever×1.1) − net(base) and net(lever×0.9) − net(base), per lever, sorted by total swing.")
    }
    static var heatInfo: InfoButton {
        InfoButton(title: "Profit map",
            description: "Year-1 net profit across a grid of orders/day (columns) × avg ticket (rows); the ringed cell is today's plan.",
            institutional: "The two-variable grid is how you find the viable operating envelope — the green region is where the model makes money, the red where it doesn't. It turns a single point estimate into a map of the downside.",
            plain: "Read across and down from the ringed centre: if dropping a few orders/day stays green you've got headroom; if it flips red fast, the plan is fragile.",
            tips: "Aim to operate well inside the green region, not at its edge — that margin of safety absorbs a bad week without going red.",
            methodology: "net profit recomputed at orders/day × {0.8…1.2} and avg ticket × {0.8…1.2} around the current levers.")
    }
    static var monthlyInfo: InfoButton {
        InfoButton(title: "12-month projection",
            description: "Net profit per month for the SAVED scenario (seasonality + weather folded in by the server engine).",
            institutional: "The monthly curve reveals seasonality the annual total hides — a chain plans cash, hiring and prep to the shape, not the average. A trough that dips negative is a working-capital warning.",
            plain: "If December towers and February dips, you bank the December surplus to cover February — the annual total alone would never warn you.",
            tips: "Plan cash reserves to the lowest months, schedule heavy maintenance + leave into the troughs, and push promotions to lift them.",
            methodology: "Per-month net from projectTwelveMonths over the saved scenario (the sandbox levers above don't rewrite this server-computed curve). Source: /admin/simulation.months.")
    }
}
