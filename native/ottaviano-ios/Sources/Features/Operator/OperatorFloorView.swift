import SwiftUI
import OttavianoKit

/// Service · Floor plan — the native twin of web `/core/service/floor`. The live
/// room: a KPI strip (covers seated · occupancy · freeing ≤15m · spend/hr), a
/// kitchen-bottleneck banner, and zone-grouped table tiles toned by status with
/// party / dwell / predicted-free / open-check. Tap a table to seat / clear and
/// read its detail. Real data off `/api/v1/admin/floor/twin` (Rule #1).
@MainActor
@Observable
final class OperatorFloorStore {
    var location: String
    var room: FloorRoom?
    var locations: [Location] = []
    var loaded = false
    var error: String?
    var busyTableId: String?
    private let api: APIClient
    init(api: APIClient, location: String) { self.api = api; self.location = location }

    func loadLocations() async {
        if locations.isEmpty { locations = (try? await api.send(.locations())) ?? [] }
    }
    func load() async {
        do { room = try await api.send(.adminFloorRoom(location: location)); error = nil }
        catch let e as APIError { if room == nil { error = OperatorListLoader<Int>.message(e) } }
        catch { if room == nil { error = "Something went wrong" } }
        loaded = true
    }
    func setLocation(_ slug: String) async { location = slug; room = nil; loaded = false; await load() }
    func seat(_ table: FloorTwinTable, seat: Bool) async {
        busyTableId = table.id
        _ = try? await api.send(.adminFloorSeat(location: location, tableId: table.id, seat: seat))
        await load()
        busyTableId = nil
    }
}

