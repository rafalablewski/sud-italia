import Foundation
import Security
import CoreModels

/// Which app's session these tokens belong to (separate Keychain slots).
public enum TokenAudience: String, Sendable {
    case customer = "ottaviano"
    case operatorApp = "ottaviano-kds"
}

/// Holds the short-lived access token in memory and the rotating refresh token
/// in the Keychain, refreshing transparently (single-flight) on demand. The
/// refresh token never leaves the Keychain except to be sent to /auth/refresh.
/// (ARCHITECTURE §2 — access in memory, refresh in Keychain.)
public actor TokenStore {
    private let baseURL: URL
    private let audience: TokenAudience
    private let session: URLSession

    private var accessToken: String?
    private var accessExpiry: Date?
    private var refreshTask: Task<String, Error>?

    public init(baseURL: URL, audience: TokenAudience, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.audience = audience
        self.session = session
    }

    private var keychainKey: String { "ottaviano.refresh.\(audience.rawValue)" }

    public var isSignedIn: Bool { Keychain.load(keychainKey) != nil }

    /// Store a freshly-issued pair (after login/verify).
    public func adopt(_ pair: TokenPair) {
        accessToken = pair.accessToken
        accessExpiry = Date().addingTimeInterval(TimeInterval(pair.expiresIn) - 30) // 30s skew
        Keychain.save(keychainKey, value: pair.refreshToken)
    }

    public func clear() {
        accessToken = nil
        accessExpiry = nil
        refreshTask?.cancel()
        refreshTask = nil
        Keychain.delete(keychainKey)
    }

    /// A valid access token, refreshing if missing/expired. Concurrent callers
    /// share one in-flight refresh. Throws `.authExpired` if no refresh is
    /// possible (the caller routes to sign-in).
    public func validAccessToken() async throws -> String {
        if let token = accessToken, let exp = accessExpiry, exp > Date() { return token }
        return try await refresh()
    }

    /// Force a refresh (e.g. after a 401). Single-flight.
    public func refresh() async throws -> String {
        if let task = refreshTask { return try await task.value }
        let task = Task<String, Error> { [self] in
            defer { clearRefreshTask() }
            guard let refreshToken = Keychain.load(keychainKey) else { throw APIError.authExpired }
            let pair = try await postRefresh(refreshToken)
            adopt(pair)
            return pair.accessToken
        }
        refreshTask = task
        return try await task.value
    }

    private func clearRefreshTask() { refreshTask = nil }

    private func postRefresh(_ refreshToken: String) async throws -> TokenPair {
        var req = URLRequest(url: baseURL.appendingPathComponent("auth/refresh"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["refreshToken": refreshToken])
        do {
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse else { throw APIError.transport(underlying: "no response") }
            guard http.statusCode == 200 else {
                clear() // refresh rejected (rotated/expired/reuse) → sign in again
                throw APIError.authExpired
            }
            return try JSONDecoder().decode(SuccessEnvelope<TokenPair>.self, from: data).data
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.transport(underlying: error.localizedDescription)
        }
    }
}

/// Minimal Keychain string store (this-device-only, after-first-unlock).
enum Keychain {
    static func save(_ key: String, value: String) {
        let data = Data(value.utf8)
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(base as CFDictionary)
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    static func load(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(decoding: data, as: UTF8.self)
    }

    static func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
