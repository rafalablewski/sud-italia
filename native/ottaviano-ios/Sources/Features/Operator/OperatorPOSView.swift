import SwiftUI
import OttavianoKit

/// The POS till (/core/pos) — a counter-sale screen that mirrors the web POS:
/// tap items off the live menu into a ticket, then charge (server-priced,
/// immediate dine-in via `POST /api/v1/admin/pos/order`). The phone is captured
/// for the receipt / loyalty — a real number, never fabricated (Rule #1).
@MainActor
@Observable
public final class OperatorPOSStore {
    public enum State: Sendable { case loading, loaded([AdminMenuItem]), failed(String) }
    public private(set) var state: State = .loading
    /// Ticket: menu item id → quantity. The display item is looked up from `menu`.
    public private(set) var ticket: [String: Int] = [:]
    public private(set) var sending = false
    public let location: String
    private let api: APIClient
    private var menuById: [String: AdminMenuItem] = [:]

    public init(api: APIClient, location: String) { self.api = api; self.location = location }

    public func load() async {
        state = .loading
        do {
            let items = try await api.send(.adminMenu(location: location))
            menuById = Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })
            state = .loaded(items)
        } catch let e as APIError { state = .failed(OperatorListLoader<AdminMenuItem>.message(e)) }
        catch { state = .failed("Something went wrong") }
    }

    /// Cross-sell chips for the current ticket (the four-slot complete-your-meal
    /// panel), off /api/v1/admin/pos/suggestions. Refreshed when the ticket changes.
    public private(set) var suggestions: [PosSuggestion] = []

    public func add(_ item: AdminMenuItem) { ticket[item.id, default: 0] += 1 }
    public func add(byId id: String) { if let item = menuById[id] { add(item) } }
    public func remove(_ id: String) {
        guard let q = ticket[id] else { return }
        if q <= 1 { ticket[id] = nil } else { ticket[id] = q - 1 }
    }
    public func clear() { ticket.removeAll(); suggestions = []; currentTab = nil }
    /// Switch to counter-sale mode (no open check) without discarding the working
    /// ticket — the "Quick sale" path in the tab strip.
    public func deselectTab() { currentTab = nil }

    /// A stable signature of the ticket contents — drives the suggestions refresh.
    public var ticketSignature: String {
        ticket.map { "\($0.key):\($0.value)" }.sorted().joined(separator: ",")
    }

    public func refreshSuggestions() async {
        guard !ticket.isEmpty else { suggestions = []; return }
        suggestions = (try? await api.send(
            .posSuggestions(locationSlug: location, itemIds: Array(ticket.keys)))) ?? []
    }

    // ── Tabs (open checks) — several concurrent checks per till, persisted via
    //    /api/v1/admin/pos/tabs. A tab is loaded into the working ticket, edited
    //    with the normal add/remove, saved back, fired to the KDS (whole or
    //    course-by-course) and charged — all through the shared server actuator
    //    (@/lib/pos/fireTab), so prices/discounts/coursing resolve server-side.
    public private(set) var tabs: [PosTab] = []
    public private(set) var currentTab: PosTab?
    public var currentTabID: String? { currentTab?.id }
    public var currentTabName: String? { currentTab?.name }
    public var isCoursed: Bool { currentTab?.coursed ?? false }
    public var firedCourses: [String] { currentTab?.firedCourses ?? [] }

    /// Native twin of web `defaultCourseForCategory` — lines bucket by category.
    static func defaultCourse(_ category: String?) -> String {
        switch category {
        case "antipasti": return "starter"
        case "desserts": return "dessert"
        case "drinks": return "drink"
        default: return "main" // pizza / pasta / panini
        }
    }

    public func refreshTabs() async {
        tabs = (try? await api.send(.posTabs(location: location))) ?? []
        if let id = currentTab?.id { currentTab = tabs.first { $0.id == id } ?? currentTab }
    }
    public func openTab(name: String?) async {
        guard let tab = try? await api.send(.posTabOpen(location: location, name: name)) else { return }
        load(tab: tab)
        await refreshTabs()
    }
    /// Promote the current counter-sale ticket into a saved check — opens a tab and
    /// carries the in-progress items onto it (so a quick sale can become a tab).
    public func startCheckFromTicket(name: String?) async {
        let pending = ticket
        guard let tab = try? await api.send(.posTabOpen(location: location, name: name)) else { return }
        currentTab = tab
        ticket = pending
        await saveCurrentTab()
        await refreshTabs()
    }
    public func voidTab(_ id: String) async {
        _ = try? await api.send(.posTabVoid(id: id, location: location))
        if currentTabID == id { clear() }
        await refreshTabs()
    }
    /// Pull a saved check into the working ticket.
    public func load(tab: PosTab) {
        ticket = Dictionary(tab.items.map { ($0.menuItemId, $0.quantity) }, uniquingKeysWith: +)
        currentTab = tab
    }

    private func ticketLinesForSave(coursed: Bool) -> [PosTabSaveBody.Line] {
        ticket.map { id, qty in
            PosTabSaveBody.Line(menuItemId: id, quantity: qty,
                                course: coursed ? Self.defaultCourse(menuById[id]?.category) : nil)
        }
    }

    /// Persist the working ticket onto the current tab. Any non-nil attribute is
    /// written; the rest are omitted so the server preserves them. `discount`
    /// only writes when `discountProvided` (null clears, object sets) — matching
    /// the v1 tab PUT semantics.
    @discardableResult
    public func saveCurrentTab(
        coursed: Bool? = nil,
        channel: String? = nil,
        status: String? = nil,
        covers: Int? = nil,
        address: String? = nil,
        tableId: String? = nil,
        customerName: String? = nil,
        customerPhone: String? = nil,
        discount: PosTabDiscount? = nil,
        discountProvided: Bool = false
    ) async -> PosTab? {
        guard let id = currentTabID else { return nil }
        let effectiveCoursed = coursed ?? isCoursed
        let body = PosTabSaveBody(
            id: id, locationSlug: location,
            items: ticketLinesForSave(coursed: effectiveCoursed),
            channel: channel, status: status, tableId: tableId, covers: covers, address: address,
            customerName: customerName, customerPhone: customerPhone,
            coursed: effectiveCoursed, discount: discount, discountProvided: discountProvided
        )
        guard let saved = try? await api.send(.posTabSave(body)) else { return nil }
        currentTab = saved
        if let i = tabs.firstIndex(where: { $0.id == id }) { tabs[i] = saved } else { tabs.insert(saved, at: 0) }
        return saved
    }

    public func setCoursed(_ on: Bool) async { await saveCurrentTab(coursed: on) }

    // ── Tab attributes (web parity: a check needs a channel before it can fire /
    //    charge; dine-in carries covers + table, delivery an address). ──────────
    public var channel: String? { currentTab?.channel }
    public var covers: Int { currentTab?.covers ?? 2 }
    public var address: String { currentTab?.address ?? "" }
    public var tableId: String? { currentTab?.tableId }
    public var discount: PosTabDiscount? { currentTab?.discount }
    public var isParked: Bool { currentTab?.status == "parked" }

    /// Floor tables for the dine-in table picker (read-only over v1).
    public private(set) var tables: [FloorTable] = []
    public func loadTables() async {
        tables = (try? await api.send(.adminFloorTables(location: location))) ?? []
    }
    /// Resolve a table id (e.g. "krk-t-12") to its human number for display.
    public func tableNumber(forId id: String?) -> String? {
        guard let id, !id.isEmpty else { return nil }
        return tables.first { $0.id == id }?.number ?? id
    }

    // ── Loyalty member on the check (web parity: a member accrues points on
    //    payment). Persisted via the SAME tab PUT — PosTab already carries
    //    customerName/customerPhone, so no new endpoint is needed.
    public var memberName: String? { currentTab?.customerName }
    public var memberPhone: String? { currentTab?.customerPhone }
    public func setMember(name: String, phone: String) async {
        await saveCurrentTab(customerName: name, customerPhone: phone)
    }

    // ── QR table-order queue (web `/core/pos` QR pill): unpaid orders placed via
    //    the table QR. They come straight off the live board (channel == "qr");
    //    "Mark paid" reuses the existing settle endpoint — no new facade route.
    public private(set) var qrOrders: [Order] = []
    public var unpaidQrCount: Int { qrOrders.filter { $0.paidAt == nil }.count }
    public func loadQrOrders() async {
        let board = (try? await api.send(.operatorBoard(location: location))) ?? []
        qrOrders = board.filter { ($0.channel ?? "") == "qr" }.sorted { $0.createdAt > $1.createdAt }
    }
    public func settleOrder(_ id: String) async {
        _ = try? await api.send(.settle(orderID: id))
        await loadQrOrders()
    }

    public func setChannel(_ c: String) async { await saveCurrentTab(channel: c) }
    public func setCovers(_ n: Int) async { await saveCurrentTab(covers: max(1, min(50, n))) }
    public func setAddress(_ a: String) async { await saveCurrentTab(address: a) }
    /// Seat the check at a table (empty string clears — mergePosTab drops it).
    public func setTable(_ id: String) async { await saveCurrentTab(tableId: id) }
    public func togglePark() async { await saveCurrentTab(status: isParked ? "open" : "parked") }
    /// Returns the saved tab, or nil if the write failed — so the caller can show
    /// honest feedback instead of assuming success.
    @discardableResult
    public func setDiscount(_ d: PosTabDiscount?) async -> PosTab? {
        await saveCurrentTab(discount: d, discountProvided: true)
    }

    /// Grosze value of a manual discount against a base — port of the shared web
    /// `manualDiscountGrosze`, so the footer preview matches the charged total
    /// (the server is still authoritative; combos resolve there).
    public func manualDiscount(_ base: Grosze, _ d: PosTabDiscount?) -> Grosze {
        guard let d, base > 0 else { return 0 }
        if d.type == "percent" {
            let pct = max(0, min(100, d.value))
            return min(base, Int((Double(base) * Double(pct) / 100).rounded()))
        }
        return min(base, max(0, d.value)) // amount (grosze)
    }
    public var discountAmount: Grosze { manualDiscount(total, discount) }
    public var totalAfterDiscount: Grosze { max(0, total - discountAmount) }

    /// Fire the current tab to the kitchen — whole, or named courses. Saves the
    /// latest ticket first so the server fires off current truth.
    public func fireCurrentTab(courses: [String]? = nil) async -> String? {
        guard let id = currentTabID else { return "No open tab" }
        await saveCurrentTab()
        do {
            _ = try await api.send(.posTabFire(id: id, location: location,
                                               courses: courses, fireAll: courses == nil))
            await refreshTabs()
            return nil
        } catch let e as APIError {
            if case .api(_, let m, _) = e { return m }
            return "You appear to be offline"
        } catch { return "Something went wrong" }
    }

    /// Charge the current tab (settle + close). Clears the till on success.
    public func chargeCurrentTab() async -> String? {
        guard let id = currentTabID else { return "No open tab" }
        do {
            _ = try await api.send(.posTabCharge(id: id, location: location))
            clear()
            await refreshTabs()
            return nil
        } catch let e as APIError {
            if case .api(_, let m, _) = e { return m }
            return "You appear to be offline"
        } catch { return "Something went wrong" }
    }

    public var lineCount: Int { ticket.values.reduce(0, +) }
    public var isEmpty: Bool { ticket.isEmpty }
    public var total: Grosze {
        ticket.reduce(0) { sum, kv in sum + (menuById[kv.key]?.price ?? 0) * kv.value }
    }
    public func item(_ id: String) -> AdminMenuItem? { menuById[id] }
    public var ticketLines: [(item: AdminMenuItem, qty: Int)] {
        ticket.compactMap { id, q in menuById[id].map { ($0, q) } }
            .sorted { $0.item.name < $1.item.name }
    }

    /// Send the ticket as a counter sale. Returns the order id on success, else nil.
    public func charge(name: String, phone: String, table: String) async -> (orderId: String?, error: String?) {
        sending = true
        defer { sending = false }
        let lines = ticket.map { PosOrderBody.Line(id: $0.key, quantity: $0.value) }
        do {
            let order = try await api.send(.posCreateOrder(
                locationSlug: location, items: lines,
                customerName: name, customerPhone: phone, tableNumber: table
            ))
            clear()
            return (order.id, nil)
        } catch let e as APIError {
            if case .api(_, let m, _) = e { return (nil, m) }
            if case .transport = e { return (nil, "You appear to be offline") }
            return (nil, "Couldn't send the order")
        } catch { return (nil, "Something went wrong") }
    }
}

