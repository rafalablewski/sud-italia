import Foundation
import CoreModels

/// A typed request against `/api/v1`.
public struct Endpoint<Response: Decodable & Sendable>: Sendable {
    public enum Method: String, Sendable { case get = "GET", post = "POST", patch = "PATCH" }
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
}

/// Result of the 86 toggle (`PATCH /api/v1/admin/menu`).
public struct Item86Result: Codable, Sendable {
    public let itemId: String
    public let available: Bool
}
private struct Set86Body: Encodable { let itemId: String; let available: Bool }
