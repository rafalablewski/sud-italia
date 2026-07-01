import SwiftUI
import OttavianoKit

/// The kitchen display — web `/core/kds` parity on the operator skin. A live KPI
/// strip, station filter, a Floor mode (New / Firing / Ready lanes, or a single
/// focused lane) and a Chef make-queue mode, with a multi-entry recall tray and
/// a pause control. Live over SSE; large touch targets for the line
/// (DESIGN-SYSTEM §4.2 KDSTicket). iPad-first; lanes stack on iPhone.
public struct KDSBoardView: View {
    @Environment(\.theme) private var theme
    /// iOS clears `isIdleTimerDisabled` when the app backgrounds; we re-apply
    /// keep-awake on return so a kiosk board doesn't silently start sleeping.
    @Environment(\.scenePhase) private var scenePhase
    @State private var store: KDSStore
    /// Station filter (nil = all). Mirrors the web STATION_FILTERS; a ticket shows
    /// when it has any line for the focused station.
    @State private var station: String?
    /// Focused status lane (Floor mode): "all" or a column id. Web `lane` segment.
    @State private var lane: String = "all"
    /// Floor (lanes) · Chef (station make-queue) · Fleet (owner Atlas). Web `view`
    /// tabs — Fleet is owner-only, off `GET /api/v1/admin/kds/fleet`.
    @State private var mode: Mode
    /// Owner fleet store — polls the Atlas feed while the Fleet tab is on screen.
    @State private var fleet: KDSFleetStore
    /// Operator role — gates the Fleet tab (owner) + the floor-ops KPIs (manager+),
    /// the same role gate the web KDS applies via /api/admin/me.
    private let role: OperatorRole
    /// API client — for the manager 86 sheet (per-location availability).
    private let api: APIClient
    /// 86 (eighty-six) item-availability sheet.
    @State private var eightySixOpen = false
    /// New-ticket chime toggle (web KDS sound control). On by default for the line.
    @State private var soundOn = true
    /// Kiosk mode — hides all chrome + keeps the screen awake for a wall-mounted
    /// line iPad. The web KDS has a fullscreen kiosk; this is its native twin.
    @State private var kiosk = false
    /// New-lane ticket ids last seen, so we chime only on genuinely fresh tickets
    /// (not on the initial board load, nor on bumps that leave the New lane).
    @State private var chimeArmed = false

    private enum Mode: String, CaseIterable { case floor = "Floor", chef = "Chef", fleet = "Fleet" }

    // The three KDS columns, 1:1 with the web KDS_COLUMNS (kds-board.ts):
    // confirmed → preparing → ready.
    private let columns: [(id: String, label: String)] = [
        ("confirmed", "New"), ("preparing", "Firing"), ("ready", "Ready"),
    ]

    public init(store: KDSStore, api: APIClient, role: OperatorRole = .kitchen) {
        _store = State(initialValue: store)
        _fleet = State(initialValue: KDSFleetStore(api: api))
        self.role = role
        self.api = api
        // Owners land on the cross-truck Atlas by default (web parity); the line
        // roles stay on the floor.
        _mode = State(initialValue: role == .owner ? .fleet : .floor)
    }

