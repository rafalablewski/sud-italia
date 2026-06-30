import SwiftUI
import CoreModels
import Networking

/// Customer sign-in state + profile (Rule #6 phone-OTP, no passwords). Owns the
/// auth handshake and the loyalty profile; the app root gates on `state`. One
/// bounded context — not a God object: it only does identity.
@MainActor
@Observable
public final class CustomerSession {
    public enum State: Sendable, Equatable { case unknown, signedOut, signedIn }

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

    /// Fetch the signed-in guest's own data for a portable export (GDPR Art. 15).
    public func exportData() async throws -> CustomerDataExport {
        try await api.send(.customerExport())
    }

    /// Self-serve account deletion (GDPR Art. 17 · Apple App Store 5.1.1(v)). The
    /// server erases the guest's data and revokes every session; we then drop the
    /// local tokens so the app returns to the signed-out shell.
    public func deleteAccount() async throws -> AccountDeleteResult {
        let result = try await api.send(.customerDeleteAccount())
        await tokens.clear()
        profile = nil
        state = .signedOut
        return result
    }
}
