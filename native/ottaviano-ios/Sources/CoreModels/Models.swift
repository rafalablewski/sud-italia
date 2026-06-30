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

// MARK: - Account data & privacy (GDPR Art. 15/17 · Apple 5.1.1(v))

/// A single order line in the self-serve data export. Lightweight + tolerant
/// (only the fields the app renders are required) so it decodes cleanly off the
/// server's full domain `Order` blob without coupling to its every field.
public struct ExportOrder: Codable, Sendable, Identifiable {
    public let id: String
    public let createdAt: String?
    public let status: String?
    public let totalAmount: Grosze?
    public let locationSlug: String?
}

/// `GET /api/v1/customer/account/export` — the signed-in guest's own data (DSAR).
public struct CustomerDataExport: Codable, Sendable {
    public let phone: String
    public let exportedAt: String
    public let orders: [ExportOrder]
}

/// `DELETE /api/v1/customer/account` — the erasure receipt.
public struct AccountDeleteResult: Codable, Sendable {
    public let deleted: Bool
    public let redactedOrders: Int
    public let removedLoyaltyMember: Bool
    public let revokedSessions: Int
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

/// A resolved modifier pick on a KDS ticket — the cook-readable option label
/// plus the menu's `flagOnKds` callout (e.g. BUFALO MOZZ, highlighted). The
/// server resolves these from the modifier catalogue so the app needn't carry it.
public struct OrderModifier: Codable, Sendable, Hashable {
    public let label: String
    public let flag: Bool
}

public struct OrderLine: Codable, Sendable, Identifiable, Equatable {
    public var id: String { menuItemId + "-" + (notes ?? "") }
    public let menuItemId: String
    public let name: String
    /// Menu category — drives the KDS station filter. Optional for resilience.
    public let category: String?
    public let quantity: Int
    public let unitPrice: Grosze
    public let notes: String?
    /// Resolved modifier picks (label + KDS flag). Optional for resilience
    /// against frames that predate the field.
    public let modifiers: [OrderModifier]?
    /// Allergens for the line's dish — the KDS allergen callout.
    public let allergens: [String]?
}

public enum OrderStatus: String, Codable, Sendable, CaseIterable {
    case pending, confirmed, preparing, ready, assigned
    case pickedUp = "picked_up", delivered, completed, cancelled
}

/// POS coursing state (dine-in) — which courses are away vs still in the
/// kitchen. Drives the KDS "Coursed · … held" callout.
public struct OrderCoursing: Codable, Sendable, Equatable {
    public let fired: [String]
    public let held: [String]
}

/// Server-computed predicted-ready model for one ticket (`analyzeTruck`, per
/// location). Drives the KDS SLA meter, the due countdown and the at-risk tone
/// tier — the predictive parity with the web board. Times are ms epoch.
public struct OrderPrediction: Codable, Sendable, Equatable {
    /// Promised-ready instant (ms epoch) from the order SLA, or nil.
    public let promisedReadyAtMs: Double?
    /// Model's predicted-ready instant (ms epoch).
    public let predictedReadyAtMs: Double
    /// Seconds until predicted plate-up, from the frame's compute time.
    public let predSeconds: Int
    /// Model predicts the promise will be missed, before it is actually late.
    public let atRisk: Bool
}

public struct Order: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    /// Short, glanceable ticket id (last 6, uppercased) — the KDS card header.
    /// Optional for resilience; `ticketShortId` derives a fallback.
    public let shortId: String?
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
    /// Dine-in party size (covers), when known — the KDS channel chip.
    public let partySize: Int?
    /// Assigned table, when seated.
    public let tableId: String?
    /// Free-text guest instructions for the whole ticket — the KDS "Note".
    public let specialInstructions: String?
    public let slotDate: String
    public let slotTime: String
    public let createdAt: String
    /// Set when the order has been settled (paid). Nil = unpaid.
    public let paidAt: String?
    public let estimatedReadyAt: String?
    /// Synthetic / simulation marker (KDS sim banner). Defaults false.
    public let simulated: Bool?
    /// POS coursing callout (dine-in), when the ticket was coursed.
    public let coursing: OrderCoursing?
    /// Predictive block (SLA meter / at-risk tier) — present on the live board
    /// frames; nil on single-order reads the model doesn't score.
    public let prediction: OrderPrediction?

    /// Glanceable ticket id — server `shortId`, or a derived fallback (last 6,
    /// uppercased) for any frame that predates the field.
    public var ticketShortId: String {
        if let shortId, !shortId.isEmpty { return shortId }
        return String(id.suffix(6)).uppercased()
    }
}

/// A floor table for the POS dine-in table picker (read-only over v1). Mirrors
/// the web FloorTable (subset).
public struct FloorTable: Codable, Sendable, Identifiable {
    public let id: String
    public let number: String
    public let seats: Int
    public let zone: String?
    /// "available" | "seated" | "reserved" | "out-of-service".
    public let status: String
    public let notes: String?
}

/// Operator-applied manual discount on a POS check (on top of any auto combo).
/// The server re-prices from this at fire/charge — never the client. Mirrors the
/// web PosTabDiscount.
public struct PosTabDiscount: Codable, Sendable, Equatable {
    /// "amount" (grosze) or "percent" (whole 0–100).
    public let type: String
    public let value: Int
    public let reason: String?
    public init(type: String, value: Int, reason: String? = nil) {
        self.type = type; self.value = value; self.reason = reason
    }
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
    /// Delivery: free-text address.
    public let address: String?
    public let customerName: String?
    public let customerPhone: String?
    /// Operator manual discount (on top of any auto combo).
    public let discount: PosTabDiscount?
    public let coursed: Bool?
    /// Server-owned: which courses have been fired to the kitchen so far.
    public let firedCourses: [String]?
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
