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
        // A Wallet-style pass: a warm Tuscan gradient (terracotta → oxblood), a
        // soft lift off the page, and a faint top sheen for the "pressed-foil"
        // depth Apple passes have.
        let shape = RoundedRectangle(cornerRadius: theme.radius.xl, style: .continuous)
        return VStack(alignment: .leading, spacing: theme.space.md) {
            HStack(alignment: .firstTextBaseline) {
                Text("Ottaviano").font(.system(.title2, design: .serif).weight(.bold))
                Spacer()
                Text((p?.tier ?? "bronze").capitalized)
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, theme.space.sm).padding(.vertical, 4)
                    .background(.white.opacity(0.22), in: Capsule())
                    .overlay(Capsule().strokeBorder(.white.opacity(0.25), lineWidth: 0.5))
            }
            Spacer(minLength: theme.space.xl)
            Text("\(p?.points ?? 0)").textRole(.displayXL).monospacedDigit()
            Text("points").font(.subheadline).opacity(0.85)
            Text(p?.name ?? p?.phone ?? "")
                .font(.footnote).opacity(0.85)
        }
        .foregroundStyle(theme.color.onAccent)
        .padding(theme.space.xl)
        .frame(maxWidth: .infinity, minHeight: 210, alignment: .leading)
        .background {
            LinearGradient(colors: [theme.color.accent, theme.color.brand],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
                .clipShape(shape)
                .overlay(
                    LinearGradient(colors: [.white.opacity(0.18), .clear], startPoint: .top, endPoint: .center)
                        .clipShape(shape)
                )
        }
        .overlay(shape.strokeBorder(.white.opacity(0.12), lineWidth: 0.5))
        .dsShadow(theme.elevation.card)
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).monospacedDigit().foregroundStyle(theme.color.textPrimary)
            Text(label).font(.caption).foregroundStyle(theme.color.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous).strokeBorder(theme.color.line, lineWidth: 0.5))
    }
}
