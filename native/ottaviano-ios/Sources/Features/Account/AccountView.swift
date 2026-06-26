import SwiftUI
import OttavianoKit

/// The customer "More" tab — the native home for everything the web storefront
/// puts below the menu: the famiglia story (AboutSection), the soci loyalty pitch
/// (LoyaltySection), the location list, privacy, and the guest's own identity
/// (sign in / out). Keeps the Order/Rewards/Orders tabs focused while still
/// giving the brand voice and info a discoverable home (Rule #5).
public struct AccountView: View {
    @Environment(\.theme) private var theme
    private let session: CustomerSession
    private let locations: LocationsStore
    @State private var presentingAuth = false

    public init(session: CustomerSession, locations: LocationsStore) {
        self.session = session; self.locations = locations
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: theme.space.xl) {
                identityCard
                famiglia
                sociPitch
                locationsCard
                aboutLinks
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("More")
        .task { await locations.load() }
        .sheet(isPresented: $presentingAuth) { AuthSheet(session: session) }
    }

    private var identityCard: some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            if session.state == .signedIn, let p = session.profile {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.name ?? p.phone).font(.title3.weight(.bold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(p.tier.capitalized) · \(p.points) points").font(.subheadline).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    Image(systemName: "star.circle.fill").font(.largeTitle).foregroundStyle(theme.color.accent)
                }
                Button("Sign out", role: .destructive) { Task { await session.signOut() } }
            } else {
                Text("Join the famiglia").font(.system(.title3, design: .serif).weight(.semibold))
                    .foregroundStyle(theme.color.textPrimary)
                Text("Sign in with your phone — no password, no account to create — to collect points and track orders.")
                    .font(.subheadline).foregroundStyle(theme.color.textSecondary)
                DSButton("Continue with phone") { presentingAuth = true }
            }
        }
        .panel(theme)
    }

    private var famiglia: some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text("La famiglia").font(.system(.title2, design: .serif).weight(.semibold))
                .foregroundStyle(theme.color.brand)
            Text("“Pizza napoletana the way Napoli makes it — 00 flour, San Marzano, a 90-second turn in the wood-fired forno. We cook for friends, not customers.”")
                .font(.system(.body, design: .serif).italic())
                .foregroundStyle(theme.color.textSecondary)
        }
        .panel(theme)
    }

    private var sociPitch: some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Label("Soci e amici", systemImage: "star.fill").font(.headline).foregroundStyle(theme.color.onAccent)
            Text("A point for every złoty. Climb the tiers, unlock rewards, skip the queue.")
                .font(.subheadline).foregroundStyle(theme.color.onAccent.opacity(0.9))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.lg)
        .background(theme.color.accent, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
    }

    private var locationsCard: some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            Text("Our tables").font(.headline).foregroundStyle(theme.color.textPrimary)
            if locations.locations.isEmpty {
                Text("Kraków · Warszawa").font(.subheadline).foregroundStyle(theme.color.textSecondary)
            }
            ForEach(locations.locations) { loc in
                HStack(alignment: .top, spacing: theme.space.sm) {
                    Image(systemName: "mappin.and.ellipse").foregroundStyle(theme.color.brand)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(loc.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text(loc.address).font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                }
            }
        }
        .panel(theme)
    }

    private var aboutLinks: some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            link("Privacy", "lock.fill")
            Divider().overlay(theme.color.line)
            link("Pizza napoletana · forno a legna", "flame.fill")
        }
        .panel(theme)
    }

    private func link(_ title: String, _ icon: String) -> some View {
        HStack(spacing: theme.space.md) {
            Image(systemName: icon).foregroundStyle(theme.color.accent).frame(width: 22)
            Text(title).foregroundStyle(theme.color.textPrimary)
            Spacer()
        }
    }
}

/// AuthView in a sheet that dismisses itself once sign-in succeeds. (Mirror of the
/// SignInGate's private AuthSheet — kept local so Account doesn't depend on it.)
private struct AuthSheet: View {
    let session: CustomerSession
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        AuthView(session: session)
            .onChange(of: session.state) { _, new in if new == .signedIn { dismiss() } }
    }
}

private extension View {
    func panel(_ theme: Theme) -> some View {
        self
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(theme.space.lg)
            .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
            .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }
}
