import Foundation

// Wire DTOs for /api/v1. Hand-written stand-ins that mirror the OpenAPI contract
// (docs/native/openapi.json) — replace with swift-openapi-generator output (see
// README "Codegen"). Money is minor units (grosze): an Int, formatted by
// MoneyText in DesignSystem.

public typealias Grosze = Int

public struct TokenPair: Codable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let expiresIn: Int
    public let refreshExpiresIn: Int?
    public let tokenType: String
}

public struct CustomerProfile: Codable, Sendable, Identifiable {
    public var id: String { phone }
    public let phone: String
    public let name: String?
    public let email: String?
    public let points: Int
    public let tier: String
    public let orderCount: Int
    public let totalSpentGrosze: Grosze
}

public struct Location: Codable, Sendable, Identifiable {
    public var id: String { slug }
    public let slug: String
    public let name: String
    public let city: String
    public let address: String
    public let shortDescription: String
    public let currency: String
}

public struct MenuItem: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let description: String
    public let price: Grosze
    public let currency: String
    public let category: String
    public let image: String?
    public let tags: [String]
    public let available: Bool
}

public struct OrderLine: Codable, Sendable, Identifiable {
    public var id: String { menuItemId + "-" + (notes ?? "") }
    public let menuItemId: String
    public let name: String
    /// Menu category — drives the KDS station filter. Optional for resilience.
    public let category: String?
    public let quantity: Int
    public let unitPrice: Grosze
    public let notes: String?
}

public enum OrderStatus: String, Codable, Sendable, CaseIterable {
    case pending, confirmed, preparing, ready, assigned
    case pickedUp = "picked_up", delivered, completed, cancelled
}

public struct Order: Codable, Sendable, Identifiable {
    public let id: String
    public let locationSlug: String
    /// `var` so an optimistic UI (KDS bump) can update a decoded copy without
    /// the (internal) memberwise initializer being needed across modules.
    public var status: OrderStatus
    public let fulfillmentType: String
    /// Order channel — web / qr / whatsapp / pos (DTO defaults to "web"). Optional
    /// for resilience against any frame that predates the field.
    public let channel: String?
    public let customerName: String
    public let customerPhone: String
    public let items: [OrderLine]
    public let totalAmount: Grosze
    public let slotDate: String
    public let slotTime: String
    public let createdAt: String
    /// Set when the order has been settled (paid). Nil = unpaid.
    public let paidAt: String?
    public let estimatedReadyAt: String?
}

/// An open POS check (Tabs). Lines carry id+qty(+course) only; prices resolve
/// server-side at send/charge. Mirrors the web PosTab.
public struct PosTabLine: Codable, Sendable {
    public let menuItemId: String
    public let quantity: Int
    public let course: String?
}

public struct PosTab: Codable, Sendable, Identifiable {
    public let id: String
    public let locationSlug: String
    public let name: String
    public let channel: String?
    public let status: String
    public let items: [PosTabLine]
    public let tableId: String?
    public let covers: Int?
    public let customerName: String?
    public let customerPhone: String?
    public let coursed: Bool?
    public let sentKds: Bool
    public let orderId: String?
    public let createdAt: String
    public let updatedAt: String

    public var lineCount: Int { items.reduce(0) { $0 + $1.quantity } }
}

public struct PaymentIntentDTO: Codable, Sendable {
    public let clientSecret: String
    public let publishableKey: String
    public let amount: Grosze
    public let currency: String
    public let orderId: String
}
