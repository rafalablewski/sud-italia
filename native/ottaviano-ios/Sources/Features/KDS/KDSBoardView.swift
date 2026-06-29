import SwiftUI
import OttavianoKit

/// The kitchen display — web `/core/kds` parity on the operator skin. A live KPI
/// strip, station filter, a Floor mode (New / Firing / Ready lanes, or a single
/// focused lane) and a Chef make-queue mode, with a multi-entry recall tray and
/// a pause control. Live over SSE; large touch targets for the line
/// (DESIGN-SYSTEM §4.2 KDSTicket). iPad-first; lanes stack on iPhone.
public struct KDSBoardView: View {
    @Environment(\.theme) private var theme
    @State private var store: KDSStore
    /// Station filter (nil = all). Mirrors the web STATION_FILTERS; a ticket shows
    /// when it has any line for the focused station.
    @State private var station: String?
    /// Focused status lane (Floor mode): "all" or a column id. Web `lane` segment.
    @State private var lane: String = "all"
    /// Floor (lanes) vs Chef (single station make-queue). Web `view` tabs (Fleet
    /// is owner-only + needs the fleet facade — tracked as a follow-up).
    @State private var mode: Mode = .floor

    private enum Mode: String, CaseIterable { case floor = "Floor", chef = "Chef" }

    // The three KDS columns, 1:1 with the web KDS_COLUMNS (kds-board.ts):
    // confirmed → preparing → ready.
    private let columns: [(id: String, label: String)] = [
        ("confirmed", "New"), ("preparing", "Firing"), ("ready", "Ready"),
    ]

