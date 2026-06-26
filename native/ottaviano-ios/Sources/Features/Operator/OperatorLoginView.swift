import SwiftUI
import UIKit
import OttavianoKit

/// OttavianoKDS sign-in (staff-only). Email is optional — blank uses the shared
/// owner session; the TOTP field reveals itself when the server asks for MFA.
/// Dark operator skin. Pure projection over `OperatorSession`.
public struct OperatorLoginView: View {
    @Environment(\.theme) private var theme
    private let session: OperatorSession

    @State private var email = ""
    @State private var password = ""
    @State private var totp = ""
    @State private var busy = false
    @State private var error: String?

    public init(session: OperatorSession) { self.session = session }

    public var body: some View {
        ZStack {
            theme.color.surface.ignoresSafeArea()
            ScrollView {
                VStack(spacing: theme.space.lg) {
                    Spacer(minLength: theme.space.xxl)
                    Image(systemName: "flame.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(theme.color.accent)
                    Text("OttavianoKDS")
                        .font(.title.weight(.bold))
                        .foregroundStyle(theme.color.textPrimary)
                    Text("Kitchen & operations")
                        .font(.subheadline)
                        .foregroundStyle(theme.color.textSecondary)

                    VStack(spacing: theme.space.md) {
                        DSTextField("Email (optional)", text: $email, systemImage: "envelope",
                                    keyboard: .emailAddress, contentType: .emailAddress,
                                    autocapitalization: .never, autocorrect: false)
                        DSTextField("Password", text: $password, secure: true, systemImage: "lock",
                                    contentType: .password)
                        if session.mfaRequired {
                            DSTextField("Authentication code", text: $totp, systemImage: "key",
                                        keyboard: .numberPad, contentType: .oneTimeCode,
                                        autocapitalization: .never, autocorrect: false)
                                .transition(.opacity)
                        }
                    }
                    .padding(.top, theme.space.md)

                    DSButton(busy ? "Signing in…" : "Sign in", action: signIn)
                        .disabled(busy || password.isEmpty)

                    if let error {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(theme.color.danger)
                            .multilineTextAlignment(.center)
                    }
                    Text("Leave email blank to use the owner session.")
                        .font(.caption)
                        .foregroundStyle(theme.color.textSecondary)
                    Spacer()
                }
                .padding(theme.space.xl)
                .frame(maxWidth: 460)
                .frame(maxWidth: .infinity)
            }
        }
        .animation(theme.snappy, value: session.mfaRequired)
    }

    private func signIn() {
        busy = true; error = nil
        Task {
            defer { busy = false }
            error = await session.signIn(email: email, password: password, totp: totp)
        }
    }
}