    /// View modes available to this role — Fleet is owner-only.
    private var modes: [Mode] { role == .owner ? Mode.allCases : [.floor, .chef] }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if mode == .fleet {
                    fleetBody
                } else {
                    // Only the time-derived aggregates (oldest / avg / late) need
                    // the coarse tick; the per-ticket countdowns live in each
                    // KDSTicket, and the controls re-render off @Observable changes.
                    TimelineView(.periodic(from: .now, by: 2)) { ctx in
                        let now = ctx.date.timeIntervalSince1970 * 1000
                        VStack(alignment: .leading, spacing: theme.space.sm) {
                            kpiStrip(now: now)
                            pressureBanner(now: now)
                        }
                    }
                    stationStrip
                    if mode == .floor { laneSegment }
                    if mode == .chef { chefBody } else { floorBody }
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Kitchen")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Picker("View", selection: $mode) {
                    ForEach(modes, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            if mode != .fleet {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button("All stations") { station = nil }
                        ForEach(stations, id: \.self) { s in Button(s.capitalized) { station = s } }
                    } label: {
                        Label(station?.capitalized ?? "All stations", systemImage: "line.3.horizontal.decrease.circle")
                    }
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
            if mode != .fleet && role.rank >= OperatorRole.manager.rank {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { eightySixOpen = true } label: {
                        Label("86 an item", systemImage: "nosign")
                    }
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
                Button { soundOn.toggle() } label: {
                    Label(soundOn ? "Sound on" : "Muted",
                          systemImage: soundOn ? "speaker.wave.2.fill" : "speaker.slash.fill")
                }
                .tint(soundOn ? theme.color.success : theme.color.textSecondary)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { setKiosk(true) } label: { Label("Kiosk", systemImage: "rectangle.inset.filled") }
                    .accessibilityLabel("Enter kiosk mode")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Circle().fill(store.connected ? theme.color.success : theme.color.danger)
                    .frame(width: 10, height: 10)
                    .accessibilityLabel(store.connected ? "Live" : (store.paused ? "Paused" : "Reconnecting"))
            }
        }
        // Kiosk chrome: hide the bar + status bar + home indicator, full-bleed board.
        .toolbar(kiosk ? .hidden : .automatic, for: .navigationBar)
        .statusBarHidden(kiosk)
        .persistentSystemOverlays(kiosk ? .hidden : .automatic)
        .navigationBarBackButtonHidden(kiosk)
        .overlay(alignment: .topTrailing) { if kiosk { kioskExit } }
        // Re-assert keep-awake on foreground — iOS resets the idle timer when the
        // app backgrounds, so a board still in kiosk would otherwise dim + sleep.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { KioskMode.keepAwake(kiosk) }
        }
        // Ring the chime when a genuinely new ticket lands (web KDS sound parity),
        // unless the operator muted it or the board is paused. `chimeArmed` skips
        // the initial board population so opening the screen isn't a burst of dings.
        .onChange(of: incomingTicketIDs) { old, new in
            if chimeArmed, soundOn, !store.paused, !new.subtracting(old).isEmpty {
                KDSChime.newTicket()
            }
            chimeArmed = true
        }
        .task { store.start() }
        // Floor-ops KPIs (Done/hr + On-shift) — manager+ only; refresh every 15s
        // like the web header. A kitchen/staff token 403s and the cells stay off.
        .task(id: role) {
            guard role.rank >= OperatorRole.manager.rank else { return }
            while !Task.isCancelled {
                await store.loadFloorOps()
                try? await Task.sleep(for: .seconds(15))
            }
        }
        // Poll the Atlas feed only while the Fleet tab is on screen.
        .onChange(of: mode, initial: true) { _, m in
            if m == .fleet { fleet.start() } else { fleet.stop() }
        }
        .onDisappear { store.stop(); fleet.stop(); KioskMode.keepAwake(false) }
        .sheet(isPresented: $eightySixOpen) { EightySixSheet(api: api) }
    }

    /// Enter/leave kiosk mode, toggling the keep-awake side effect with it.
    private func setKiosk(_ on: Bool) {
        kiosk = on
        KioskMode.keepAwake(on)
    }

    /// Floating exit affordance shown only in kiosk mode (the chrome is hidden).
    private var kioskExit: some View {
        Button { setKiosk(false) } label: {
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 30))
                .symbolRenderingMode(.palette)
                .foregroundStyle(theme.color.onAccent, theme.color.accent)
                .padding(theme.space.lg)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Exit kiosk mode")
    }

    /// Ids of every ticket currently in the New lane (pending/confirmed), ignoring
    /// the station filter — the chime should ring for any new ticket on the board.
    private var incomingTicketIDs: Set<String> {
        Set(store.orders.filter { $0.status == .pending || $0.status == .confirmed }.map(\.id))
    }

    // MARK: Fleet (owner Atlas)

    @ViewBuilder
    private var fleetBody: some View {
        if let board = fleet.board {
            KDSFleetView(board: board)
        } else if let error = fleet.error {
            DSEmptyState("Fleet unavailable", systemImage: "exclamationmark.triangle", message: error)
                .frame(maxWidth: .infinity)
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(theme.space.xl)
        }
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
                // Manager-only floor-ops signals (nil for kitchen/staff tokens).
                if let fo = store.floorOps {
                    kpi("Done/hr", "\(fo.throughputLastHour)", theme.color.success)
                    kpi("On shift", "\(fo.onShift)", theme.color.textPrimary)
                }
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
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.md, style: .continuous))
    }

    // MARK: pressure badge (web `PressureBadge` — board-level line pressure)

    /// A single line-pressure banner derived from the LIVE board (Rule #1 — real
    /// late/at-risk counts + oldest age, nothing faked). Mirrors the web KDS
    /// pressure tier: calm shows nothing, busy paces the line, slammed says
    /// expedite. The server prediction block already tags at-risk/late per ticket;
    /// this rolls them up so the expo sees the room's state without counting cards.
    @ViewBuilder
    private func pressureBanner(now: Double) -> some View {
        let active = activeOrders
        let working = active.filter { $0.status != .ready }
        let late = active.filter { $0.isLate(nowMs: now) }.count
        let risk = active.filter { $0.isAtRisk }.count
        let oldest = working.map { max(0, (now - $0.paidAtMs) / 1000) }.max() ?? 0
        let tier = pressureTier(late: late, risk: risk, oldest: oldest)
        if tier != .calm {
            HStack(spacing: theme.space.sm) {
                Image(systemName: tier == .slammed ? "flame.fill" : "gauge.with.dots.needle.67percent")
                    .foregroundStyle(tier == .slammed ? theme.color.danger : theme.color.warning)
                Text(pressureText(tier: tier, late: late, oldest: oldest))
                    .textRole(.caption).fontWeight(.semibold).foregroundStyle(theme.color.textPrimary)
                Spacer()
            }
            .padding(theme.space.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background((tier == .slammed ? theme.dangerSoft : theme.warningSoft),
                        in: RoundedRectangle(cornerRadius: theme.radius.md, style: .continuous))
            .accessibilityElement(children: .combine)
        }
    }

    private enum PressureTier { case calm, busy, slammed }
    private func pressureTier(late: Int, risk: Int, oldest: Double) -> PressureTier {
        if late >= 3 || oldest >= 900 { return .slammed }
        if late >= 1 || risk >= 3 || oldest >= 600 { return .busy }
        return .calm
    }
    private func pressureText(tier: PressureTier, late: Int, oldest: Double) -> String {
        let oldestTxt = oldest > 0 ? " · oldest \(KDSClock.clock(oldest))" : ""
        switch tier {
        case .slammed: return "Kitchen slammed — \(late) late\(oldestTxt). Expedite the oldest first."
        case .busy: return "Kitchen under pressure — pace the line\(oldestTxt)."
        case .calm: return ""
        }
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
