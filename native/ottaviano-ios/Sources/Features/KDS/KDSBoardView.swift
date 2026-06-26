import SwiftUI
import OttavianoKit

/// The kitchen display — two lanes (Cooking / Ready) of ticket cards, bump to
/// advance. Live over SSE; large touch targets for the line (DESIGN-SYSTEM §4.2
/// KDSTicket). iPad-first; lanes stack on iPhone.
public struct KDSBoardView: View {
    @Environment(\.theme) private var theme
    @State private var store: KDSStore

    public init(store: KDSStore) {
        _store = State(initialValue: store)
    }

    public var body: some View {
        ScrollView {
            HStack(alignment: .top, spacing: theme.space.lg) {
                lane("New", store.incoming)
                lane("Firing", store.cooking)
                lane("Ready", store.ready)
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Kitchen")
        .toolbar {
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
