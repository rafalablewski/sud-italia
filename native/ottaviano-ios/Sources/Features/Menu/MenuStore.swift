import SwiftUI
import OttavianoKit

/// Feature store for the customer storefront (APP-SHELL §3 — `@Observable`,
/// MainActor, constructor-injected services, no I/O in views). Loads the menu and
/// the location header for one bounded context (a single restaurant).
@MainActor
@Observable
public final class MenuStore {
    public enum LoadState: Sendable { case idle, loading, loaded, failed(String) }

    public private(set) var items: [MenuItem] = []
    public private(set) var location: Location?
    public private(set) var state: LoadState = .idle
    public let locationSlug: String

    private let api: APIClient

    public init(locationSlug: String, api: APIClient) {
        self.locationSlug = locationSlug
        self.api = api
    }

    public func load() async {
        state = .loading
        do {
            // Location header is best-effort — the menu is what matters.
            if let locs = try? await api.send(.locations()) {
                location = locs.first { $0.slug == locationSlug } ?? locs.first
            }
            items = try await api.send(.menu(location: locationSlug))
            state = .loaded
        } catch let error as APIError {
            state = .failed(message(for: error))
        } catch {
            state = .failed("Something went wrong")
        }
    }

    private func message(for error: APIError) -> String {
        switch error {
        case .transport: return "You appear to be offline"
        case .api(_, let message, _): return message
        case .decoding, .authExpired: return "Couldn't load the menu"
        }
    }

    /// A friendly city name for the header even before `/locations` resolves.
    public var locationTitle: String {
        location?.city ?? locationSlug.capitalized
    }

    public var categories: [String] {
        var seen = Set<String>(), ordered: [String] = []
        for item in items where !seen.contains(item.category) {
            seen.insert(item.category); ordered.append(item.category)
        }
        return ordered
    }

    public func items(in category: String) -> [MenuItem] {
        items.filter { $0.category == category }
    }
}
