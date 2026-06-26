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

// MARK: - Wave 2

/// `/api/v1/admin/menu` — operator menu row (price + cost + availability).
public struct AdminMenuItem: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let description: String
    public let price: Grosze
    public let cost: Grosze
    public let category: String
    public let available: Bool
    public let tags: [String]
    public let menuRole: String?
    public let sku: String?
    public let prepTimeMinutes: Int?
    public let isLimited: Bool
}

/// `/api/v1/admin/recipes` — chain-wide recipe with resolved names (Rule #10).
public struct AdminRecipe: Codable, Sendable, Identifiable {
    public struct Line: Codable, Sendable, Identifiable {
        public var id: String { name }
        public let name: String
        public let unit: String
        public let quantity: Double
    }
    public let id: String
    public let menuItemId: String
    public let dishName: String
    public let yieldPortions: Int
    public let prepTimeMinutes: Int?
    public let ingredients: [Line]
}

/// `/api/v1/admin/loyalty` — enrolled member (LoyaltyMember).
public struct AdminLoyaltyMember: Codable, Sendable, Identifiable {
    public var id: String { phone }
    public let phone: String
    public let name: String
    public let lastName: String?
    public let nickname: String?
    public let email: String?
    public let signedUpAt: String
    public let dob: String?
}

/// `/api/v1/admin/tasks` — a shift to-do (Task).
public struct AdminTask: Codable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let detail: String?
    public let assigneeName: String
    public let priority: String
    public let dueDate: String?
    public let status: String
    public let createdAt: String
}

/// `/api/v1/admin/alerts` — an operational notification (Notification).
public struct AdminAlert: Codable, Sendable, Identifiable {
    public let id: String
    public let type: String
    public let title: String
    public let message: String
    public let locationSlug: String?
    public let createdAt: String
    public let read: Bool
}

/// `/api/v1/admin/announcements` — a team broadcast (route DTO).
public struct AdminAnnouncement: Codable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let body: String
    public let createdByName: String
    public let pinned: Bool
    public let createdAt: String
    public let readCount: Int
}

/// `/api/v1/admin/schedule` — a scheduled shift with staff name (route DTO).
public struct AdminShift: Codable, Sendable, Identifiable {
    public let id: String
    public let staffId: String
    public let staffName: String
    public let locationSlug: String
    public let startAt: String
    public let endAt: String
    public let role: String
    public let status: String
}

// MARK: - Wave 3

/// `/api/v1/admin/users` — staff account (safe fields only; no secrets).
public struct AdminUser: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let email: String?
    public let role: String
    public let status: String
    public let locationSlug: String?
    public let locationSlugs: [String]?
    public let mfaEnabled: Bool
    public let hasPasskeys: Bool
    public let createdAt: String
}

/// `/api/v1/admin/audit-log` — a privileged-action entry (route DTO).
public struct AdminAuditEntry: Codable, Sendable, Identifiable {
    public let id: String
    public let actor: String
    public let action: String
    public let entityType: String?
    public let entityId: String?
    public let occurredAt: String
}

/// `/api/v1/admin/cash` — a till session summary (route DTO).
public struct AdminCashSession: Codable, Sendable, Identifiable {
    public let id: String
    public let locationSlug: String
    public let openedAt: String
    public let openedBy: String
    public let openingFloat: Grosze
    public let dropCount: Int
    public let dropsTotal: Grosze
    public let closingCountGrosze: Grosze?
    public let varianceGrosze: Grosze?
    public let closedAt: String?
    public let open: Bool
}

/// `/api/v1/admin/business-costs` — a recurring cost (route DTO).
public struct AdminBusinessCost: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let category: String
    public let vendor: String?
    public let amountGrosze: Grosze
    public let frequency: String
    public let locationSlug: String?
    public let nextDueDate: String?
}

/// `/api/v1/admin/compliance` — a licence/inspection with expiry (route DTO).
public struct AdminComplianceItem: Codable, Sendable, Identifiable {
    public let id: String
    public let locationSlug: String
    public let kind: String
    public let title: String
    public let expiresAt: String
    public let expired: Bool
    public let lastRenewedAt: String?
}

/// `/api/v1/admin/events` — an event / large-party booking (route DTO).
public struct AdminEvent: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let locationSlug: String
    public let date: String
    public let status: String
    public let expectedAttendance: Int?
    public let actualRevenueGrosze: Grosze?
}

/// `/api/v1/admin/waste` — a wastage entry (route DTO).
public struct AdminWasteEntry: Codable, Sendable, Identifiable {
    public let id: String
    public let locationSlug: String
    public let item: String
    public let quantity: Double
    public let unit: String
    public let reason: String
    public let estimatedCostGrosze: Grosze?
    public let recordedAt: String
}

/// `/api/v1/admin/surveys` — a pulse survey with response rollup (route DTO).
public struct AdminSurvey: Codable, Sendable, Identifiable {
    public let id: String
    public let question: String
    public let trigger: String
    public let active: Bool
    public let responseCount: Int
    public let avgRating: Double
}