public struct OperatorFloorView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorFloorStore?
    @State private var selected: FloorTwinTable?
    private let api: APIClient
    private let initialLocation: String
    public init(api: APIClient, location: String = "krakow") { self.api = api; self.initialLocation = location }

    private let kpiCols = [GridItem(.adaptive(minimum: 120), spacing: 12)]
    private let tileCols = [GridItem(.adaptive(minimum: 120), spacing: 12)]

    public var body: some View {
        ScrollView {
            if let store { content(store) }
            else { ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl) }
        }
        .background(theme.color.surface)
        .task {
            if store == nil { store = OperatorFloorStore(api: api, location: initialLocation) }
            await store?.loadLocations()
            if store?.loaded == false { await store?.load() }
        }
        .refreshable { await store?.load() }
        .sheet(item: $selected) { t in
            if let store { FloorTableSheet(table: t, store: store) }
        }
    }

    @ViewBuilder
    private func content(_ store: OperatorFloorStore) -> some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            if store.locations.count > 1 { locationPicker(store) }
            if let error = store.error, store.room == nil {
                ContentUnavailableView("Couldn't load the floor", systemImage: "table.furniture", description: Text(error))
                    .padding(.top, theme.space.xxl)
            } else if let room = store.room {
                if room.kitchen.tier != "calm" { bottleneckBanner(room.kitchen) }
                kpis(room.twin.summary)
                tablesByZone(room.twin.tables, store: store)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
            }
        }
        .padding(theme.space.lg)
    }

    private func locationPicker(_ store: OperatorFloorStore) -> some View {
        DSSegmented(Binding(
            get: { store.location },
            set: { slug in Task { await store.setLocation(slug) } }
        ), options: store.locations.map { (value: $0.slug, label: $0.city) })
    }

    private func bottleneckBanner(_ k: FloorKitchen) -> some View {
        HStack(spacing: theme.space.sm) {
            Image(systemName: "flame.fill").foregroundStyle(k.tier == "risk" ? theme.color.danger : theme.color.warning)
            Text("Kitchen \(k.tier == "risk" ? "overloaded" : "busy")\(k.label.map { " · \($0) \(k.util)%" } ?? "") — ease seating")
                .textRole(.caption).foregroundStyle(theme.color.textPrimary)
            Spacer()
        }
        .padding(theme.space.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background((k.tier == "risk" ? theme.dangerSoft : theme.warningSoft), in: RoundedRectangle(cornerRadius: theme.radius.md))
    }

    private func kpis(_ s: FloorTwinSummary) -> some View {
        LazyVGrid(columns: kpiCols, spacing: theme.space.md) {
            card("Occupancy", subtitle: "\(s.seated)/\(s.totalTables) seated", info: Self.occInfo) {
                HStack { Spacer()
                    OperatorGauge(fraction: min(1, s.occupancyPct / 100), centerValue: "\(Int(s.occupancyPct))%",
                                  centerLabel: "seated", tint: occTint(s.occupancyPct), diameter: 110)
                    Spacer() }
            }
            OperatorKPICard(label: "Covers seated", value: "\(coversSeated)", icon: "person.3.fill", tint: theme.color.accent)
            OperatorKPICard(label: "Freeing ≤15m", value: "\(s.freeingSoon15)", icon: "clock.arrow.circlepath", tint: theme.color.success, caption: "tables")
            OperatorKPICard(label: "Spend / hr", value: s.spendVelocityPerHourGrosze.map { MoneyText.format($0) } ?? "—",
                            icon: "banknote.fill", tint: theme.color.success, info: Self.spendInfo)
        }
    }
    // Covers currently seated — summed from the live table parties.
    private var coversSeated: Int { store?.room?.twin.tables.reduce(0) { $0 + ($1.occupied ? ($1.party ?? 0) : 0) } ?? 0 }

    private func tablesByZone(_ tables: [FloorTwinTable], store: OperatorFloorStore) -> some View {
        let zones = zoneGroups(tables)
        return VStack(alignment: .leading, spacing: theme.space.lg) {
            ForEach(zones, id: \.name) { z in
                VStack(alignment: .leading, spacing: theme.space.sm) {
                    DSSectionHeader(z.name, subtitle: "\(z.tables.filter(\.occupied).count)/\(z.tables.count) seated")
                    LazyVGrid(columns: tileCols, spacing: theme.space.md) {
                        ForEach(z.tables) { t in tableTile(t, store: store) }
                    }
                }
            }
        }
    }

    private func tableTile(_ t: FloorTwinTable, store: OperatorFloorStore) -> some View {
        let tint = statusTint(t.status, occupied: t.occupied)
        return Button { selected = t } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(t.number).font(.headline).foregroundStyle(theme.color.textPrimary)
                    Spacer()
                    Image(systemName: "person.2").font(.caption2).foregroundStyle(theme.color.textSecondary)
                    Text("\(t.party ?? t.seats)").font(.caption.weight(.bold)).monospacedDigit().foregroundStyle(theme.color.textSecondary)
                }
                Spacer(minLength: 4)
                Text(statusLabel(t)).textRole(.caption).fontWeight(.semibold).foregroundStyle(tint)
                if t.occupied {
                    if let open = t.openCheckGrosze, open > 0 {
                        MoneyText(open).font(.caption2).foregroundStyle(theme.color.textSecondary)
                    }
                } else if let free = t.predictedFreeInMin, free > 0 {
                    Text("~\(Int(free))m").font(.caption2).foregroundStyle(theme.color.textSecondary)
                }
            }
            .padding(theme.space.md)
            .frame(height: 92, alignment: .topLeading)
            .frame(maxWidth: .infinity)
            .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: theme.radius.lg))
            .overlay(RoundedRectangle(cornerRadius: theme.radius.lg).strokeBorder(tint.opacity(0.5), lineWidth: 1))
            .overlay(alignment: .topTrailing) {
                if store.busyTableId == t.id { ProgressView().controlSize(.mini).padding(6) }
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            if t.status == "out-of-service" {
            } else if t.occupied {
                Button { Task { await store.seat(t, seat: false) } } label: { Label("Clear table", systemImage: "arrow.uturn.backward") }
            } else {
                Button { Task { await store.seat(t, seat: true) } } label: { Label("Seat table", systemImage: "person.fill.checkmark") }
            }
        }
        .accessibilityLabel("Table \(t.number), \(statusLabel(t)), seats \(t.seats)")
    }

    // MARK: helpers

    private struct ZoneGroup { let name: String; let tables: [FloorTwinTable] }
    private func zoneGroups(_ tables: [FloorTwinTable]) -> [ZoneGroup] {
        let names = Array(Set(tables.map { $0.zone ?? "Main" })).sorted()
        return names.map { n in
            ZoneGroup(name: n, tables: tables.filter { ($0.zone ?? "Main") == n }
                .sorted { $0.number.localizedStandardCompare($1.number) == .orderedAscending })
        }
    }
    private func statusLabel(_ t: FloorTwinTable) -> String {
        switch t.status {
        case "seated": return t.elapsedMin.map { "Seated · \(Int($0))m" } ?? "Seated"
        case "reserved": return "Reserved"
        case "out-of-service": return "Out of service"
        default: return "Free"
        }
    }
    private func statusTint(_ status: String, occupied: Bool) -> Color {
        switch status {
        case "seated": return theme.color.accent
        case "reserved": return theme.color.warning
        case "out-of-service": return theme.color.textSecondary
        default: return theme.color.success
        }
    }
    private func occTint(_ pct: Double) -> Color {
        pct >= 90 ? theme.color.danger : (pct >= 70 ? theme.color.warning : theme.color.success)
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
}

