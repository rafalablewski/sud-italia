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

// MARK: - Wave 4

/// `/api/v1/admin/settings?surface=` — a flat, read-only settings projection.
public struct SettingsSurface: Codable, Sendable {
    public struct Field: Codable, Sendable { public let label: String; public let value: String }
    public let surface: String
    public let title: String
    public let fields: [Field]
}

/// Shared per-location KPI row (used by insights + multi-location).
public struct AdminLocationKPI: Codable, Sendable, Identifiable {
    public var id: String { locationSlug }
    public let locationSlug: String
    public let city: String
    public let revenue: Grosze
    public let profit: Grosze
    public let profitMargin: Double
    public let orderCount: Int
    public let avgOrderValue: Double
    public let cancellationRate: Double
}

/// `/api/v1/admin/insights` — analytics rollup (route DTO).
public struct AdminInsights: Codable, Sendable {
    public struct NamedSale: Codable, Sendable, Identifiable {
        public var id: String { name }
        public let name: String
        public let quantity: Int
        public let revenue: Grosze
    }
    public struct PeakHour: Codable, Sendable, Identifiable {
        public var id: Int { hour }
        public let hour: Int
        public let orderCount: Int
        public let revenue: Grosze
    }
    public let avgItemsPerOrder: Double
    public let cancelledOrders: Int
    public let cancellationRate: Double
    public let topSellers: [NamedSale]
    public let worstSellers: [NamedSale]
    public let peakHours: [PeakHour]
    public let locationComparison: [AdminLocationKPI]
}

/// `/api/v1/admin/expansion` — new-site readiness summary (route DTO).
public struct AdminExpansion: Codable, Sendable, Identifiable {
    public var id: String { locationSlug }
    public let locationSlug: String
    public let city: String?
    public let total: Int
    public let done: Int
    public let pct: Int
    public let updatedAt: String
}

/// `/api/v1/admin/scheduled-bundles` — a recurring bundle intent (route DTO).
public struct AdminScheduledBundle: Codable, Sendable, Identifiable {
    public let id: String
    public let bundleName: String
    public let customerPhone: String
    public let locationSlug: String
    public let weekday: String
    public let readyAt: String
    public let itemCount: Int
    public let status: String
}

// MARK: - Wave 5

/// `/api/v1/admin/corporate` — a corporate/B2B account (route DTO).
public struct AdminCorporate: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let slug: String
    public let memberCount: Int
    public let billingEmail: String?
    public let locationSlug: String?
}

/// `/api/v1/admin/manage-locations` — a location with status (route DTO).
public struct AdminManagedLocation: Codable, Sendable, Identifiable {
    public var id: String { slug }
    public let slug: String
    public let name: String
    public let city: String
    public let address: String
    public let isActive: Bool
    public let servesAlcohol: Bool
    public let displayOrder: Int
}

/// `/api/v1/admin/campaigns` — a WhatsApp broadcast campaign (route DTO).
public struct AdminCampaign: Codable, Sendable, Identifiable {
    public let id: String
    public let template: String
    public let audienceLabel: String
    public let sentCount: Int
    public let failedCount: Int
    public let total: Int
    public let status: String
    public let createdAt: String
}

/// `/api/v1/admin/handover` — a shift handover record (route DTO).
public struct AdminHandover: Codable, Sendable, Identifiable {
    public let id: String
    public let locationSlug: String
    public let shift: String
    public let outgoingManager: String
    public let incomingManager: String?
    public let cashVarianceGrosze: Grosze?
    public let tempChecksOk: Bool
    public let equipmentOk: Bool
    public let managerComment: String?
    public let recordedAt: String
}

/// `/api/v1/admin/permissions` — the role × permission-group matrix (route DTO).
public struct AdminPermissionMatrix: Codable, Sendable {
    public struct Grant: Codable, Sendable { public let role: String; public let granted: Int }
    public struct Group: Codable, Sendable, Identifiable {
        public let id: String
        public let label: String
        public let total: Int
        public let grants: [Grant]
    }
    public let roles: [String]
    public let groups: [Group]
}

// MARK: - Wave 7

