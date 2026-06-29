import SwiftUI

// Institutional analytics kit (DESIGN-SYSTEM §4.2) — the visual vocabulary that
// makes the operator surfaces read like the web admin's "institutional" boards,
// not flat tile grids. All hand-rolled on Path/Shape (no Swift Charts framework
// dependency, identical across OS versions), all colour from the active `Theme`,
// all Dynamic-Type + VoiceOver aware. These are the native twins of the web
// `Kpi`/`Sparkline`/`Chart`/`Donut` primitives in `src/admin-v3/ui/`.
//
// Catalogue:
//   TrendBadge               — Δ% pill with arrow + good/bad tone (invertible)
//   OperatorSparkline        — inline line+area trend (gradient fill, end dot)
//   OperatorKPICard          — label + value + Δ + sparkline + ⓘ (the rail unit)
//   OperatorAreaChart        — full trend chart: gradient, gridlines, axis, caption
//   OperatorGauge            — radial progress arc with centre readout + threshold
//   OperatorProgressMeter    — linear progress-to-goal with a benchmark tick
//   OperatorComparisonColumns— grouped two-series bars (this vs prior) + legend
//   OperatorHourBars         — hourly demand bars, peak highlighted, axis labels
//   OperatorHeatGrid         — 2-D sensitivity heatmap (Calculator what-if grids)
//   OperatorWaterfall        — revenue → −cost → profit cascade
//   OperatorTornado          — ± sensitivity bars (assumption impact)
//   DSSegmented              — themed segmented control (period chips)
//   OperatorLeaderRow        — ranked row (position · name · value · Δ)

// MARK: - TrendBadge

/// A period-over-period delta pill: `↑ +12%` / `↓ −3%`. `fraction` is a ratio
/// (0.12 = +12%). `goodWhenUp` flips the colour semantics for "lower is better"
/// metrics (cancellation rate, food cost, labour ratio). nil ⇒ a muted "—".
public struct TrendBadge: View {
    @Environment(\.theme) private var theme
    private let fraction: Double?
    private let goodWhenUp: Bool
    private let showsArrow: Bool

    public init(_ fraction: Double?, goodWhenUp: Bool = true, showsArrow: Bool = true) {
        self.fraction = fraction; self.goodWhenUp = goodWhenUp; self.showsArrow = showsArrow
    }

    public var body: some View {
        if let f = fraction {
            let up = f >= 0
            let flat = abs(f) < 0.0005
            let tint = flat ? theme.color.textSecondary : ((up == goodWhenUp) ? theme.color.success : theme.color.danger)
            Label {
                Text(Self.format(f))
            } icon: {
                if showsArrow && !flat { Image(systemName: up ? "arrow.up.right" : "arrow.down.right") }
            }
            .labelStyle(.titleAndIcon)
            .font(.caption.weight(.bold)).monospacedDigit()
            .foregroundStyle(tint)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(tint.opacity(0.14), in: Capsule())
            .accessibilityLabel("\(flat ? "flat" : (up ? "up" : "down")) \(Self.format(abs(f)))")
        } else {
            Text("—").font(.caption.weight(.bold)).foregroundStyle(theme.color.textSecondary)
                .accessibilityLabel("no comparison")
        }
    }

    static func format(_ f: Double) -> String {
        let pct = f * 100
        return String(format: abs(pct) < 10 ? "%+.1f%%" : "%+.0f%%", pct)
    }
}

// MARK: - OperatorSparkline

/// Inline trend line with an optional gradient area fill and an end-point dot —
/// the at-a-glance "where's this heading" mark sat next to a KPI value.
public struct OperatorSparkline: View {
    @Environment(\.theme) private var theme
    private let values: [Double]
    private let tint: Color?
    private let filled: Bool
    private let showsEndDot: Bool
    private let height: CGFloat

    public init(_ values: [Double], tint: Color? = nil, filled: Bool = true,
                showsEndDot: Bool = true, height: CGFloat = 40) {
        self.values = values; self.tint = tint; self.filled = filled
        self.showsEndDot = showsEndDot; self.height = height
    }

    public var body: some View {
        let color = tint ?? theme.color.accent
        GeometryReader { geo in
            let pts = Self.points(values, in: geo.size)
            ZStack {
                if filled, pts.count > 1 {
                    Self.area(pts, in: geo.size)
                        .fill(LinearGradient(colors: [color.opacity(0.30), color.opacity(0.02)],
                                             startPoint: .top, endPoint: .bottom))
                }
                if pts.count > 1 {
                    Self.line(pts).stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                }
                if showsEndDot, let last = pts.last {
                    Circle().fill(color).frame(width: 5, height: 5).position(last)
                }
            }
        }
        .frame(height: height)
        .accessibilityLabel("Trend, \(values.count) points")
    }

