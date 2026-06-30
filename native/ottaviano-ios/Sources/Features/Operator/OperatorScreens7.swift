import SwiftUI
import OttavianoKit

// Wave 7 operator surfaces — HACCP temperature log, Menu engineering matrix,
// Regulatory disclosures. All read-only off /api/v1/admin, dark operator skin.

// MARK: - HACCP (/admin/haccp)

/// HACCP — the native twin of web `/admin/haccp`. Per-sensor temperature trend
/// charts over the observed compliant band (the range of non-flagged readings),
/// with out-of-band readings flagged in red, a flagged-rate gauge, and the live
/// log action. Real data only (Rule #1); the trend carries the five-section ⓘ.
@MainActor
@Observable
final class OperatorHaccpStore {
    var items: [AdminTempLog] = []
    var loaded = false
    var error: String?
    private let api: APIClient
    init(api: APIClient) { self.api = api }
    func load() async {
        do { items = try await api.send(.adminHaccp()); error = nil }
        catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { self.error = "Something went wrong" }
        loaded = true
    }
}

public struct OperatorHaccpView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorHaccpStore?
    private let api: APIClient
    public init(api: APIClient) { self.api = api }

    private let cols = [GridItem(.adaptive(minimum: 120), spacing: 12)]

    public var body: some View {
        ScrollView {
            if let store { content(store) }
            else { ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl) }
        }
        .background(theme.color.surface)
        .navigationTitle("HACCP log")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) {
            if let store { LogTempButton(api: api, reload: { await store.load() }) }
        } }
        .task {
            if store == nil { store = OperatorHaccpStore(api: api) }
            if store?.loaded == false { await store?.load() }
        }
        .refreshable { await store?.load() }
    }

    @ViewBuilder
    private func content(_ store: OperatorHaccpStore) -> some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            if let error = store.error, store.items.isEmpty {
                ContentUnavailableView("Couldn't load HACCP", systemImage: "thermometer.medium", description: Text(error))
                    .padding(.top, theme.space.xxl)
            } else if store.items.isEmpty && store.loaded {
                DSEmptyState("HACCP log", systemImage: "thermometer.medium", message: "No temperature readings yet.")
            } else {
                kpis(store.items)
                ForEach(sensors(store.items), id: \.name) { group in sensorCard(group) }
            }
        }
        .padding(theme.space.lg)
    }

    private func kpis(_ items: [AdminTempLog]) -> some View {
        let flagged = items.filter { $0.status == "flagged" }.count
        let rate = items.isEmpty ? 0 : Double(flagged) / Double(items.count) * 100
        let tint: Color = rate <= 0 ? theme.color.success : (rate <= 5 ? theme.color.warning : theme.color.danger)
        return LazyVGrid(columns: cols, spacing: theme.space.md) {
            OperatorKPICard(label: "Readings", value: "\(items.count)", icon: "list.bullet", tint: theme.color.accent)
            OperatorKPICard(label: "Sensors", value: "\(Set(items.map(\.sensor)).count)", icon: "sensor.fill", tint: theme.color.accent)
            card("Flagged rate", subtitle: "out of band", info: Self.flaggedInfo) {
                HStack { Spacer()
                    OperatorGauge(fraction: min(1, rate / 20), centerValue: String(format: "%.0f%%", rate),
                                  centerLabel: "\(flagged) flagged", tint: tint, diameter: 110)
                    Spacer() }
            }
        }
    }

    private struct SensorGroup { let name: String; let readings: [AdminTempLog] }
    private func sensors(_ items: [AdminTempLog]) -> [SensorGroup] {
        let names = Array(Set(items.map(\.sensor))).sorted()
        return names.map { name in
            SensorGroup(name: name, readings: items.filter { $0.sensor == name }.sorted { $0.recordedAt < $1.recordedAt })
        }
    }

    private func sensorCard(_ g: SensorGroup) -> some View {
        let temps = g.readings.map(\.celsius)
        let okTemps = g.readings.filter { $0.status != "flagged" }.map(\.celsius)
        // The compliant band the kitchen actually holds — the range of OK readings.
        let lo = okTemps.min() ?? (temps.min() ?? 0)
        let hi = okTemps.max() ?? (temps.max() ?? 0)
        let latest = g.readings.last
        let flagged = g.readings.filter { $0.status == "flagged" }.count
        return card(g.name, subtitle: g.readings.first.map { $0.locationSlug.capitalized } ?? "", info: Self.trendInfo) {
            VStack(alignment: .leading, spacing: theme.space.md) {
                if temps.count > 1 {
                    OperatorBandChart(values: temps, safeLow: lo, safeHigh: hi,
                                      tint: latest?.status == "flagged" ? theme.color.danger : theme.color.success)
                }
                HStack(spacing: theme.space.lg) {
                    stat("Latest", latest.map { String(format: "%.1f°C", $0.celsius) } ?? "—",
                         latest?.status == "flagged" ? theme.color.danger : theme.color.success)
                    stat("Band", String(format: "%.0f…%.0f°C", lo, hi), theme.color.textSecondary)
                    stat("Readings", "\(g.readings.count)", theme.color.textSecondary)
                    stat("Flagged", "\(flagged)", flagged > 0 ? theme.color.danger : theme.color.textSecondary)
                }
            }
        }
    }

    private func stat(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle(tint)
            Text(label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
        }
    }

    private func card<Content: View>(_ title: String, subtitle: String? = nil, info: InfoButton?,
                                     @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).foregroundStyle(theme.color.textPrimary)
                    if let subtitle, !subtitle.isEmpty { Text(subtitle).textRole(.caption).foregroundStyle(theme.color.textSecondary) }
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

