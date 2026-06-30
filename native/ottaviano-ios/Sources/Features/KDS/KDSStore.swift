import SwiftUI
import OttavianoKit

/// The live kitchen display store — the heart of OttavianoKDS. Follows the
/// operator SSE board (`/api/v1/orders/stream`) with auto-reconnect, and bumps
/// tickets through the pipeline (`PATCH /api/v1/orders/:id`). The bump is
/// optimistic; the next SSE frame reconciles to server truth.
/// A recallable completion — a ticket bumped to completed within the last 10
/// minutes (the mis-tap undo window), mirroring the web KDS recall tray.
public struct KDSRecall: Identifiable, Sendable, Equatable {
    public let id: String       // orderId
    public let label: String    // "#shortId"
    public let at: Date
}

@MainActor
@Observable
public final class KDSStore {
    public private(set) var orders: [Order] = []
    public private(set) var connected = false
    /// Recently completed tickets (newest first, ≤5) — the recall tray. The web
    /// keeps a 10-min undo window; `liveRecents` applies it on read.
    public private(set) var recents: [KDSRecall] = []
    /// Stream paused (the web pause/resume control) — stops following the board.
    public private(set) var paused = false
    /// Manager floor-ops header signals (throughput + on-shift) — nil until
    /// loaded, or when the operator's role can't read the manager endpoint.
    public private(set) var floorOps: FloorOps?

    private let api: APIClient
    private let sse: SSEClient
    private let location: String?
    private var streamTask: Task<Void, Never>?

    /// 10-minute recall window — the API only un-bumps for ~10 min after the bump.
    private static let recallWindow: TimeInterval = 10 * 60

    public init(api: APIClient, sse: SSEClient, location: String? = nil) {
        self.api = api; self.sse = sse; self.location = location
    }

    /// Recall entries still inside the 10-min undo window (filtered on read so no
    /// timer is needed — the board re-renders on its kitchen tick).
    public var liveRecents: [KDSRecall] {
        recents.filter { Date().timeIntervalSince($0.at) < Self.recallWindow }
    }

    public func start() {
        guard streamTask == nil, !paused else { return }
        // Task{} inside a @MainActor method inherits MainActor isolation, so the
        // body reads/writes the store's state directly (no actor hops).
        streamTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                do {
                    let query = location.map { ["location": $0] } ?? [:]
                    let stream = sse.stream("orders/stream", query: query, as: OrderBoardFrame<Order>.self)
                    connected = true
                    for try await frame in stream { orders = frame.orders }
                } catch { /* fall through to reconnect */ }
                connected = false
                if Task.isCancelled { break }
                try? await Task.sleep(for: .seconds(3)) // reconnect backoff
            }
        }
    }

    public func stop() { streamTask?.cancel(); streamTask = nil }

    /// Pause / resume following the live board (web pause control). Pausing stops
    /// the SSE follow; resuming reconnects and reconciles to server truth.
    public func togglePause() {
        paused.toggle()
        if paused { stop() } else { start() }
    }

    /// Advance a ticket: cooking → ready → completed. Optimistic local update
    /// (status is `var`), reconciled by the next SSE frame or reloaded on error.
    public func bumpForward(_ order: Order) async {
        guard let next = Self.nextStatus(order.status) else { return }
        if let i = orders.firstIndex(where: { $0.id == order.id }) {
            orders[i].status = next
        }
        if next == .completed {
            // Arm the recall undo — newest first, keep the last 5 (web tray cap).
            recents.insert(KDSRecall(id: order.id, label: "#\(order.ticketShortId)", at: Date()), at: 0)
            recents = Array(recents.prefix(5))
        }
        do { _ = try await api.send(.bump(orderID: order.id, to: next)) }
        catch { await reload() } // revert to truth on failure
    }

    /// Recall a completed ticket (completed → ready) — the mis-tap undo. Reuses
    /// POST /api/v1/orders/:id/recall; the next SSE frame brings the recalled
    /// ticket back onto the Ready lane.
    public func recall(_ orderID: String) async {
        recents.removeAll { $0.id == orderID }
        do { _ = try await api.send(.recall(orderID: orderID)) }
        catch { await reload() }
    }

    private func reload() async {
        if let board = try? await api.send(.operatorBoard(location: location)) { orders = board }
    }

    /// Load the manager floor-ops header (Done/hr + On-shift). Best-effort: a
    /// kitchen/staff token gets 403, so failures silently leave `floorOps` nil
    /// and the KPI strip just omits those two cells (no faked numbers, Rule #1).
    public func loadFloorOps() async {
        floorOps = try? await api.send(.adminKdsFloorOps(location: location))
    }

    // Three lanes, 1:1 with the web KDS board (New · Firing · Ready·Expo —
    // src/core/kds/kds-board.ts KDS_COLUMNS): confirmed → preparing → ready.
    public var incoming: [Order] { orders.filter { $0.status == .pending || $0.status == .confirmed } }
    public var cooking: [Order] { orders.filter { $0.status == .preparing } }
    public var ready: [Order] { orders.filter { $0.status == .ready } }

    static func nextStatus(_ s: OrderStatus) -> OrderStatus? {
        switch s {
        case .pending, .confirmed: .preparing
        case .preparing: .ready
        case .ready: .completed
        default: nil
        }
    }
}
