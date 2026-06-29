import Foundation

// Wire DTOs for the Core Service (Floor plan) + Guest (Booking, CRM detail)
// surfaces — mirror the new `/api/v1/admin/floor/*` and
// `/api/v1/admin/customers/:phone*` facade routes. Money is grosze (Int).

// MARK: - Floor twin (/api/v1/admin/floor/twin)

/// One table in the live room (TwinTableRow). `predictedFreeInMin`/`elapsedMin`
/// are nil when unknown — never faked.
public struct FloorTwinTable: Codable, Sendable, Identifiable {
    public let id: String
    public let number: String
    public let seats: Int
    public let zone: String?
    public let status: String   // available | seated | reserved | out-of-service
    public let turns: Int
    public let medianDwellMin: Double?
    public let avgSpendGrosze: Grosze?
    public let spendVelocityPerHourGrosze: Grosze?
    public let occupied: Bool
    public let occupiedSince: String?
    public let elapsedMin: Double?
    public let predictedFreeInMin: Double?
    public let party: Int?
    public let openCheckGrosze: Grosze?
    public let notes: String?
}

public struct FloorTwinSummary: Codable, Sendable {
    public let totalTables: Int
    public let openTables: Int
    public let seated: Int
    public let occupancyPct: Double
    public let freeingSoon15: Int
    public let freeingSoon30: Int
    public let medianTurnMin: Double?
    public let spendVelocityPerHourGrosze: Grosze?
}

public struct FloorTwin: Codable, Sendable {
    public let generatedAt: String
    public let tables: [FloorTwinTable]
    public let summary: FloorTwinSummary
}

/// Kitchen-bottleneck signal fused onto the floor (when to slow seating).
public struct FloorKitchen: Codable, Sendable {
    public let tier: String          // calm | warn | risk
    public let station: String?
    public let label: String?
    public let util: Int
}

/// `GET /api/v1/admin/floor/twin` envelope payload.
public struct FloorRoom: Codable, Sendable {
    public let twin: FloorTwin
    public let kitchen: FloorKitchen
}

/// Result of a seat/clear action.
public struct FloorSeatResult: Codable, Sendable {
    public let ok: Bool
    public let tableId: String
    public let status: String
}

// MARK: - Reservations / booking

public struct Reservation: Codable, Sendable, Identifiable {
    public let id: String
    public let locationSlug: String
    public let customerName: String
    public let customerPhone: String?
    public let partySize: Int
    public let date: String
    public let time: String
    public let durationMin: Int
    public let tableId: String?
    public let slotId: String?
    public let status: String   // booked | seated | completed | cancelled | no-show
    public let notes: String?
    public let createdAt: String
}

public struct ReservationDeleteResult: Codable, Sendable {
    public let deleted: Bool
    public let id: String
}

// MARK: - CRM customer detail (/api/v1/admin/customers/:phone)

public struct CrmMember: Codable, Sendable {
    public let phone: String?
    public let name: String?
    public let lastName: String?
    public let nickname: String?
    public let email: String?
    public let dob: String?
    public let signedUpAt: String?
}

public struct CrmOrder: Codable, Sendable, Identifiable {
    public let id: String
    public let createdAt: String
    public let status: String
    public let totalAmount: Grosze
    public let itemCount: Int
    public let locationSlug: String
    public let fulfillmentType: String
    public let channel: String?
}

public struct CrmTotals: Codable, Sendable {
    public let totalSpent: Grosze
    public let orderCount: Int
    public let avgOrderValue: Grosze
    public let lastOrderAt: String?
    public let firstOrderAt: String?
    public let channels: [String]
    public let locations: [String]
    public let earnedPoints: Int
    public let manualPoints: Int
    public let redeemedPoints: Int
    public let spendablePoints: Int
}

public struct CrmNote: Codable, Sendable, Identifiable {
    public let id: String
    public let body: String
    public let tags: [String]
    public let authoredBy: String?
    public let createdAt: String
}

public struct CrmCustomerDetail: Codable, Sendable {
    public let phone: String
    public let name: String?
    public let member: CrmMember?
    public let smsOptIn: Bool
    public let emailOptIn: Bool
    public let orders: [CrmOrder]
    public let totals: CrmTotals
    public let notes: [CrmNote]
}

public struct CrmConsentResult: Codable, Sendable {
    public let phone: String
    public let smsOptIn: Bool
    public let emailOptIn: Bool
}

public struct CrmPointsResult: Codable, Sendable {
    public let phone: String
    public let delta: Int
    public let manualPointsTotal: Int
}