/// `/api/v1/admin/haccp` — a temperature reading. `tempCelsius` is TENTHS of a
/// degree (−50 = −5.0 °C); divide by 10 for display.
public struct AdminTempLog: Codable, Sendable, Identifiable {
    public let id: String
    public let locationSlug: String
    public let sensor: String
    public let tempCelsius: Int
    public let status: String
    public let recordedBy: String?
    public let recordedAt: String
    public var celsius: Double { Double(tempCelsius) / 10.0 }
}

/// `/api/v1/admin/menu-engineering` — one Kasavana-Smith matrix line (route DTO).
public struct AdminMenuEngineeringLine: Codable, Sendable, Identifiable {
    public var id: String { menuItemId }
    public let menuItemId: String
    public let name: String
    public let category: String
    public let unitsSold: Int
    public let gpPerUnit: Grosze
    public let revenue: Grosze
    public let quadrant: String
    public let menuRole: String?
}

/// `/api/v1/admin/regulatory` — per-location disclosure config (route DTO).
public struct AdminRegulatory: Codable, Sendable, Identifiable {
    public var id: String { locationSlug }
    public let locationSlug: String
    public let city: String
    public let zone: String
    public let dohGrade: String?
    public let calorieDisclosureRequired: Bool
    public let halalCertId: String?
    public let halalCertExpires: String?
}

// MARK: - Wave 8

/// `/api/v1/admin/simulation` — the Calculator's P&L projection (route DTO).
public struct AdminSimulation: Codable, Sendable {
    public struct Assumptions: Codable, Sendable {
        public let ordersPerDay: Int
        public let avgTicketGrosze: Grosze
        public let daysOpenPerMonth: Int
        public let cogsPct: Double
        public let paymentProcessorPct: Double?
        public let setupCostGrosze: Grosze?
    }
    public struct PnL: Codable, Sendable {
        public let revenue: Grosze
        public let cogs: Grosze
        public let labor: Grosze
        public let fixed: Grosze
        public let payment: Grosze
        public let netProfit: Grosze
    }
    public struct MonthRow: Codable, Sendable, Identifiable {
        public var id: Int { monthIndex }
        public let month: String
        public let monthIndex: Int
        public let revenue: Grosze
        public let cogs: Grosze
        public let labor: Grosze
        public let fixed: Grosze
        public let payment: Grosze
        public let netProfit: Grosze
    }
    public let assumptions: Assumptions
    public let year1: PnL
    public let months: [MonthRow]
}

// MARK: - Wave 9 (Ops Agent)

/// A single chat message in an Ops-Agent thread.
public struct AgentMessage: Codable, Sendable, Identifiable {
    public let id: String
    public let role: String   // "user" | "assistant"
    public let text: String
    public let createdAt: String
    /// Explicit public init — the synthesized memberwise init is `internal`, so
    /// feature code (a different module) can't build optimistic messages without this.
    public init(id: String, role: String, text: String, createdAt: String) {
        self.id = id; self.role = role; self.text = text; self.createdAt = createdAt
    }
}

/// `/api/v1/admin/agent` (GET) + `/agent/turn` (POST) — the Ops-Agent thread.
public struct AgentThread: Codable, Sendable {
    public let conversationId: String?
    public let title: String?
    public let messages: [AgentMessage]
    public let error: String?
}

// MARK: - Wave 10 (Agent HQ)

/// `/api/v1/admin/agent-hq` — the autonomous-agent command center (route DTO).
public struct AgentHQ: Codable, Sendable {
    public struct Fleet: Codable, Sendable {
        public let runsToday: Int
        public let cost7dGrosze: Grosze
        public let costMonthGrosze: Grosze
        public let successRate7d: Double?
        public let runs7d: Int
    }
    public struct Agent: Codable, Sendable, Identifiable {
        public let id: String
        public let name: String
        public let title: String
        public let status: String
        public let spendTodayGrosze: Grosze
    }
    public struct Event: Codable, Sendable, Identifiable {
        public let id: String
        public let agentId: String
        public let type: String
        public let summary: String
        public let costGrosze: Grosze?
        public let ok: Bool?
        public let at: String
    }
    public let fleet: Fleet
    public let agents: [Agent]
    public let events: [Event]
}
