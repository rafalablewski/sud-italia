import SwiftUI
import OttavianoKit

// Service · Book — the native twin of web `src/core/service/CoreBook.tsx`. The
// reservation console: a Timeline lens (table rows × 30-min ticks with status-
// toned blocks, a live "now" line and dimmed "done" history blocks), an Arrivals
// lens (host queue — running-late triage + upcoming with seat-early + seated),
// and a New-reservation deck (dine-in slot → table → guest). All data is real
// off the `/api/v1/admin/floor/*` facade (Rule #1); the seat / seat-early /
// no-show / complete transitions post to `admin/floor/reservations`.

@MainActor
@Observable
final class OperatorBookStore {
    var location = "krakow"
    var locations: [Location] = []
    var date: String = CoreDay.today()
    var slots: [AdminSlot] = []
    var tables: [FloorTable] = []
    var reservations: [Reservation] = []
    var loaded = false
    var error: String?
    var message: String?
    var busy = false
    private let api: APIClient
    init(api: APIClient) { self.api = api }

    func loadLocations() async { if locations.isEmpty { locations = (try? await api.send(.locations())) ?? [] } }

    func load() async {
        do {
            async let s = api.send(.adminSlots(location: location, date: date))
            async let t = api.send(.adminFloorTables(location: location))
            async let r = api.send(.adminReservations(location: location, date: date))
            slots = try await s; tables = try await t; reservations = try await r
            error = nil
        } catch let e as APIError {
            if reservations.isEmpty { error = OperatorListLoader<Reservation>.message(e) }
        } catch { if reservations.isEmpty { error = "Something went wrong" } }
        loaded = true
    }

    func setLocation(_ slug: String) async { location = slug; loaded = false; reservations = []; await load() }
    func setDate(_ iso: String) async { date = iso; await load() }

    /// Active dine-in slots for the day, sorted — the "when" chips on the deck.
    var dineInSlots: [AdminSlot] {
        slots.filter { $0.status == "active" && $0.fulfillmentTypes.contains { $0 == "dine-in" || $0 == "dine_in" } }
            .sorted { $0.time < $1.time }
    }

    /// Tables held at a given minute (reservation window + 15-min turnaround) —
    /// drives slot-chip capacity fill and the deck's "N free" per zone.
    func heldTableIds(atMin m: Int) -> Set<String> {
        var held = Set<String>()
        for r in reservations where r.status == "booked" || r.status == "seated" {
            let start = CoreDay.minutes(r.time)
            let end = start + r.durationMin + 15
            if m >= start && m < end {
                if let t = r.tableId { held.insert(t) }
                for j in r.joinedTableIds ?? [] { held.insert(j) }
            }
        }
        return held
    }

    func book(slotId: String, tableId: String, name: String, phone: String?, party: Int, notes: String?, override: Bool) async -> Bool {
        busy = true; defer { busy = false }
        let b = BookingBody(locationSlug: location, slotId: slotId, tableId: tableId, customerName: name,
                            customerPhone: phone?.isEmpty == false ? phone : nil, partySize: party,
                            notes: notes?.isEmpty == false ? notes : nil, forceOverride: override)
        do { _ = try await api.send(.adminCreateBooking(b)); message = "Booked \(name)"; await load(); return true }
        catch let e as APIError { message = OperatorListLoader<Reservation>.message(e); return false }
        catch { message = "Couldn't book"; return false }
    }

    func cancel(_ id: String) async {
        do { _ = try await api.send(.adminCancelReservation(id: id, location: location)); message = "Cancelled"; await load() }
        catch { message = "Couldn't cancel" }
    }

    private func transition(_ r: Reservation, to status: String, time: String? = nil, override: Bool = false) async {
        busy = true; defer { busy = false }
        let b = ReservationUpdateBody(from: r, status: status, time: time, forceOverride: override)
        do { _ = try await api.send(.adminUpdateReservation(location: location, b)); await load() }
        catch let e as APIError { message = OperatorListLoader<Reservation>.message(e) }
        catch { message = "Couldn't update" }
    }
    func seat(_ r: Reservation) async { await transition(r, to: "seated", override: true) }
    func seatEarly(_ r: Reservation) async { await transition(r, to: "seated", time: CoreDay.nowHM(), override: true) }
    func noShow(_ r: Reservation) async { await transition(r, to: "no-show") }
    func complete(_ r: Reservation) async { await transition(r, to: "completed") }
}

