import SwiftUI
import OttavianoKit

/// The customer's orders — active (tap to track live) above past. Drives the
/// tracker via a typed navigation destination on the order id.
public struct OrdersListView: View {
    @Environment(\.theme) private var theme
    @State private var store: OrdersStore
    private let api: APIClient
    private let sse: SSEClient

    public init(store: OrdersStore, api: APIClient, sse: SSEClient) {
        _store = State(initialValue: store)
        self.api = api
        self.sse = sse
    }

    public var body: some View {
        List {
            switch store.state {
            case .idle, .loading:
                ProgressView()
            case .failed(let message):
                ContentUnavailableView("Couldn't load orders", systemImage: "wifi.slash", description: Text(message))
            case .loaded where store.orders.isEmpty:
                ContentUnavailableView("No orders yet", systemImage: "bag", description: Text("Your orders will appear here."))
            case .loaded:
                if !store.active.isEmpty {
                    Section("Active") { ForEach(store.active) { row($0, live: true) } }
                }
                if !store.past.isEmpty {
                    Section("Past") { ForEach(store.past) { row($0, live: false) } }
                }
            }
        }
        .navigationTitle("Orders")
        .navigationDestination(for: String.self) { id in
            OrderTrackerView(orderID: id, api: api, sse: sse)
        }
        .task { await store.load() }
        .refreshable { await store.load() }
    }

    private func row(_ order: Order, live: Bool) -> some View {
        NavigationLink(value: order.id) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(order.id).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                    Text(order.status.rawValue.capitalized).font(.caption)
                        .foregroundStyle(live ? theme.color.accent : theme.color.textSecondary)
                }
                Spacer()
                MoneyText(order.totalAmount).foregroundStyle(theme.color.textPrimary)
            }
        }
    }
}
