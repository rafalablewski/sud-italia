import SwiftUI
import CoreModels

/// Navigation-as-data (APP-SHELL §4): an exhaustive enum drives the
/// NavigationStack path / split selection, so deep links + restoration + cross-
/// feature jumps are all "append a Route".
public enum Route: Hashable, Codable, Sendable {
    // customer
    case menu(locationSlug: String)
    case orderTracker(orderID: String)
    case rewards
    case account
    // operator
    case board(location: String?)
    case orderDetail(orderID: String)
}

@MainActor
@Observable
public final class Router {
    public var path = NavigationPath()
    public var sheet: Route?
    public init() {}
    public func push(_ route: Route) { path.append(route) }
    public func present(_ route: Route) { sheet = route }
    public func popToRoot() { path = NavigationPath() }
}
