import SwiftUI
import OttavianoKit

/// A layout-parity operator surface. Every web admin/core page has a native
/// counterpart in the OttavianoKDS sidebar (`OPERATOR_NAV`); the ones whose data
/// isn't on `/api/v1` yet render here. This is **not** fake data (Rule #1): it
/// states the surface's purpose, the web page it mirrors, the role gate, and the
/// honest wiring status, so the IA is complete and discoverable while the facade
/// catches up (ARCHITECTURE §5 — the contract grows surface by surface).
public struct OperatorSurfaceView: View {
    @Environment(\.theme) private var theme
    private let item: OperatorNavItem
    public init(item: OperatorNavItem) { self.item = item }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                header
                purposeCard
                statusCard
                Spacer(minLength: theme.space.xl)
            }
            .padding(theme.space.lg)
            .frame(maxWidth: 760, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(theme.color.surface)
        .navigationTitle(item.label)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var header: some View {
        HStack(spacing: theme.space.md) {
            Image(systemName: item.icon)
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(theme.color.accent)
                .frame(width: 52, height: 52)
                .background(theme.color.accent.opacity(0.14), in: RoundedRectangle(cornerRadius: theme.cornerRadius))
            VStack(alignment: .leading, spacing: 2) {
                Text(item.label).font(.title2.weight(.bold)).foregroundStyle(theme.color.textPrimary)
                Text(item.id).font(.caption.monospaced()).foregroundStyle(theme.color.textSecondary)
            }
        }
    }

    private var purposeCard: some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            label("WHAT THIS SURFACE DOES")
            Text(item.blurb.isEmpty ? "Mirrors the web operator surface." : item.blurb)
                .font(.body).foregroundStyle(theme.color.textPrimary)
        }
        .panel(theme)
    }

    private var statusCard: some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            label("PARITY STATUS")
            row("Web counterpart", item.id)
            row("Minimum role", item.requiredRole.displayName)
            HStack {
                Text("Data wiring").font(.subheadline).foregroundStyle(theme.color.textSecondary)
                Spacer()
                Text("Pending /api/v1")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, theme.space.sm).padding(.vertical, 4)
                    .background(theme.color.warning.opacity(0.18), in: Capsule())
                    .foregroundStyle(theme.color.warning)
            }
            Text("This screen completes the operator IA so the layout matches the web exactly. Live data lands as the /api/v1 facade is extended to cover this surface.")
                .font(.footnote).foregroundStyle(theme.color.textSecondary)
        }
        .panel(theme)
    }

    private func label(_ text: String) -> some View {
        Text(text).font(.caption2.weight(.bold)).tracking(0.8)
            .foregroundStyle(theme.color.textSecondary)
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack {
            Text(k).font(.subheadline).foregroundStyle(theme.color.textSecondary)
            Spacer()
            Text(v).font(.subheadline.monospaced()).foregroundStyle(theme.color.textPrimary)
        }
    }
}

private extension View {
    /// The standard operator card chrome (surface2 + hairline), reused across surfaces.
    func panel(_ theme: Theme) -> some View {
        self
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(theme.space.lg)
            .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
            .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }
}