/// Table detail — status, live state, and seat/clear. Pure projection of the
/// twin row (Rule #1).
private struct FloorTableSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let table: FloorTwinTable
    let store: OperatorFloorStore

    var body: some View {
        OperatorDetailSheet(
            leading: .icon("table.furniture"),
            title: "Table \(table.number)",
            badge: badge,
            meta: meta
        ) {
            OperatorStatBand(stats)
            if let notes = table.notes, !notes.isEmpty {
                DSCard {
                    VStack(alignment: .leading, spacing: theme.space.xs) {
                        Text("SERVICE NOTE").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
                        Text(notes).textRole(.callout).foregroundStyle(theme.color.textPrimary)
                    }
                }
            }
            if table.status != "out-of-service" {
                DSButton(table.occupied ? "Clear table" : "Seat table") {
                    Task { await store.seat(table, seat: !table.occupied); dismiss() }
                }
            }
        }
    }

    private var badge: (String, DSBadge.Tone)? {
        switch table.status {
        case "seated": return ("Seated", .accent)
        case "reserved": return ("Reserved", .warning)
        case "out-of-service": return ("Out of service", .neutral)
        default: return ("Free", .success)
        }
    }
    private var stats: [OperatorStatTile] {
        var t: [OperatorStatTile] = [OperatorStatTile("Seats", "\(table.seats)")]
        if let p = table.party { t.append(OperatorStatTile("Party", "\(p)")) }
        if let e = table.elapsedMin { t.append(OperatorStatTile("Seated", "\(Int(e))m")) }
        if let f = table.predictedFreeInMin, !table.occupied { t.append(OperatorStatTile("Frees in", "~\(Int(f))m")) }
        if let open = table.openCheckGrosze, open > 0 { t.append(OperatorStatTile("Open check", MoneyText.format(open))) }
        if let dwell = table.medianDwellMin { t.append(OperatorStatTile("Median turn", "\(Int(dwell))m")) }
        return Array(t.prefix(4))
    }
    private var meta: [OperatorMetaRow] {
        var m: [OperatorMetaRow] = []
        if let z = table.zone { m.append(OperatorMetaRow("mappin.and.ellipse", z)) }
        if table.turns > 0 { m.append(OperatorMetaRow("arrow.triangle.2.circlepath", "\(table.turns) turns today")) }
        return m
    }
}

/// Service — the native twin of web `/core/service`: a Floor plan + Slots hub.
public struct OperatorServiceView: View {
    @Environment(\.theme) private var theme
    @State private var tab: ServiceTab = .floor
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    enum ServiceTab: Hashable { case floor, slots, demand }

