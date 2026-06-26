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
                        field("Email (optional)", text: $email, content: .emailAddress, secure: false)
                        field("Password", text: $password, content: .password, secure: true)
                        if session.mfaRequired {
                            field("Authentication code", text: $totp, content: .oneTimeCode, secure: false)
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

    private func field(_ placeholder: String, text: Binding<String>, content: UITextContentType, secure: Bool) -> some View {
        Group {
            if secure {
                SecureField(placeholder, text: text)
            } else {
                TextField(placeholder, text: text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
        }
        .textContentType(content)
        .foregroundStyle(theme.color.textPrimary)
        .padding()
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func signIn() {
        busy = true; error = nil
        Task {
            defer { busy = false }
            error = await session.signIn(email: email, password: password, totp: totp)
        }
    }
}