    /// Normalised points with a small vertical inset so the stroke + dot never clip.
    static func points(_ values: [Double], in size: CGSize, pad: CGFloat = 3) -> [CGPoint] {
        guard values.count > 1 else {
            return values.isEmpty ? [] : [CGPoint(x: size.width / 2, y: size.height / 2)]
        }
        let maxV = values.max() ?? 1, minV = values.min() ?? 0
        let range = max(maxV - minV, 0.0001)
        let stepX = size.width / CGFloat(values.count - 1)
        let usable = max(size.height - 2 * pad, 1)
        return values.enumerated().map { i, v in
            let norm = (v - minV) / range
            return CGPoint(x: CGFloat(i) * stepX, y: pad + (1 - CGFloat(norm)) * usable)
        }
    }

    static func line(_ pts: [CGPoint]) -> Path {
        var p = Path(); guard let first = pts.first else { return p }
        p.move(to: first); pts.dropFirst().forEach { p.addLine(to: $0) }
        return p
    }

    static func area(_ pts: [CGPoint], in size: CGSize) -> Path {
        var p = Path(); guard let first = pts.first, let last = pts.last else { return p }
        p.move(to: CGPoint(x: first.x, y: size.height))
        p.addLine(to: first)
        pts.dropFirst().forEach { p.addLine(to: $0) }
        p.addLine(to: CGPoint(x: last.x, y: size.height))
        p.closeSubpath()
        return p
    }
}

// MARK: - OperatorKPICard

/// The executive-rail unit: icon + label + ⓘ, a big value, a period delta and an
/// inline sparkline — everything the web `Kpi` card carries. `goodWhenUp` inverts
/// the delta tone for lower-is-better metrics.
public struct OperatorKPICard: View {
    @Environment(\.theme) private var theme
    private let label: String
    private let value: String
    private let icon: String?
    private let tint: Color?
    private let delta: Double?
    private let goodWhenUp: Bool
    private let spark: [Double]?
    private let caption: String?
    private let info: InfoButton?

    public init(label: String, value: String, icon: String? = nil, tint: Color? = nil,
                delta: Double? = nil, goodWhenUp: Bool = true, spark: [Double]? = nil,
                caption: String? = nil, info: InfoButton? = nil) {
        self.label = label; self.value = value; self.icon = icon; self.tint = tint
        self.delta = delta; self.goodWhenUp = goodWhenUp; self.spark = spark
        self.caption = caption; self.info = info
    }