public struct OperatorPOSView: View {
    @Environment(\.theme) private var theme
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var store: OperatorPOSStore
    @State private var showCharge = false
    @State private var showTabs = false
    @State private var showCheckSheet = false
    @State private var showQR = false
    @State private var showNewCheck = false
    @State private var newCheckName = ""
    @State private var category: String?
    @State private var search = ""
    @State private var tabMessage: String?

    public init(api: APIClient, location: String = "krakow") {
        _store = State(initialValue: OperatorPOSStore(api: api, location: location))
    }

    private let gridCols = [GridItem(.adaptive(minimum: 144), spacing: 12)]

    public var body: some View {
        Group {
            switch store.state {
            case .loading:
                ProgressView("Loading the till…").frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let m):
                ContentUnavailableView("Couldn't load the till", systemImage: "wifi.slash", description: Text(m))
            case .loaded(let items):
                loaded(items)
            }
        }
        .background(theme.color.surface)
        .navigationTitle("POS — \(store.location.capitalized)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showQR = true } label: {
                    let n = store.unpaidQrCount
                    Label(n > 0 ? "QR (\(n))" : "QR orders",
                          systemImage: n > 0 ? "qrcode.viewfinder" : "qrcode")
                        .foregroundStyle(n > 0 ? theme.color.warning : theme.color.accent)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showTabs = true } label: { Label("Manage checks", systemImage: "rectangle.stack.fill") }
            }
        }
        .task { if case .loading = store.state { await store.load() } }
        .task { await store.refreshTabs(); await store.loadTables(); await store.loadQrOrders() }
        .task(id: store.ticketSignature) { await store.refreshSuggestions() }
        .sheet(isPresented: $showCharge) { ChargeSheet(store: store) }
        .sheet(isPresented: $showTabs) { TabsSheet(store: store) }
        .sheet(isPresented: $showQR) { QROrdersSheet(store: store) }
        .sheet(isPresented: $showCheckSheet) {
            NavigationStack {
                POSCheckPanel(store: store, message: $tabMessage, onWalkInCharge: { showCheckSheet = false; showCharge = true })
                    .navigationTitle(store.currentTabName ?? "Check")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { showCheckSheet = false } } }
            }
            .presentationDetents([.large])
        }
        .alert("New check", isPresented: $showNewCheck) {
            TextField("Name (optional)", text: $newCheckName)
            Button("Open") {
                let n = newCheckName.trimmingCharacters(in: .whitespaces)
                Task { await store.openTab(name: n.isEmpty ? nil : n) }
                newCheckName = ""
            }
            Button("Cancel", role: .cancel) { newCheckName = "" }
        } message: { Text("Open a new check on the till.") }
        .dsToast($tabMessage)
    }

    // MARK: layout

    @ViewBuilder
    private func loaded(_ items: [AdminMenuItem]) -> some View {
        VStack(spacing: 0) {
            tabStrip
            Divider().overlay(theme.color.line)
            if hSize == .regular {
                HStack(spacing: 0) {
                    menuPane(items).frame(maxWidth: .infinity)
                    Divider().overlay(theme.color.line)
                    POSCheckPanel(store: store, message: $tabMessage, onWalkInCharge: { showCharge = true })
                        .frame(width: 380)
                        .background(theme.color.surface2)
                }
            } else {
                menuPane(items)
                if !store.isEmpty || store.currentTabID != nil { compactCartBar }
            }
        }
    }

    // MARK: open-checks strip

    private var tabStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: theme.space.sm) {
                Button { showNewCheck = true } label: {
                    Label("New", systemImage: "plus").textRole(.caption).fontWeight(.semibold)
                        .padding(.horizontal, theme.space.md).frame(height: 34)
                        .foregroundStyle(theme.color.onAccent)
                        .background(theme.color.accent, in: Capsule())
                }
                .buttonStyle(.plain)
                chip(title: "Quick sale", icon: "bag", active: store.currentTabID == nil) { store.deselectTab() }
                ForEach(store.tabs) { tab in
                    chip(title: tab.name, icon: "rectangle.stack", active: tab.id == store.currentTabID,
                         badge: tab.lineCount) { store.load(tab: tab) }
                        .contextMenu {
                            Button(role: .destructive) { Task { await store.voidTab(tab.id) } } label: { Label("Void", systemImage: "trash") }
                        }
                }
            }
            .padding(.horizontal, theme.space.lg).padding(.vertical, theme.space.sm)
        }
        .background(theme.color.surface)
    }

    private func chip(title: String, icon: String, active: Bool, badge: Int? = nil, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.caption2)
                Text(title).textRole(.caption).fontWeight(.semibold).lineLimit(1)
                if let badge, badge > 0 {
                    Text("\(badge)").font(.caption2.weight(.bold)).monospacedDigit()
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background((active ? theme.color.onAccent : theme.color.accent).opacity(0.2), in: Capsule())
                }
            }
            .padding(.horizontal, theme.space.md).frame(height: 34)
            .foregroundStyle(active ? theme.color.onAccent : theme.color.textPrimary)
            .background(active ? theme.color.accent : theme.color.surface2, in: Capsule())
            .overlay(Capsule().strokeBorder(theme.color.line, lineWidth: active ? 0 : 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: menu pane

    @ViewBuilder
    private func menuPane(_ items: [AdminMenuItem]) -> some View {
        VStack(spacing: theme.space.sm) {
            HStack(spacing: theme.space.sm) {
                Image(systemName: "magnifyingglass").foregroundStyle(theme.color.textSecondary)
                TextField("Search the menu", text: $search)
                    .textFieldStyle(.plain).foregroundStyle(theme.color.textPrimary)
                if !search.isEmpty { Button { search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(theme.color.textSecondary) }.buttonStyle(.plain) }
            }
            .padding(.horizontal, theme.space.md).frame(height: 40)
            .background(theme.color.surface2, in: Capsule())
            .overlay(Capsule().strokeBorder(theme.color.line, lineWidth: 1))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: theme.space.xs) {
                    catChip("All", active: category == nil) { category = nil }
                    ForEach(categories(items), id: \.self) { c in
                        catChip(c.capitalized, active: category == c) { category = c }
                    }
                }
            }

            ScrollView {
                LazyVGrid(columns: gridCols, spacing: theme.space.md) {
                    ForEach(filtered(items)) { itemCard($0) }
                }
                .padding(.bottom, theme.space.xl)
            }
        }
        .padding(.horizontal, theme.space.lg).padding(.top, theme.space.sm)
    }

    private func catChip(_ label: String, active: Bool, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Text(label).textRole(.caption).fontWeight(.semibold)
                .padding(.horizontal, theme.space.md).frame(height: 30)
                .foregroundStyle(active ? theme.color.onAccent : theme.color.textSecondary)
                .background(active ? theme.color.accent : theme.color.surface2, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func itemCard(_ item: AdminMenuItem) -> some View {
        let qty = store.ticketQty(item.id) ?? 0
        return Button { store.add(item) } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .top) {
                    Text(item.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        .lineLimit(2).multilineTextAlignment(.leading)
                    Spacer(minLength: 2)
                    if qty > 0 {
                        Text("\(qty)").font(.caption.weight(.bold)).monospacedDigit()
                            .foregroundStyle(theme.color.onAccent)
                            .frame(minWidth: 20, minHeight: 20)
                            .background(theme.color.accent, in: Circle())
                    }
                }
                Spacer(minLength: 6)
                HStack {
                    MoneyText(item.price).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                    Spacer()
                    if !item.available {
                        Text("86").font(.caption2.weight(.bold)).foregroundStyle(theme.color.danger)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(theme.color.danger.opacity(0.18), in: Capsule())
                    } else {
                        Image(systemName: "plus.circle.fill").foregroundStyle(theme.color.accent)
                    }
                }
            }
            .padding(theme.space.md)
            .frame(height: 96, alignment: .topLeading)
            .frame(maxWidth: .infinity)
            .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg))
            .overlay(RoundedRectangle(cornerRadius: theme.radius.lg)
                .strokeBorder(qty > 0 ? theme.color.accent : theme.color.line, lineWidth: qty > 0 ? 1.5 : 1))
        }
        .buttonStyle(.plain)
        .disabled(!item.available)
        .opacity(item.available ? 1 : 0.55)
        .sensoryFeedback(.impact(weight: .light), trigger: qty)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.name), \(MoneyText.format(item.price))\(item.available ? "" : ", sold out")\(qty > 0 ? ", \(qty) in check" : "")")
        .accessibilityHint(item.available ? "Adds one to the check" : "")
        .accessibilityAddTraits(.isButton)
    }

    // MARK: compact cart bar (iPhone)

    private var compactCartBar: some View {
        Button { showCheckSheet = true } label: {
            HStack {
                Image(systemName: "cart.fill")
                Text("\(store.lineCount) item\(store.lineCount == 1 ? "" : "s")").fontWeight(.semibold)
                if let n = store.currentTabName { Text("· \(n)").foregroundStyle(theme.color.onAccent.opacity(0.85)) }
                Spacer()
                MoneyText(store.totalAfterDiscount).fontWeight(.bold)
                Image(systemName: "chevron.up")
            }
            .foregroundStyle(theme.color.onAccent)
            .padding(theme.space.lg)
            .background(theme.color.accent)
        }
        .buttonStyle(.plain)
    }

    // MARK: helpers

    private func categories(_ items: [AdminMenuItem]) -> [String] {
        var seen = Set<String>(), out: [String] = []
        for i in items where !seen.contains(i.category) { seen.insert(i.category); out.append(i.category) }
        return out
    }

    private func filtered(_ items: [AdminMenuItem]) -> [AdminMenuItem] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return items.filter { item in
            (category == nil || item.category == category)
            && (q.isEmpty || item.name.lowercased().contains(q))
        }
    }
}

