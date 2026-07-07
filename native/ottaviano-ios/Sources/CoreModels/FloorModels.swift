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

/// Result of a table move — the party (and its open dine-in check) relocated to
/// `to`; `moved` is the count of reassigned orders.
public struct FloorMoveResult: Codable, Sendable {
    public let ok: Bool
    public let action: String
    public let moved: Int
    public let from: String
    public let to: String
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
    /// booking (default) | walk-in — a walk-in was seated on arrival, no prior hold.
    public let source: String?
    /// ISO — start of live occupancy (stamped on the seat transition).
    public let seatedAt: String?
    /// ISO — party left; (seatedAt→completedAt) is one realised turn.
    public let completedAt: String?
    /// Guest-needs the table had to satisfy (accessible | high-chair | step-free).
    public let needs: [String]?
    /// Combined tables for a big party (held / freed together).
    public let joinedTableIds: [String]?
    public let createdAt: String
}

public struct ReservationDeleteResult: Codable, Sendable {
    public let deleted: Bool
    public let id: String
}

// MARK: - Dispatch (/api/v1/admin/dispatch)

/// One line on a delivery order card (name × quantity; money stays on the order).
public struct DispatchLine: Codable, Sendable {
    public let name: String
    public let quantity: Int
}

/// A live delivery order on the dispatch board. `totalGrosze` is minor units.
public struct DispatchOrder: Codable, Sendable, Identifiable {
    public let id: String
    public let status: String   // confirmed | preparing | ready | assigned | picked_up
    public let customerName: String
    public let deliveryAddress: String?
    public let totalGrosze: Grosze
    public let assignedDriverId: String?
    public let items: [DispatchLine]
    public let createdAt: String
}

/// A driver on the roster (staff in the delivery role group, active only).
public struct DispatchDriver: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let role: String
}

/// `GET /api/v1/admin/dispatch` envelope payload: in-flight deliveries + drivers.
public struct DispatchBoard: Codable, Sendable {
    public let orders: [DispatchOrder]
    public let drivers: [DispatchDriver]
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

// MARK: - Demand Exchange (/api/v1/admin/demand-exchange)

public struct DemandSlotRow: Codable, Sendable, Identifiable {
    public var id: String { slotId }
    public let slotId: String
    public let time: String
    public let status: String
    public let fulfillmentTypes: [String]
    public let maxOrders: Int
    public let currentOrders: Int
    public let predictedDemand: Int
    public let throughputCapacity: Int?
    public let advertisedUtil: Double
    public let kitchenUtil: Double?
    public let tier: String          // under | healthy | tight | over | kitchen-capped
    public let recommendedMaxOrders: Int
    public let minSpendGrosze: Grosze
    public let recommendedMinSpendGrosze: Grosze
    public let action: String        // raise | trim | protect | hold
    public let missedDemand: Int
    public let note: String
}

public struct DemandSummary: Codable, Sendable {
    public let predictedCovers: Int
    public let advertisedCapacity: Int
    public let throughputCapacity: Int?
    public let fillForecastPct: Double
    public let overCount: Int
    public let underCount: Int
    public let kitchenCappedCount: Int
    public let missedDemand: Int
}

public struct DemandBoard: Codable, Sendable {
    public let date: String
    public let weekday: Int
    public let generatedAt: String
    public let intervalMin: Int
    public let kitchenCoversPerHour: Double?
    public let slots: [DemandSlotRow]
    public let summary: DemandSummary
}

/// `GET /api/v1/admin/demand-exchange` envelope payload.
public struct DemandBoardWrapper: Codable, Sendable {
    public let board: DemandBoard
}

public struct DemandApplyResult: Codable, Sendable {
    public let ok: Bool
    public let applied: Int?
}
