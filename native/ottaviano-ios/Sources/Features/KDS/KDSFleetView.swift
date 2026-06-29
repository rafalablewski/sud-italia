import SwiftUI
import OttavianoKit

/// The owner Atlas — cross-truck KDS health, the promise-accuracy benchmark, and
/// per-truck tiles (counts · pace · active-ticket preview). Web `/core/kds` Fleet
/// parity, off `GET /api/v1/admin/kds/fleet`. Rendered inside the board's
/// ScrollView, so this is a plain VStack (no nested scroll).
struct KDSFleetView: View {
    @Environment(\.theme) private var theme
    let board: FleetBoard

    var body: some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            paceHeader
            totals
            benchmark
            ForEach(board.tiles) { truckCard($0) }
        }
    }

    // MARK: pace header — promise-accuracy gauge + per-hour throughput

    private var paceHeader: some View {
        let b = board.benchmark
        let t = board.totals
        let acc = max(0, min(1, b.fleetAccuracy / 100))
        let tint: Color = b.fleetAccuracy >= Double(board.promiseTarget) ? theme.color.success
            : (b.fleetAccuracy >= Double(board.promiseTarget) - 10 ? theme.color.warning : theme.color.danger)
        return VStack(alignment: .leading, spacing: theme.space.md) {
            HStack(alignment: .firstTextBaseline) {
                Text("Fleet pace").font(.headline).foregroundStyle(theme.color.textPrimary)
                Spacer()
                Self.paceInfo(target: board.promiseTarget, window: board.paceWindowMin)
            }
            HStack(spacing: theme.space.xl) {
                OperatorGauge(fraction: acc, centerValue: "\(Int(b.fleetAccuracy.rounded()))%",
                              centerLabel: "on time", tint: tint, diameter: 120)
                VStack(alignment: .leading, spacing: theme.space.md) {
                    paceStat("Throughput", "\(t.throughputHr)/hr", "flame.fill", theme.color.success)
                    paceStat("Covers", "\(t.coversHr)/hr", "person.2.fill", theme.color.textPrimary)
                    paceStat("Revenue", "\(MoneyText.format(t.revenueHr))/hr", "banknote.fill", theme.color.success)
                }
                Spacer()
            }
        }
        .padding(theme.space.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func paceStat(_ label: String, _ value: String, _ icon: String, _ tint: Color) -> some View {
        HStack(spacing: theme.space.sm) {
            Image(systemName: icon).font(.footnote).foregroundStyle(tint).frame(width: 18)
            Text(value).font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle(theme.color.textPrimary)
            Text(label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
        }
    }

    private static func paceInfo(target: Int, window: Int) -> InfoButton {
        InfoButton(title: "Fleet pace",
            description: "Cross-truck promise accuracy (share of tickets plated by their promised time) plus live per-hour throughput, covers and revenue.",
            institutional: "Promise accuracy is the KDS quality gate — it's the kitchen's on-time-delivery (OTD) number, the one a multi-site operator manages the line against. Below target it predicts refunds, bad reviews and churn before they show up in revenue; the cross-truck spread tells you whether a miss is systemic or one struggling site.",
            plain: "If \(target)% is the goal and the fleet runs 88%, roughly 1 in 8 tickets is late — felt by guests right now. Throughput/hr tells you how hard the line is being pushed while that happens.",
            tips: "When accuracy dips, add a hand to the hottest station (see each truck's pace bars), pre-fire prep ahead of the daypart peak, and course long tickets so plates land together.",
            methodology: "On-time tickets ÷ total over the last \(window)m, fleet-wide; throughput/covers/revenue are last-60m counts. Source: /admin/kds/fleet.")
    }

    // MARK: fleet totals

    private var totals: some View {
        let t = board.totals
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: theme.space.sm) {
                cell("Active", "\(t.active)", theme.color.textPrimary)
                cell("At risk", "\(t.risk)", t.risk > 0 ? theme.risk : theme.color.textSecondary)
                cell("Late", "\(t.late)", t.late > 0 ? theme.color.danger : theme.color.textSecondary)
                cell("Ready", "\(t.ready)", theme.color.success)
                cell("Done/hr", "\(t.throughputHr)", theme.color.success)
                cell("Covers/hr", "\(t.coversHr)", theme.color.textPrimary)
                revenueCell(t.revenueHr)
            }
        }
    }

    private func cell(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
            Text(value).textRole(.title).foregroundStyle(tint)
        }
        .padding(.horizontal, theme.space.md).padding(.vertical, theme.space.sm)
        .frame(minWidth: 72, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.md))
    }

    private func revenueCell(_ grosze: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Revenue/hr").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            MoneyText(grosze).textRole(.title).foregroundStyle(theme.color.textPrimary)
        }
        .padding(.horizontal, theme.space.md).padding(.vertical, theme.space.sm)
        .frame(minWidth: 90, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.md))
    }

    // MARK: cross-truck benchmark

    private var benchmark: some View {
        let b = board.benchmark
        return VStack(alignment: .leading, spacing: theme.space.sm) {
            HStack {
                Text("Promise-accuracy · cross-truck").textRole(.caption)
                    .foregroundStyle(theme.color.textSecondary)
                Spacer()
                Text(benchmarkSummary(b)).textRole(.caption).foregroundStyle(theme.color.textSecondary)
            }
            ForEach(board.tiles) { tile in
                HStack(spacing: theme.space.sm) {
                    Text(tile.name).textRole(.caption).foregroundStyle(theme.color.textPrimary)
                        .frame(width: 96, alignment: .leading)
                    track(fraction: min(1, tile.promiseAccuracy / 100),
                          tint: tile.promiseAccuracy < Double(board.promiseTarget) ? theme.color.warning : theme.color.success)
                    Text("\(Int(tile.promiseAccuracy.rounded()))%").textRole(.caption)
                        .foregroundStyle(theme.color.textSecondary).frame(width: 44, alignment: .trailing)
                }
            }
        }
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg))
    }

    private func benchmarkSummary(_ b: FleetBenchmark) -> String {
        var s = "fleet \(Int(b.fleetAccuracy.rounded()))% · target \(board.promiseTarget)%"
        if let leader = b.leader, b.gap > 0 { s += " · \(leader) leads by \(Int(b.gap.rounded())) pts" }
        return s
    }

    // MARK: one truck

    private func truckCard(_ tile: FleetTile) -> some View {
        let now = Date().timeIntervalSince1970 * 1000
        let preview = Array(tile.tickets.sorted { lhs, rhs in
            // Most urgent first: late, then at-risk, then oldest.
            if lhs.isLate(nowMs: now) != rhs.isLate(nowMs: now) { return lhs.isLate(nowMs: now) }
            if lhs.isAtRisk != rhs.isAtRisk { return lhs.isAtRisk }
            return lhs.paidAtMs < rhs.paidAtMs
        }.prefix(3))
        let stations = tile.stations.filter { $0.demand > 0 }.sorted { $0.pct > $1.pct }

        return VStack(alignment: .leading, spacing: theme.space.md) {
            HStack(spacing: theme.space.md) {
                Text("\(tile.health)")
                    .textRole(.title).foregroundStyle(theme.color.onAccent)
                    .frame(width: 44, height: 44)
                    .background(healthColor(tile.healthClass), in: Circle())
                VStack(alignment: .leading, spacing: 1) {
                    Text(tile.name).textRole(.bodyEmphasis).foregroundStyle(theme.color.textPrimary)
                    Text("Open · \(tile.counts.active) active · \(tile.healthState)")
                        .textRole(.caption).foregroundStyle(theme.color.textSecondary)
                }
                Spacer()
            }

            HStack(spacing: theme.space.lg) {
                stat("Active", "\(tile.counts.active)", theme.color.textPrimary)
                stat("At risk", "\(tile.counts.risk)", tile.counts.risk > 0 ? theme.risk : theme.color.textSecondary)
                stat("Late", "\(tile.counts.late)", tile.counts.late > 0 ? theme.color.danger : theme.color.textSecondary)
                stat("Ready", "\(tile.counts.ready)", theme.color.success)
                stat("On shift", "\(tile.onShift)", theme.color.textPrimary)
            }

            if !stations.isEmpty {
                VStack(alignment: .leading, spacing: theme.space.xs) {
                    Text("Pace · next \(board.paceWindowMin)m").textRole(.caption)
                        .foregroundStyle(theme.color.textSecondary)
                    ForEach(stations) { s in
                        HStack(spacing: theme.space.sm) {
                            Text(s.label).textRole(.caption).foregroundStyle(theme.color.textPrimary)
                                .frame(width: 80, alignment: .leading)
                            track(fraction: min(1, s.capacity > 0 ? Double(s.currentLoad) / s.capacity : 1),
                                  tint: tierColor(s.tier))
                            Text("\(s.currentLoad)/\(Int(s.capacity.rounded()))" + (s.forecast > 0 ? " · +\(s.forecast)" : ""))
                                .textRole(.caption).foregroundStyle(theme.color.textSecondary)
                                .frame(width: 80, alignment: .trailing)
                        }
                    }
                }
            }

            if preview.isEmpty {
                Text("No active tickets").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                VStack(alignment: .leading, spacing: theme.space.xs) {
                    ForEach(preview) { tk in
                        let due = tk.kdsDue(nowMs: now)
                        HStack(spacing: theme.space.sm) {
                            Text("#\(tk.ticketShortId)").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                            Text(dishSummary(tk)).textRole(.caption).foregroundStyle(theme.color.textPrimary)
                                .lineLimit(1)
                            Spacer()
                            Text(due.text).textRole(.caption).foregroundStyle(toneColor(due.tone))
                        }
                    }
                }
            }
        }
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg))
    }

    private func stat(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
            Text(value).textRole(.bodyEmphasis).foregroundStyle(tint)
        }
    }

    // A 6pt progress track with a tinted fill.
    private func track(fraction: Double, tint: Color) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(theme.color.line.opacity(0.5))
                Capsule().fill(tint).frame(width: max(0, geo.size.width * fraction))
            }
        }
        .frame(height: 6)
    }

    // Compact "2× Margherita · Bufala +1" preview line (web dishSummary).
    private func dishSummary(_ o: Order) -> String {
        let parts = o.items.prefix(2).map { $0.quantity > 1 ? "\($0.quantity)× \($0.name)" : $0.name }
        let extra = o.items.count - 2
        return parts.joined(separator: " · ") + (extra > 0 ? " +\(extra)" : "")
    }

    private func healthColor(_ cls: String) -> Color {
        switch cls {
        case "good": theme.color.success
        case "warn": theme.color.warning
        case "risk": theme.risk
        default: theme.color.danger
        }
    }
    private func tierColor(_ tier: String) -> Color {
        switch tier {
        case "calm": theme.color.success
        case "warn": theme.color.warning
        default: theme.color.danger
        }
    }
    private func toneColor(_ tone: KdsTone) -> Color {
        switch tone {
        case .ready: theme.color.success
        case .late: theme.color.danger
        case .risk: theme.risk
        case .warn: theme.color.warning
        case .firing: theme.info
        case .queued: theme.color.textSecondary
        }
    }
}