private extension OperatorHaccpView {
    static var flaggedInfo: InfoButton {
        InfoButton(title: "Flagged rate",
            description: "Share of temperature readings that fell outside the compliant band.",
            institutional: "HACCP is a legal and brand-risk control, not a nicety — a single logged excursion left unactioned is what a health inspector or an injury lawyer builds a case on. Best-in-class kitchens hold flagged readings near 0%; a rising rate is an equipment or process failure to fix before it becomes a closure.",
            plain: "If 2 of 80 fridge readings were too warm, that's 2.5% flagged — each one is a window where food may have spoiled. Trace it to the unit and the shift.",
            tips: "Service the worst sensor's equipment, tighten door discipline, and re-check after restocking surges — most excursions cluster around deliveries.",
            methodology: "flagged readings ÷ total readings. Source: /admin/haccp.status == flagged.")
    }
    static var trendInfo: InfoButton {
        InfoButton(title: "Temperature trend",
            description: "Each sensor's readings over time against the band it normally holds (the range of its compliant readings); out-of-band points are flagged red.",
            institutional: "A trend beats a snapshot for cold-chain control — a fridge drifting warm over a week is a failing compressor you catch before it spoils a delivery. The band makes 'normal' visible, so an excursion reads instantly.",
            plain: "If the line sits calmly inside the green band then spikes above it one afternoon, that red dot is the moment to investigate — a propped door, a failing unit, an overpacked shelf.",
            tips: "Watch for slow upward drift (equipment ageing) and repeated spikes at the same time of day (a process step). Fix the unit behind the most red dots first.",
            methodology: "Per-sensor readings (°C) over time; band = min…max of non-flagged readings. Source: /admin/haccp.")
    }
}

// MARK: - Menu engineering (/admin/menu-engineering)

/// Menu engineering — the native twin of web `/admin/menu-engineering`
/// (MenuEngineeringV3). The Kasavana-Smith matrix rendered as a real scatter
/// (popularity × profitability) with a median crosshair + tinted quadrants, a
/// 30/60/90-day window control, the quadrant KPI rail, and the ranked dish list.
/// Real data only (Rule #1); the matrix carries the five-section ⓘ (Rule #12).
@MainActor
@Observable
final class OperatorMenuEngStore {
    var window = 30
    var items: [AdminMenuEngineeringLine] = []
    var loaded = false
    var error: String?
    private let api: APIClient
    init(api: APIClient) { self.api = api }
    func load() async {
        do { items = try await api.send(.adminMenuEngineering(window: window)); error = nil }
        catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { self.error = "Something went wrong" }
        loaded = true
    }
}