    public var body: some View {
        DSCard {
            VStack(alignment: .leading, spacing: theme.space.sm) {
                HStack(spacing: theme.space.xs) {
                    if let icon { Image(systemName: icon).font(.footnote).foregroundStyle(tint ?? theme.color.accent) }
                    Text(label).textRole(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(1)
                    Spacer(minLength: 2)
                    if let info { info }
                }
                Text(value).textRole(.titleL).foregroundStyle(theme.color.textPrimary)
                    .lineLimit(1).minimumScaleFactor(0.6)
                HStack(alignment: .bottom, spacing: theme.space.sm) {
                    if delta != nil { TrendBadge(delta, goodWhenUp: goodWhenUp) }
                    if let caption { Text(caption).textRole(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(1) }
                    Spacer(minLength: 0)
                    if let spark, spark.count > 1 {
                        OperatorSparkline(spark, tint: tint, height: 26).frame(width: 72)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - OperatorAreaChart

/// A full trend chart: gradient area, reference gridlines, max/min y-axis labels,
/// leading/trailing x captions. The headline chart on Reports / Dashboard.
public struct OperatorAreaChart: View {
    @Environment(\.theme) private var theme
    private let values: [Double]
    private let tint: Color?
    private let leadingLabel: String
    private let trailingLabel: String
    private let valueFormat: (Double) -> String
    private let height: CGFloat

    public init(values: [Double], tint: Color? = nil, leadingLabel: String = "",
                trailingLabel: String = "", height: CGFloat = 168,
                valueFormat: @escaping (Double) -> String = { String(Int($0.rounded())) }) {
        self.values = values; self.tint = tint; self.leadingLabel = leadingLabel
        self.trailingLabel = trailingLabel; self.height = height; self.valueFormat = valueFormat
    }

    public var body: some View {
        let color = tint ?? theme.color.accent
        let maxV = values.max() ?? 0
        VStack(spacing: theme.space.xs) {
            ZStack(alignment: .topLeading) {
                gridlines
                GeometryReader { geo in
                    let pts = OperatorSparkline.points(values, in: geo.size, pad: 6)
                    ZStack {
                        if pts.count > 1 {
                            OperatorSparkline.area(pts, in: geo.size)
                                .fill(LinearGradient(colors: [color.opacity(0.32), color.opacity(0.03)],
                                                     startPoint: .top, endPoint: .bottom))
                            OperatorSparkline.line(pts)
                                .stroke(color, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                        }
                        if let last = pts.last { Circle().fill(color).frame(width: 7, height: 7).position(last) }
                    }
                }
                Text(valueFormat(maxV)).textRole(.caption).monospacedDigit()
                    .foregroundStyle(theme.color.textSecondary).padding(.leading, 2)
            }
            .frame(height: height)
            if !leadingLabel.isEmpty || !trailingLabel.isEmpty {
                HStack { Text(leadingLabel); Spacer(); Text(trailingLabel) }
                    .textRole(.caption).foregroundStyle(theme.color.textSecondary)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Area chart, \(values.count) points, peak \(valueFormat(maxV))")
    }

    private var gridlines: some View {
        GeometryReader { geo in
            Path { p in
                let rows = 4
                for i in 0...rows {
                    let y = geo.size.height * CGFloat(i) / CGFloat(rows)
                    p.move(to: CGPoint(x: 0, y: y)); p.addLine(to: CGPoint(x: geo.size.width, y: y))
                }
            }
            .stroke(theme.color.line.opacity(0.6), lineWidth: 0.5)
        }
    }
}

// MARK: - OperatorGauge

/// A 270° radial progress arc with a centre readout — share-of-target / margin /
/// SLA. `tint` overrides the fill; otherwise the active accent.
public struct OperatorGauge: View {
    @Environment(\.theme) private var theme
    private let fraction: Double
    private let centerValue: String
    private let centerLabel: String
    private let tint: Color?
    private let diameter: CGFloat

    public init(fraction: Double, centerValue: String, centerLabel: String,
                tint: Color? = nil, diameter: CGFloat = 132) {
        self.fraction = fraction; self.centerValue = centerValue
        self.centerLabel = centerLabel; self.tint = tint; self.diameter = diameter
    }

    public var body: some View {
        let f = max(0, min(1, fraction))
        let color = tint ?? theme.color.accent
        let lw = diameter * 0.12
        ZStack {
            Circle().trim(from: 0, to: 0.75)
                .stroke(theme.color.textSecondary.opacity(0.15), style: StrokeStyle(lineWidth: lw, lineCap: .round))
                .rotationEffect(.degrees(135))
            Circle().trim(from: 0, to: 0.75 * f)
                .stroke(color, style: StrokeStyle(lineWidth: lw, lineCap: .round))
                .rotationEffect(.degrees(135))
            VStack(spacing: 1) {
                Text(centerValue).textRole(.titleL).monospacedDigit().foregroundStyle(theme.color.textPrimary)
                Text(centerLabel).textRole(.caption).foregroundStyle(theme.color.textSecondary)
            }
        }
        .frame(width: diameter, height: diameter)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(centerLabel): \(centerValue), \(Int(f * 100))% of target")
    }
}

// MARK: - OperatorProgressMeter

/// A linear progress-to-goal bar with an optional benchmark tick. Used for "today
/// vs daily goal" and the dashboard levers (value vs healthy band).
public struct OperatorProgressMeter: View {
    @Environment(\.theme) private var theme
    private let fraction: Double
    private let tint: Color?
    private let target: Double?
    private let height: CGFloat

    public init(fraction: Double, tint: Color? = nil, target: Double? = nil, height: CGFloat = 10) {
        self.fraction = fraction; self.tint = tint; self.target = target; self.height = height
    }

    public var body: some View {
        let f = max(0, min(1, fraction))
        let color = tint ?? theme.color.accent
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(theme.color.textSecondary.opacity(0.15))
                Capsule().fill(LinearGradient(colors: [color.opacity(0.7), color],
                                              startPoint: .leading, endPoint: .trailing))
                    .frame(width: geo.size.width * f)
                if let target {
                    let tx = geo.size.width * CGFloat(max(0, min(1, target)))
                    Rectangle().fill(theme.color.textPrimary.opacity(0.55))
                        .frame(width: 2, height: height + 4).position(x: tx, y: height / 2)
                }
            }
        }
        .frame(height: height)
        .accessibilityLabel("\(Int(f * 100))% of target")
    }
}

// MARK: - OperatorComparisonColumns

/// Grouped two-series bars (this period vs prior) with a legend — the
/// period-over-period read the web shows for daypart / channel comparisons.
public struct OperatorComparisonColumns: View {
    public struct Group: Sendable, Identifiable {
        public let id: String
        public let label: String
        public let current: Double
        public let prior: Double
        public init(label: String, current: Double, prior: Double) {
            self.id = label; self.label = label; self.current = current; self.prior = prior
        }
    }
    @Environment(\.theme) private var theme
    private let groups: [Group]
    private let currentLabel: String
    private let priorLabel: String
    private let height: CGFloat

    public init(groups: [Group], currentLabel: String = "This period",
                priorLabel: String = "Prior", height: CGFloat = 140) {
        self.groups = groups; self.currentLabel = currentLabel
        self.priorLabel = priorLabel; self.height = height
    }

    public var body: some View {
        let maxV = max(groups.flatMap { [$0.current, $0.prior] }.max() ?? 1, 0.0001)
        VStack(spacing: theme.space.sm) {
            HStack(alignment: .bottom, spacing: theme.space.sm) {
                ForEach(groups) { g in
                    VStack(spacing: 4) {
                        HStack(alignment: .bottom, spacing: 3) {
                            bar(g.prior / maxV, color: theme.color.textSecondary.opacity(0.45))
                            bar(g.current / maxV, color: theme.color.accent)
                        }
                        .frame(height: height, alignment: .bottom)
                        Text(g.label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            HStack(spacing: theme.space.md) {
                legendDot(theme.color.accent, currentLabel)
                legendDot(theme.color.textSecondary.opacity(0.45), priorLabel)
            }
        }
        .accessibilityLabel("Comparison columns, \(groups.count) groups")
    }

    private func bar(_ frac: Double, color: Color) -> some View {
        RoundedRectangle(cornerRadius: 3).fill(color)
            .frame(width: 14, height: max(3, CGFloat(frac) * height))
    }
    private func legendDot(_ color: Color, _ label: String) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 10)
            Text(label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
        }
    }
}

// MARK: - OperatorHourBars

/// Hourly demand bars with the peak hour highlighted and sparse axis labels — the
/// daypart shape that drives prep + labour. Each bar is `(hour, value)`.
public struct OperatorHourBars: View {
    @Environment(\.theme) private var theme
    private let bars: [(hour: Int, value: Double)]
    private let height: CGFloat

    public init(bars: [(hour: Int, value: Double)], height: CGFloat = 130) {
        self.bars = bars; self.height = height
    }

    public var body: some View {
        let maxV = max(bars.map(\.value).max() ?? 1, 0.0001)
        let peak = bars.max(by: { $0.value < $1.value })?.hour
        VStack(spacing: 6) {
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(bars, id: \.hour) { b in
                    let isPeak = b.hour == peak && b.value > 0
                    RoundedRectangle(cornerRadius: 3)
                        .fill(isPeak ? theme.color.warning : theme.color.accent.opacity(0.55))
                        .frame(maxWidth: .infinity)
                        .frame(height: max(2, CGFloat(b.value / maxV) * height))
                }
            }
            .frame(height: height, alignment: .bottom)
            HStack {
                if let first = bars.first { Text(String(format: "%02d:00", first.hour)) }
                Spacer()
                if let peak { Text("peak \(String(format: "%02d:00", peak))").foregroundStyle(theme.color.warning) }
                Spacer()
                if let last = bars.last { Text(String(format: "%02d:00", last.hour)) }
            }
            .textRole(.caption).foregroundStyle(theme.color.textSecondary)
        }
        .accessibilityLabel("Hourly demand, peak at \(peak.map { String(format: "%02d:00", $0) } ?? "n/a")")
    }
}

// MARK: - OperatorHeatGrid

/// A 2-D sensitivity heatmap — the Calculator's what-if grids (orders × ticket,
/// COGS × ticket). Cells are coloured on a diverging profit(green)/loss(red)
/// scale; the baseline cell is ringed. `cell(row,col)` returns the raw value
/// (sign drives colour) and its compact display string.
public struct OperatorHeatGrid: View {
    @Environment(\.theme) private var theme
    private let rowLabels: [String]
    private let colLabels: [String]
    private let baseline: (row: Int, col: Int)?
    private let cell: (Int, Int) -> (value: Double, display: String)

    public init(rowLabels: [String], colLabels: [String], baseline: (row: Int, col: Int)? = nil,
                cell: @escaping (Int, Int) -> (value: Double, display: String)) {
        self.rowLabels = rowLabels; self.colLabels = colLabels
        self.baseline = baseline; self.cell = cell
    }

    public var body: some View {
        let mag = magnitude()
        VStack(spacing: 3) {
            HStack(spacing: 3) {
                Color.clear.frame(width: 44, height: 16)
                ForEach(colLabels.indices, id: \.self) { c in
                    Text(colLabels[c]).textRole(.caption).monospacedDigit()
                        .foregroundStyle(theme.color.textSecondary)
                        .frame(maxWidth: .infinity).lineLimit(1).minimumScaleFactor(0.6)
                }
            }
            ForEach(rowLabels.indices, id: \.self) { r in
                HStack(spacing: 3) {
                    Text(rowLabels[r]).textRole(.caption).monospacedDigit()
                        .foregroundStyle(theme.color.textSecondary)
                        .frame(width: 44, alignment: .trailing).lineLimit(1).minimumScaleFactor(0.6)
                    ForEach(colLabels.indices, id: \.self) { c in
                        let v = cell(r, c)
                        let isBase = baseline.map { $0.row == r && $0.col == c } ?? false
                        Text(v.display)
                            .font(.caption2.weight(.semibold)).monospacedDigit()
                            .foregroundStyle(theme.color.textPrimary)
                            .frame(maxWidth: .infinity, minHeight: 30)
                            .background(color(for: v.value, mag: mag), in: RoundedRectangle(cornerRadius: 4))
                            .overlay {
                                if isBase {
                                    RoundedRectangle(cornerRadius: 4)
                                        .strokeBorder(theme.color.textPrimary, lineWidth: 1.5)
                                }
                            }
                    }
                }
            }
        }
        .accessibilityLabel("Sensitivity heatmap, \(rowLabels.count) by \(colLabels.count)")
    }

    private func magnitude() -> Double {
        var m = 0.0001
        for r in rowLabels.indices { for c in colLabels.indices { m = max(m, abs(cell(r, c).value)) } }
        return m
    }
    private func color(for value: Double, mag: Double) -> Color {
        let t = max(0, min(1, abs(value) / mag))
        let base = value >= 0 ? theme.color.success : theme.color.danger
        return base.opacity(0.12 + 0.55 * t)
    }
}

// MARK: - OperatorWaterfall

/// A revenue → −cost → profit cascade. `steps` are signed deltas; a step flagged
/// `isTotal` draws a full-height resting bar (the start/end totals).
public struct OperatorWaterfall: View {
    public struct Step: Sendable, Identifiable {
        public let id: String
        public let label: String
        public let amount: Double   // signed
        public let isTotal: Bool
        public init(label: String, amount: Double, isTotal: Bool = false) {
            self.id = label; self.label = label; self.amount = amount; self.isTotal = isTotal
        }
    }
    @Environment(\.theme) private var theme
    private let steps: [Step]
    private let height: CGFloat
    private let valueFormat: (Double) -> String

    public init(steps: [Step], height: CGFloat = 170,
                valueFormat: @escaping (Double) -> String = { String(Int($0.rounded())) }) {
        self.steps = steps; self.height = height; self.valueFormat = valueFormat
    }

    public var body: some View {
        let layout = computeLayout()
        VStack(spacing: 6) {
            HStack(alignment: .bottom, spacing: theme.space.sm) {
                ForEach(Array(steps.enumerated()), id: \.element.id) { idx, step in
                    VStack(spacing: 4) {
                        Spacer(minLength: 0)
                        Text(valueFormat(step.amount)).font(.caption2.weight(.semibold)).monospacedDigit()
                            .foregroundStyle(theme.color.textSecondary).lineLimit(1).minimumScaleFactor(0.6)
                        RoundedRectangle(cornerRadius: 3)
                            .fill(fill(for: step))
                            .frame(height: max(3, layout[idx].barHeight))
                            .padding(.top, layout[idx].topGap)
                        Text(step.label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
                            .lineLimit(1).minimumScaleFactor(0.6)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: height + 36, alignment: .bottom)
        }
        .accessibilityLabel("Waterfall, \(steps.count) steps")
    }

    private func fill(for step: Step) -> Color {
        if step.isTotal { return theme.color.accent }
        return step.amount >= 0 ? theme.color.success : theme.color.danger
    }

    /// Running-total layout: each floating bar sits atop the cumulative balance.
    private func computeLayout() -> [(barHeight: CGFloat, topGap: CGFloat)] {
        var running = 0.0
        var lo = 0.0, hi = 0.0
        var bands: [(bottom: Double, top: Double)] = []
        for s in steps {
            if s.isTotal {
                // Order the band so a NEGATIVE total (a loss) still renders as a
                // proper bar below the baseline instead of a clamped 3px sliver.
                bands.append((min(0, s.amount), max(0, s.amount))); running = s.amount
            } else {
                let bottom = min(running, running + s.amount)
                let top = max(running, running + s.amount)
                bands.append((bottom, top)); running += s.amount
            }
            lo = min(lo, bands.last!.bottom); hi = max(hi, bands.last!.top)
        }
        let span = max(hi - lo, 0.0001)
        return bands.map { band in
            let h = CGFloat((band.top - band.bottom) / span) * height
            let gap = CGFloat((hi - band.top) / span) * height
            return (h, gap)
        }
    }
}

// MARK: - OperatorTornado

/// A sensitivity tornado: for each driver, how far year-1 profit swings when the
/// assumption moves ±. Bars are centred on zero (low = red left, high = green right).
public struct OperatorTornado: View {
    public struct Driver: Sendable, Identifiable {
        public let id: String
        public let label: String
        public let low: Double
        public let high: Double
        public init(label: String, low: Double, high: Double) {
            self.id = label; self.label = label; self.low = low; self.high = high
        }
    }
    @Environment(\.theme) private var theme
    private let drivers: [Driver]
    private let valueFormat: (Double) -> String

    public init(drivers: [Driver], valueFormat: @escaping (Double) -> String = { String(Int($0.rounded())) }) {
        self.drivers = drivers; self.valueFormat = valueFormat
    }

    public var body: some View {
        let mag = max(drivers.flatMap { [abs($0.low), abs($0.high)] }.max() ?? 1, 0.0001)
        VStack(spacing: theme.space.sm) {
            ForEach(sorted) { d in
                VStack(alignment: .leading, spacing: 2) {
                    Text(d.label).textRole(.caption).foregroundStyle(theme.color.textPrimary)
                    GeometryReader { geo in
                        let mid = geo.size.width / 2
                        ZStack(alignment: .leading) {
                            Rectangle().fill(theme.color.line).frame(width: 1).position(x: mid, y: 9)
                            // low side (left)
                            Capsule().fill(theme.color.danger.opacity(0.7))
                                .frame(width: CGFloat(abs(min(d.low, 0)) / mag) * mid, height: 14)
                                .position(x: mid - CGFloat(abs(min(d.low, 0)) / mag) * mid / 2, y: 9)
                            // high side (right)
                            Capsule().fill(theme.color.success.opacity(0.7))
                                .frame(width: CGFloat(max(d.high, 0) / mag) * mid, height: 14)
                                .position(x: mid + CGFloat(max(d.high, 0) / mag) * mid / 2, y: 9)
                        }
                    }
                    .frame(height: 18)
                }
            }
        }
        .accessibilityLabel("Sensitivity tornado, \(drivers.count) drivers")
    }

    private var sorted: [Driver] {
        drivers.sorted { (abs($0.high) + abs($0.low)) > (abs($1.high) + abs($1.low)) }
    }
}

// MARK: - DSSegmented

/// A themed segmented control — the period chips (Today / 7d / 30d) that scope a
/// board. Generic over any `Hashable` value.
public struct DSSegmented<Value: Hashable>: View {
    @Environment(\.theme) private var theme
    @Binding private var selection: Value
    private let options: [(value: Value, label: String)]

    public init(_ selection: Binding<Value>, options: [(value: Value, label: String)]) {
        _selection = selection; self.options = options
    }

    public var body: some View {
        HStack(spacing: 2) {
            ForEach(options, id: \.value) { opt in
                let active = opt.value == selection
                Button { selection = opt.value } label: {
                    Text(opt.label).textRole(.caption).fontWeight(.semibold)
                        .frame(maxWidth: .infinity).padding(.vertical, 6)
                        .foregroundStyle(active ? theme.color.onAccent : theme.color.textSecondary)
                        .background(active ? theme.color.accent : Color.clear,
                                    in: RoundedRectangle(cornerRadius: theme.radius.sm))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(3)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.md))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.md).strokeBorder(theme.color.line, lineWidth: 1))
        .sensoryFeedback(.selection, trigger: selection)
    }
}

// MARK: - OperatorLeaderRow

/// A ranked leaderboard row: position medal + name + value + optional delta. Used
/// for top sellers, location ranking, agent spend.
public struct OperatorLeaderRow: View {
    @Environment(\.theme) private var theme
    private let rank: Int
    private let name: String
    private let value: String
    private let fraction: Double
    private let delta: Double?

    public init(rank: Int, name: String, value: String, fraction: Double, delta: Double? = nil) {
        self.rank = rank; self.name = name; self.value = value
        self.fraction = fraction; self.delta = delta
    }

    public var body: some View {
        HStack(spacing: theme.space.sm) {
            Text("\(rank)").font(.caption.weight(.bold)).monospacedDigit()
                .foregroundStyle(rank <= 3 ? theme.color.warning : theme.color.textSecondary)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 3) {
                Text(name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary).lineLimit(1)
                OperatorBarRow(fraction: fraction)
            }
            Spacer(minLength: theme.space.sm)
            VStack(alignment: .trailing, spacing: 2) {
                Text(value).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(theme.color.textPrimary)
                if delta != nil { TrendBadge(delta) }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - OperatorScatter

/// A two-variable scatter with a median crosshair and tinted quadrants — the
/// Kasavana-Smith menu-engineering matrix (popularity × profitability). Points
/// are normalised over the data's own range; the crosshair sits at the supplied
/// medians (or the data medians). Each point carries its own quadrant colour.
public struct OperatorScatter: View {
    public struct Point: Sendable, Identifiable {
        public let id: String
        public let x: Double
        public let y: Double
        public let color: Color
        public let label: String?
        public init(id: String, x: Double, y: Double, color: Color, label: String? = nil) {
            self.id = id; self.x = x; self.y = y; self.color = color; self.label = label
        }
    }
    @Environment(\.theme) private var theme
    private let points: [Point]
    private let xLabel: String
    private let yLabel: String
    private let quadrantTints: (tl: Color, tr: Color, bl: Color, br: Color)?
    private let height: CGFloat

    public init(points: [Point], xLabel: String, yLabel: String,
                quadrantTints: (tl: Color, tr: Color, bl: Color, br: Color)? = nil, height: CGFloat = 240) {
        self.points = points; self.xLabel = xLabel; self.yLabel = yLabel
        self.quadrantTints = quadrantTints; self.height = height
    }

    public var body: some View {
        let xs = points.map(\.x), ys = points.map(\.y)
        let xMin = xs.min() ?? 0, xMax = xs.max() ?? 1
        let yMin = ys.min() ?? 0, yMax = ys.max() ?? 1
        let xMed = median(xs), yMed = median(ys)
        VStack(spacing: 4) {
            GeometryReader { geo in
                let w = geo.size.width, h = geo.size.height
                let px: (Double) -> CGFloat = { CGFloat(($0 - xMin) / max(xMax - xMin, 0.0001)) * w }
                let py: (Double) -> CGFloat = { h - CGFloat(($0 - yMin) / max(yMax - yMin, 0.0001)) * h }
                let cx = px(xMed), cy = py(yMed)
                ZStack {
                    if let q = quadrantTints {
                        q.tl.frame(width: cx, height: cy).position(x: cx / 2, y: cy / 2)
                        q.tr.frame(width: w - cx, height: cy).position(x: cx + (w - cx) / 2, y: cy / 2)
                        q.bl.frame(width: cx, height: h - cy).position(x: cx / 2, y: cy + (h - cy) / 2)
                        q.br.frame(width: w - cx, height: h - cy).position(x: cx + (w - cx) / 2, y: cy + (h - cy) / 2)
                    }
                    Path { p in
                        p.move(to: CGPoint(x: cx, y: 0)); p.addLine(to: CGPoint(x: cx, y: h))
                        p.move(to: CGPoint(x: 0, y: cy)); p.addLine(to: CGPoint(x: w, y: cy))
                    }.stroke(theme.color.textSecondary.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    ForEach(points) { pt in
                        Circle().fill(pt.color)
                            .frame(width: 9, height: 9)
                            .overlay(Circle().strokeBorder(theme.color.surface, lineWidth: 1))
                            .position(x: px(pt.x), y: py(pt.y))
                    }
                }
            }
            .frame(height: height)
            .background(theme.color.surface, in: RoundedRectangle(cornerRadius: theme.radius.sm))
            HStack {
                Text("← \(xLabel) →").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                Spacer()
                Text("↑ \(yLabel)").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            }
        }
        .accessibilityLabel("Scatter matrix, \(points.count) items")
    }

    private func median(_ xs: [Double]) -> Double {
        guard !xs.isEmpty else { return 0 }
        let s = xs.sorted(); let n = s.count
        return n % 2 == 1 ? s[n / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
    }
}

// MARK: - OperatorBandChart

/// A line trend drawn over a shaded "safe band" [low, high] — the HACCP
/// temperature log per sensor. Out-of-band readings render as danger dots.
public struct OperatorBandChart: View {
    @Environment(\.theme) private var theme
    private let values: [Double]
    private let safeLow: Double
    private let safeHigh: Double
    private let tint: Color?
    private let height: CGFloat

    public init(values: [Double], safeLow: Double, safeHigh: Double, tint: Color? = nil, height: CGFloat = 120) {
        self.values = values; self.safeLow = safeLow; self.safeHigh = safeHigh; self.tint = tint; self.height = height
    }

    public var body: some View {
        let color = tint ?? theme.color.accent
        let lo = min(values.min() ?? safeLow, safeLow)
        let hi = max(values.max() ?? safeHigh, safeHigh)
        let range = max(hi - lo, 0.0001)
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let py: (Double) -> CGFloat = { h - CGFloat(($0 - lo) / range) * h }
            let pts: [CGPoint] = values.count > 1
                ? values.enumerated().map { CGPoint(x: CGFloat($0.offset) / CGFloat(values.count - 1) * w, y: py($0.element)) }
                : values.map { _ in CGPoint(x: w / 2, y: py(values.first ?? 0)) }
            ZStack {
                Rectangle().fill(theme.color.success.opacity(0.14))
                    .frame(height: max(2, py(safeLow) - py(safeHigh)))
                    .position(x: w / 2, y: (py(safeLow) + py(safeHigh)) / 2)
                if pts.count > 1 {
                    OperatorSparkline.line(pts).stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                }
                ForEach(Array(values.enumerated()), id: \.offset) { i, v in
                    let bad = v < safeLow || v > safeHigh
                    Circle().fill(bad ? theme.color.danger : color)
                        .frame(width: bad ? 7 : 5, height: bad ? 7 : 5)
                        .position(pts[i])
                }
            }
        }
        .frame(height: height)
        .accessibilityLabel("Temperature trend, safe band \(Int(safeLow)) to \(Int(safeHigh))°C")
    }
}

// MARK: - Gallery (living Storybook — DESIGN-SYSTEM §6)

#if DEBUG
private struct AnalyticsGallery: View {
    @State private var range = 7
    private let trend: [Double] = [42, 38, 51, 47, 63, 58, 72, 69, 81, 77, 88, 94, 90, 102]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                DSSegmented($range, options: [(7, "7d"), (30, "30d"), (90, "90d")])
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                    OperatorKPICard(label: "Revenue", value: "9 800 zł", icon: "banknote.fill",
                                    delta: 0.123, spark: trend, caption: "vs prior")
                    OperatorKPICard(label: "Cancel %", value: "3%", icon: "xmark.circle.fill",
                                    tint: .orange, delta: 0.18, goodWhenUp: false, spark: trend.reversed())
                }
                OperatorAreaChart(values: trend, leadingLabel: "14d ago", trailingLabel: "today")
                HStack(spacing: 16) {
                    OperatorGauge(fraction: 0.62, centerValue: "62%", centerLabel: "of goal")
                    VStack { OperatorProgressMeter(fraction: 0.62, target: 0.8); OperatorProgressMeter(fraction: 0.4) }
                }
                OperatorComparisonColumns(groups: [
                    .init(label: "Lun", current: 40, prior: 30), .init(label: "Cena", current: 80, prior: 72),
                    .init(label: "Late", current: 25, prior: 30),
                ])
                OperatorHourBars(bars: (10...22).map { ($0, Double(($0 * 7) % 50 + 5)) })
                OperatorWaterfall(steps: [
                    .init(label: "Rev", amount: 100, isTotal: true), .init(label: "COGS", amount: -32),
                    .init(label: "Labour", amount: -28), .init(label: "Fixed", amount: -25),
                    .init(label: "Profit", amount: 15, isTotal: true),
                ])
                OperatorTornado(drivers: [
                    .init(label: "Avg ticket ±10%", low: -40, high: 45),
                    .init(label: "COGS ±5pp", low: -25, high: 25),
                    .init(label: "Orders/day ±10%", low: -38, high: 42),
                ])
                OperatorLeaderRow(rank: 1, name: "Margherita", value: "1 240 zł", fraction: 1.0, delta: 0.08)
            }
            .padding()
        }
    }
}

#Preview("Analytics · KDS") {
    AnalyticsGallery().environment(\.theme, .kds).background(Theme.kds.color.surface).preferredColorScheme(.dark)
}
#Preview("Analytics · Ottaviano") {
    AnalyticsGallery().environment(\.theme, .ottaviano).background(Theme.ottaviano.color.surface)
}
#endif
