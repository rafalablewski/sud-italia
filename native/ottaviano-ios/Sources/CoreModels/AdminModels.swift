import Foundation

// Operator (OttavianoKDS) admin DTOs — mirror the `/api/v1/admin/*` responses,
// which in turn mirror the web admin pages' data (src/lib/store.ts shapes).
// Money is grosze (Int) unless a field is an average/ratio (Double). Hand-written
// to match the routes; swap for generated types when the OpenAPI contract covers
// these surfaces.

/// `/api/v1/admin/customers` — CRM rollup (CustomerRollup).
public struct AdminCustomer: Codable, Sendable, Identifiable {
    public var id: String { phone }
    public let phone: String
    public let name: String?
    public let email: String?
    public let birthday: String?
    public let totalSpentGrosze: Grosze
    public let orderCount: Int
    public let firstOrderAt: String?
    public let lastOrderAt: String?
    public let loyaltyPointsBalance: Int
    public let manualPointsAdjust: Int
    public let smsOptout: Bool
    public let emailOptout: Bool
    public let notes: String?
}

/// `/api/v1/admin/staff` — roster (StaffMember).
public struct AdminStaff: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let phone: String?
    public let email: String?
    public let role: String
    public let locationSlug: String
    public let hourlyRateGrosze: Grosze
    public let hireDate: String?
    public let status: String
    public let notes: String?
}

/// `/api/v1/admin/suppliers` — vendor catalogue (Supplier).
public struct AdminSupplier: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let contactName: String?
    public let email: String?
    public let phone: String?
    public let leadTimeDays: Int?
    public let notes: String?
    public let createdAt: String
}

/// `/api/v1/admin/feedback` — guest reviews (FeedbackEntry).
public struct AdminFeedback: Codable, Sendable, Identifiable {
    public let id: String
    public let orderId: String
    public let customerName: String
    public let locationSlug: String
    public let date: String
    public let overallRating: Double
    public let comment: String
    public let status: String
    public let sentiment: String?
    public let themes: [String]?
}

/// `/api/v1/admin/inventory` — joined stock row (StockRowDTO).
public struct AdminStockRow: Codable, Sendable, Identifiable {
    public var id: String { ingredientId + "@" + locationSlug }
    public let ingredientId: String
    public let name: String
    public let category: String
    public let unit: String
    public let locationSlug: String
    public let onHand: Double
    public let parLevel: Double
    public let reorderPoint: Double
    public let low: Bool
    public let lastCountedAt: String?
    public let updatedAt: String
}

/// `/api/v1/admin/slots` — fulfilment time-slots (TimeSlot).
public struct AdminSlot: Codable, Sendable, Identifiable {
    public let id: String
    public let locationSlug: String
    public let date: String
    public let time: String
    public let maxOrders: Int
    public let currentOrders: Int
    public let fulfillmentTypes: [String]
    public let status: String
    public let minSpendGrosze: Grosze?
}

/// `/api/v1/admin/purchase-orders` — PO summary row (route DTO).
public struct AdminPurchaseOrder: Codable, Sendable, Identifiable {
    public let id: String
    public let supplierId: String
    public let supplierName: String
    public let locationSlug: String
    public let status: String
    public let lineCount: Int
    public let totalCents: Grosze
    public let expectedAt: String?
    public let receivedAt: String?
    public let createdAt: String
}

/// `/api/v1/admin/summary` — sales/cost/profit rollup (SummaryStats).
public struct AdminSummary: Codable, Sendable {
    public struct TopItem: Codable, Sendable, Identifiable {
        public var id: String { name }
        public let name: String
        public let quantity: Int
        public let revenue: Grosze
    }
    public struct DailyStat: Codable, Sendable, Identifiable {
        public var id: String { date }
        public let date: String
        public let revenue: Grosze
        public let profit: Grosze
        public let orderCount: Int
        public let itemCount: Int
    }
    public let totalRevenue: Grosze
    public let totalCost: Grosze
    public let totalProfit: Grosze
    public let profitMargin: Double
    public let totalOrders: Int
    public let totalItems: Int
    public let avgOrderValue: Double
    public let takeoutCount: Int
    public let deliveryCount: Int
    public let dineInCount: Int
    public let topItems: [TopItem]
    public let dailyStats: [DailyStat]
}
