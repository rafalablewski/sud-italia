import SwiftUI
import OttavianoKit

/// The customer menu — a pure projection of `MenuStore` state (APP-SHELL §3:
/// views do no I/O). Sectioned by category, money via `MoneyText`, themed.
public struct MenuView: View {
    @Environment(\.theme) private var theme
    @State private var store: MenuStore

    public init(store: MenuStore) {
        _store = State(initialValue: store)
    }

    public var body: some View {
        List {
            switch store.state {
            case .idle, .loading:
                ForEach(0..<6, id: \.self) { _ in MenuRowSkeleton() }
            case .failed(let message):
                ContentUnavailableView("Menu unavailable", systemImage: "wifi.slash", description: Text(message))
            case .loaded:
                ForEach(store.categories, id: \.self) { category in
                    Section(category.capitalized) {
                        ForEach(store.items.filter { $0.category == category }) { item in
                            MenuRow(item: item)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Menu")
        .task { if case .idle = store.state { await store.load() } }
        .refreshable { await store.load() }
    }
}

private struct MenuRow: View {
    @Environment(\.theme) private var theme
    let item: MenuItem
    var body: some View {
        HStack(alignment: .top, spacing: theme.space.md) {
            VStack(alignment: .leading, spacing: theme.space.xs) {
                Text(item.name).font(.headline).foregroundStyle(theme.color.textPrimary)
                if !item.description.isEmpty {
                    Text(item.description).font(.subheadline)
                        .foregroundStyle(theme.color.textSecondary).lineLimit(2)
                }
            }
            Spacer(minLength: theme.space.sm)
            MoneyText(item.price)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(item.available ? theme.color.textPrimary : theme.color.textSecondary)
        }
        .opacity(item.available ? 1 : 0.5)
        .padding(.vertical, theme.space.xs)
    }
}

private struct MenuRowSkeleton: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(.quaternary)
            .frame(height: 18)
            .redacted(reason: .placeholder)
            .padding(.vertical, 6)
    }
}
