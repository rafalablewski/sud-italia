import SwiftUI
import OttavianoKit

/// The kitchen display — three lanes (New / Firing / Ready) of ticket cards, bump
/// to advance, with a station filter (1:1 with the web KDS columns + station
/// filters). Live over SSE; large touch targets for the line (DESIGN-SYSTEM §4.2
/// KDSTicket). iPad-first; lanes stack on iPhone.
public struct KDSBoardView: View {
    @Environment(\.theme) private var theme
    @State private var store: KDSStore
    /// Station filter (nil = all). Mirrors the web STATION_FILTERS; a ticket shows
    /// when it has any line for the focused station.
    @State private var station: String?

    public init(store: KDSStore) {
        _store = State(initialValue: store)
    }

    public var body: some View {
        ScrollView {
            HStack(alignment: .top, spacing: theme.space.lg) {
                lane("New", filtered(store.incoming))
                lane("Firing", filtered(store.cooking))
                lane("Ready", filtered(store.ready))
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Kitchen")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Menu {
                    Button("All stations") { station = nil }
                    ForEach(stations, id: \.self) { s in Button(s.capitalized) { station = s } }
                } label: {
                    Label(station?.capitalized ?? "All stations", systemImage: "line.3.horizontal.decrease.circle")
                }
            }
            if store.lastCompletedID != nil {
                ToolbarItem(placement: .topBarLeading) {
                    Button { Task { await store.recallLast() } } label: {
                        Label("Recall", systemImage: "arrow.uturn.backward")
                    }
                    .tint(theme.color.warning)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Circle().fill(store.connected ? theme.color.success : theme.color.danger)
                    .frame(width: 10, height: 10)
                    .accessibilityLabel(store.connected ? "Live" : "Reconnecting")
            }
        }
        .task { store.start() }
        .onDisappear { store.stop() }
    }

    /// Stations present on the board right now, for the filter menu.
    private var stations: [String] {
        var set = Set<String>()
        for o in store.orders { for l in o.items { if let c = l.category { set.insert(c) } } }
        return set.sorted()
    }

    /// Apply the station filter — a ticket shows when any of its lines is for the
    /// focused station (web `groupTicketsByColumn` semantics).
    private func filtered(_ orders: [Order]) -> [Order] {
        guard let station else { return orders }
        return orders.filter { $0.items.contains { $0.category == station } }
    }

    private func lane(_ title: String, _ orders: [Order]) -> some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            DSSectionHeader(title) {
                DSBadge("\(orders.count)", tone: orders.isEmpty ? .neutral : .accent)
            }
            if orders.isEmpty {
                DSEmptyState("All clear", systemImage: "checkmark.seal.fill")
                    .frame(maxWidth: .infinity)
            }
            // KDSTicket owns its own age-driven state colour (fresh→cooking→late);
            // the lane `accent` only tints the count badge. Each ticket is
            // Equatable so a single bump doesn't redraw the whole lane.
            ForEach(orders) { order in
                KDSTicket(order: order, bumpTitle: bumpLabel(order.status)) {
                    await store.bumpForward(order)
                }
                .equatable()
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func bumpLabel(_ s: OrderStatus) -> String? {
        switch s {
        case .pending, .confirmed: "Start firing"
        case .preparing: "Bump to pass"
        case .ready: "Complete"
        default: nil
        }
    }
}