/// Quantity lookup helper for the pad row.
extension OperatorPOSStore {
    func ticketQty(_ id: String) -> Int? { ticket[id] }
}

private struct ChargeSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let store: OperatorPOSStore
    @State private var name = "Walk-in"
    @State private var phone = ""
    @State private var table = ""
    @State private var error: String?
    @State private var doneOrderId: String?
    @State private var tender: Tender = .card
    @State private var cash: Grosze = 0
    private enum Tender: Hashable { case card, cash }

    var body: some View {
        NavigationStack {
            Group {
                if let id = doneOrderId {
                    VStack(spacing: theme.space.lg) {
                        Spacer()
                        Image(systemName: "checkmark.seal.fill").font(.system(size: 56)).foregroundStyle(theme.color.success)
                        Text("Sent to kitchen").font(.title3.weight(.bold)).foregroundStyle(theme.color.textPrimary)
                        Text("Order \(id)").font(.subheadline.monospaced()).foregroundStyle(theme.color.textSecondary)
                        DSButton("Done") { dismiss() }.padding(.horizontal, theme.space.xxl)
                        Spacer()
                    }
                } else {
                    Form {
                        Section("Ticket") {
                            ForEach(store.ticketLines, id: \.item.id) { line in
                                HStack {
                                    Text("\(line.qty)× \(line.item.name)").foregroundStyle(theme.color.textPrimary)
                                    Spacer()
                                    MoneyText(line.item.price * line.qty).foregroundStyle(theme.color.textSecondary)
                                }
                            }
                            HStack {
                                Text("Total").font(.headline)
                                Spacer()
                                MoneyText(store.total).font(.headline)
                            }.foregroundStyle(theme.color.textPrimary)
                        }
                        Section("Guest (for receipt / loyalty)") {
                            TextField("Name", text: $name).textContentType(.name)
                            TextField("Phone", text: $phone).keyboardType(.phonePad).textContentType(.telephoneNumber)
                            TextField("Table (optional)", text: $table).keyboardType(.numberPad)
                        }
                        Section("Payment") {
                            Picker("Method", selection: $tender) {
                                Text("Card").tag(Tender.card)
                                Text("Cash").tag(Tender.cash)
                            }
                            .pickerStyle(.segmented)
                            if tender == .cash {
                                // Order total stays server-priced; the keypad is a
                                // till aid that computes change for the cashier.
                                POSKeypad(grosze: $cash)
                                    .listRowInsets(EdgeInsets(top: theme.space.sm, leading: theme.space.md,
                                                              bottom: theme.space.sm, trailing: theme.space.md))
                                HStack {
                                    Text("Change due").foregroundStyle(theme.color.textSecondary)
                                    Spacer()
                                    MoneyText(max(0, cash - store.total)).font(.headline)
                                        .foregroundStyle(cash >= store.total ? theme.color.success : theme.color.textSecondary)
                                }
                            }
                        }
                        if let error { Section { Text(error).font(.footnote).foregroundStyle(theme.color.danger) } }
                        Section {
                            DSButton(store.sending ? "Sending…" : "Send to kitchen") { Task { await charge() } }
                                .disabled(store.sending || name.isEmpty || phone.count < 7
                                          || (tender == .cash && cash < store.total))
                        }
                    }
                }
            }
            .navigationTitle("Charge")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
        }
    }

    private func charge() async {
        error = nil
        let result = await store.charge(name: name, phone: phone, table: table)
        if let id = result.orderId { doneOrderId = id } else { error = result.error }
    }
}

