import SwiftUI
import OttavianoKit

/// Loads the chain's locations once (`GET /api/v1/locations`). Owned by the
/// customer root so the picker and the menu header share one list. Mirrors the
/// web's Locations grid / location switcher — Kraków & Warszawa today.
@MainActor
@Observable
public final class LocationsStore {
    public private(set) var locations: [Location] = []
    public private(set) var loaded = false
    private let api: APIClient
    public init(api: APIClient) { self.api = api }

    public func load() async {
        guard !loaded else { return }
        // Only latch `loaded` on success, so a failed first load can be retried.
        if let locs = try? await api.send(.locations()) {
            locations = locs
            loaded = true
        }
    }

    public func location(_ slug: String) -> Location? { locations.first { $0.slug == slug } }
}

/// A sheet that lets the guest switch which restaurant they're ordering from.
/// Switching clears the cart (prices/availability are per-location).
public struct LocationPickerView: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    private let store: LocationsStore
    @Binding private var selected: String

    public init(store: LocationsStore, selected: Binding<String>) {
        self.store = store; self._selected = selected
    }

    public var body: some View {
        NavigationStack {
            List {
                if store.locations.isEmpty {
                    HStack { Spacer(); ProgressView(); Spacer() }
                }
                ForEach(store.locations) { loc in
                    Button { selected = loc.slug; dismiss() } label: {
                        HStack(alignment: .top, spacing: theme.space.md) {
                            Image(systemName: "mappin.circle.fill")
                                .font(.title2).foregroundStyle(theme.color.brand)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(loc.name).font(.system(.headline, design: .serif))
                                    .foregroundStyle(theme.color.textPrimary)
                                Text(loc.address).font(.caption).foregroundStyle(theme.color.textSecondary)
                                if !loc.shortDescription.isEmpty {
                                    Text(loc.shortDescription).font(.caption).foregroundStyle(theme.color.textSecondary)
                                }
                            }
                            Spacer()
                            if loc.slug == selected {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(theme.color.accent)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Choose a location")
            .navigationBarTitleDisplayMode(.inline)
            .task { await store.load() }
        }
    }
}