    public var body: some View {
        VStack(spacing: 0) {
            DSSegmented($tab, options: [(value: .floor, label: "Floor plan"),
                                        (value: .slots, label: "Slots"),
                                        (value: .demand, label: "Demand")])
                .padding(.horizontal, theme.space.lg).padding(.vertical, theme.space.sm)
                .background(theme.color.surface)
            Divider().overlay(theme.color.line)
            switch tab {
            case .floor: OperatorFloorView(api: api)
            case .slots: OperatorSlotsView(api: api)
            case .demand: OperatorDemandView(api: api)
            }
        }
        .background(theme.color.surface)
        .navigationTitle("Service")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Service · Demand Exchange

/// Demand Exchange — the native twin of web `/admin/demand-exchange` (Slots →
/// Demand). Forecast covers vs advertised + kitchen-throughput capacity per slot,
/// the yield tier and the recommended lever (raise / trim / protect / hold), with
/// per-slot Apply + an Apply-all autonomy lever. Real data off
/// `/api/v1/admin/demand-exchange` (Rule #1; capacities are server-derived).
@MainActor
@Observable
final class OperatorDemandStore {
    var location: String
    var board: DemandBoard?
    var locations: [Location] = []
    var loaded = false
    var error: String?
    var message: String?
    var busy = false
    private let api: APIClient
    init(api: APIClient, location: String) { self.api = api; self.location = location }

    func loadLocations() async { if locations.isEmpty { locations = (try? await api.send(.locations())) ?? [] } }
    func load() async {
        do { board = try await api.send(.adminDemandBoard(location: location)).board; error = nil }
        catch let e as APIError { if board == nil { error = OperatorListLoader<Int>.message(e) } }
        catch { if board == nil { error = "Something went wrong" } }
        loaded = true
    }
    func setLocation(_ slug: String) async { location = slug; board = nil; loaded = false; await load() }
    func applySlot(_ r: DemandSlotRow) async {
        busy = true
        _ = try? await api.send(.adminApplyDemandSlot(location: location, slotId: r.slotId,
                                                      maxOrders: r.recommendedMaxOrders,
                                                      minSpendGrosze: r.recommendedMinSpendGrosze > 0 ? r.recommendedMinSpendGrosze : nil))
        await load(); message = "Capacity applied"; busy = false
    }
    func applyAll() async {
        busy = true
        let res = try? await api.send(.adminApplyAllDemand(location: location))
        await load(); message = "Applied to \(res?.applied ?? 0) slots"; busy = false
    }
}

public struct OperatorDemandView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorDemandStore?
    private let api: APIClient
    private let initialLocation: String
    public init(api: APIClient, location: String = "krakow") { self.api = api; self.initialLocation = location }

    private let kpiCols = [GridItem(.adaptive(minimum: 120), spacing: 12)]

    public var body: some View {
        ScrollView {
            if let store { content(store) }
            else { ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl) }
        }
        .background(theme.color.surface)
        .task {
            if store == nil { store = OperatorDemandStore(api: api, location: initialLocation) }
            await store?.loadLocations()
            if store?.loaded == false { await store?.load() }
        }
        .refreshable { await store?.load() }
        .dsToast(Binding(get: { store?.message }, set: { store?.message = $0 }))
    }

