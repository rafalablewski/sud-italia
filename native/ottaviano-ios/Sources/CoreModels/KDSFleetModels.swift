import Foundation

// Wire DTOs for the KDS fleet (owner Atlas) + floor-ops (manager header) feeds —
// mirror `/api/v1/admin/kds/fleet` and `/api/v1/admin/kds/floor-ops`
// (docs/native/openapi.json: FleetBoard / FloorOps). Money is grosze (Int).

/// Manager floor-control signals not already in the order stream: throughput
/// (completed last 60 min) + staff on the clock. The KDS KPI strip's Done/hr +
/// On-shift cells.
public struct FloorOps: Codable, Sendable {
    /// The location this reflects, or "" when aggregated chain-wide.
    public let locationSlug: String
    public let throughputLastHour: Int
    public let onShift: Int
}

/// One station's capacity-vs-demand pace row on a fleet tile.
public struct FleetStation: Codable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let currentLoad: Int
    public let forecast: Int
    public let demand: Int
    public let capacity: Double
    /// util %, 999 when capacity is 0.
    public let pct: Int
    /// "calm" | "warn" | "risk".
    public let tier: String
}

public struct FleetCounts: Codable, Sendable {
    public let active: Int
    public let ready: Int
    public let late: Int
    public let risk: Int
}

/// One truck's live KDS health + pace + active-ticket preview.
public struct FleetTile: Codable, Sendable, Identifiable {
    public var id: String { slug }
    public let slug: String
    public let name: String
    public let counts: FleetCounts
    /// 0–100 health score.
    public let health: Int
    public let healthState: String
    /// "good" | "warn" | "risk" | "alert".
    public let healthClass: String
    public let onShift: Int
    public let throughputHr: Int
    public let coversHr: Int
    /// Minor units (grosze), last 60 min.
    public let revenueHr: Int
    public let promiseAccuracy: Double
    public let stations: [FleetStation]
    /// Active-ticket preview — the same enriched orders the KDS board renders.
    public let tickets: [Order]
}

public struct FleetTotals: Codable, Sendable {
    public let active: Int
    public let late: Int
    public let risk: Int
    public let ready: Int
    public let throughputHr: Int
    public let coversHr: Int
    public let revenueHr: Int
}

public struct FleetBenchmark: Codable, Sendable {
    public let fleetAccuracy: Double
    public let leader: String?
    public let gap: Double
}

/// The owner Atlas board — every active truck's KDS health, the cross-truck
/// promise-accuracy benchmark, and fleet totals.
public struct FleetBoard: Codable, Sendable {
    public let generatedAt: String
    public let paceWindowMin: Int
    public let promiseTarget: Int
    public let totals: FleetTotals
    public let benchmark: FleetBenchmark
    public let tiles: [FleetTile]
}
