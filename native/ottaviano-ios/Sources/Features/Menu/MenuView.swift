import SwiftUI
import OttavianoKit

/// The customer storefront — a warm, editorial projection of `MenuStore`
/// (APP-SHELL §3: views do no I/O). Brand hero + location switcher + sectioned
/// menu with add-to-cart, in the V8 Tuscany skin. Opens with no sign-in (Rule #6,
/// zero-friction). The cart is shared via the environment; checkout is a sheet.
public struct MenuView: View {
    @Environment(\.theme) private var theme
    @Environment(CartStore.self) private var cart
    @State private var store: MenuStore
    private let locations: LocationsStore
    @Binding private var selectedLocation: String
    private let session: CustomerSession
    private let api: APIClient
    @State private var showCart = false
    @State private var showLocations = false

    public init(
        store: MenuStore,
        locations: LocationsStore,
        selectedLocation: Binding<String>,
        session: CustomerSession,
        api: APIClient
    ) {
        _store = State(initialValue: store)
        self.locations = locations
        self._selectedLocation = selectedLocation
        self.session = session
        self.api = api
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
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { showLocations = true } label: {
                    Label(store.locationTitle, systemImage: "mappin.and.ellipse").font(.subheadline)
                }
            }
            ToolbarItem(placement: .topBarTrailing) { cartButton }
        }
        .sheet(isPresented: $showLocations) {
            LocationPickerView(store: locations, selected: $selectedLocation)
        }
        .sheet(isPresented: $showCart) {
            CartView(cart: cart, api: api, profile: session.profile)
        }
        .task { if case .idle = store.state { await store.load() } }
        .refreshable { await store.load() }
    }

    private var cartButton: some View {
        Button { showCart = true } label: {
            Image(systemName: "bag\(cart.itemCount > 0 ? ".fill" : "")")
                .overlay(alignment: .topTrailing) {
                    if cart.itemCount > 0 {
                        Text("\(cart.itemCount)")
                            .font(.caption2.weight(.bold)).monospacedDigit()
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(theme.color.accent, in: Capsule())
                            .foregroundStyle(theme.color.onAccent)
                            .offset(x: 10, y: -10)
                    }
                }
        }
        .accessibilityLabel("Cart, \(cart.itemCount) items")
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            BrandWordmark(subtitle: "Soci e amici", onBrand: true)
            Button { showLocations = true } label: {
                HStack(spacing: theme.space.xs) {
                    Image(systemName: "mappin.and.ellipse")
                    Text(store.locationTitle)
                    if let addr = store.location?.address { Text("· \(addr)").lineLimit(1) }
                    Image(systemName: "chevron.down").font(.caption2)
                }
                .font(.footnote)
                .foregroundStyle(theme.color.onAccent.opacity(0.9))
            }
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
    @Environment(CartStore.self) private var cart
    let item: MenuItem

    private var qty: Int { cart.quantity(of: item) }

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
            VStack(alignment: .trailing, spacing: theme.space.sm) {
                MoneyText(item.price)
                    .font(.headline)
                    .foregroundStyle(theme.color.brand)
                if !item.available {
                    Text("Sold out")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(theme.color.danger)
                } else {
                    addControl
                }
            }
        }
        .opacity(item.available ? 1 : 0.55)
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }

    @ViewBuilder
    private var addControl: some View {
        if qty == 0 {
            Button { cart.add(item) } label: {
                Label("Add", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, theme.space.md).padding(.vertical, 6)
                    .foregroundStyle(theme.color.onAccent)
                    .background(theme.color.accent, in: Capsule())
            }
            .buttonStyle(.plain)
            .sensoryFeedback(.impact(weight: .light), trigger: qty)
        } else {
            HStack(spacing: theme.space.md) {
                stepButton("minus") { cart.setQuantity(qty - 1, for: item) }
                Text("\(qty)").font(.subheadline.weight(.bold)).monospacedDigit()
                    .foregroundStyle(theme.color.textPrimary).frame(minWidth: 18)
                stepButton("plus") { cart.add(item) }
            }
            .padding(.horizontal, theme.space.sm).padding(.vertical, 4)
            .overlay(Capsule().strokeBorder(theme.color.accent, lineWidth: 1.5))
            .sensoryFeedback(.selection, trigger: qty)
        }
    }

    private func stepButton(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.subheadline.weight(.bold)).foregroundStyle(theme.color.accent)
                .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
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