public struct OperatorBookView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorBookStore?
    @State private var lens: Lens = .timeline
    @State private var showDeck = false
    @State private var selected: Reservation?
    private let api: APIClient
    private let location: String
    public init(api: APIClient, location: String = "krakow") { self.api = api; self.location = location }

    enum Lens: Hashable { case timeline, arrivals }

    public var body: some View {
        Group {
            if let store {
                content(store)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(theme.color.surface)
        .task {
            if store == nil { store = OperatorBookStore(api: api); store?.location = location }
            await store?.loadLocations()
            if store?.loaded == false { await store?.load() }
        }
        .dsToast(Binding(get: { store?.message }, set: { store?.message = $0 }))
        .sheet(isPresented: $showDeck) { if let store { BookDeckSheet(store: store) } }
        .sheet(item: $selected) { r in if let store { ReservationActionSheet(store: store, res: r) } }
    }

    @ViewBuilder
    private func content(_ store: OperatorBookStore) -> some View {
        VStack(spacing: 0) {
            toolbar(store)
            Divider().overlay(theme.color.line)
            ScrollView {
                VStack(alignment: .leading, spacing: theme.space.lg) {
                    statStrip(store)
                    if let error = store.error, store.reservations.isEmpty {
                        ContentUnavailableView("Couldn't load bookings", systemImage: "calendar.badge.exclamationmark", description: Text(error))
                            .padding(.top, theme.space.xl)
                    } else {
                        switch lens {
                        case .timeline: TimelineBoard(store: store, tap: { selected = $0 })
                        case .arrivals: ArrivalsBoard(store: store)
                        }
                    }
                }
                .padding(theme.space.lg)
            }
            .refreshable { await store.load() }
        }
    }

    private func toolbar(_ store: OperatorBookStore) -> some View {
        VStack(spacing: theme.space.sm) {
            HStack {
                DSSegmented(Binding(get: { lens }, set: { lens = $0 }),
                            options: [(value: .timeline, label: "Timeline"), (value: .arrivals, label: "Arrivals")])
                    .frame(maxWidth: 260)
                Spacer()
                Button { showDeck = true } label: {
                    Label("New reservation", systemImage: "plus")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, theme.space.md).frame(height: 34)
                        .foregroundStyle(theme.color.onAccent)
                        .background(theme.color.accent, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            HStack {
                OperatorDateField(Binding(get: { store.date }, set: { d in Task { await store.setDate(d) } }),
                                  label: "Booking day", marked: Set(store.reservations.map(\.date)))
                Spacer()
                if store.locations.count > 1 {
                    Menu {
                        ForEach(store.locations) { loc in
                            Button(loc.city) { Task { await store.setLocation(loc.slug) } }
                        }
                    } label: {
                        Label(store.location.capitalized, systemImage: "mappin.and.ellipse")
                            .font(.caption.weight(.semibold)).foregroundStyle(theme.color.textSecondary)
                    }
                }
            }
        }
        .padding(.horizontal, theme.space.lg).padding(.vertical, theme.space.sm)
        .background(theme.color.surface)
    }

    // Dense-console stat strip — the figures the web `.core-statstrip` leads with.
    private func statStrip(_ store: OperatorBookStore) -> some View {
        let res = store.reservations
        let covers = res.filter { $0.status != "cancelled" && $0.status != "no-show" }.reduce(0) { $0 + $1.partySize }
        let seated = res.filter { $0.status == "seated" }.count
        let upcoming = res.filter { $0.status == "booked" }.count
        let noShows = res.filter { $0.status == "no-show" }.count
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 108), spacing: theme.space.md)], spacing: theme.space.md) {
            OperatorKPICard(label: "Tables", value: "\(store.tables.count)", icon: "table.furniture", tint: theme.color.accent,
                            caption: "\(store.tables.reduce(0) { $0 + $1.seats }) seats")
            OperatorKPICard(label: "Reservations", value: "\(res.count)", icon: "calendar", tint: theme.info,
                            caption: "\(store.dineInSlots.count) slots")
            OperatorKPICard(label: "Covers", value: "\(covers)", icon: "person.2.fill", tint: theme.color.textSecondary)
            OperatorKPICard(label: "Seated", value: "\(seated)", icon: "checkmark.circle.fill", tint: theme.color.success)
            OperatorKPICard(label: "Upcoming", value: "\(upcoming)", icon: "clock.fill", tint: theme.color.warning)
            OperatorKPICard(label: "No-shows", value: "\(noShows)", icon: "person.fill.xmark",
                            tint: noShows > 0 ? theme.color.danger : theme.color.textSecondary)
        }
    }
}