public struct OperatorMenuEngineeringView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorMenuEngStore?
    private let api: APIClient
    public init(api: APIClient) { self.api = api }

    private let cols = [GridItem(.adaptive(minimum: 120), spacing: 12)]

    public var body: some View {
        ScrollView {
            if let store { content(store) }
            else { ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl) }
        }
        .background(theme.color.surface)
        .navigationTitle("Menu engineering")
        .task {
            if store == nil { store = OperatorMenuEngStore(api: api) }
            if store?.loaded == false { await store?.load() }
        }
        .refreshable { await store?.load() }
    }

    @ViewBuilder
    private func content(_ store: OperatorMenuEngStore) -> some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            DSSegmented(Binding(
                get: { store.window },
                set: { store.window = $0; Task { await store.load() } }
            ), options: [(value: 30, label: "30d"), (value: 60, label: "60d"), (value: 90, label: "90d")])
            if let error = store.error, store.items.isEmpty {
                ContentUnavailableView("Couldn't load menu engineering", systemImage: "square.grid.2x2", description: Text(error))
                    .padding(.top, theme.space.xxl)
            } else if store.items.isEmpty && store.loaded {
                DSEmptyState("Menu engineering", systemImage: "square.grid.2x2", message: "Not enough sales to classify yet.")
            } else {
                quadRail(store.items)
                matrix(store.items)
                ranked(store.items)
            }
        }
        .padding(theme.space.lg)
    }

    private func quadRail(_ items: [AdminMenuEngineeringLine]) -> some View {
        LazyVGrid(columns: cols, spacing: theme.space.md) {
            OperatorKPICard(label: "Stars", value: "\(count(items, "star"))", icon: "star.fill", tint: theme.color.success)
            OperatorKPICard(label: "Plowhorses", value: "\(count(items, "plowhorse"))", icon: "tortoise.fill", tint: theme.color.accent)
            OperatorKPICard(label: "Puzzles", value: "\(count(items, "puzzle"))", icon: "puzzlepiece.fill", tint: theme.color.warning)
            OperatorKPICard(label: "Dogs", value: "\(count(items, "dog"))", icon: "pawprint.fill", tint: theme.color.danger)
        }
    }

    private func matrix(_ items: [AdminMenuEngineeringLine]) -> some View {
        card("Kasavana-Smith matrix", subtitle: "popularity × profit/unit", info: Self.matrixInfo) {
            OperatorScatter(
                points: items.map { .init(id: $0.menuItemId, x: Double($0.unitsSold),
                                          y: Double($0.gpPerUnit), color: quadColor($0.quadrant), label: $0.name) },
                xLabel: "units sold", yLabel: "GP / unit",
                quadrantTints: (tl: theme.warningSoft, tr: theme.successSoft,
                                bl: theme.dangerSoft, br: theme.color.accent.opacity(0.12)))
        }
    }

    private func ranked(_ items: [AdminMenuEngineeringLine]) -> some View {
        let maxRev = max(items.map(\.revenue).max() ?? 1, 1)
        return card("Dishes", subtitle: "by revenue", info: nil) {
            VStack(spacing: theme.space.sm) {
                ForEach(items.sorted { $0.revenue > $1.revenue }) { l in
                    HStack(spacing: theme.space.sm) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(l.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary).lineLimit(1)
                            OperatorBarRow(fraction: Double(l.revenue) / Double(maxRev))
                            Text("×\(l.unitsSold) · GP \(MoneyText.format(l.gpPerUnit))/unit")
                                .textRole(.caption).foregroundStyle(theme.color.textSecondary)
                        }
                        Spacer(minLength: theme.space.sm)
                        VStack(alignment: .trailing, spacing: 4) {
                            MoneyText(l.revenue).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                            quadrantTag(l.quadrant)
                        }
                    }
                }
            }
        }
    }

    private func count(_ items: [AdminMenuEngineeringLine], _ q: String) -> Int { items.filter { $0.quadrant == q }.count }
    private func quadColor(_ q: String) -> Color {
        q == "star" ? theme.color.success : q == "plowhorse" ? theme.color.accent : q == "puzzle" ? theme.color.warning : theme.color.danger
    }
    private func quadrantTag(_ q: String) -> some View {
        let c = quadColor(q)
        return Text(q.capitalized).font(.caption2.weight(.bold))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(c.opacity(0.18), in: Capsule()).foregroundStyle(c)
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
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
    }
}

private extension OperatorMenuEngineeringView {
    static var matrixInfo: InfoButton {
        InfoButton(title: "Kasavana-Smith matrix",
            description: "Every dish plotted by popularity (units sold, x) against profit per unit (gross profit, y), split at the menu medians into four quadrants.",
            institutional: "Menu engineering is the highest-ROI margin lever in food service — it reprices and re-plates what you already sell. The discipline: protect stars (high-high), reprice/re-engineer plowhorses (popular but thin) and puzzles (profitable but unloved), and cut dogs (low-low). It's the standard the whole industry benchmarks a menu against.",
            plain: "Top-right dishes (stars like Margherita) sell a lot AND make money — feature them. Bottom-right (plowhorses) sell well but earn little — nudge the price or trim the recipe. Top-left (puzzles) are profitable but slow — promote them. Bottom-left (dogs) do neither — cut them.",
            tips: "Move plowhorses up with a small price rise or cheaper garnish; pull puzzles right by featuring + describing them better; delist dogs and redeploy their prep to stars.",
            methodology: "x = unitsSold, y = gpPerUnit; crosshair at the median of each. Quadrant from the server's Kasavana-Smith classification. Source: /admin/menu-engineering (window-scoped).")
    }
}

// MARK: - Regulatory disclosures (/admin/regulatory-compliance)

public struct OperatorRegulatoryView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Regulatory",
            emptyText: "No locations to disclose.",
            loader: OperatorListLoader { try await api.send(.adminRegulatory()) },
            search: { [$0.city, $0.zone].joined(separator: " ") },
            filters: [
                OperatorFilter("Calorie labels", systemImage: "list.bullet.rectangle") { $0.calorieDisclosureRequired },
                OperatorFilter("Halal", systemImage: "checkmark.seal.fill") { $0.halalCertId != nil },
            ],
            sorts: [
                OperatorSortOption("City") { $0.city.localizedCaseInsensitiveCompare($1.city) == .orderedAscending },
            ],
            row: { r in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(r.city).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Spacer()
                        Text(r.zone).font(.caption2.weight(.bold))
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(theme.color.accent.opacity(0.18), in: Capsule()).foregroundStyle(theme.color.accent)
                    }
                    HStack(spacing: theme.space.sm) {
                        if let g = r.dohGrade { flag("DOH \(g)") }
                        if r.calorieDisclosureRequired { flag("kcal labels") }
                        if r.halalCertId != nil { flag("Halal cert") }
                    }
                }
            }
        )
    }
    private func flag(_ t: String) -> some View {
        Text(t).font(.caption2)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(theme.color.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(theme.color.line, lineWidth: 1))
            .foregroundStyle(theme.color.textSecondary)
    }
}
