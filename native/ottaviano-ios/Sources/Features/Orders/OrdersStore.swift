import SwiftUI
import OttavianoKit

/// The customer's own orders (history + active), from GET /api/v1/customer/orders.
@MainActor
@Observable
public final class OrdersStore {
    public enum LoadState: Sendable { case idle, loading, loaded, failed(String) }
    public private(set) var orders: [Order] = []
    public private(set) var state: LoadState = .idle
    private let api: APIClient

    public init(api: APIClient) { self.api = api }

    public func load() async {
        if case .loaded = state {} else { state = .loading }
        do { orders = try await api.send(.myOrders()); state = .loaded }
        catch let e as APIError {
            if case .transport = e { state = .failed("You appear to be offline") }
            else { state = .failed("Couldn't load your orders") }
        } catch { state = .failed("Something went wrong") }
    }

    /// Active = not a terminal status; the app surfaces these for tracking.
    public var active: [Order] {
        orders.filter { ![.completed, .delivered, .cancelled].contains($0.status) }
    }
    public var past: [Order] {
        orders.filter { [.completed, .delivered, .cancelled].contains($0.status) }
    }
}
