import SwiftUI
import OttavianoKit

/// Live order tracker — the customer-facing twin of the KDS. Hydrates from
/// GET /api/v1/customer/orders/:id, then follows the ownership-gated SSE stream
/// so an operator's KDS bump moves the timeline in real time (the Live Activity
/// surface, APP-SHELL §5.2).
public struct OrderTrackerView: View {
    @Environment(\.theme) private var theme
    private let orderID: String
    private let api: APIClient
    private let sse: SSEClient

    @State private var order: Order?
    @State private var error: String?

    public init(orderID: String, api: APIClient, sse: SSEClient) {
        self.orderID = orderID; self.api = api; self.sse = sse
    }

    // The happy-path lifecycle shown as a timeline (terminal states handled inline).
    private let steps: [OrderStatus] = [.pending, .confirmed, .preparing, .ready, .completed]

    public var body: some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            if let order {
                Text("Order \(order.id)").font(.headline).foregroundStyle(theme.color.textPrimary)
                timeline(current: order.status)
                if let eta = order.estimatedReadyAt {
                    Label("Ready ~\(eta)", systemImage: "clock").foregroundStyle(theme.color.textSecondary)
                }
                Divider()
                ForEach(order.items) { line in
                    HStack {
                        Text("\(line.quantity)× \(line.name)").foregroundStyle(theme.color.textPrimary)
                        Spacer()
                        MoneyText(line.unitPrice * line.quantity).foregroundStyle(theme.color.textSecondary)
                    }
                }
                HStack {
                    Text("Total").font(.headline)
                    Spacer()
                    MoneyText(order.totalAmount).font(.headline)
                }.foregroundStyle(theme.color.textPrimary)
            } else if let error {
                ContentUnavailableView("Can't track this order", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ProgressView()
            }
            Spacer()
        }
        .padding(theme.space.lg)
        .background(theme.color.surface)
        .navigationTitle("Tracking")
        .task { await follow() }
    }

    private func timeline(current: OrderStatus) -> some View {
        let idx = steps.firstIndex(of: current) ?? 0
        let cancelled = current == .cancelled
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.offset) { i, step in
                HStack(spacing: theme.space.md) {
                    Circle()
                        .fill(cancelled ? theme.color.danger : (i <= idx ? theme.color.accent : theme.color.surface2))
                        .frame(width: 14, height: 14)
                    Text(label(step))
                        .foregroundStyle(i <= idx ? theme.color.textPrimary : theme.color.textSecondary)
                    Spacer()
                }
                .padding(.vertical, theme.space.xs)
            }
            if cancelled {
                Text("This order was cancelled.").font(.footnote).foregroundStyle(theme.color.danger)
            }
        }
    }

    private func label(_ s: OrderStatus) -> String {
        switch s {
        case .pending: "Placed"
        case .confirmed: "Confirmed"
        case .preparing: "In the kitchen"
        case .ready: "Ready"
        case .completed: "Completed"
        default: s.rawValue.capitalized
        }
    }

    private func follow() async {
        // Initial snapshot, then live updates.
        do { order = try await api.send(.myOrder(id: orderID)) }
        catch { self.error = "Couldn't load this order"; return }
        do {
            let stream = sse.stream("customer/orders/\(orderID)/stream", as: OrderTrackFrame<Order>.self)
            for try await frame in stream { order = frame.order }
        } catch {
            // Stream dropped (backgrounded / network) — the snapshot still shows.
        }
    }
}
