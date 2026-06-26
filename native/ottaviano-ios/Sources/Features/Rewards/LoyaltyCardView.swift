import SwiftUI
import OttavianoKit

/// The loyalty card — the customer-facing payoff of the brief ("loyalty card").
/// Reads the profile off `CustomerSession` (sourced from GET /api/v1/customer/me),
/// renders a wallet-style pass with points + tier, and lets the guest sign out.
public struct LoyaltyCardView: View {
    @Environment(\.theme) private var theme
    private let session: CustomerSession

    public init(session: CustomerSession) { self.session = session }

    public var body: some View {
        ScrollView {
            VStack(spacing: theme.space.lg) {
                card
                if let p = session.profile {
                    HStack(spacing: theme.space.md) {
                        stat("Orders", "\(p.orderCount)")
                        stat("Lifetime", MoneyText.format(p.totalSpentGrosze))
                    }
                }
                Button("Sign out", role: .destructive) { Task { await session.signOut() } }
                    .padding(.top, theme.space.lg)
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Rewards")
        .task { await session.refreshProfile() }
        .refreshable { await session.refreshProfile() }
    }

    private var card: some View {
        let p = session.profile
        return VStack(alignment: .leading, spacing: theme.space.md) {
            HStack {
                Text("Ottaviano").font(.title2.weight(.bold))
                Spacer()
                Text((p?.tier ?? "bronze").capitalized)
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, theme.space.sm).padding(.vertical, 4)
                    .background(.white.opacity(0.2), in: Capsule())
            }
            Spacer(minLength: theme.space.xl)
            Text("\(p?.points ?? 0)").font(.system(size: 44, weight: .heavy)).monospacedDigit()
            Text("points").font(.subheadline).opacity(0.85)
            Text(p?.name ?? p?.phone ?? "")
                .font(.footnote).opacity(0.85)
        }
        .foregroundStyle(theme.color.onAccent)
        .padding(theme.space.xl)
        .frame(maxWidth: .infinity, minHeight: 200, alignment: .leading)
        .background(theme.color.accent, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).monospacedDigit().foregroundStyle(theme.color.textPrimary)
            Text(label).font(.caption).foregroundStyle(theme.color.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
    }
}
