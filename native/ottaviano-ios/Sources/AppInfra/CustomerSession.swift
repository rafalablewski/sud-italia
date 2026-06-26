import SwiftUI
import CoreModels
import Networking

/// Customer sign-in state + profile (Rule #6 phone-OTP, no passwords). Owns the
/// auth handshake and the loyalty profile; the app root gates on `state`. One
/// bounded context — not a God object: it only does identity.
@MainActor
@Observable
public final class CustomerSession {
    public enum State: Sendable { case unknown, signedOut, signedIn }

    public private(set) var state: State = .unknown
    public private(set) var profile: CustomerProfile?

    private let api: APIClient
    private let tokens: TokenStore

    public init(api: APIClient, tokens: TokenStore) {
        self.api = api
        self.tokens = tokens
    }

    /// Resolve initial state at launch — a stored refresh token means signed-in
    /// (optimistic), then hydrate the profile (refresh-on-401 handles staleness).
    public func bootstrap() async {
        state = (await tokens.isSignedIn) ? .signedIn : .signedOut
        if state == .signedIn { await refreshProfile() }
    }

    public func requestCode(phone: String) async throws -> OtpRequestResult {
        try await api.send(.requestOtp(phone: phone))
    }

    public func verify(phone: String, code: String) async throws {
        let result = try await api.send(.verifyOtp(phone: phone, code: code))
        await tokens.adopt(result.tokenPair)
        state = .signedIn
        await refreshProfile()
    }

    public func refreshProfile() async {
        do {
            profile = try await api.send(.me())
            state = .signedIn
        } catch APIError.authExpired {
            await signOut()
        } catch {
            // Offline / transient — keep the signed-in shell, profile stays stale.
        }
    }

    public func signOut() async {
        await tokens.clear()
        profile = nil
        state = .signedOut
    }
}
