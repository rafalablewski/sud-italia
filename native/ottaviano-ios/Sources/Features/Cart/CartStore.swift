import SwiftUI
import OttavianoKit

/// The customer cart — one bounded context, shared between the menu (add) and the
/// cart/checkout (review + place). Built at the app root and injected through the
/// environment so the Order tab and the cart sheet see the same lines. Zero-
/// friction (Rule #6): no account needed to build a cart; identity is only asked
/// for at checkout, and even then guest checkout is allowed.
@MainActor
@Observable
public final class CartStore {
    /// A cart line: the menu item plus a quantity. Keyed by item id in `lines`.
    public struct Line: Identifiable, Sendable {
        public let item: MenuItem
        public var quantity: Int
        public var notes: String?
        public var id: String { item.id }
        public var subtotal: Grosze { item.price * quantity }
    }

    public private(set) var lines: [Line] = []
    /// The location the cart is for — switching locations clears the cart, since
    /// prices and availability are per-location.
    public private(set) var locationSlug: String

    public init(locationSlug: String) { self.locationSlug = locationSlug }

    public func setLocation(_ slug: String) {
        guard slug != locationSlug else { return }
        locationSlug = slug
        lines.removeAll()
    }

    public func add(_ item: MenuItem, quantity: Int = 1) {
        if let i = lines.firstIndex(where: { $0.id == item.id }) {
            lines[i].quantity += quantity
        } else {
            lines.append(Line(item: item, quantity: quantity, notes: nil))
        }
    }

    public func setQuantity(_ q: Int, for item: MenuItem) {
        guard let i = lines.firstIndex(where: { $0.id == item.id }) else { return }
        if q <= 0 { lines.remove(at: i) } else { lines[i].quantity = q }
    }

    public func quantity(of item: MenuItem) -> Int {
        lines.first(where: { $0.id == item.id })?.quantity ?? 0
    }

    public func remove(_ item: MenuItem) { lines.removeAll { $0.id == item.id } }
    public func clear() { lines.removeAll() }

    public var itemCount: Int { lines.reduce(0) { $0 + $1.quantity } }
    public var isEmpty: Bool { lines.isEmpty }
    public var subtotal: Grosze { lines.reduce(0) { $0 + $1.subtotal } }

    /// Build the server order-create request (server prices it — the client only
    /// sends intent, Rule: server-priced order create).
    public func makeRequest(fulfillment: String, name: String?, phone: String?, tableNumber: String?) -> OrderCreateRequest {
        OrderCreateRequest(
            locationSlug: locationSlug,
            items: lines.map { .init(id: $0.item.id, quantity: $0.quantity, notes: $0.notes) },
            fulfillmentType: fulfillment,
            customerName: name?.isEmpty == false ? name : nil,
            customerPhone: phone?.isEmpty == false ? phone : nil,
            tableNumber: tableNumber?.isEmpty == false ? tableNumber : nil
        )
    }
}
// Injected via `.environment(cart)` at the app root and read with
// `@Environment(CartStore.self)` — the same @Observable environment pattern the
// Router uses (no custom EnvironmentKey, which can't carry a @MainActor default).
