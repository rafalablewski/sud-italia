import Foundation
import CoreModels

/// A typed request against `/api/v1`.
public struct Endpoint<Response: Decodable & Sendable>: Sendable {
    public enum Method: String, Sendable { case get = "GET", post = "POST", patch = "PATCH", put = "PUT", delete = "DELETE" }
    public let method: Method
    public let path: String
    public let query: [String: String]
    public let body: Data?
    public let requiresAuth: Bool

    public init(_ method: Method, _ path: String, query: [String: String] = [:],
                body: Data? = nil, requiresAuth: Bool = false) {
        self.method = method
        self.path = path
        self.query = query
        self.body = body
        self.requiresAuth = requiresAuth
    }
}

/// The single network entry point. An actor so its (small) mutable state and the
/// auth handshake are race-free under Swift 6 strict concurrency. Decodes the
/// envelope, maps `error.code` → `APIError`, and transparently refreshes once on
/// a 401 for authed calls.
public actor APIClient {
    private let baseURL: URL
    private let tokens: TokenStore
    private let session: URLSession
    private let decoder = JSONDecoder()

    public init(baseURL: URL, tokens: TokenStore, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokens = tokens
        self.session = session
    }

    public func send<R>(_ endpoint: Endpoint<R>) async throws -> R {
        do {
            return try await perform(endpoint, retryOn401: endpoint.requiresAuth)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.transport(underlying: error.localizedDescription)
        }
    }

    private func perform<R>(_ endpoint: Endpoint<R>, retryOn401: Bool) async throws -> R {
        var components = URLComponents(
            url: baseURL.appendingPathComponent(endpoint.path),
            resolvingAgainstBaseURL: false
        )!
        if !endpoint.query.isEmpty {
            components.queryItems = endpoint.query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var req = URLRequest(url: components.url!)
        req.httpMethod = endpoint.method.rawValue
        if let body = endpoint.body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if endpoint.requiresAuth {
            let token = try await tokens.validAccessToken()
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.transport(underlying: error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport(underlying: "non-HTTP response")
        }

        if http.statusCode == 401, retryOn401 {
            _ = try await tokens.refresh() // single-flight; throws .authExpired if dead
            return try await perform(endpoint, retryOn401: false)
        }

        guard (200..<300).contains(http.statusCode) else {
            if let env = try? decoder.decode(ErrorEnvelope.self, from: data) {
                throw APIError.api(
                    code: APIErrorCode(rawValue: env.error.code) ?? .unknown,
                    message: env.error.message,
                    status: http.statusCode
                )
            }
            throw APIError.api(code: .unknown, message: "HTTP \(http.statusCode)", status: http.statusCode)
        }

        do {
            return try decoder.decode(SuccessEnvelope<R>.self, from: data).data
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }
}

// Endpoint catalogue — every server route the apps call, in one place so call
// sites stay declarative. (A subset; grows with the features.)
public extension Endpoint {
    static func menu(location: String) -> Endpoint<[MenuItem]> {
        Endpoint<[MenuItem]>(.get, "menu", query: ["location": location])
    }
    static func locations() -> Endpoint<[Location]> {
        Endpoint<[Location]>(.get, "locations")
    }
    static func me() -> Endpoint<CustomerProfile> {
        Endpoint<CustomerProfile>(.get, "customer/me", requiresAuth: true)
    }
    static func myOrders() -> Endpoint<[Order]> {
        Endpoint<[Order]>(.get, "customer/orders", requiresAuth: true)
    }
    static func operatorBoard(location: String?) -> Endpoint<[Order]> {
        Endpoint<[Order]>(.get, "orders", query: location.map { ["location": $0] } ?? [:], requiresAuth: true)
    }
    static func bump(orderID: String, to status: OrderStatus) -> Endpoint<Order> {
        let body = try? JSONEncoder().encode(["status": status.rawValue])
        return Endpoint<Order>(.patch, "orders/\(orderID)", body: body, requiresAuth: true)
    }
    /// Recall a mis-bumped completion (completed → ready) — the expo mis-tap undo.
    static func recall(orderID: String) -> Endpoint<Order> {
        Endpoint<Order>(.post, "orders/\(orderID)/recall", requiresAuth: true)
    }
    /// Settle (mark paid) an order at the counter. Idempotent server-side.
    static func settle(orderID: String) -> Endpoint<Order> {
        Endpoint<Order>(.post, "orders/\(orderID)/settle", requiresAuth: true)
    }
    /// Render/print a thermal receipt — mode=printed, or simulated with a preview.
    static func receipt(orderID: String) -> Endpoint<ReceiptResult> {
        Endpoint<ReceiptResult>(.post, "orders/\(orderID)/receipt", requiresAuth: true)
    }
    /// Cross-sell chips for a POS ticket (the four-slot complete-your-meal panel).
    static func posSuggestions(locationSlug: String, itemIds: [String]) -> Endpoint<[PosSuggestion]> {
        let body = try? JSONEncoder().encode(PosSuggestionsBody(locationSlug: locationSlug, itemIds: itemIds))
        return Endpoint<[PosSuggestion]>(.post, "admin/pos/suggestions", body: body, requiresAuth: true)
    }

    // POS open checks (Tabs) — several concurrent checks per till, persisted server-
    // side. Lines are id+qty(+course); prices resolve at send/charge.
    static func posTabs(location: String) -> Endpoint<[PosTab]> {
        Endpoint<[PosTab]>(.get, "admin/pos/tabs", query: ["location": location], requiresAuth: true)
    }
    static func posTabOpen(location: String, name: String?) -> Endpoint<PosTab> {
        let body = try? JSONEncoder().encode(["name": name ?? "New tab"])
        return Endpoint<PosTab>(.post, "admin/pos/tabs", query: ["location": location], body: body, requiresAuth: true)
    }
    static func posTabSave(_ tab: PosTabSaveBody) -> Endpoint<PosTab> {
        let body = try? JSONEncoder().encode(tab)
        return Endpoint<PosTab>(.put, "admin/pos/tabs", body: body, requiresAuth: true)
    }
    static func posTabVoid(id: String, location: String) -> Endpoint<TabDeleteResult> {
        Endpoint<TabDeleteResult>(.delete, "admin/pos/tabs", query: ["id": id, "location": location], requiresAuth: true)
    }
    /// Send to KDS / fire course(s). Omit courses (or fireAll) to fire everything.
    static func posTabFire(id: String, location: String, courses: [String]? = nil, fireAll: Bool = false) -> Endpoint<TabFireResult> {
        let body = try? JSONEncoder().encode(TabFireBody(courses: courses, fireAll: fireAll))
        return Endpoint<TabFireResult>(.post, "admin/pos/tabs/\(id)/fire", query: ["location": location], body: body, requiresAuth: true)
    }
    /// Charge (settle) the tab and close it.
    static func posTabCharge(id: String, location: String) -> Endpoint<TabChargeResult> {
        Endpoint<TabChargeResult>(.post, "admin/pos/tabs/\(id)/charge", query: ["location": location], requiresAuth: true)
    }
    // Customer auth (phone OTP).
    static func requestOtp(phone: String) -> Endpoint<OtpRequestResult> {
        let body = try? JSONEncoder().encode(["phone": phone])
        return Endpoint<OtpRequestResult>(.post, "customer/auth/request", body: body)
    }
    static func verifyOtp(phone: String, code: String) -> Endpoint<CustomerAuthResult> {
        let body = try? JSONEncoder().encode(["phone": phone, "code": code])
        return Endpoint<CustomerAuthResult>(.post, "customer/auth/verify", body: body)
    }
    // Operator auth (email + password, optional TOTP) for OttavianoKDS.
    static func operatorLogin(email: String?, password: String, totp: String?) -> Endpoint<OperatorAuthResult> {
        var payload: [String: String] = ["password": password, "app": "ottaviano-kds"]
        if let email, !email.isEmpty { payload["email"] = email }
        if let totp, !totp.isEmpty { payload["totp"] = totp }
        let body = try? JSONEncoder().encode(payload)
        return Endpoint<OperatorAuthResult>(.post, "auth/login", body: body)
    }
    // Customer order detail (ownership-gated server-side).
    static func myOrder(id: String) -> Endpoint<Order> {
        Endpoint<Order>(.get, "customer/orders/\(id)", requiresAuth: true)
    }
    // Server-priced create + payment. Zero-friction (Rule #6): the POST is
    // guest-capable — `customerName`+`customerPhone` in the body identify a guest,
    // so it must NOT force auth (an unauthenticated guest has no token to attach).
    // A signed-in customer still gets linked: we pass their profile phone in the
    // body and the server associates the order by phone.
    static func createOrder(_ request: OrderCreateRequest) -> Endpoint<Order> {
        let body = try? JSONEncoder().encode(request)
        return Endpoint<Order>(.post, "orders", body: body, requiresAuth: false)
    }
    static func paymentIntent(orderID: String) -> Endpoint<PaymentIntentDTO> {
        Endpoint<PaymentIntentDTO>(.post, "orders/\(orderID)/payment-intent", requiresAuth: true)
    }

    // Account data & privacy — self-serve export (GDPR Art. 15) + delete (Art. 17,
    // Apple App Store 5.1.1(v)). Both act on the token's own phone (subject).
    static func customerExport() -> Endpoint<CustomerDataExport> {
        Endpoint<CustomerDataExport>(.get, "customer/account/export", requiresAuth: true)
    }
    static func customerDeleteAccount() -> Endpoint<AccountDeleteResult> {
        let body = try? JSONEncoder().encode(["confirm": true])
        return Endpoint<AccountDeleteResult>(.delete, "customer/account", body: body, requiresAuth: true)
    }

    // Operator admin reads (OttavianoKDS) — mirror the web /admin/* data over the
    // bearer-authed, role-gated /api/v1/admin facade. `location` scopes to a site.
    static func adminCustomers() -> Endpoint<[AdminCustomer]> {
        Endpoint<[AdminCustomer]>(.get, "admin/customers", requiresAuth: true)
    }
    static func adminStaff(location: String? = nil) -> Endpoint<[AdminStaff]> {
        Endpoint<[AdminStaff]>(.get, "admin/staff", query: location.map { ["location": $0] } ?? [:], requiresAuth: true)
    }
    static func adminSuppliers() -> Endpoint<[AdminSupplier]> {
        Endpoint<[AdminSupplier]>(.get, "admin/suppliers", requiresAuth: true)
    }
    static func adminFeedback(location: String? = nil) -> Endpoint<[AdminFeedback]> {
        Endpoint<[AdminFeedback]>(.get, "admin/feedback", query: location.map { ["location": $0] } ?? [:], requiresAuth: true)
    }
    static func adminInventory(location: String? = nil) -> Endpoint<[AdminStockRow]> {
        Endpoint<[AdminStockRow]>(.get, "admin/inventory", query: location.map { ["location": $0] } ?? [:], requiresAuth: true)
    }
    static func adminSlots(location: String? = nil, date: String? = nil) -> Endpoint<[AdminSlot]> {
        var q: [String: String] = [:]
        if let location { q["location"] = location }
        if let date { q["date"] = date }
        return Endpoint<[AdminSlot]>(.get, "admin/slots", query: q, requiresAuth: true)
    }
    static func adminPurchaseOrders(location: String? = nil) -> Endpoint<[AdminPurchaseOrder]> {
        Endpoint<[AdminPurchaseOrder]>(.get, "admin/purchase-orders", query: location.map { ["location": $0] } ?? [:], requiresAuth: true)
    }
    static func adminSummary(location: String? = nil, from: String? = nil, to: String? = nil) -> Endpoint<AdminSummary> {
        var q: [String: String] = [:]
        if let location { q["location"] = location }
        if let from { q["from"] = from }
        if let to { q["to"] = to }
        return Endpoint<AdminSummary>(.get, "admin/summary", query: q, requiresAuth: true)
    }

    // Wave 2.
    static func adminMenu(location: String) -> Endpoint<[AdminMenuItem]> {
        Endpoint<[AdminMenuItem]>(.get, "admin/menu", query: ["location": location], requiresAuth: true)
    }
    /// 86 / un-86 an item. Returns `{ itemId, available }`.
    static func adminSet86(itemId: String, available: Bool) -> Endpoint<Item86Result> {
        let body = try? JSONEncoder().encode(Set86Body(itemId: itemId, available: available))
        return Endpoint<Item86Result>(.patch, "admin/menu", body: body, requiresAuth: true)
    }
    static func adminRecipes() -> Endpoint<[AdminRecipe]> {
        Endpoint<[AdminRecipe]>(.get, "admin/recipes", requiresAuth: true)
    }
    static func adminLoyalty() -> Endpoint<[AdminLoyaltyMember]> {
        Endpoint<[AdminLoyaltyMember]>(.get, "admin/loyalty", requiresAuth: true)
    }
    static func adminTasks() -> Endpoint<[AdminTask]> {
        Endpoint<[AdminTask]>(.get, "admin/tasks", requiresAuth: true)
    }
    static func adminSetTaskStatus(id: String, status: String) -> Endpoint<AdminTask> {
        let body = try? JSONEncoder().encode(["id": id, "status": status])
        return Endpoint<AdminTask>(.patch, "admin/tasks", body: body, requiresAuth: true)
    }
    static func adminAlerts() -> Endpoint<[AdminAlert]> {
        Endpoint<[AdminAlert]>(.get, "admin/alerts", requiresAuth: true)
    }
    static func adminAnnouncements() -> Endpoint<[AdminAnnouncement]> {
        Endpoint<[AdminAnnouncement]>(.get, "admin/announcements", requiresAuth: true)
    }
    static func adminSchedule(from: String? = nil, to: String? = nil) -> Endpoint<[AdminShift]> {
        var q: [String: String] = [:]
        if let from { q["from"] = from }
        if let to { q["to"] = to }
        return Endpoint<[AdminShift]>(.get, "admin/schedule", query: q, requiresAuth: true)
    }

    // Wave 3.
    static func adminUsers() -> Endpoint<[AdminUser]> {
        Endpoint<[AdminUser]>(.get, "admin/users", requiresAuth: true)
    }
    static func adminAuditLog() -> Endpoint<[AdminAuditEntry]> {
        Endpoint<[AdminAuditEntry]>(.get, "admin/audit-log", requiresAuth: true)
    }
    static func adminCash() -> Endpoint<[AdminCashSession]> {
        Endpoint<[AdminCashSession]>(.get, "admin/cash", requiresAuth: true)
    }
    static func adminBusinessCosts() -> Endpoint<[AdminBusinessCost]> {
        Endpoint<[AdminBusinessCost]>(.get, "admin/business-costs", requiresAuth: true)
    }
    static func adminCompliance() -> Endpoint<[AdminComplianceItem]> {
        Endpoint<[AdminComplianceItem]>(.get, "admin/compliance", requiresAuth: true)
    }
    static func adminEvents() -> Endpoint<[AdminEvent]> {
        Endpoint<[AdminEvent]>(.get, "admin/events", requiresAuth: true)
    }
    static func adminWaste() -> Endpoint<[AdminWasteEntry]> {
        Endpoint<[AdminWasteEntry]>(.get, "admin/waste", requiresAuth: true)
    }
    static func adminSurveys() -> Endpoint<[AdminSurvey]> {
        Endpoint<[AdminSurvey]>(.get, "admin/surveys", requiresAuth: true)
    }

    // Wave 4.
    static func adminSettings(surface: String) -> Endpoint<SettingsSurface> {
        Endpoint<SettingsSurface>(.get, "admin/settings", query: ["surface": surface], requiresAuth: true)
    }
    static func adminInsights() -> Endpoint<AdminInsights> {
        Endpoint<AdminInsights>(.get, "admin/insights", requiresAuth: true)
    }
    static func adminLocations() -> Endpoint<[AdminLocationKPI]> {
        Endpoint<[AdminLocationKPI]>(.get, "admin/locations", requiresAuth: true)
    }
    static func adminExpansion() -> Endpoint<[AdminExpansion]> {
        Endpoint<[AdminExpansion]>(.get, "admin/expansion", requiresAuth: true)
    }
    static func adminScheduledBundles() -> Endpoint<[AdminScheduledBundle]> {
        Endpoint<[AdminScheduledBundle]>(.get, "admin/scheduled-bundles", requiresAuth: true)
    }

    // Wave 5.
    static func adminCorporate() -> Endpoint<[AdminCorporate]> {
        Endpoint<[AdminCorporate]>(.get, "admin/corporate", requiresAuth: true)
    }
    static func adminManageLocations() -> Endpoint<[AdminManagedLocation]> {
        Endpoint<[AdminManagedLocation]>(.get, "admin/manage-locations", requiresAuth: true)
    }
    static func adminCampaigns() -> Endpoint<[AdminCampaign]> {
        Endpoint<[AdminCampaign]>(.get, "admin/campaigns", requiresAuth: true)
    }
    static func adminHandover() -> Endpoint<[AdminHandover]> {
        Endpoint<[AdminHandover]>(.get, "admin/handover", requiresAuth: true)
    }
    static func adminPermissions() -> Endpoint<AdminPermissionMatrix> {
        Endpoint<AdminPermissionMatrix>(.get, "admin/permissions", requiresAuth: true)
    }

    /// POS counter sale — immediate dine-in, server-priced. Returns the Order.
    static func posCreateOrder(locationSlug: String, items: [PosOrderBody.Line],
                               customerName: String, customerPhone: String,
                               tableNumber: String?) -> Endpoint<Order> {
        let body = try? JSONEncoder().encode(PosOrderBody(
            locationSlug: locationSlug, items: items,
            customerName: customerName, customerPhone: customerPhone,
            tableNumber: tableNumber?.isEmpty == false ? tableNumber : nil
        ))
        return Endpoint<Order>(.post, "admin/pos/order", body: body, requiresAuth: true)
    }
}

public extension Endpoint {
    // Wave 7.
    static func adminHaccp() -> Endpoint<[AdminTempLog]> {
        Endpoint<[AdminTempLog]>(.get, "admin/haccp", requiresAuth: true)
    }
    static func adminMenuEngineering(window: Int? = nil) -> Endpoint<[AdminMenuEngineeringLine]> {
        Endpoint<[AdminMenuEngineeringLine]>(.get, "admin/menu-engineering",
            query: window.map { ["window": String($0)] } ?? [:], requiresAuth: true)
    }
    static func adminRegulatory() -> Endpoint<[AdminRegulatory]> {
        Endpoint<[AdminRegulatory]>(.get, "admin/regulatory", requiresAuth: true)
    }
    // Wave 8.
    static func adminSimulation() -> Endpoint<AdminSimulation> {
        Endpoint<AdminSimulation>(.get, "admin/simulation", requiresAuth: true)
    }
    // Wave 9 — Ops Agent.
    static func adminAgentThread() -> Endpoint<AgentThread> {
        Endpoint<AgentThread>(.get, "admin/agent", requiresAuth: true)
    }
    static func adminAgentTurn(message: String, conversationId: String?) -> Endpoint<AgentThread> {
        let body = try? JSONEncoder().encode(AgentTurnBody(message: message, conversationId: conversationId))
        return Endpoint<AgentThread>(.post, "admin/agent/turn", body: body, requiresAuth: true)
    }
    // Wave 10 — Agent HQ.
    static func adminAgentHQ() -> Endpoint<AgentHQ> {
        Endpoint<AgentHQ>(.get, "admin/agent-hq", requiresAuth: true)
    }

    // KDS owner fleet (Atlas) + manager floor-ops header.
    static func adminKdsFleet(includeSimulated: Bool = false) -> Endpoint<FleetBoard> {
        Endpoint<FleetBoard>(.get, "admin/kds/fleet",
            query: includeSimulated ? ["includeSimulated": "1"] : [:], requiresAuth: true)
    }
    static func adminKdsFloorOps(location: String? = nil) -> Endpoint<FloorOps> {
        Endpoint<FloorOps>(.get, "admin/kds/floor-ops",
            query: location.map { ["location": $0] } ?? [:], requiresAuth: true)
    }
    /// Floor tables for the POS dine-in table picker (read-only). Location required.
    static func adminFloorTables(location: String) -> Endpoint<[FloorTable]> {
        Endpoint<[FloorTable]>(.get, "admin/floor/tables", query: ["location": location], requiresAuth: true)
    }

    // Operator write actions (staff+) — log a HACCP reading / a waste entry. The
    // server computes the HACCP verdict; both return the created record.
    static func adminLogTemp(locationSlug: String, sensor: String, tempCelsius: Int,
                             recordedBy: String? = nil) -> Endpoint<AdminTempLog> {
        let body = try? JSONEncoder().encode(LogTempBody(
            locationSlug: locationSlug, sensor: sensor, tempCelsius: tempCelsius, recordedBy: recordedBy))
        return Endpoint<AdminTempLog>(.post, "admin/haccp", body: body, requiresAuth: true)
    }
    static func adminLogWaste(locationSlug: String, item: String, quantity: Double, unit: String,
                              reason: String, estimatedCostGrosze: Int? = nil,
                              notes: String? = nil) -> Endpoint<AdminWasteEntry> {
        let body = try? JSONEncoder().encode(LogWasteBody(
            locationSlug: locationSlug, item: item, quantity: quantity, unit: unit, reason: reason,
            estimatedCostGrosze: estimatedCostGrosze, notes: notes))
        return Endpoint<AdminWasteEntry>(.post, "admin/waste", body: body, requiresAuth: true)
    }
    /// Adjust an ingredient's on-hand for a location by a SIGNED delta (manager).
    /// Records an `adjust` stock movement server-side; returns the updated row.
    static func adminAdjustStock(ingredientId: String, locationSlug: String, delta: Double,
                                 reason: String? = nil) -> Endpoint<AdminStockRow> {
        let body = try? JSONEncoder().encode(AdjustStockBody(
            ingredientId: ingredientId, locationSlug: locationSlug, delta: delta, reason: reason))
        return Endpoint<AdminStockRow>(.post, "admin/inventory", body: body, requiresAuth: true)
    }
    /// Tune a fulfilment slot's capacity and/or status (manager). Returns the row.
    static func adminUpdateSlot(id: String, maxOrders: Int? = nil, status: String? = nil) -> Endpoint<AdminSlot> {
        let body = try? JSONEncoder().encode(UpdateSlotBody(id: id, maxOrders: maxOrders, status: status))
        return Endpoint<AdminSlot>(.patch, "admin/slots", body: body, requiresAuth: true)
    }
    /// Advance an event's lifecycle status (manager). Returns the updated row.
    static func adminSetEventStatus(id: String, status: String) -> Endpoint<AdminEvent> {
        let body = try? JSONEncoder().encode(SetEventStatusBody(id: id, status: status))
        return Endpoint<AdminEvent>(.patch, "admin/events", body: body, requiresAuth: true)
    }
    /// Renew a compliance item to a new expiry (manager); stamps lastRenewedAt
    /// server-side. `expiresAt` is an ISO date (`yyyy-MM-dd`). Returns the row.
    static func adminRenewCompliance(id: String, expiresAt: String) -> Endpoint<AdminComplianceItem> {
        let body = try? JSONEncoder().encode(RenewComplianceBody(id: id, expiresAt: expiresAt))
        return Endpoint<AdminComplianceItem>(.patch, "admin/compliance", body: body, requiresAuth: true)
    }
    /// Advance a scheduled shift's status (manager). Returns the updated row.
    static func adminSetShiftStatus(id: String, status: String) -> Endpoint<AdminShift> {
        let body = try? JSONEncoder().encode(SetEventStatusBody(id: id, status: status))
        return Endpoint<AdminShift>(.patch, "admin/schedule", body: body, requiresAuth: true)
    }
    /// Record a shift handover (manager). `shift` ∈ {open, mid, close}. Returns the row.
    static func adminCreateHandover(locationSlug: String, shift: String, outgoingManager: String,
                                    incomingManager: String?, tempChecksOk: Bool, equipmentOk: Bool,
                                    wasteNoted: Bool, managerComment: String?) -> Endpoint<AdminHandover> {
        let body = try? JSONEncoder().encode(CreateHandoverBody(
            locationSlug: locationSlug, shift: shift, outgoingManager: outgoingManager,
            incomingManager: incomingManager, tempChecksOk: tempChecksOk, equipmentOk: equipmentOk,
            wasteNoted: wasteNoted, managerComment: managerComment))
        return Endpoint<AdminHandover>(.post, "admin/handover", body: body, requiresAuth: true)
    }
}

public extension Endpoint {
    /// Post a team announcement (owner). Returns the created row.
    static func adminPostAnnouncement(title: String, body: String, pinned: Bool = false) -> Endpoint<AdminAnnouncement> {
        let payload = try? JSONEncoder().encode(PostAnnouncementBody(title: title, body: body, pinned: pinned))
        return Endpoint<AdminAnnouncement>(.post, "admin/announcements", body: payload, requiresAuth: true)
    }
    /// Open a till session (manager). 409 if one is already open at the location.
    static func adminOpenCashSession(locationSlug: String, openingFloat: Grosze, notes: String? = nil) -> Endpoint<AdminCashSession> {
        let payload = try? JSONEncoder().encode(OpenCashBody(locationSlug: locationSlug, openingFloat: openingFloat, notes: notes))
        return Endpoint<AdminCashSession>(.post, "admin/cash", body: payload, requiresAuth: true)
    }
    /// Advance a review's triage status (manager): new | reviewed | responded.
    static func adminSetFeedbackStatus(id: String, status: String) -> Endpoint<AdminFeedback> {
        let payload = try? JSONEncoder().encode(["id": id, "status": status])
        return Endpoint<AdminFeedback>(.patch, "admin/feedback", body: payload, requiresAuth: true)
    }
    /// Advance a PO's status (manager): draft | sent | received | cancelled.
    /// `received` posts the receive stock movements server-side.
    static func adminSetPurchaseOrderStatus(id: String, status: String) -> Endpoint<AdminPurchaseOrder> {
        let payload = try? JSONEncoder().encode(["id": id, "status": status])
        return Endpoint<AdminPurchaseOrder>(.patch, "admin/purchase-orders", body: payload, requiresAuth: true)
    }
}

private struct PostAnnouncementBody: Encodable {
    let title: String; let body: String; let pinned: Bool
}
private struct OpenCashBody: Encodable {
    let locationSlug: String; let openingFloat: Grosze; let notes: String?
}

private struct LogTempBody: Encodable {
    let locationSlug: String; let sensor: String; let tempCelsius: Int; let recordedBy: String?
}
private struct LogWasteBody: Encodable {
    let locationSlug: String; let item: String; let quantity: Double; let unit: String
    let reason: String; let estimatedCostGrosze: Int?; let notes: String?
}
private struct AdjustStockBody: Encodable {
    let ingredientId: String; let locationSlug: String; let delta: Double; let reason: String?
}
private struct UpdateSlotBody: Encodable { let id: String; let maxOrders: Int?; let status: String? }
private struct SetEventStatusBody: Encodable { let id: String; let status: String }
private struct RenewComplianceBody: Encodable { let id: String; let expiresAt: String }
private struct CreateHandoverBody: Encodable {
    let locationSlug: String; let shift: String; let outgoingManager: String
    let incomingManager: String?; let tempChecksOk: Bool; let equipmentOk: Bool
    let wasteNoted: Bool; let managerComment: String?
}

private struct AgentTurnBody: Encodable { let message: String; let conversationId: String? }
private struct SetConciergeExposureBody: Encodable { let capability: String; let exposed: Bool }

/// Body for `POST /api/v1/admin/pos/order`.
public struct PosOrderBody: Encodable, Sendable {
    public struct Line: Encodable, Sendable {
        public let id: String; public let quantity: Int
        // Explicit public init — feature code (AppFeatures) builds these, and the
        // synthesized memberwise init of a public struct is only `internal`.
        public init(id: String, quantity: Int) { self.id = id; self.quantity = quantity }
    }
    public let locationSlug: String
    public let items: [Line]
    public let customerName: String
    public let customerPhone: String
    public let tableNumber: String?
}

// MARK: - Core: Floor plan + Booking + CRM detail (facade routes for native Core)

/// Phones are E.164 (`+48…`); `+` is ambiguous in URLs, so path-encode as
/// digits — the server's `normalizePlPhoneE164` re-canonicalizes (it strips
/// non-digits and re-adds +48), so matching is unaffected.
private func phonePathDigits(_ phone: String) -> String {
    let d = phone.filter(\.isNumber)
    return d.isEmpty ? phone : d
}

/// Body for `POST /api/v1/admin/floor/booking` — unified slot+table booking.
public struct BookingBody: Encodable, Sendable {
    public let locationSlug: String
    public let slotId: String
    public let tableId: String
    public let customerName: String
    public let customerPhone: String?
    public let partySize: Int
    public let notes: String?
    public let forceOverride: Bool
    public init(locationSlug: String, slotId: String, tableId: String, customerName: String,
                customerPhone: String? = nil, partySize: Int, notes: String? = nil, forceOverride: Bool = false) {
        self.locationSlug = locationSlug; self.slotId = slotId; self.tableId = tableId
        self.customerName = customerName; self.customerPhone = customerPhone
        self.partySize = partySize; self.notes = notes; self.forceOverride = forceOverride
    }
    enum CodingKeys: String, CodingKey {
        case locationSlug, slotId, tableId, customerName, customerPhone, partySize, notes
        case forceOverride = "override"
    }
}

private struct AdjustPointsBody: Encodable { let delta: Int; let reason: String? }

public extension Endpoint {
    static func adminFloorRoom(location: String) -> Endpoint<FloorRoom> {
        Endpoint<FloorRoom>(.get, "admin/floor/twin", query: ["location": location], requiresAuth: true)
    }
    static func adminFloorSeat(location: String, tableId: String, seat: Bool) -> Endpoint<FloorSeatResult> {
        let body = try? JSONEncoder().encode(["action": seat ? "seat" : "clear", "tableId": tableId])
        return Endpoint<FloorSeatResult>(.post, "admin/floor/twin", query: ["location": location], body: body, requiresAuth: true)
    }
    /// Move a seated party (and its open dine-in check) to another table.
    static func adminFloorMove(location: String, tableId: String, toTableId: String) -> Endpoint<FloorMoveResult> {
        let body = try? JSONEncoder().encode(["action": "move", "tableId": tableId, "toTableId": toTableId])
        return Endpoint<FloorMoveResult>(.post, "admin/floor/twin", query: ["location": location], body: body, requiresAuth: true)
    }
    static func adminReservations(location: String, date: String? = nil) -> Endpoint<[Reservation]> {
        var q = ["location": location]; if let date { q["date"] = date }
        return Endpoint<[Reservation]>(.get, "admin/floor/reservations", query: q, requiresAuth: true)
    }
    static func adminCancelReservation(id: String, location: String) -> Endpoint<ReservationDeleteResult> {
        Endpoint<ReservationDeleteResult>(.delete, "admin/floor/reservations", query: ["id": id, "location": location], requiresAuth: true)
    }
    static func adminCreateBooking(_ b: BookingBody) -> Endpoint<Reservation> {
        let body = try? JSONEncoder().encode(b)
        return Endpoint<Reservation>(.post, "admin/floor/booking", query: ["location": b.locationSlug], body: body, requiresAuth: true)
    }
    static func adminCustomerDetail(phone: String) -> Endpoint<CrmCustomerDetail> {
        Endpoint<CrmCustomerDetail>(.get, "admin/customers/\(phonePathDigits(phone))", requiresAuth: true)
    }
    static func adminAddCustomerNote(phone: String, text: String) -> Endpoint<CrmNote> {
        let body = try? JSONEncoder().encode(["body": text])
        return Endpoint<CrmNote>(.post, "admin/customers/\(phonePathDigits(phone))/notes", body: body, requiresAuth: true)
    }
    static func adminDeleteCustomerNote(phone: String, id: String) -> Endpoint<ReservationDeleteResult> {
        Endpoint<ReservationDeleteResult>(.delete, "admin/customers/\(phonePathDigits(phone))/notes", query: ["id": id], requiresAuth: true)
    }
    static func adminSetConsent(phone: String, smsOptIn: Bool? = nil, emailOptIn: Bool? = nil) -> Endpoint<CrmConsentResult> {
        var payload: [String: Bool] = [:]
        if let smsOptIn { payload["smsOptIn"] = smsOptIn }
        if let emailOptIn { payload["emailOptIn"] = emailOptIn }
        let body = try? JSONEncoder().encode(payload)
        return Endpoint<CrmConsentResult>(.patch, "admin/customers/\(phonePathDigits(phone))/consent", body: body, requiresAuth: true)
    }
    static func adminAdjustPoints(phone: String, delta: Int, reason: String? = nil) -> Endpoint<CrmPointsResult> {
        let body = try? JSONEncoder().encode(AdjustPointsBody(delta: delta, reason: reason))
        return Endpoint<CrmPointsResult>(.post, "admin/customers/\(phonePathDigits(phone))/points", body: body, requiresAuth: true)
    }

    // Guest hub — Inbox (WhatsApp) + Concierge (MCP), completing /core/guest parity.
    static func adminWhatsAppInbox() -> Endpoint<WaInbox> {
        Endpoint<WaInbox>(.get, "admin/whatsapp", requiresAuth: true)
    }
    static func adminWhatsAppThread(phone: String, limit: Int = 100) -> Endpoint<WaThread> {
        Endpoint<WaThread>(.get, "admin/whatsapp/\(phonePathDigits(phone))", query: ["limit": String(limit)], requiresAuth: true)
    }
    static func adminWhatsAppSend(phone: String, body text: String) -> Endpoint<WaSendResult> {
        let body = try? JSONEncoder().encode(["body": text])
        return Endpoint<WaSendResult>(.post, "admin/whatsapp/\(phonePathDigits(phone))/message", body: body, requiresAuth: true)
    }
    static func adminConcierge() -> Endpoint<ConciergeInfo> {
        Endpoint<ConciergeInfo>(.get, "admin/concierge", requiresAuth: true)
    }
    /// Flip one MCP capability's exposure to agents (manager+). Returns the full
    /// refreshed capability list so the app reconciles from the server.
    static func adminSetConciergeExposure(capability: String, exposed: Bool) -> Endpoint<ConciergeInfo> {
        let body = try? JSONEncoder().encode(SetConciergeExposureBody(capability: capability, exposed: exposed))
        return Endpoint<ConciergeInfo>(.patch, "admin/concierge", body: body, requiresAuth: true)
    }

    // Demand Exchange (Service · Demand tab).
    static func adminDemandBoard(location: String, date: String? = nil) -> Endpoint<DemandBoardWrapper> {
        var q = ["location": location]; if let date { q["date"] = date }
        return Endpoint<DemandBoardWrapper>(.get, "admin/demand-exchange", query: q, requiresAuth: true)
    }
    static func adminApplyDemandSlot(location: String, slotId: String, maxOrders: Int, minSpendGrosze: Int? = nil) -> Endpoint<DemandApplyResult> {
        let body = try? JSONEncoder().encode(ApplyDemandBody(slotId: slotId, maxOrders: maxOrders, minSpendGrosze: minSpendGrosze))
        return Endpoint<DemandApplyResult>(.post, "admin/demand-exchange", query: ["location": location], body: body, requiresAuth: true)
    }
    static func adminApplyAllDemand(location: String, date: String? = nil) -> Endpoint<DemandApplyResult> {
        var q = ["location": location]; if let date { q["date"] = date }
        let body = try? JSONEncoder().encode(["mode": "apply-all"])
        return Endpoint<DemandApplyResult>(.post, "admin/demand-exchange", query: q, body: body, requiresAuth: true)
    }
}

private struct ApplyDemandBody: Encodable {
    let slotId: String; let maxOrders: Int; let minSpendGrosze: Int?
}

/// Result of the 86 toggle (`PATCH /api/v1/admin/menu`).
public struct Item86Result: Codable, Sendable {
    public let itemId: String
    public let available: Bool
}
private struct Set86Body: Encodable { let itemId: String; let available: Bool }

/// Result of `POST /api/v1/orders/:id/receipt`. `printed` → streamed to the
/// printer; `simulated` → `preview` is the exact plain-text receipt to show/share.
public struct ReceiptResult: Codable, Sendable {
    public let mode: String
    public let bytes: Int
    public let preview: String
    public let printer: String?
}

/// A POS cross-sell chip (`POST /api/v1/admin/pos/suggestions`).
public struct PosSuggestion: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let price: Grosze
    public let reason: String
}
private struct PosSuggestionsBody: Encodable { let locationSlug: String; let itemIds: [String] }

/// Body for `PUT /api/v1/admin/pos/tabs` — edit an open check. Lines are id+qty
/// (+course); the server resolves prices/discounts at send/charge.
public struct PosTabSaveBody: Encodable, Sendable {
    public struct Line: Encodable, Sendable {
        public let menuItemId: String
        public let quantity: Int
        public let course: String?
        public init(menuItemId: String, quantity: Int, course: String? = nil) {
            self.menuItemId = menuItemId; self.quantity = quantity; self.course = course
        }
    }
    public let id: String
    public let locationSlug: String
    public let name: String?
    public let channel: String?
    public let status: String?
    public let items: [Line]
    public let tableId: String?
    public let covers: Int?
    public let address: String?
    public let customerName: String?
    public let customerPhone: String?
    public let coursed: Bool?
    /// Manual discount value when `discountProvided` is true.
    public let discount: PosTabDiscount?
    /// When true the discount key is serialized (null clears, object sets);
    /// when false it's omitted so the server preserves its current value.
    public let discountProvided: Bool

    public init(id: String, locationSlug: String, items: [Line], name: String? = nil,
                channel: String? = nil, status: String? = nil, tableId: String? = nil,
                covers: Int? = nil, address: String? = nil, customerName: String? = nil,
                customerPhone: String? = nil, coursed: Bool? = nil,
                discount: PosTabDiscount? = nil, discountProvided: Bool = false) {
        self.id = id; self.locationSlug = locationSlug; self.items = items; self.name = name
        self.channel = channel; self.status = status; self.tableId = tableId; self.covers = covers
        self.address = address; self.customerName = customerName; self.customerPhone = customerPhone
        self.coursed = coursed; self.discount = discount; self.discountProvided = discountProvided
    }

    enum CodingKeys: String, CodingKey {
        case id, locationSlug, name, channel, status, items, tableId, covers, address
        case customerName, customerPhone, coursed, discount
    }

    // Optionals omit when nil (the server preserves those fields) — EXCEPT a
    // provided discount, which is always written so a full-tab PUT can clear it
    // (null) or set it (object), mirroring the web tab PUT.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(locationSlug, forKey: .locationSlug)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(channel, forKey: .channel)
        try c.encodeIfPresent(status, forKey: .status)
        try c.encode(items, forKey: .items)
        try c.encodeIfPresent(tableId, forKey: .tableId)
        try c.encodeIfPresent(covers, forKey: .covers)
        try c.encodeIfPresent(address, forKey: .address)
        try c.encodeIfPresent(customerName, forKey: .customerName)
        try c.encodeIfPresent(customerPhone, forKey: .customerPhone)
        try c.encodeIfPresent(coursed, forKey: .coursed)
        if discountProvided { try c.encode(discount, forKey: .discount) }
    }
}

/// Result of `DELETE /api/v1/admin/pos/tabs`.
public struct TabDeleteResult: Codable, Sendable {
    public let deleted: Bool
    public let id: String
}

private struct TabFireBody: Encodable { let courses: [String]?; let fireAll: Bool }

/// Result of `POST /api/v1/admin/pos/tabs/:id/fire`.
public struct TabFireResult: Codable, Sendable {
    public let order: Order
    public let firedCourses: [String]
}

/// Result of `POST /api/v1/admin/pos/tabs/:id/charge`.
public struct TabChargeResult: Codable, Sendable {
    public let ok: Bool
    public let orderId: String
    public let totalAmount: Grosze
}
