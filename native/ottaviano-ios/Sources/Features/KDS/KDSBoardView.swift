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
                lane("Cooking", store.cooking, accent: theme.color.warning)
                lane("Ready", store.ready, accent: theme.color.success)
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Kitchen")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Circle().fill(store.connected ? theme.color.success : theme.color.danger)
                    .frame(width: 10, height: 10)
                    .accessibilityLabel(store.connected ? "Live" : "Reconnecting")
            }
        }
        .task { store.start() }
        .onDisappear { store.stop() }
    }

    private func lane(_ title: String, _ orders: [Order], accent: Color) -> some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            HStack {
                Text(title).font(.headline).foregroundStyle(theme.color.textPrimary)
                Text("\(orders.count)").font(.caption.weight(.bold)).foregroundStyle(accent)
            }
            if orders.isEmpty {
                Text("All clear").font(.footnote).foregroundStyle(theme.color.textSecondary)
            }
            ForEach(orders) { order in ticket(order, accent: accent) }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func ticket(_ order: Order, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            HStack {
                Text(order.id).font(.subheadline.weight(.bold)).foregroundStyle(theme.color.textPrimary)
                Spacer()
                Text(order.fulfillmentType).font(.caption).foregroundStyle(theme.color.textSecondary)
            }
            ForEach(order.items) { line in
                Text("\(line.quantity)× \(line.name)").foregroundStyle(theme.color.textPrimary)
                if let notes = line.notes, !notes.isEmpty {
                    Text(notes).font(.caption.italic()).foregroundStyle(theme.color.warning)
                }
            }
            if let label = bumpLabel(order.status) {
                Button { Task { await store.bumpForward(order) } } label: {
                    Text(label).font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(theme.color.onAccent)
                        .background(accent, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
                }
                .buttonStyle(.plain)
                .sensoryFeedback(.success, trigger: order.status)
            }
        }
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2).fill(accent).frame(width: 4)
        }
    }

    private func bumpLabel(_ s: OrderStatus) -> String? {
        switch s {
        case .pending, .confirmed, .preparing: "Bump → Ready"
        case .ready: "Complete"
        default: nil
        }
    }
}
