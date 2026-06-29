import SwiftUI
import OttavianoKit

/// Guest — the native twin of web `/core/guest`: a Loyalty + Guests (CRM) + Book
/// hub. Loyalty is the enrolment roster; Guests is the CRM with a full profile
/// (lifetime, points, consent, notes); Book is the slot+table booking console.
/// All real data off `/api/v1/admin/*` (Rule #1).
public struct OperatorGuestView: View {
    @Environment(\.theme) private var theme
    @State private var tab: GuestTab = .loyalty
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    enum GuestTab: Hashable { case loyalty, crm, book }

    public var body: some View {
        VStack(spacing: 0) {
            DSSegmented($tab, options: [(value: .loyalty, label: "Loyalty"),
                                        (value: .crm, label: "Guests"),
                                        (value: .book, label: "Book")])
                .padding(.horizontal, theme.space.lg).padding(.vertical, theme.space.sm)
                .background(theme.color.surface)
            Divider().overlay(theme.color.line)
            switch tab {
            case .loyalty: GuestLoyaltyTab(api: api)
            case .crm: GuestCRMTab(api: api)
            case .book: GuestBookTab(api: api)
            }
        }
        .background(theme.color.surface)
        .navigationTitle("Guest")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Guests (CRM)

/// CRM roster (reuses the OperatorListView substrate + Customer filters) whose
/// detail opens the rich profile with notes / points / consent writes.
struct GuestCRMTab: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    init(api: APIClient) { self.api = api }

    var body: some View {
        OperatorListView(
            title: "Guests",
            emptyText: "Guests appear here as orders come in.",
            loader: OperatorListLoader { try await api.send(.adminCustomers()) },
            header: { (items: [AdminCustomer]) in
                AnyView(HStack(spacing: theme.space.sm) {
                    OperatorStatChip("Guests", "\(items.count)", tint: theme.color.accent)
                    OperatorStatChip("VIPs", "\(items.filter { $0.totalSpentGrosze >= 50000 }.count)", tint: theme.color.warning)
                })
            },
            search: { "\($0.name ?? "") \($0.phone)" },
            detail: { c, reload in AnyView(CrmDetailSheet(phone: c.phone, fallbackName: c.name ?? c.phone, api: api, onChange: reload)) },
            filters: [
                OperatorFilter("VIP", systemImage: "star.fill") { $0.totalSpentGrosze >= 50000 },
                OperatorFilter("Members", systemImage: "gift.fill") { ($0.loyaltyPointsBalance + $0.manualPointsAdjust) > 0 },
                OperatorFilter("Lapsed", systemImage: "moon.zzz.fill") { ($0.lastOrderAt ?? "") < AnalyticsDates.window(for: .quarter).from },
            ],
            sorts: [
                OperatorSortOption("Top spend") { $0.totalSpentGrosze > $1.totalSpentGrosze },
                OperatorSortOption("Most orders") { $0.orderCount > $1.orderCount },
                OperatorSortOption("Name") { ($0.name ?? $0.phone).localizedCaseInsensitiveCompare($1.name ?? $1.phone) == .orderedAscending },
            ],
            row: { c in
                HStack(spacing: theme.space.sm) {
                    Avatar(name: c.name ?? c.phone)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.name ?? c.phone).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(c.orderCount) orders · \(c.phone)").font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer(minLength: theme.space.sm)
                    MoneyText(c.totalSpentGrosze).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                }
            }
        )
    }
}

@MainActor
@Observable
final class CrmDetailStore {
    var detail: CrmCustomerDetail?
    var loading = true
    var error: String?
    var busy = false
    let phone: String
    private let api: APIClient
    init(phone: String, api: APIClient) { self.phone = phone; self.api = api }

