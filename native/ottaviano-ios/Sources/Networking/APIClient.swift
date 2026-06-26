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
}
