import SwiftUI
import OttavianoKit

/// Feature store for the customer menu (APP-SHELL §3 — `@Observable`, MainActor,
/// constructor-injected services, no I/O in views). Owns one bounded context.
@MainActor
@Observable
public final class MenuStore {
    public enum LoadState: Sendable { case idle, loading, loaded, failed(String) }

    public private(set) var items: [MenuItem] = []
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

    public var categories: [String] {
        var seen = Set<String>(), ordered: [String] = []
        for item in items where !seen.contains(item.category) {
            seen.insert(item.category); ordered.append(item.category)
        }
        return ordered
    }
}