/// The persistent check panel — the always-visible right pane on iPad (and the
/// sheet body on iPhone). Web `/core/pos` parity: channel (required before
/// fire/charge) + dine-in covers/table or delivery address, line steppers,
/// cross-sell, manual discount, coursing, and the fire/charge actions. Attributes
/// persist through the v1 tab PUT; the server re-prices (combos + discount) at
/// fire/charge. For a quick counter-sale (no open check) it shows the working
/// ticket + a walk-in charge and a "Start a check" promote.
private struct POSCheckPanel: View {
    @Environment(\.theme) private var theme
    let store: OperatorPOSStore
    @Binding var message: String?
    let onWalkInCharge: () -> Void

    @State private var channel = ""
    @State private var covers = 2
    @State private var address = ""
    @State private var tableId = ""
    @State private var discKind: DiscKind = .none
    @State private var discValue = ""
    @State private var showDiscount = false
    @State private var showAddMember = false
    @State private var memberNameInput = ""
    @State private var memberPhoneInput = ""
    private enum DiscKind: Hashable { case none, percent, amount }

    private var hasTab: Bool { store.currentTabID != nil }
    private var channelReady: Bool { !hasTab || (store.channel?.isEmpty == false) }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(theme.color.line)
            ScrollView {
                VStack(alignment: .leading, spacing: theme.space.lg) {
                    if !hasTab && store.isEmpty {
                        emptyState
                    } else {
                        if hasTab { channelSection }
                        linesSection
                        if hasTab { memberSection }
                        if !store.suggestions.isEmpty { suggestionsRow }
                        discountSection
                    }
                }
                .padding(theme.space.lg)
            }
            footer
        }
        .background(theme.color.surface2)
        .task(id: store.currentTabID) { syncFromStore(); await store.loadTables() }
        .alert("Add member", isPresented: $showAddMember) {
            TextField("Name", text: $memberNameInput)
            TextField("Phone", text: $memberPhoneInput)
            Button("Attach") {
                let n = memberNameInput.trimmingCharacters(in: .whitespaces)
                let p = memberPhoneInput.trimmingCharacters(in: .whitespaces)
                if !p.isEmpty { Task { await store.setMember(name: n.isEmpty ? "Member" : n, phone: p) } }
                memberNameInput = ""; memberPhoneInput = ""
            }
            Button("Cancel", role: .cancel) { memberNameInput = ""; memberPhoneInput = "" }
        } message: { Text("Attach a loyalty member so this check earns points on payment.") }
    }

    // MARK: member

    private var memberSection: some View {
        VStack(alignment: .leading, spacing: theme.space.xs) {
            Text("MEMBER").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
            if let phone = store.memberPhone, !phone.isEmpty {
                HStack(spacing: theme.space.sm) {
                    Image(systemName: "person.crop.circle.badge.checkmark").foregroundStyle(theme.color.success)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(store.memberName ?? "Member").font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text(phone).textRole(.caption).monospacedDigit().foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    Label("Earns points", systemImage: "gift.fill").textRole(.caption).foregroundStyle(theme.color.accent)
                }
                .padding(theme.space.sm)
                .background(theme.successSoft, in: RoundedRectangle(cornerRadius: theme.radius.md))
            } else {
                Button {
                    memberNameInput = store.memberName ?? ""
                    memberPhoneInput = store.memberPhone ?? ""
                    showAddMember = true
                } label: {
                    Label("Add member", systemImage: "person.badge.plus")
                        .textRole(.callout).foregroundStyle(theme.color.accent)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(theme.color.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: theme.radius.md))
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: header

    private var header: some View {
        HStack(spacing: theme.space.sm) {
            Image(systemName: hasTab ? "rectangle.stack.fill" : "bag.fill").foregroundStyle(theme.color.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text(store.currentTabName ?? "Quick sale").font(.headline).foregroundStyle(theme.color.textPrimary).lineLimit(1)
                Text(hasTab ? (store.isParked ? "Parked" : "Open check") : "Counter sale")
                    .textRole(.caption).foregroundStyle(store.isParked ? theme.color.warning : theme.color.textSecondary)
            }
            Spacer()
            if hasTab {
                Button { Task { await store.togglePark() } } label: {
                    Image(systemName: store.isParked ? "play.circle" : "pause.circle").foregroundStyle(theme.color.textSecondary)
                }.buttonStyle(.plain).accessibilityLabel(store.isParked ? "Resume check" : "Hold check")
            }
        }
        .padding(theme.space.lg)
    }

    private var emptyState: some View {
        VStack(spacing: theme.space.sm) {
            Image(systemName: "cart").font(.system(size: 34)).foregroundStyle(theme.color.textSecondary)
            Text("Tap items to start a sale").textRole(.callout).foregroundStyle(theme.color.textSecondary)
            Text("or open a check from the strip above").textRole(.caption).foregroundStyle(theme.color.textSecondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, theme.space.xxl)
    }

    // MARK: channel

    private var channelSection: some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text("CHANNEL").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
            Picker("Channel", selection: $channel) {
                Text("Pick…").tag("")
                Text("Dine-in").tag("dine-in")
                Text("Takeaway").tag("takeout")
                Text("Delivery").tag("delivery")
            }
            .pickerStyle(.segmented)
            .onChange(of: channel) { _, c in if !c.isEmpty { Task { await store.setChannel(c) } } }
            if channel == "dine-in" {
                Stepper("Covers: \(covers)", value: $covers, in: 1...50)
                    .onChange(of: covers) { _, n in Task { await store.setCovers(n) } }
                Picker("Table", selection: $tableId) {
                    Text("No table").tag("")
                    ForEach(store.tables) { t in Text(tableLabel(t)).tag(t.id) }
                }
                .onChange(of: tableId) { _, id in Task { await store.setTable(id) } }
            }
            if channel == "delivery" {
                TextField("Delivery address", text: $address, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { Task { await store.setAddress(address) } }
            }
            if !channelReady {
                Label("Pick a channel before firing or charging", systemImage: "exclamationmark.triangle.fill")
                    .textRole(.caption).foregroundStyle(theme.color.warning)
            }
        }
    }

    // MARK: lines

    private var linesSection: some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            HStack {
                Text("ITEMS").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
                Spacer()
                if hasTab {
                    Toggle("Coursed", isOn: Binding(get: { store.isCoursed }, set: { v in Task { await store.setCoursed(v) } }))
                        .toggleStyle(.button).controlSize(.small).tint(theme.color.accent)
                }
            }
            if store.ticketLines.isEmpty {
                Text("No items yet").textRole(.callout).foregroundStyle(theme.color.textSecondary)
            }
            ForEach(store.ticketLines, id: \.item.id) { line in
                HStack(spacing: theme.space.sm) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(line.item.name).font(.subheadline.weight(.medium)).foregroundStyle(theme.color.textPrimary).lineLimit(1)
                        MoneyText(line.item.price * line.qty).font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    HStack(spacing: theme.space.sm) {
                        stepBtn("minus") { store.remove(line.item.id) }
                        Text("\(line.qty)").font(.subheadline.weight(.bold)).monospacedDigit().frame(minWidth: 18).foregroundStyle(theme.color.textPrimary)
                        stepBtn("plus") { store.add(line.item) }
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func stepBtn(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.footnote.weight(.bold)).frame(width: 30, height: 30)
                .foregroundStyle(theme.color.accent)
                .background(theme.color.surface, in: Circle())
                .overlay(Circle().strokeBorder(theme.color.line, lineWidth: 1))
        }.buttonStyle(.plain)
    }

    // MARK: cross-sell

    private var suggestionsRow: some View {
        VStack(alignment: .leading, spacing: theme.space.xs) {
            Text("COMPLETE THE MEAL").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: theme.space.sm) {
                    ForEach(store.suggestions) { s in
                        Button { store.add(byId: s.id) } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "plus.circle.fill")
                                Text(s.name).lineLimit(1)
                                MoneyText(s.price)
                            }
                            .textRole(.caption)
                            .padding(.horizontal, theme.space.sm).padding(.vertical, 6)
                            .foregroundStyle(theme.color.accent)
                            .background(theme.color.accent.opacity(0.14), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Add \(s.name), \(s.reason)")
                    }
                }
            }
        }
    }

    // MARK: discount

    @ViewBuilder
    private var discountSection: some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            HStack {
                Text("DISCOUNT").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
                Spacer()
                if hasTab {
                    Button(showDiscount ? "Close" : "Add") { withAnimation { showDiscount.toggle() } }
                        .font(.caption.weight(.semibold)).foregroundStyle(theme.color.accent)
                }
            }
            if let d = store.discount {
                HStack {
                    Text(discountLabel(d)).textRole(.callout).foregroundStyle(theme.color.success)
                    Spacer()
                    Button("Remove", role: .destructive) { Task { await store.setDiscount(nil) } }.font(.caption)
                }
            }
            if showDiscount && hasTab {
                Picker("Type", selection: $discKind) {
                    Text("None").tag(DiscKind.none); Text("Percent").tag(DiscKind.percent); Text("Amount").tag(DiscKind.amount)
                }.pickerStyle(.segmented)
                if discKind != .none {
                    HStack {
                        TextField(discKind == .percent ? "0–100" : "zł", text: $discValue).keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                        Button("Apply") { Task { await applyDiscount() } }.buttonStyle(.borderedProminent)
                    }
                }
            }
        }
    }

    // MARK: footer

    private var footer: some View {
        VStack(spacing: theme.space.sm) {
            Divider().overlay(theme.color.line)
            VStack(spacing: 4) {
                totalRow("Subtotal", store.total, bold: false)
                if store.discountAmount > 0 { totalRow("Discount", -store.discountAmount, bold: false) }
                totalRow("Total", store.totalAfterDiscount, bold: true)
            }
            actions
        }
        .padding(theme.space.lg)
        .background(theme.color.surface)
    }

    @ViewBuilder
    private var actions: some View {
        if hasTab {
            HStack(spacing: theme.space.sm) {
                if store.isCoursed {
                    Menu {
                        ForEach(["starter", "main", "dessert", "drink"], id: \.self) { c in
                            Button(store.firedCourses.contains(c) ? "✓ \(c.capitalized)" : c.capitalized) {
                                Task { message = await store.fireCurrentTab(courses: [c]) ?? "Fired \(c)" }
                            }
                        }
                        Divider()
                        Button("Fire all") { Task { message = await store.fireCurrentTab() ?? "Sent to kitchen" } }
                    } label: {
                        Label("Fire", systemImage: "flame.fill").frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.bordered).disabled(!channelReady)
                } else {
                    Button { Task { message = await store.fireCurrentTab() ?? "Sent to kitchen" } } label: {
                        Label("Send", systemImage: "flame.fill").frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.bordered).disabled(!channelReady || store.isEmpty)
                }
                DSButton("Charge") { Task { message = await store.chargeCurrentTab() ?? "Charged" } }
                    .disabled(!channelReady || store.isEmpty)
                    .opacity(channelReady && !store.isEmpty ? 1 : 0.5)
            }
        } else if !store.isEmpty {
            HStack(spacing: theme.space.sm) {
                Button { Task { await store.startCheckFromTicket(name: nil) } } label: {
                    Label("Start check", systemImage: "plus.rectangle.on.rectangle").frame(maxWidth: .infinity, minHeight: 48)
                }.buttonStyle(.bordered)
                DSButton("Charge") { onWalkInCharge() }
            }
            Button("Clear", role: .destructive) { store.clear() }.font(.caption)
        }
    }

    // MARK: helpers

    private func syncFromStore() {
        channel = store.channel ?? ""
        covers = store.covers
        address = store.address
        tableId = store.tableId ?? ""
        if let d = store.discount {
            discKind = d.type == "percent" ? .percent : .amount
            discValue = d.type == "percent" ? String(d.value) : String(format: "%.2f", Double(d.value) / 100)
        } else { discKind = .none; discValue = "" }
    }

    private func totalRow(_ label: String, _ amount: Grosze, bold: Bool) -> some View {
        HStack {
            Text(label).foregroundStyle(bold ? theme.color.textPrimary : theme.color.textSecondary)
            Spacer()
            MoneyText(amount).foregroundStyle(theme.color.textPrimary)
        }
        .font(bold ? .headline : .subheadline)
    }

    private func tableLabel(_ t: FloorTable) -> String {
        let zone = t.zone.map { "\($0) · " } ?? ""
        return "\(zone)Table \(t.number) · \(t.seats) seats"
    }

    private func discountLabel(_ d: PosTabDiscount) -> String {
        let base = d.type == "percent" ? "\(d.value)% off" : "\(String(format: "%.2f", Double(d.value) / 100)) zł off"
        return d.reason.map { "\(base) · \($0)" } ?? base
    }

    private func applyDiscount() async {
        let raw = discValue.replacingOccurrences(of: ",", with: ".")
        guard let num = Double(raw), num > 0 else { message = "Enter a discount value"; return }
        let d: PosTabDiscount = discKind == .percent
            ? PosTabDiscount(type: "percent", value: max(0, min(100, Int(num.rounded()))))
            : PosTabDiscount(type: "amount", value: Int((num * 100).rounded()))
        message = await store.setDiscount(d) != nil ? "Discount applied" : "Couldn’t apply discount"
        showDiscount = false
    }
}