// MARK: - Timeline lens

private struct TimelineBoard: View {
    @Environment(\.theme) private var theme
    let store: OperatorBookStore
    let tap: (Reservation) -> Void

    private let openMin = 720, closeMin = 1380, tick = 30
    private let tickW: CGFloat = 54, lblW: CGFloat = 54, rowH: CGFloat = 44, headH: CGFloat = 26
    private var cols: Int { (closeMin - openMin) / tick }
    private var totalW: CGFloat { lblW + CGFloat(cols) * tickW }

    private var rows: [FloorTable] {
        store.tables.sorted { (Int($0.number) ?? Int.max, $0.number) < (Int($1.number) ?? Int.max, $1.number) }
    }
    private var isToday: Bool { store.date == CoreDay.today() }
    private var nowMin: Int { CoreDay.nowMinutes() }

    var body: some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            HStack(spacing: theme.space.md) {
                Text("Reservations timeline").font(.headline).foregroundStyle(theme.color.textPrimary)
                Spacer()
                legend
            }
            if rows.isEmpty {
                DSEmptyState("No tables", systemImage: "table.furniture", message: "Add tables on the web floor plan to see the booking timeline.")
            } else {
                ScrollView([.horizontal, .vertical]) {
                    VStack(spacing: 0) {
                        hours
                        ForEach(rows) { table in row(table) }
                    }
                    .frame(width: totalW, alignment: .leading)
                    .overlay(alignment: .topLeading) { nowLine }
                }
                .frame(maxHeight: 520)
                .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
            }
        }
    }

    private var legend: some View {
        HStack(spacing: theme.space.md) {
            swatch("Pending", theme.color.warning)
            swatch("Seated", theme.info)
            swatch("Done", theme.color.textSecondary)
        }
    }
    private func swatch(_ t: String, _ c: Color) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 2).fill(c).frame(width: 10, height: 10)
            Text(t).font(.caption2).foregroundStyle(theme.color.textSecondary)
        }
    }

    private var hours: some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: lblW, height: headH)
            ForEach(0..<cols, id: \.self) { i in
                let m = openMin + i * tick
                Text(m % 60 == 0 ? CoreDay.hm(m) : "")
                    .font(.caption2.monospaced())
                    .foregroundStyle(theme.color.textSecondary)
                    .frame(width: tickW, height: headH, alignment: .leading)
            }
        }
        .background(theme.color.surface)
    }

    private func row(_ table: FloorTable) -> some View {
        ZStack(alignment: .topLeading) {
            // gridlines
            HStack(spacing: 0) {
                Text(table.number).font(.caption.weight(.semibold)).monospacedDigit()
                    .foregroundStyle(theme.color.textPrimary)
                    .frame(width: lblW, height: rowH)
                    .background(theme.color.surface)
                ForEach(0..<cols, id: \.self) { i in
                    Rectangle().fill(.clear).frame(width: tickW, height: rowH)
                        .overlay(alignment: .leading) {
                            Rectangle().fill(theme.color.line.opacity((openMin + i * tick) % 60 == 0 ? 0.6 : 0.25))
                                .frame(width: 1)
                        }
                }
            }
            // blocks
            ForEach(blocks(table)) { blk in
                blockView(blk)
                    .frame(width: max(blk.widthTicks * tickW - 4, 26), height: rowH - 8)
                    .offset(x: lblW + blk.startTick * tickW + 2, y: 4)
                    .onTapGesture { tap(blk.res) }
            }
        }
        .frame(width: totalW, height: rowH)
        .overlay(alignment: .bottom) { Rectangle().fill(theme.color.line.opacity(0.4)).frame(height: 1) }
    }

    private struct Blk: Identifiable { let id: String; let res: Reservation; let startTick: CGFloat; let widthTicks: CGFloat }

    private func blocks(_ table: FloorTable) -> [Blk] {
        store.reservations
            .filter { $0.tableId == table.id && ["booked", "seated", "completed"].contains($0.status) }
            .compactMap { r in
                let start = CoreDay.minutes(r.time)
                guard start >= openMin - r.durationMin, start <= closeMin else { return nil }
                let startTick = max(0, CGFloat(start - openMin) / CGFloat(tick))
                let widthTicks = max(0.5, CGFloat(r.durationMin) / CGFloat(tick))
                return Blk(id: r.id, res: r, startTick: startTick, widthTicks: widthTicks)
            }
    }

    private func blockView(_ blk: Blk) -> some View {
        let r = blk.res
        let done = r.status == "completed"
        let tone: Color = done ? theme.color.textSecondary : (r.status == "seated" ? theme.info : theme.color.warning)
        return VStack(alignment: .leading, spacing: 1) {
            Text(r.customerName).font(.system(size: 10.5, weight: .semibold)).lineLimit(1)
                .foregroundStyle(done ? theme.color.textSecondary : theme.color.textPrimary)
            Text(context(r)).font(.system(size: 8.5)).lineLimit(1).foregroundStyle(tone)
        }
        .padding(.horizontal, 5).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(done ? theme.color.surface : tone.opacity(0.18),
                    in: RoundedRectangle(cornerRadius: theme.radius.sm, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.sm, style: .continuous)
            .strokeBorder(done ? theme.color.line : tone.opacity(0.55),
                          style: StrokeStyle(lineWidth: 1, dash: done ? [3, 2] : [])))
        .opacity(done ? 0.6 : 1)
    }

    private func context(_ r: Reservation) -> String {
        let spare = max(0, (store.tables.first { $0.id == r.tableId }?.seats ?? r.partySize) - r.partySize)
        switch r.status {
        case "seated": return "seated · party \(r.partySize)"
        case "completed": return "done · party \(r.partySize)"
        default: return "party \(r.partySize) · \(spare) spare"
        }
    }

    @ViewBuilder private var nowLine: some View {
        if isToday, nowMin >= openMin, nowMin <= closeMin {
            let x = lblW + CGFloat(nowMin - openMin) / CGFloat(tick) * tickW
            Rectangle().fill(theme.color.danger).frame(width: 2)
                .offset(x: x, y: headH)
                .allowsHitTesting(false)
        }
    }
}

