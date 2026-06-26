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

    /// Persist the working ticket onto the current tab. `coursed` overrides the
    /// tab's coursing flag when provided (the dine-in toggle).
    @discardableResult
    public func saveCurrentTab(coursed: Bool? = nil) async -> PosTab? {
        guard let id = currentTabID else { return nil }
        let effectiveCoursed = coursed ?? isCoursed
        let body = PosTabSaveBody(id: id, locationSlug: location,
                                  items: ticketLinesForSave(coursed: effectiveCoursed),
                                  coursed: effectiveCoursed)
        guard let saved = try? await api.send(.posTabSave(body)) else { return nil }
        currentTab = saved
        if let i = tabs.firstIndex(where: { $0.id == id }) { tabs[i] = saved } else { tabs.insert(saved, at: 0) }
        return saved
    }

    public func setCoursed(_ on: Bool) async { await saveCurrentTab(coursed: on) }

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
    @State private var store: OperatorPOSStore
    @State private var showCharge = false
    @State private var showTabs = false
    @State private var tabMessage: String?

    public init(api: APIClient, location: String = "krakow") {
        _store = State(initialValue: OperatorPOSStore(api: api, location: location))
    }

    public var body: some View {
        Group {
            switch store.state {
            case .loading:
                List { ForEach(0..<8, id: \.self) { _ in OperatorRowSkeleton() } }
            case .failed(let m):
                ContentUnavailableView("Couldn't load the till", systemImage: "wifi.slash", description: Text(m))
            case .loaded(let items):
                VStack(spacing: 0) {
                    List {
                        ForEach(categories(items), id: \.self) { cat in
                            Section(cat.capitalized) {
                                ForEach(items.filter { $0.category == cat && $0.available }) { item in
                                    Button { store.add(item) } label: { padRow(item) }
                                        .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    if !store.isEmpty { ticketBar }
                }
            }
        }
        .navigationTitle("POS — \(store.location.capitalized)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showTabs = true } label: {
                    Label("Tabs (\(store.tabs.count))", systemImage: "rectangle.stack.fill")
                }
            }
        }
        .task { if case .loading = store.state { await store.load() } }
        .task { await store.refreshTabs() }
        .task(id: store.ticketSignature) { await store.refreshSuggestions() }
        .sheet(isPresented: $showCharge) { ChargeSheet(store: store) }
        .sheet(isPresented: $showTabs) { TabsSheet(store: store) }
        .dsToast($tabMessage)
    }

    private func categories(_ items: [AdminMenuItem]) -> [String] {
        var seen = Set<String>(), out: [String] = []
        for i in items where i.available && !seen.contains(i.category) { seen.insert(i.category); out.append(i.category) }
        return out
    }

    private func padRow(_ item: AdminMenuItem) -> some View {
        HStack {
            Text(item.name).font(.subheadline).foregroundStyle(theme.color.textPrimary)
            if let q = store.ticketQty(item.id), q > 0 {
                Text("×\(q)").font(.caption.weight(.bold)).monospacedDigit().foregroundStyle(theme.color.accent)
            }
            Spacer()
            MoneyText(item.price).font(.subheadline).foregroundStyle(theme.color.textSecondary)
            Image(systemName: "plus.circle.fill").foregroundStyle(theme.color.accent)
        }
    }

    private var ticketBar: some View {
        VStack(spacing: theme.space.sm) {
            if let name = store.currentTabName {
                HStack {
                    Label(name, systemImage: "rectangle.stack.fill")
                        .font(.caption.weight(.semibold)).foregroundStyle(theme.color.accent)
                    Spacer()
                    Toggle("Coursed", isOn: Binding(
                        get: { store.isCoursed },
                        set: { v in Task { await store.setCoursed(v) } }
                    ))
                    .toggleStyle(.button).controlSize(.small)
                    Button("Save") { Task { await store.saveCurrentTab() } }
                        .buttonStyle(.bordered).controlSize(.small)
                }
            }
            if !store.suggestions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: theme.space.sm) {
                        ForEach(store.suggestions) { s in
                            Button { store.add(byId: s.id) } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "plus.circle.fill")
                                    Text(s.name)
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
            HStack {
                Text("\(store.lineCount) item\(store.lineCount == 1 ? "" : "s")").font(.subheadline).foregroundStyle(theme.color.textSecondary)
                Spacer()
                MoneyText(store.total).font(.headline).foregroundStyle(theme.color.textPrimary)
            }
            HStack(spacing: theme.space.md) {
                Button("Clear", role: .destructive) { store.clear() }
                    .buttonStyle(.bordered)
                if store.currentTabID != nil {
                    if store.isCoursed {
                        Menu {
                            ForEach(["starter", "main", "dessert", "drink"], id: \.self) { c in
                                Button(store.firedCourses.contains(c) ? "✓ \(c.capitalized)" : c.capitalized) {
                                    Task { tabMessage = await store.fireCurrentTab(courses: [c]) ?? "Fired \(c)" }
                                }
                            }
                            Divider()
                            Button("Fire all") { Task { tabMessage = await store.fireCurrentTab() ?? "Sent to kitchen" } }
                        } label: {
                            Label("Fire", systemImage: "flame.fill").frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.bordered)
                    } else {
                        DSButton("Send") { Task { tabMessage = await store.fireCurrentTab() ?? "Sent to kitchen" } }
                    }
                    DSButton("Charge tab") { Task { tabMessage = await store.chargeCurrentTab() ?? "Charged" } }
                } else {
                    DSButton("Charge") { showCharge = true }
                }
            }
        }
        .padding(theme.space.lg)
        .background(.bar)
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

/// Open checks (Tabs) — list, open a new check, load one into the working ticket,
/// or void it. Editing happens in the main till (add/remove + "Save to tab");
/// charging reuses the counter-sale path. Coursing is the next wave (POS-TABS-PLAN).
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
