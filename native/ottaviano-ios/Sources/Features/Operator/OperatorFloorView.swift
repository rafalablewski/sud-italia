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
    enum ServiceTab: Hashable { case floor, slots }

    public var body: some View {
        VStack(spacing: 0) {
            DSSegmented($tab, options: [(value: .floor, label: "Floor plan"), (value: .slots, label: "Slots")])
                .padding(.horizontal, theme.space.lg).padding(.vertical, theme.space.sm)
                .background(theme.color.surface)
            Divider().overlay(theme.color.line)
            switch tab {
            case .floor: OperatorFloorView(api: api)
            case .slots: OperatorSlotsView(api: api)
            }
        }
        .background(theme.color.surface)
        .navigationTitle("Service")
        .navigationBarTitleDisplayMode(.inline)
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