/// Open checks (Tabs) — list, open a new check, load one into the working ticket,
/// or void it. Editing happens in the main till (add/remove) + the Check sheet
/// (channel, covers, address, line +/−, discount); charging fires through the
/// shared server actuator.
private struct TabsSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let store: OperatorPOSStore
    @State private var newName = ""

    var body: some View {
        NavigationStack {
            List {
                Section("New check") {
                    HStack {
                        TextField("Name (optional)", text: $newName)
                        Button("Open") {
                            Task { await store.openTab(name: newName.isEmpty ? nil : newName); newName = ""; dismiss() }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                Section("Open checks") {
                    if store.tabs.isEmpty {
                        Text("No open checks").foregroundStyle(theme.color.textSecondary)
                    }
                    ForEach(store.tabs) { tab in
                        Button { store.load(tab: tab); dismiss() } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(tab.name).foregroundStyle(theme.color.textPrimary)
                                    Text("\(tab.lineCount) item\(tab.lineCount == 1 ? "" : "s") · \(tab.status)")
                                        .font(.caption).foregroundStyle(theme.color.textSecondary)
                                }
                                Spacer()
                                if tab.id == store.currentTabID {
                                    Image(systemName: "checkmark").foregroundStyle(theme.color.accent)
                                }
                            }
                        }
                        .swipeActions {
                            Button("Void", role: .destructive) { Task { await store.voidTab(tab.id) } }
                        }
                    }
                }
            }
            .navigationTitle("Tabs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
            .task { await store.refreshTabs() }
        }
    }
}

