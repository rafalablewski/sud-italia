import Foundation

// Guest hub DTOs for the two Core surfaces that complete `/core/guest` parity:
// the WhatsApp **Inbox** (`/api/v1/admin/whatsapp`) and the **Concierge** MCP
// capability layer (`/api/v1/admin/concierge`). Mirror the facade routes, which
// in turn mirror the web `CoreInbox`/`CoreConcierge` data (Rule #1).

// MARK: - Inbox (/api/v1/admin/whatsapp)

/// One merged conversation row — a historic transcript, a live WhatsApp session,
/// or both (a live session overlays cart / pending-payment state on the head).
public struct WaConversation: Codable, Sendable, Identifiable {
    public var id: String { phone }
    public let phone: String
    public let lastAt: String
    public let customerName: String?
    public let cartCount: Int
    public let cartSubtotalGrosze: Grosze
    public let fulfillmentType: String?
    public let pendingPaymentUrl: String?
    public let messageCount: Int
    public let lastBody: String
    public let hasActiveSession: Bool
}

/// Derived channel snapshot — counts only, no separate counter to keep in sync.
public struct WaMetricsLite: Codable, Sendable {
    public let totalConversations: Int
    public let activeSessions: Int
    public let awaitingPayment: Int
    public let cartsWithItems: Int
    public let paidLast7d: Int
    public let conversionRateLast7d: Double
}

/// `GET /api/v1/admin/whatsapp` — the Inbox payload (list + metrics in one call).
public struct WaInbox: Codable, Sendable {
    public let conversations: [WaConversation]
    public let metrics: WaMetricsLite
}

/// One message in a transcript thread (mirrors the store `WaMessage`).
public struct WaThreadMessage: Codable, Sendable, Identifiable {
    // No server id — the (at, direction, body) triple is unique enough to key a
    // SwiftUI ForEach within a single thread render.
    public var id: String { "\(at)·\(direction)·\(body.prefix(24))" }
    public let at: String
    public let direction: String   // "in" | "out"
    public let kind: String
    public let body: String
    public let actor: String       // "customer" | "bot" | "operator" | "system"

    public var inbound: Bool { direction == "in" }
}

/// `GET /api/v1/admin/whatsapp/:phone` — a transcript thread.
public struct WaThread: Codable, Sendable {
    public let phone: String
    public let messages: [WaThreadMessage]
}

/// `POST /api/v1/admin/whatsapp/:phone/message` — operator reply result.
public struct WaSendResult: Codable, Sendable {
    public let ok: Bool
    public let messageId: String?
}

// MARK: - Concierge (/api/v1/admin/concierge)

/// One MCP capability an external agent (or the WhatsApp bot) can reach.
public struct ConciergeCapability: Codable, Sendable, Identifiable {
    public let id: String
    public let kind: String        // "tool" | "resource"
    public let label: String
    public let desc: String
    public let transport: String   // "public" | "conversational"
    public let exposed: Bool
}

public struct ConciergeEndpoints: Codable, Sendable {
    public let httpReadApi: String
    public let whatsAppWebhook: String
}

/// `GET /api/v1/admin/concierge` — the capability layer + exposure state.
public struct ConciergeInfo: Codable, Sendable {
    public let capabilities: [ConciergeCapability]
    public let liveCount: Int
    public let totalCount: Int
    public let whatsAppConfigured: Bool
    public let endpoints: ConciergeEndpoints
}