    public init(store: KDSStore) {
        _store = State(initialValue: store)
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                // Only the time-derived aggregates (oldest / avg / late) need the
                // coarse tick; the per-ticket countdowns live in each KDSTicket,
                // and the controls re-render off @Observable order changes.
                TimelineView(.periodic(from: .now, by: 2)) { ctx in
                    kpiStrip(now: ctx.date.timeIntervalSince1970 * 1000)
                }
                stationStrip
                if mode == .floor { laneSegment }
                if mode == .chef {
                    chefBody
                } else {
                    floorBody
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Kitchen")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Picker("View", selection: $mode) {
                    ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            ToolbarItem(placement: .topBarLeading) {
                Menu {
                    Button("All stations") { station = nil }
                    ForEach(stations, id: \.self) { s in Button(s.capitalized) { station = s } }
                } label: {
                    Label(station?.capitalized ?? "All stations", systemImage: "line.3.horizontal.decrease.circle")
                }
            }
            if !store.liveRecents.isEmpty {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        ForEach(store.liveRecents) { r in
                            Button { Task { await store.recall(r.id) } } label: {
                                Label("Recall \(r.label)", systemImage: "arrow.uturn.backward")
                            }
                        }
                    } label: {
                        Label("\(store.liveRecents.count)", systemImage: "arrow.uturn.backward")
                    }
                    .tint(theme.color.warning)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { store.togglePause() } label: {
                    Label(store.paused ? "Resume" : "Pause",
                          systemImage: store.paused ? "play.fill" : "pause.fill")
                }
                .tint(store.paused ? theme.color.warning : theme.color.textSecondary)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Circle().fill(store.connected ? theme.color.success : theme.color.danger)
                    .frame(width: 10, height: 10)
                    .accessibilityLabel(store.connected ? "Live" : (store.paused ? "Paused" : "Reconnecting"))
            }
        }
        .task { store.start() }
        .onDisappear { store.stop() }
    }

    // MARK: KPI strip (web `core-kpi` — board-derived metrics)

    private func kpiStrip(now: Double) -> some View {
        let active = activeOrders
        let working = active.filter { $0.status != .ready }
        let ages = working.map { max(0, (now - $0.paidAtMs) / 1000) }
        let oldest = ages.max() ?? 0
        let avg = ages.isEmpty ? 0 : ages.reduce(0, +) / Double(ages.count)
        let risk = active.filter { $0.isAtRisk }.count
        let late = active.filter { $0.isLate(nowMs: now) }.count
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: theme.space.sm) {
                kpi("Open", "\(active.count)", theme.color.textPrimary)
                kpi("New", "\(laneOrders("confirmed").count)", theme.color.accent)
                kpi("Firing", "\(laneOrders("preparing").count)", theme.info)
                kpi("Ready", "\(laneOrders("ready").count)", theme.color.success)
                kpi("At risk", "\(risk)", risk > 0 ? theme.risk : theme.color.textSecondary)
                kpi("Late", "\(late)", late > 0 ? theme.color.danger : theme.color.textSecondary)
                kpi("Oldest", oldest > 0 ? KDSClock.clock(oldest) : "—",
                    oldest >= 600 ? theme.color.danger : theme.color.textPrimary)
                kpi("Avg age", avg > 0 ? KDSClock.clock(avg) : "—", theme.color.textPrimary)
            }
        }
    }

    private func kpi(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
            Text(value).textRole(.title).foregroundStyle(tint)
        }
        .padding(.horizontal, theme.space.md).padding(.vertical, theme.space.sm)
        .frame(minWidth: 72, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.md))
    }

    // MARK: station + lane controls

    private var stationStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: theme.space.sm) {
                stationChip("All stations", on: station == nil) { station = nil }
                ForEach(stations, id: \.self) { s in
                    stationChip(s.capitalized, on: station == s) { station = s }
                }
            }
        }
    }

    private func stationChip(_ label: String, on: Bool, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Text(label).textRole(.caption)
                .padding(.horizontal, theme.space.md).frame(minHeight: 32)
                .background(on ? theme.color.accent : theme.color.surface2, in: Capsule())
                .foregroundStyle(on ? theme.color.onAccent : theme.color.textPrimary)
        }
        .buttonStyle(.plain)
    }

    private var laneSegment: some View {
        Picker("Lane", selection: $lane) {
            Text("All \(activeOrders.count)").tag("all")
            ForEach(columns, id: \.id) { col in
                Text("\(col.label) \(laneOrders(col.id).count)").tag(col.id)
            }
        }
        .pickerStyle(.segmented)
    }

    // MARK: Floor

    @ViewBuilder
    private var floorBody: some View {
        if lane == "all" {
            HStack(alignment: .top, spacing: theme.space.lg) {
                ForEach(columns, id: \.id) { col in
                    laneColumn(col.label, laneOrders(col.id))
                }
            }
        } else {
            let label = columns.first { $0.id == lane }?.label ?? "Tickets"
            laneColumn(label, laneOrders(lane))
        }
    }

    private func laneColumn(_ title: String, _ orders: [Order]) -> some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            DSSectionHeader(title) {
                DSBadge("\(orders.count)", tone: orders.isEmpty ? .neutral : .accent)
            }
            if orders.isEmpty {
                DSEmptyState("All clear", systemImage: "checkmark.seal.fill")
                    .frame(maxWidth: .infinity)
            }
            ForEach(orders) { order in
                KDSTicket(order: order, station: station, bumpTitle: bumpLabel(order.status)) {
                    await store.bumpForward(order)
                }
                .equatable()
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    // MARK: Chef (station make-queue, oldest-first)

    private var chefBody: some View {
        // All active tickets touching the focused station, oldest-first — the
        // cook's pull order (web Chef view).
        let queue = activeOrders.sorted { $0.paidAtMs < $1.paidAtMs }
        let working = queue.filter { $0.status != .ready }
        let oldest = working.map { max(0, (Date().timeIntervalSince1970 * 1000 - $0.paidAtMs) / 1000) }.max() ?? 0
        return VStack(alignment: .leading, spacing: theme.space.md) {
            HStack(spacing: theme.space.lg) {
                chefStat("In queue", "\(queue.count)", theme.color.textPrimary)
                chefStat("Oldest", oldest > 0 ? KDSClock.clock(oldest) : "—",
                         oldest >= 480 ? theme.color.warning : theme.color.textPrimary)
                Text(station?.capitalized ?? "All stations")
                    .textRole(.caption).foregroundStyle(theme.color.textSecondary)
            }
            if queue.isEmpty {
                DSEmptyState("No active tickets", systemImage: "checkmark.seal.fill")
                    .frame(maxWidth: .infinity)
            }
            ForEach(queue) { order in
                KDSTicket(order: order, station: station, bumpTitle: bumpLabel(order.status)) {
                    await store.bumpForward(order)
                }
                .equatable()
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func chefStat(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
            Text(value).textRole(.bodyEmphasis).foregroundStyle(tint)
        }
    }

    // MARK: data helpers

    /// Stations present on the board right now, for the filter chips/menu.
    private var stations: [String] {
        var set = Set<String>()
        for o in store.orders { for l in o.items { if let c = l.category { set.insert(c) } } }
        return set.sorted()
    }

    /// Active tickets (any open status) after the station filter — the KPI /
    /// Chef working set (web `allTickets` post station filter).
    private var activeOrders: [Order] {
        store.orders.filter { o in
            switch o.status {
            case .pending, .confirmed, .preparing, .ready: return matchesStation(o)
            default: return false
            }
        }
    }

    /// Tickets for one status column, station-filtered. "confirmed" folds in
    /// pending (both are the New lane, mirroring KDSStore.incoming).
    private func laneOrders(_ id: String) -> [Order] {
        store.orders.filter { o in
            guard matchesStation(o) else { return false }
            switch id {
            case "confirmed": return o.status == .pending || o.status == .confirmed
            case "preparing": return o.status == .preparing
            case "ready": return o.status == .ready
            default: return false
            }
        }
    }

    private func matchesStation(_ o: Order) -> Bool {
        guard let station else { return true }
        return o.items.contains { $0.category == station }
    }

    // Web `BUMP_LABEL` (CoreKds.tsx) — the action the bump performs on each status.
    private func bumpLabel(_ s: OrderStatus) -> String? {
        switch s {
        case .pending, .confirmed: "Start firing"
        case .preparing: "Mark ready"
        case .ready: "Bump to pass"
        default: nil
        }
    }
}
