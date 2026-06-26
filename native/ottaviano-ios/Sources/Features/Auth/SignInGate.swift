import SwiftUI
import OttavianoKit

/// Zero-friction gate (Rule #6): the storefront never asks anyone to sign in.
/// Only the *personal* surfaces — Rewards, your Orders — need identity, and even
/// then we ask inline, on a warm card, presenting phone-OTP in a sheet. Once
/// signed in the wrapped `content` shows; the sheet self-dismisses.
public struct SignInGate<Content: View>: View {
    @Environment(\.theme) private var theme
    private let session: CustomerSession
    private let title: String
    private let message: String
    private let icon: String
    private let content: () -> Content
    @State private var presentingAuth = false

    public init(
        session: CustomerSession,
        title: String,
        message: String,
        icon: String,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.session = session
        self.title = title
        self.message = message
        self.icon = icon
        self.content = content
    }

    public var body: some View {
        Group {
            if session.state == .signedIn {
                content()
            } else {
                prompt
            }
        }
        .sheet(isPresented: $presentingAuth) {
            AuthSheet(session: session)
        }
    }

    private var prompt: some View {
        VStack(spacing: theme.space.lg) {
            Spacer()
            Image(systemName: icon)
                .font(.system(size: 52))
                .foregroundStyle(theme.color.brand)
            Text(title)
                .font(.system(.title2, design: .serif).weight(.semibold))
                .foregroundStyle(theme.color.textPrimary)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(theme.color.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, theme.space.xl)
            DSButton("Continue with phone") { presentingAuth = true }
                .padding(.horizontal, theme.space.xxl)
            Text("No password. No account to create.")
                .font(.caption)
                .foregroundStyle(theme.color.textSecondary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.color.surface)
    }
}

/// AuthView in a sheet that dismisses itself the moment sign-in succeeds.
private struct AuthSheet: View {
    let session: CustomerSession
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        AuthView(session: session)
            .onChange(of: session.state) { _, new in
                if new == .signedIn { dismiss() }
            }
    }
}