    func load() async {
        loading = detail == nil
        do { detail = try await api.send(.adminCustomerDetail(phone: phone)); error = nil }
        catch let e as APIError { if detail == nil { error = OperatorListLoader<Int>.message(e) } }
        catch { if detail == nil { self.error = "Something went wrong" } }
        loading = false
    }
    func addNote(_ text: String) async { busy = true; _ = try? await api.send(.adminAddCustomerNote(phone: phone, text: text)); await load(); busy = false }
    func deleteNote(_ id: String) async { _ = try? await api.send(.adminDeleteCustomerNote(phone: phone, id: id)); await load() }
    func adjustPoints(_ delta: Int, reason: String?) async { busy = true; _ = try? await api.send(.adminAdjustPoints(phone: phone, delta: delta, reason: reason)); await load(); busy = false }
    func setConsent(sms: Bool? = nil, email: Bool? = nil) async { _ = try? await api.send(.adminSetConsent(phone: phone, smsOptIn: sms, emailOptIn: email)); await load() }
}

/// The rich guest profile — lifetime + cadence, recent orders, points adjust,
/// consent toggles, and notes (add/delete). Writes go through the new
/// `/api/v1/admin/customers/:phone/*` facade.
struct CrmDetailSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var store: CrmDetailStore
    @State private var noteText = ""
    @State private var showPoints = false
    @State private var pointsText = ""
    private let fallbackName: String
    private let onChange: () async -> Void

    init(phone: String, fallbackName: String, api: APIClient, onChange: @escaping () async -> Void) {
        _store = State(initialValue: CrmDetailStore(phone: phone, api: api))
        self.fallbackName = fallbackName
        self.onChange = onChange
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: theme.space.lg) {
                    if let error = store.error, store.detail == nil {
                        ContentUnavailableView("Couldn't load guest", systemImage: "person.crop.circle.badge.exclamationmark", description: Text(error))
                    } else if let d = store.detail {
                        totals(d)
                        pointsCard(d)
                        consentCard(d)
                        notesCard(d)
                        ordersCard(d)
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
                    }
                }
                .padding(theme.space.lg)
            }
            .background(theme.color.surface)
            .navigationTitle(store.detail?.name ?? fallbackName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            .task { await store.load() }
            .presentationDetents([.large])
            .alert("Adjust points", isPresented: $showPoints) {
                TextField("Delta (e.g. 100 or -50)", text: $pointsText).keyboardType(.numbersAndPunctuation)
                Button("Apply") {
                    if let delta = Int(pointsText.trimmingCharacters(in: .whitespaces)), delta != 0 {
                        Task { await store.adjustPoints(delta, reason: "Operator adjustment"); await onChange() }
                    }
                    pointsText = ""
                }
                Button("Cancel", role: .cancel) { pointsText = "" }
            } message: { Text("Add or remove loyalty points for this guest.") }
        }
    }

    private func totals(_ d: CrmCustomerDetail) -> some View {
        OperatorStatBand([
            OperatorStatTile("Lifetime", MoneyText.format(d.totals.totalSpent)),
            OperatorStatTile("Orders", "\(d.totals.orderCount)"),
            OperatorStatTile("Avg ticket", MoneyText.format(d.totals.avgOrderValue)),
            OperatorStatTile("Points", "\(d.totals.spendablePoints)", sub: "redeemable", subTone: theme.color.accent),
        ])
    }

    private func pointsCard(_ d: CrmCustomerDetail) -> some View {
        card("Loyalty points") {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(d.totals.spendablePoints) pts").font(.title3.weight(.bold)).monospacedDigit().foregroundStyle(theme.color.textPrimary)
                    Text("earned \(d.totals.earnedPoints) · manual \(d.totals.manualPoints) · redeemed \(d.totals.redeemedPoints)")
                        .textRole(.caption).foregroundStyle(theme.color.textSecondary)
                }
                Spacer()
                Button { pointsText = ""; showPoints = true } label: {
                    Label("Adjust", systemImage: "plus.forwardslash.minus")
                }.buttonStyle(.bordered).controlSize(.small).disabled(store.busy)
            }
        }
    }

    private func consentCard(_ d: CrmCustomerDetail) -> some View {
        // Consent reflects the live rollup (smsOptIn/emailOptIn from the detail);
        // toggling persists via /consent and reloads so the state stays true.
        card("Marketing consent") {
            VStack(spacing: theme.space.sm) {
                Toggle("SMS", isOn: Binding(
                    get: { store.detail?.smsOptIn ?? true },
                    set: { v in Task { await store.setConsent(sms: v); await onChange() } }))
                Toggle("Email", isOn: Binding(
                    get: { store.detail?.emailOptIn ?? true },
                    set: { v in Task { await store.setConsent(email: v); await onChange() } }))
            }
            .tint(theme.color.accent)
        }
    }

    private func notesCard(_ d: CrmCustomerDetail) -> some View {
        card("Notes") {
            VStack(alignment: .leading, spacing: theme.space.sm) {
                HStack {
                    TextField("Add a note", text: $noteText, axis: .vertical).textFieldStyle(.roundedBorder)
                    Button("Add") {
                        let t = noteText.trimmingCharacters(in: .whitespaces)
                        if !t.isEmpty { Task { await store.addNote(t); noteText = "" } }
                    }.buttonStyle(.borderedProminent).disabled(noteText.trimmingCharacters(in: .whitespaces).isEmpty || store.busy)
                }
                if d.notes.isEmpty {
                    Text("No notes yet.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                }
                ForEach(d.notes) { n in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(n.body).textRole(.callout).foregroundStyle(theme.color.textPrimary)
                            Text("\(n.authoredBy ?? "—") · \(n.createdAt.prefix(10))").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                        }
                        Spacer()
                        Button(role: .destructive) { Task { await store.deleteNote(n.id) } } label: { Image(systemName: "trash").font(.caption) }
                            .buttonStyle(.plain).foregroundStyle(theme.color.danger)
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private func ordersCard(_ d: CrmCustomerDetail) -> some View {
        card("Recent orders") {
            if d.orders.isEmpty {
                Text("No orders in your locations.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                VStack(spacing: theme.space.sm) {
                    ForEach(d.orders.prefix(10)) { o in
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("\(o.createdAt.prefix(10)) · \(o.locationSlug.capitalized)").font(.subheadline).foregroundStyle(theme.color.textPrimary)
                                Text("\(o.itemCount) items · \(o.fulfillmentType)").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                            }
                            Spacer()
                            MoneyText(o.totalAmount).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        }
                    }
                }
            }
        }
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            Text(title.uppercased()).textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
            content()
        }
        .padding(theme.space.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg).strokeBorder(theme.color.line, lineWidth: 1))
    }
}

