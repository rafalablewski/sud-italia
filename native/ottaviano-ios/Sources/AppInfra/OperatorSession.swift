import SwiftUI
import CoreModels
import Networking

/// Operator (OttavianoKDS) sign-in state + staff identity. The kitchen app is
/// staff-only, so unlike the customer app it IS gated: the shell shows the login
/// until a refresh token exists. Password (+ optional MFA) via
/// `POST /api/v1/auth/login`; the rotating refresh token lives in the Keychain.
@MainActor
@Observable
public final class OperatorSession {
    public enum State: Sendable, Equatable { case unknown, signedOut, signedIn }

    public private(set) var state: State = .unknown
    public private(set) var user: OperatorAuthResult.OperatorUser?
    /// Set when the server says MFA is required so the login view reveals the code field.
    public private(set) var mfaRequired = false

    private let api: APIClient
    private let tokens: TokenStore

    public init(api: APIClient, tokens: TokenStore) {
        self.api = api
        self.tokens = tokens
    }

    /// A stored refresh token means an established session (optimistic); the
    /// first authed board call reconciles via refresh-on-401.
    public func bootstrap() async {
        state = (await tokens.isSignedIn) ? .signedIn : .signedOut
    }

    /// Returns a human error string on failure (the view renders it), or nil on
    /// success. Sets `mfaRequired` so the caller can reveal the TOTP field.
    public func signIn(email: String, password: String, totp: String) async -> String? {
        do {
            let result = try await api.send(.operatorLogin(email: email, password: password, totp: totp))
            await tokens.adopt(result.tokenPair)
            user = result.user
            mfaRequired = false
            state = .signedIn
            return nil
        } catch let error as APIError {
            if case .api(_, let message, _) = error {
                if message.localizedCaseInsensitiveContains("mfa") || message.localizedCaseInsensitiveContains("code required") {
                    mfaRequired = true
                }
                return message
            }
            if case .transport = error { return "You appear to be offline" }
            return "Sign-in failed"
        } catch {
            return "Something went wrong"
        }
    }

    public func signOut() async {
        await tokens.clear()
        user = nil
        mfaRequired = false
        state = .signedOut
    }
}