// MARK: - Arrivals lens (host queue)

private struct ArrivalsBoard: View {
    @Environment(\.theme) private var theme
    let store: OperatorBookStore
    private var isToday: Bool { store.date == CoreDay.today() }
    private var nowMin: Int { CoreDay.nowMinutes() }

    private var expected: [Reservation] { store.reservations.filter { $0.status == "booked" }.sorted { $0.time < $1.time } }
    private var late: [Reservation] { isToday ? expected.filter { CoreDay.minutes($0.time) < nowMin } : [] }
    private var upcoming: [Reservation] {
        let lateIds = Set(late.map(\.id))
        return expected.filter { !lateIds.contains($0.id) }
    }
    private var seated: [Reservation] { store.reservations.filter { $0.status == "seated" }.sorted { $0.time < $1.time } }

    var body: some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            if !late.isEmpty {
                section("Running late", tint: theme.color.danger, icon: "clock.badge.exclamationmark") {
                    ForEach(late) { r in card(r, late: true) }
                }
            }
            section("Upcoming", tint: theme.color.warning, icon: "clock.fill") {
                if upcoming.isEmpty { DSEmptyState("Nobody expected", systemImage: "checkmark.circle", message: "No parties awaiting a table.") }
                else { ForEach(upcoming) { r in card(r, late: false) } }
            }
            section("Seated", tint: theme.color.success, icon: "person.2.fill") {
                if seated.isEmpty { Text("No parties seated yet.").font(.caption).foregroundStyle(theme.color.textSecondary) }
                else { ForEach(seated) { r in seatedCard(r) } }
            }
        }
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, tint: Color, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.caption).foregroundStyle(tint)
                Text(title).font(.subheadline.weight(.bold)).foregroundStyle(theme.color.textPrimary)
            }
            content()
        }
        .padding(theme.space.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func card(_ r: Reservation, late: Bool) -> some View {
        let early = isToday && CoreDay.minutes(r.time) > nowMin
        return VStack(alignment: .leading, spacing: theme.space.sm) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(r.customerName).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                    Text("\(r.time) · party of \(r.partySize)\(late ? " · \(nowMin - CoreDay.minutes(r.time))m late" : "")")
                        .font(.caption).foregroundStyle(late ? theme.color.danger : theme.color.textSecondary)
                }
                Spacer()
                if r.source == "walk-in" { pill("walk-in", theme.color.textSecondary) }
            }
            HStack(spacing: theme.space.sm) {
                if early {
                    actionBtn("Seat early", tint: theme.color.accent, prominent: true) { Task { await store.seatEarly(r) } }
                } else {
                    actionBtn("Seat", tint: theme.color.accent, prominent: true) { Task { await store.seat(r) } }
                }
                actionBtn("No-show", tint: theme.color.danger, prominent: false) { Task { await store.noShow(r) } }
            }
        }
        .padding(theme.space.md)
        .background(theme.color.surface, in: RoundedRectangle(cornerRadius: theme.radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.md, style: .continuous)
            .strokeBorder(late ? theme.color.danger.opacity(0.4) : theme.color.line, lineWidth: 1))
    }

    private func seatedCard(_ r: Reservation) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(r.customerName).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                Text("seated · party of \(r.partySize)").font(.caption).foregroundStyle(theme.color.textSecondary)
            }
            Spacer()
            actionBtn("Complete", tint: theme.color.success, prominent: false) { Task { await store.complete(r) } }
        }
        .padding(theme.space.md)
        .background(theme.color.surface, in: RoundedRectangle(cornerRadius: theme.radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.md, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func actionBtn(_ title: String, tint: Color, prominent: Bool, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Text(title).font(.caption.weight(.semibold))
                .padding(.horizontal, theme.space.md).frame(height: 32)
                .foregroundStyle(prominent ? theme.color.onAccent : tint)
                .background(prominent ? tint : tint.opacity(0.14), in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(store.busy)
    }
    private func pill(_ t: String, _ c: Color) -> some View {
        Text(t).font(.caption2.weight(.semibold)).padding(.horizontal, 6).padding(.vertical, 2)
            .background(c.opacity(0.16), in: Capsule()).foregroundStyle(c)
    }
}

// MARK: - Reservation action sheet (tap a timeline block)

private struct ReservationActionSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let store: OperatorBookStore
    let res: Reservation

    var body: some View {
        NavigationStack {
            List {
                Section {
                    row("Guest", res.customerName)
                    if let p = res.customerPhone, !p.isEmpty { row("Phone", p) }
                    row("Party", "\(res.partySize)")
                    row("Time", "\(res.time) · \(res.durationMin) min")
                    row("Status", res.status.capitalized)
                    if let n = res.notes, !n.isEmpty { row("Notes", n) }
                }
                Section {
                    if res.status == "booked" {
                        act("Seat now", "person.fill.checkmark", theme.color.success) { await store.seat(res) }
                        act("No-show", "person.fill.xmark", theme.color.danger) { await store.noShow(res) }
                    }
                    if res.status == "seated" {
                        act("Complete", "checkmark.circle.fill", theme.color.success) { await store.complete(res) }
                    }
                    if res.status != "completed" && res.status != "cancelled" {
                        Button(role: .destructive) { Task { await store.cancel(res.id); dismiss() } } label: {
                            Label("Cancel reservation", systemImage: "trash")
                        }
                    }
                }
            }
            .navigationTitle("Reservation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack { Text(k).foregroundStyle(theme.color.textSecondary); Spacer(); Text(v).foregroundStyle(theme.color.textPrimary) }
    }
    private func act(_ title: String, _ icon: String, _ tint: Color, _ run: @escaping () async -> Void) -> some View {
        Button { Task { await run(); dismiss() } } label: { Label(title, systemImage: icon).foregroundStyle(tint) }
            .disabled(store.busy)
    }
}

// MARK: - New-reservation deck

private struct BookDeckSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let store: OperatorBookStore
    @State private var slotId: String?
    @State private var party = 2
    @State private var name = ""
    @State private var phone = ""
    @State private var notes = ""
    @State private var tableId: String?
    @State private var override = false

    private var fitting: [FloorTable] {
        store.tables.sorted { (Int($0.number) ?? Int.max, $0.number) < (Int($1.number) ?? Int.max, $1.number) }
    }
    private var canBook: Bool { slotId != nil && tableId != nil && !name.trimmingCharacters(in: .whitespaces).isEmpty && party >= 1 && !store.busy }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: theme.space.lg) {
                    field("WHEN") {
                        if store.dineInSlots.isEmpty {
                            Text("No active dine-in slots for \(CoreDay.face(store.date)). Add one under Slots.")
                                .font(.caption).foregroundStyle(theme.color.textSecondary)
                        } else {
                            FlowChips(store.dineInSlots, selected: slotId) { s in
                                slotChip(s)
                            } tap: { slotId = slotId == $0.id ? nil : $0.id }
                        }
                    }
                    field("WHO") {
                        HStack {
                            Text("Party").font(.subheadline).foregroundStyle(theme.color.textPrimary)
                            Spacer()
                            DSStepper(value: $party, range: 1...20)
                        }
                        DSTextField("Guest name", text: $name, placeholder: "Name on the booking")
                        DSTextField("Phone (optional)", text: $phone, placeholder: "+48…", keyboard: .phonePad)
                        DSTextField("Notes (optional)", text: $notes, placeholder: "Allergies, occasion, seating…")
                    }
                    field("WHERE") {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: theme.space.sm)], spacing: theme.space.sm) {
                            ForEach(fitting) { t in tableCard(t) }
                        }
                    }
                    Toggle("Override conflicts & capacity", isOn: $override)
                        .font(.caption).tint(theme.color.accent)
                    DSButton(bookLabel) {
                        guard let slotId, let tableId else { return }
                        Task {
                            let ok = await store.book(slotId: slotId, tableId: tableId, name: name,
                                                      phone: phone, party: party, notes: notes, override: override)
                            if ok { dismiss() }
                        }
                    }
                    .disabled(!canBook)
                    .opacity(canBook ? 1 : 0.5)
                }
                .padding(theme.space.lg)
            }
            .background(theme.color.surface)
            .navigationTitle("New reservation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
        }
        .presentationDetents([.large])
    }

    private var bookLabel: String {
        guard let slotId, let sel = store.dineInSlots.first(where: { $0.id == slotId }) else { return "Book table" }
        let t = tableId.flatMap { id in store.tables.first { $0.id == id } }?.number
        return "Book · \(sel.time)\(t.map { " · T\($0)" } ?? "") · \(party)"
    }

    private func slotChip(_ s: AdminSlot) -> some View {
        let atMin = CoreDay.minutes(s.time)
        let held = store.heldTableIds(atMin: atMin).count
        let cap = max(store.tables.count, 1)
        let fill = Double(held) / Double(cap)
        let tint: Color = fill >= 1 ? theme.color.danger : (fill >= 0.85 ? theme.color.accent : (fill >= 0.6 ? theme.color.warning : theme.color.success))
        let on = slotId == s.id
        return VStack(spacing: 1) {
            Text(s.time).font(.caption.weight(.semibold)).monospacedDigit()
            Text("\(max(cap - held, 0))/\(cap)").font(.system(size: 8))
        }
        .padding(.horizontal, theme.space.sm).padding(.vertical, 5)
        .foregroundStyle(on ? theme.color.onAccent : tint)
        .background(on ? theme.color.accent : tint.opacity(0.16), in: RoundedRectangle(cornerRadius: theme.radius.sm, style: .continuous))
    }

    private func tableCard(_ t: FloorTable) -> some View {
        let oos = t.status == "out-of-service"
        let tooSmall = t.seats < party
        let disabled = oos || (tooSmall && !override)
        let on = tableId == t.id
        let tag = oos ? "out of service" : (tooSmall ? "too small" : "\(t.seats)-top")
        return Button {
            tableId = on ? nil : t.id
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text("T\(t.number)").font(.subheadline.weight(.bold)).foregroundStyle(on ? theme.color.onAccent : theme.color.textPrimary)
                Text(t.zone ?? "—").font(.caption2).foregroundStyle(on ? theme.color.onAccent.opacity(0.8) : theme.color.textSecondary).lineLimit(1)
                Text(tag).font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(on ? theme.color.onAccent : (disabled ? theme.color.danger : theme.color.success))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(theme.space.sm)
            .background(on ? theme.color.accent : theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.md, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: theme.radius.md, style: .continuous).strokeBorder(on ? .clear : theme.color.line, lineWidth: 1))
            .opacity(disabled ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }

    @ViewBuilder
    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text(label).font(.caption2.weight(.bold)).tracking(0.8).foregroundStyle(theme.color.textSecondary)
            content()
        }
        .padding(theme.space.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
    }
}

