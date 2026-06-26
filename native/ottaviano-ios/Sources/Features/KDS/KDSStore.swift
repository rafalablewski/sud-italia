import SwiftUI
import OttavianoKit

/// The live kitchen display store — the heart of OttavianoKDS. Follows the
/// operator SSE board (`/api/v1/orders/stream`) with auto-reconnect, and bumps
/// tickets through the pipeline (`PATCH /api/v1/orders/:id`). The bump is
/// optimistic; the next SSE frame reconciles to server truth.
@MainActor
@Observable
public final class KDSStore {
    public private(set) var orders: [Order] = []
    public private(set) var connected = false
    /// The last ticket bumped to completed — the mis-tap recall target, mirroring
    /// the web KDS "recall last completed" insurance. Cleared once recalled.
    public private(set) var lastCompletedID: String?

    private let api: APIClient
    private let sse: SSEClient
    private let location: String?
    private var streamTask: Task<Void, Never>?

    public init(api: APIClient, sse: SSEClient, location: String? = nil) {
        self.api = api; self.sse = sse; self.location = location
    }

    public func start() {
        guard streamTask == nil else { return }
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

    /// Advance a ticket: cooking → ready → completed. Optimistic local update
    /// (status is `var`), reconciled by the next SSE frame or reloaded on error.
    public func bumpForward(_ order: Order) async {
        guard let next = Self.nextStatus(order.status) else { return }
        if let i = orders.firstIndex(where: { $0.id == order.id }) {
            orders[i].status = next
        }
        if next == .completed { lastCompletedID = order.id } // arm the recall undo
        do { _ = try await api.send(.bump(orderID: order.id, to: next)) }
        catch { await reload() } // revert to truth on failure
    }

    /// Recall the last ticket bumped to completed (completed → ready) — the
    /// mis-tap undo. Reuses POST /api/v1/orders/:id/recall; the next SSE frame
    /// brings the recalled ticket back onto the Ready lane.
    public func recallLast() async {
        guard let id = lastCompletedID else { return }
        lastCompletedID = nil
        do { _ = try await api.send(.recall(orderID: id)) }
        catch { await reload() }
    }

    private func reload() async {
        if let board = try? await api.send(.operatorBoard(location: location)) { orders = board }
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