// MARK: - Book (slot + table booking console)

@MainActor
@Observable
final class GuestBookStore {
    var location = "krakow"
    var locations: [Location] = []
    var slots: [AdminSlot] = []
    var tables: [FloorTable] = []
    var reservations: [Reservation] = []
    var loaded = false
    var message: String?
    private let api: APIClient
    init(api: APIClient) { self.api = api }

    /// Dine-in, active slots only — the bookable windows.
    var bookable: [AdminSlot] {
        slots.filter { $0.status == "active" && $0.fulfillmentTypes.contains { $0.contains("dine") } }
            .sorted { ($0.date, $0.time) < ($1.date, $1.time) }
    }
    func loadLocations() async { if locations.isEmpty { locations = (try? await api.send(.locations())) ?? [] } }
    func load() async {
        async let s = api.send(.adminSlots(location: location))
        async let t = api.send(.adminFloorTables(location: location))
        async let r = api.send(.adminReservations(location: location, date: nil))
        slots = (try? await s) ?? []
        tables = (try? await t) ?? []
        reservations = ((try? await r) ?? []).filter { $0.status == "booked" || $0.status == "seated" }
        loaded = true
    }
    func setLocation(_ slug: String) async { location = slug; loaded = false; await load() }
    func book(_ b: BookingBody) async {
        do { _ = try await api.send(.adminCreateBooking(b)); message = "Booked"; await load() }
        catch let e as APIError { message = OperatorListLoader<Int>.message(e) }
        catch { self.message = "Couldn't book" }
    }
    func cancel(_ id: String) async { _ = try? await api.send(.adminCancelReservation(id: id, location: location)); await load() }
}