    @ViewBuilder
    private func content(_ store: OperatorDemandStore) -> some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            if store.locations.count > 1 {
                DSSegmented(Binding(get: { store.location }, set: { s in Task { await store.setLocation(s) } }),
                            options: store.locations.map { (value: $0.slug, label: $0.city) })
            }
            if let error = store.error, store.board == nil {
                ContentUnavailableView("Couldn't load demand", systemImage: "chart.line.uptrend.xyaxis", description: Text(error))
                    .padding(.top, theme.space.xxl)
            } else if let board = store.board {
                kpis(board.summary)
                if needsApplyAll(board) {
                    Button { Task { await store.applyAll() } } label: {
                        Label("Apply all recommendations", systemImage: "wand.and.stars")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent).disabled(store.busy)
                }
                slotList(board, store: store)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
            }
        }
        .padding(theme.space.lg)
    }

    private func needsApplyAll(_ b: DemandBoard) -> Bool {
        b.slots.contains { $0.recommendedMaxOrders != $0.maxOrders || $0.recommendedMinSpendGrosze != $0.minSpendGrosze }
    }

    private func kpis(_ s: DemandSummary) -> some View {
        LazyVGrid(columns: kpiCols, spacing: theme.space.md) {
            OperatorKPICard(label: "Forecast covers", value: "\(s.predictedCovers)", icon: "person.3.sequence.fill", tint: theme.color.accent, info: Self.forecastInfo)
            OperatorKPICard(label: "Advertised cap", value: "\(s.advertisedCapacity)", icon: "gauge.with.dots.needle.50percent", tint: theme.color.textSecondary)
            card("Fill forecast", subtitle: "predicted ÷ advertised", info: Self.fillInfo) {
                HStack { Spacer()
                    OperatorGauge(fraction: min(1, s.fillForecastPct / 100), centerValue: "\(Int(s.fillForecastPct))%",
                                  centerLabel: "forecast", tint: fillTint(s.fillForecastPct), diameter: 110)
                    Spacer() }
            }
            OperatorKPICard(label: "Missed demand", value: "\(s.missedDemand)", icon: "person.fill.xmark",
                            tint: s.missedDemand > 0 ? theme.color.danger : theme.color.textSecondary, caption: "walked")
        }
    }

    private func slotList(_ board: DemandBoard, store: OperatorDemandStore) -> some View {
        card("Slots · \(board.date)", subtitle: "forecast vs capacity · recommended lever", info: Self.leverInfo) {
            if board.slots.isEmpty {
                Text("No slots for this day.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                VStack(spacing: theme.space.md) {
                    ForEach(board.slots) { r in slotRow(r, store: store) }
                }
            }
        }
    }

    private func slotRow(_ r: DemandSlotRow, store: OperatorDemandStore) -> some View {
        let changed = r.recommendedMaxOrders != r.maxOrders || r.recommendedMinSpendGrosze != r.minSpendGrosze
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(r.time).font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle(theme.color.textPrimary)
                tierBadge(r.tier)
                Spacer()
                Text("~\(r.predictedDemand) / \(r.maxOrders)").font(.subheadline.weight(.semibold)).monospacedDigit()
                    .foregroundStyle(theme.color.textPrimary)
            }
            OperatorProgressMeter(fraction: min(1, r.maxOrders > 0 ? Double(r.predictedDemand) / Double(r.maxOrders) : 0),
                                  tint: tierTint(r.tier), height: 7)
            Text(r.note).textRole(.caption).foregroundStyle(theme.color.textSecondary).fixedSize(horizontal: false, vertical: true)
            if changed {
                HStack {
                    Label(actionLabel(r.action), systemImage: actionIcon(r.action))
                        .textRole(.caption).fontWeight(.semibold).foregroundStyle(tierTint(r.tier))
                    Spacer()
                    Button { Task { await store.applySlot(r) } } label: {
                        Text("Set \(r.recommendedMaxOrders)\(r.recommendedMinSpendGrosze > 0 ? " · \(MoneyText.format(r.recommendedMinSpendGrosze)) min" : "")")
                            .font(.caption.weight(.semibold))
                    }
                    .buttonStyle(.bordered).controlSize(.small).disabled(store.busy)
                }
            }
        }
        .padding(theme.space.md)
        .background(theme.color.surface, in: RoundedRectangle(cornerRadius: theme.radius.md))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.md).strokeBorder(theme.color.line, lineWidth: 1))
    }

    // MARK: bits

    private func tierBadge(_ tier: String) -> some View {
        Text(tierLabel(tier)).font(.caption2.weight(.bold))
            .padding(.horizontal, 6).padding(.vertical, 1)
            .background(tierTint(tier).opacity(0.18), in: Capsule()).foregroundStyle(tierTint(tier))
    }
    private func tierLabel(_ t: String) -> String {
        switch t { case "kitchen-capped": "Kitchen-capped"; default: t.capitalized }
    }
    private func tierTint(_ t: String) -> Color {
        switch t {
        case "over": theme.color.danger
        case "tight": theme.color.warning
        case "under": theme.color.textSecondary
        case "kitchen-capped": theme.risk
        default: theme.color.success
        }
    }
    private func actionLabel(_ a: String) -> String {
        switch a { case "raise": "Raise capacity"; case "trim": "Trim / promote"; case "protect": "Protect kitchen"; default: "Hold" }
    }
    private func actionIcon(_ a: String) -> String {
        switch a { case "raise": "arrow.up.circle"; case "trim": "arrow.down.circle"; case "protect": "shield.fill"; default: "checkmark.circle" }
    }
    private func fillTint(_ pct: Double) -> Color {
        pct >= 90 ? theme.color.danger : (pct >= 70 ? theme.color.warning : (pct < 50 ? theme.color.textSecondary : theme.color.success))
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
}

