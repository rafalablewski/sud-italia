import Foundation

// Request/response shapes for the customer auth + order-create flows. Mirrors the
// /api/v1 contract (replace with generated types later — see README Codegen).

public struct OtpRequestResult: Codable, Sendable {
    public let sent: Bool
    public let channel: String?
    public let expiresInSec: Int?
    /// Present only in non-prod with no SMS provider — lets the dev flow proceed.
    public let devCode: String?
}

/// Verify response = TokenPair fields + a small customer stub (flat JSON).
public struct CustomerAuthResult: Codable, Sendable {
    public struct CustomerStub: Codable, Sendable {
        public let phone: String
        public let name: String?
    }
    public let accessToken: String
    public let refreshToken: String
    public let expiresIn: Int
    public let refreshExpiresIn: Int?
    public let tokenType: String
    public let customer: CustomerStub

    public var tokenPair: TokenPair {
        TokenPair(
            accessToken: accessToken, refreshToken: refreshToken,
            expiresIn: expiresIn, refreshExpiresIn: refreshExpiresIn, tokenType: tokenType
        )
    }
}

/// Body for `POST /api/v1/orders`. Server prices it; the client only sends intent.
public struct OrderCreateRequest: Codable, Sendable {
    public struct Item: Codable, Sendable {
        public let id: String
        public let quantity: Int
        public let notes: String?
        public init(id: String, quantity: Int, notes: String? = nil) {
            self.id = id; self.quantity = quantity; self.notes = notes
        }
    }
    public let locationSlug: String
    public let items: [Item]
    public let fulfillmentType: String
    public let customerName: String?
    public let customerPhone: String?
    public let slotId: String?
    public let slotDate: String?
    public let slotTime: String?
    public let immediate: Bool?
    public let tableNumber: String?
    public let tipAmount: Grosze?

    public init(
        locationSlug: String, items: [Item], fulfillmentType: String,
        customerName: String? = nil, customerPhone: String? = nil,
        slotId: String? = nil, slotDate: String? = nil, slotTime: String? = nil,
        immediate: Bool? = nil, tableNumber: String? = nil, tipAmount: Grosze? = nil
    ) {
        self.locationSlug = locationSlug; self.items = items
        self.fulfillmentType = fulfillmentType
        self.customerName = customerName; self.customerPhone = customerPhone
        self.slotId = slotId; self.slotDate = slotDate; self.slotTime = slotTime
        self.immediate = immediate; self.tableNumber = tableNumber; self.tipAmount = tipAmount
    }
}
