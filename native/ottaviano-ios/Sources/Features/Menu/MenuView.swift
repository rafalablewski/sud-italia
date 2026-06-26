import SwiftUI
import OttavianoKit

/// The customer storefront — a warm, editorial projection of `MenuStore`
/// (APP-SHELL §3: views do no I/O). Brand hero + sectioned menu in the V8
/// Tuscany skin. Opens with no sign-in (Rule #6, zero-friction).
public struct MenuView: View {
    @Environment(\.theme) private var theme
    @State private var store: MenuStore

    public init(store: MenuStore) {
        _store = State(initialValue: store)
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: theme.space.xl) {
                hero
                switch store.state {
                case .idle, .loading:
                    VStack(spacing: theme.space.md) {
                        ForEach(0..<5, id: \.self) { _ in MenuCardSkeleton() }
                    }
                    .padding(.horizontal, theme.space.lg)
                case .failed(let message):
                    ContentUnavailableView("Menu unavailable", systemImage: "wifi.slash", description: Text(message))
                        .padding(.top, theme.space.xxl)
                case .loaded:
                    ForEach(store.categories, id: \.self) { category in
                        VStack(alignment: .leading, spacing: theme.space.md) {
                            Text(category.capitalized)
                                .font(.system(.title2, design: .serif).weight(.semibold))
                                .foregroundStyle(theme.color.textPrimary)
                            ForEach(store.items(in: category)) { item in
                                MenuCard(item: item)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, theme.space.lg)
                    }
                }
                footer
            }
            .padding(.vertical, theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(theme.color.surface, for: .navigationBar)
        .task { if case .idle = store.state { await store.load() } }
        .refreshable { await store.load() }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            BrandWordmark(subtitle: "Soci e amici", onBrand: true)
            HStack(spacing: theme.space.xs) {
                Image(systemName: "mappin.and.ellipse")
                Text(store.locationTitle)
                if let addr = store.location?.address {
                    Text("· \(addr)").lineLimit(1)
                }
            }
            .font(.footnote)
            .foregroundStyle(theme.color.onAccent.opacity(0.9))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.xl)
        .background(theme.color.brand, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .padding(.horizontal, theme.space.lg)
    }

    private var footer: some View {
        Text("Pizza napoletana · forno a legna · Kraków & Warszawa")
            .font(.system(.footnote, design: .serif).italic())
            .foregroundStyle(theme.color.textSecondary)
            .multilineTextAlignment(.center)
            .padding(.top, theme.space.md)
            .padding(.horizontal, theme.space.xl)
    }
}

private struct MenuCard: View {
    @Environment(\.theme) private var theme
    let item: MenuItem
    var body: some View {
        HStack(alignment: .top, spacing: theme.space.md) {
            VStack(alignment: .leading, spacing: theme.space.xs) {
                Text(item.name)
                    .font(.system(.headline, design: .serif))
                    .foregroundStyle(theme.color.textPrimary)
                if !item.description.isEmpty {
                    Text(item.description)
                        .font(.subheadline)
                        .foregroundStyle(theme.color.textSecondary)
                        .lineLimit(3)
                }
                if !item.tags.isEmpty {
                    HStack(spacing: theme.space.xs) {
                        ForEach(item.tags.prefix(3), id: \.self) { TagChip($0) }
                    }
                    .padding(.top, 2)
                }
            }
            Spacer(minLength: theme.space.sm)
            VStack(alignment: .trailing, spacing: theme.space.xs) {
                MoneyText(item.price)
                    .font(.headline)
                    .foregroundStyle(theme.color.brand)
                if !item.available {
                    Text("Sold out")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(theme.color.danger)
                }
            }
        }
        .opacity(item.available ? 1 : 0.55)
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }
}

private struct MenuCardSkeleton: View {
    @Environment(\.theme) private var theme
    var body: some View {
        RoundedRectangle(cornerRadius: theme.cornerRadius)
            .fill(theme.color.surface2)
            .frame(height: 84)
            .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
            .redacted(reason: .placeholder)
    }
}