private extension OperatorDemandView {
    static var forecastInfo: InfoButton {
        InfoButton(title: "Forecast covers",
            description: "Predicted covers across the day's slots, from same-weekday history + logged walked demand.",
            institutional: "Demand forecasting is the input that turns fixed capacity into yield — you can't price or staff to demand you haven't measured. Forecasting off real same-weekday history (not a guess) is what lets a chain pre-empt the rush instead of reacting to it.",
            plain: "If Saturday usually does ~180 covers and you've only opened capacity for 140, that gap is bookings you'll turn away — the board flags exactly which slots to open.",
            tips: "Open capacity into under-forecast slots, protect the kitchen on over-forecast ones, and log walked demand so the forecast keeps learning.",
            methodology: "Per-slot covers from same-weekday order history + demand signals. Source: /admin/demand-exchange.summary.predictedCovers.")
    }
    static var fillInfo: InfoButton {
        InfoButton(title: "Fill forecast",
            description: "Predicted covers as a share of advertised capacity. Amber past 70%, red past 90%.",
            institutional: "Forecast fill is the yield-management gate — it decides, before the day starts, whether to open more capacity (under) or raise price/protect the kitchen (over). It's the same revenue lever hotels and airlines run, applied to a dining room.",
            plain: "An 60% forecast means headroom to fill; a 95% forecast on a kitchen-capped day means raise the minimum spend, not the cover count.",
            tips: "Push promotions into low-fill slots, raise min-spend on capped high-fill slots, and use Apply-all to right-size every slot at once.",
            methodology: "predicted ÷ advertised capacity. Source: /admin/demand-exchange.summary.fillForecastPct.")
    }
    static var leverInfo: InfoButton {
        InfoButton(title: "Recommended lever",
            description: "Per slot: the yield tier (under / healthy / tight / over / kitchen-capped) and the prescribed action — raise capacity, trim/promote, protect the kitchen (cap + min-spend), or hold.",
            institutional: "Prescriptive yield is the institutional step beyond a dashboard — it doesn't just show the gap, it computes the capacity that closes it, and Apply-all executes the whole board server-side (audited). That's the autonomy lever a multi-site operator scales on.",
            plain: "An 'over' slot says raise from 20 to 28; a 'kitchen-capped' slot says hold the cover count but set a 60 zł minimum so fewer, bigger orders fit. Tap Set, or Apply-all to do every slot.",
            tips: "Trust the protect action on capped slots (raising volume there just makes tickets late); use raise on under-capacity demand; promote into 'under' slots rather than just trimming them.",
            methodology: "Tier from predicted vs advertised + kitchen-throughput capacity; recommendation from the shared buildDemandBoard engine. Source: /admin/demand-exchange.slots[].")
    }
}

private extension OperatorFloorView {
    static var occInfo: InfoButton {
        InfoButton(title: "Occupancy",
            description: "Share of tables currently seated.",
            institutional: "Occupancy is the room's utilisation rate — the floor analogue of slot fill. Too low is empty capacity you're paying rent + staff for; pinned at 100% with a queue means you're turning away covers or under-tabled. The art is high occupancy WITHOUT breaching the kitchen's pace.",
            plain: "12 of 16 tables seated is 75% — a healthy busy room with a little headroom. At 100% with people waiting, the bottleneck is either the kitchen or too few tables.",
            tips: "Watch the kitchen banner before seating into a full board; use the predicted-free times to quote accurate waits; turn tables faster by clearing promptly.",
            methodology: "seated ÷ total tables. Source: /admin/floor/twin.summary.occupancyPct.")
    }
    static var spendInfo: InfoButton {
        InfoButton(title: "Spend per hour",
            description: "Realised revenue per hour of occupied table-time across the room.",
            institutional: "Spend velocity is the floor's yield metric — revenue per seat-hour is how you compare a slow high-ticket room to a fast-turning one. It's the number that says whether to push turns or push ticket.",
            plain: "If occupied tables generate 600 zł/hr between them, seating a 2-top that lingers on coffees has a real opportunity cost vs a party ready to order.",
            tips: "Lift it by speeding the first-order and the check-drop, prompting a second round, and seating bigger parties into the right tables.",
            methodology: "Realised spend ÷ occupied table-hours. Source: /admin/floor/twin.summary.spendVelocityPerHourGrosze.")
    }
}