/// A simple wrapping chip row (avoids a hard dependency on iOS 16 Layout APIs).
private struct FlowChips<Item: Identifiable, Chip: View>: View {
    @Environment(\.theme) private var theme
    private let items: [Item]
    private let selected: String?
    private let chip: (Item) -> Chip
    private let tap: (Item) -> Void
    init(_ items: [Item], selected: String?, @ViewBuilder chip: @escaping (Item) -> Chip, tap: @escaping (Item) -> Void) {
        self.items = items; self.selected = selected; self.chip = chip; self.tap = tap
    }
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 62), spacing: theme.space.sm)], spacing: theme.space.sm) {
            ForEach(items) { item in
                Button { tap(item) } label: { chip(item) }.buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Service · Dispatch

@MainActor
@Observable
final class OperatorDispatchStore {
    var location = "krakow"
    var locations: [Location] = []
    var board: DispatchBoard?
    var loaded = false
    var error: String?
    var message: String?
    var busy = false
    private let api: APIClient
    init(api: APIClient) { self.api = api }

    func loadLocations() async { if locations.isEmpty { locations = (try? await api.send(.locations())) ?? [] } }
    func load() async {
        do { board = try await api.send(.adminDispatch(location: location)); error = nil }
        catch let e as APIError { if board == nil { error = OperatorListLoader<DispatchOrder>.message(e) } }
        catch { if board == nil { error = "Something went wrong" } }
        loaded = true
    }
    func setLocation(_ slug: String) async { location = slug; board = nil; loaded = false; await load() }

    func assign(_ orderId: String, driverId: String?) async {
        busy = true; defer { busy = false }
        do { _ = try await api.send(.adminDispatchAssign(orderId: orderId, driverId: driverId)); await load() }
        catch { message = "Couldn't assign" }
    }
    func advance(_ o: DispatchOrder) async {
        guard let next = Self.nextStatus(o) else { return }
        busy = true; defer { busy = false }
        do { _ = try await api.send(.adminDispatchAdvance(orderId: o.id, status: next)); await load() }
        catch { message = "Couldn't update" }
    }
    static func nextStatus(_ o: DispatchOrder) -> String? {
        if o.assignedDriverId == nil { return nil }
        if o.status == "picked_up" { return "delivered" }
        return "picked_up"
    }
}

public struct OperatorDispatchView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorDispatchStore?
    private let api: APIClient
    private let location: String
    public init(api: APIClient, location: String = "krakow") { self.api = api; self.location = location }

    public var body: some View {
        Group {
            if let store { content(store) } else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
        }
        .background(theme.color.surface)
        .task {
            if store == nil { store = OperatorDispatchStore(api: api); store?.location = location }
            await store?.loadLocations()
            if store?.loaded == false { await store?.load() }
        }
        .dsToast(Binding(get: { store?.message }, set: { store?.message = $0 }))
    }

    @ViewBuilder
    private func content(_ store: OperatorDispatchStore) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let error = store.error, store.board == nil {
                    ContentUnavailableView("Couldn't load dispatch", systemImage: "box.truck", description: Text(error))
                        .padding(.top, theme.space.xl)
                } else if let board = store.board {
                    stats(board)
                    if board.orders.isEmpty {
                        DSEmptyState("No deliveries in flight", systemImage: "box.truck", message: "Active delivery orders and their drivers appear here.")
                    } else {
                        ForEach(board.orders) { o in orderCard(o, board.drivers, store) }
                    }
                    driverRoster(board)
                }
            }
            .padding(theme.space.lg)
        }
        .refreshable { await store.load() }
    }

    private func stats(_ b: DispatchBoard) -> some View {
        let inKitchen = b.orders.filter { $0.status == "confirmed" || $0.status == "preparing" }.count
        let ready = b.orders.filter { ($0.status == "ready" || $0.status == "assigned") && $0.assignedDriverId == nil }.count
        let onRoad = b.orders.filter { $0.status == "picked_up" }.count
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 108), spacing: theme.space.md)], spacing: theme.space.md) {
            OperatorKPICard(label: "In kitchen", value: "\(inKitchen)", icon: "flame.fill", tint: theme.color.warning)
            OperatorKPICard(label: "Ready", value: "\(ready)", icon: "shippingbox.fill", tint: theme.info, caption: "awaiting driver")
            OperatorKPICard(label: "On road", value: "\(onRoad)", icon: "box.truck.fill", tint: theme.color.success)
            OperatorKPICard(label: "Drivers", value: "\(b.drivers.count)", icon: "person.2.fill", tint: theme.color.accent)
        }
    }

    private func orderCard(_ o: DispatchOrder, _ drivers: [DispatchDriver], _ store: OperatorDispatchStore) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            HStack {
                Text("#\(o.id.suffix(6))").font(.caption.monospaced().weight(.bold)).foregroundStyle(theme.color.textPrimary)
                statusPill(o.status)
                Spacer()
                MoneyText(o.totalGrosze).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
            }
            if let addr = o.deliveryAddress, !addr.isEmpty {
                Label(addr, systemImage: "mappin.circle.fill").font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(2)
            }
            Text(o.items.map { "\($0.quantity)× \($0.name)" }.joined(separator: ", "))
                .font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(2)
            if o.assignedDriverId == nil {
                Menu {
                    ForEach(drivers) { d in Button(d.name) { Task { await store.assign(o.id, driverId: d.id) } } }
                } label: {
                    Label("Assign driver", systemImage: "person.badge.plus")
                        .font(.caption.weight(.semibold)).foregroundStyle(theme.color.onAccent)
                        .padding(.horizontal, theme.space.md).frame(height: 32)
                        .background(theme.color.accent, in: Capsule())
                }
                .disabled(drivers.isEmpty || store.busy)
            } else {
                HStack(spacing: theme.space.sm) {
                    let driver = drivers.first { $0.id == o.assignedDriverId }?.name ?? "Driver"
                    Button { Task { await store.advance(o) } } label: {
                        Label("\(driver) · \(advanceLabel(o))", systemImage: "arrow.right.circle.fill")
                            .font(.caption.weight(.semibold)).foregroundStyle(theme.color.onAccent)
                            .padding(.horizontal, theme.space.md).frame(height: 32)
                            .background(theme.color.success, in: Capsule())
                    }
                    .disabled(store.busy)
                    Button { Task { await store.assign(o.id, driverId: nil) } } label: {
                        Image(systemName: "xmark.circle").foregroundStyle(theme.color.textSecondary)
                    }
                    .disabled(store.busy)
                }
            }
        }
        .padding(theme.space.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func advanceLabel(_ o: DispatchOrder) -> String { o.status == "picked_up" ? "delivered" : "picked up" }

    private func driverRoster(_ b: DispatchBoard) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text("Drivers").font(.headline).foregroundStyle(theme.color.textPrimary)
            if b.drivers.isEmpty {
                Text("No delivery drivers on shift. Add staff in the delivery role.").font(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                ForEach(b.drivers) { d in
                    let load = b.orders.filter { $0.assignedDriverId == d.id }.count
                    HStack {
                        Text(initials(d.name)).font(.caption.weight(.bold)).foregroundStyle(theme.color.onAccent)
                            .frame(width: 32, height: 32).background(theme.color.accent, in: Circle())
                        VStack(alignment: .leading, spacing: 1) {
                            Text(d.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                            Text(load > 0 ? "en route · \(load) order\(load == 1 ? "" : "s")" : "idle · at pass")
                                .font(.caption).foregroundStyle(theme.color.textSecondary)
                        }
                        Spacer()
                        Circle().fill(load > 0 ? theme.color.success : theme.color.textSecondary).frame(width: 8, height: 8)
                    }
                    .padding(theme.space.sm)
                    .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.md, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: theme.radius.md, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
                }
            }
        }
    }

    private func statusPill(_ s: String) -> some View {
        let tint: Color = s == "picked_up" ? theme.color.success : (s == "ready" || s == "assigned" ? theme.info : theme.color.warning)
        return Text(s.replacingOccurrences(of: "_", with: " ")).font(.caption2.weight(.bold))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(tint.opacity(0.16), in: Capsule()).foregroundStyle(tint)
    }
    private func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").prefix(2).compactMap { $0.first }
        return String(parts).uppercased()
    }
}