struct GuestBookTab: View {
    @Environment(\.theme) private var theme
    @State private var store: GuestBookStore
    @State private var slotId = ""
    @State private var tableId = ""
    @State private var party = 2
    @State private var name = ""
    @State private var phone = ""
    @State private var forceOverride = false
    private let api: APIClient
    init(api: APIClient) { self.api = api; _store = State(initialValue: GuestBookStore(api: api)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if store.locations.count > 1 {
                    DSSegmented(Binding(get: { store.location }, set: { s in Task<Void, Never> { await store.setLocation(s) } }),
                                options: store.locations.map { (value: $0.slug, label: $0.city) })
                }
                bookingForm
                reservationsCard
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .task { await store.loadLocations(); if !store.loaded { await store.load() } }
        .refreshable { await store.load() }
        .dsToast(Binding(get: { store.message }, set: { store.message = $0 }))
    }

    private var fittingTables: [FloorTable] {
        store.tables.filter { $0.seats >= party && $0.status != "out-of-service" }
            .sorted { $0.seats < $1.seats }
    }

    private var bookingForm: some View {
        card("New booking") {
            VStack(alignment: .leading, spacing: theme.space.md) {
                if store.bookable.isEmpty {
                    Text("No dine-in slots open — add slots under Service.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                }
                Picker("Slot", selection: $slotId) {
                    Text("Pick a slot").tag("")
                    ForEach(store.bookable) { s in Text("\(s.date.suffix(5)) \(s.time) · \(s.currentOrders)/\(s.maxOrders)").tag(s.id) }
                }
                Stepper("Party: \(party)", value: $party, in: 1...50)
                Picker("Table", selection: $tableId) {
                    Text("Best fit").tag("")
                    ForEach(fittingTables) { t in Text("Table \(t.number) · \(t.seats) seats\(t.zone.map { " · \($0)" } ?? "")").tag(t.id) }
                }
                TextField("Guest name", text: $name).textFieldStyle(.roundedBorder).textContentType(.name)
                TextField("Phone (optional)", text: $phone).textFieldStyle(.roundedBorder).keyboardType(.phonePad)
                Toggle("Override conflicts", isOn: $forceOverride).tint(theme.color.accent)
                DSButton("Book table") {
                    let chosenTable = tableId.isEmpty ? fittingTables.first?.id : tableId
                    guard !slotId.isEmpty, let table = chosenTable else { store.message = "Pick a slot and a table"; return }
                    Task {
                        await store.book(BookingBody(
                            locationSlug: store.location, slotId: slotId, tableId: table,
                            customerName: name, customerPhone: phone.isEmpty ? nil : phone,
                            partySize: party, forceOverride: forceOverride))
                        if store.message == "Booked" { name = ""; phone = ""; slotId = ""; tableId = "" }
                    }
                }
                .disabled(slotId.isEmpty || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private var reservationsCard: some View {
        card("Upcoming bookings") {
            if store.reservations.isEmpty {
                Text("No bookings yet.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                VStack(spacing: theme.space.sm) {
                    ForEach(store.reservations.sorted { ($0.date, $0.time) < ($1.date, $1.time) }) { r in
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("\(r.customerName) · \(r.partySize)p").font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                                Text("\(r.date.suffix(5)) \(r.time)\(r.tableId != nil ? " · seated" : "")").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                            }
                            Spacer()
                            Button(role: .destructive) { Task { await store.cancel(r.id) } } label: { Image(systemName: "xmark.circle") }
                                .buttonStyle(.plain).foregroundStyle(theme.color.danger)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            Text(title.uppercased()).textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
            content()
        }
        .padding(theme.space.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg).strokeBorder(theme.color.line, lineWidth: 1))
    }
}