/// QR table-order queue — orders placed from a table's QR code (web `/core/pos`
/// QR pill). Lists them with a Mark-paid action that settles via the shared order
/// endpoint, so the order stays the single source of truth (no duplicate tab).
private struct QROrdersSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let store: OperatorPOSStore

    var body: some View {
        NavigationStack {
            Group {
                if store.qrOrders.isEmpty {
                    ContentUnavailableView("No QR orders", systemImage: "qrcode",
                                           description: Text("Orders placed from a table QR appear here."))
                } else {
                    List {
                        ForEach(store.qrOrders) { o in
                            HStack(spacing: theme.space.sm) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("#\(o.ticketShortId) · \(o.customerName)")
                                        .font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                                    Text("\(store.tableNumber(forId: o.tableId).map { "Table \($0) · " } ?? "")\(o.items.count) item\(o.items.count == 1 ? "" : "s") · \(o.createdAt.prefix(16).replacingOccurrences(of: "T", with: " "))")
                                        .font(.caption).foregroundStyle(theme.color.textSecondary)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 4) {
                                    MoneyText(o.totalAmount).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                                    if o.paidAt == nil {
                                        Button("Mark paid") { Task { await store.settleOrder(o.id) } }
                                            .font(.caption.weight(.semibold)).buttonStyle(.borderedProminent).controlSize(.small)
                                    } else {
                                        Label("Paid", systemImage: "checkmark.circle.fill")
                                            .font(.caption2.weight(.bold)).foregroundStyle(theme.color.success)
                                    }
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
            }
            .navigationTitle("QR orders")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button { Task { await store.loadQrOrders() } } label: { Image(systemName: "arrow.clockwise") } }
                ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } }
            }
            .task { await store.loadQrOrders() }
        }
    }
}
