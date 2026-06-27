import SwiftUI
import CoreModels

// KDSTicket — the single most performance-sensitive component (hundreds on a
// busy line). DESIGN-SYSTEM §4.2: order #, items + mods, an age timer that shifts
// the ticket fresh → cooking → late by elapsed time, and a bump action. Value-
// driven and `Equatable` so a lane of tickets only redraws the ones whose data
// changed. The age recomputes on a coarse TimelineView tick (every 30s) — no
// per-ticket Timer, no main-thread churn.
public struct KDSTicket: View, Equatable {
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let order: Order
    private let bumpTitle: String?
    private let onBump: (() async -> Void)?

    public init(order: Order, bumpTitle: String? = nil, onBump: (() async -> Void)? = nil) {
        self.order = order; self.bumpTitle = bumpTitle; self.onBump = onBump
    }

    // Equatable on the data only — the closures don't affect the render. This is
    // what lets SwiftUI skip untouched tickets when one updates. `nonisolated`
    // because `View` is @MainActor but `Equatable.==` is a nonisolated requirement;
    // the witness only reads immutable Sendable storage (order / bumpTitle), so it's
    // safe off the main actor (Swift 6 strict concurrency).
    nonisolated public static func == (lhs: KDSTicket, rhs: KDSTicket) -> Bool {
        lhs.order.id == rhs.order.id
            && lhs.order.status == rhs.order.status
            && lhs.bumpTitle == rhs.bumpTitle
            && lhs.order.items.count == rhs.order.items.count
    }

    public var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { ctx in
            let mins = elapsedMinutes(at: ctx.date)
            let state = theme.ticketState(elapsedMinutes: mins)
            ticket(state: state, accent: theme.ticketColor(state), minutes: mins)
        }
    }

    private func ticket(state: Theme.TicketState, accent: Color, minutes: Double) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            HStack(alignment: .firstTextBaseline) {
                Text(order.id).textRole(.bodyEmphasis).foregroundStyle(theme.color.textPrimary)
                Spacer()
                DSBadge(ageLabel(minutes), tone: badgeTone(state), systemImage: ageIcon(state))
            }
            Text(order.fulfillmentType.capitalized)
                .textRole(.caption).foregroundStyle(theme.color.textSecondary)

            ForEach(order.items) { line in
                HStack(alignment: .top, spacing: theme.space.xs) {
                    Text("\(line.quantity)×").textRole(.mono).foregroundStyle(accent)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(line.name).textRole(.body).foregroundStyle(theme.color.textPrimary)
                        if let notes = line.notes, !notes.isEmpty {
                            Text(notes).textRole(.caption).italic().foregroundStyle(theme.color.warning)
                        }
                    }
                }
            }

            if let bumpTitle, let onBump {
                Button { Task { await onBump() } } label: {
                    Text(bumpTitle).textRole(.bodyEmphasis)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(theme.color.onAccent)
                        .background(accent, in: RoundedRectangle(cornerRadius: theme.radius.md))
                }
                .buttonStyle(.plain)
                .sensoryFeedback(.success, trigger: order.status)
            }
        }
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg))
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2).fill(accent)
                .frame(width: 4).padding(.vertical, theme.space.xs)
        }
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg).strokeBorder(
            state == .late ? theme.color.danger : .clear, lineWidth: 1.5))
        .dsAnimation(theme.motion.snappy, value: state, reduceMotion: reduceMotion)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Order \(order.id), \(stateLabel(state)), \(Int(minutes)) minutes")
    }

    // MARK: timing

    private func elapsedMinutes(at now: Date) -> Double {
        guard let created = Self.parseISO(order.createdAt) else { return 0 }
        return max(0, now.timeIntervalSince(created) / 60.0)
    }

    private func ageLabel(_ minutes: Double) -> String { "\(Int(minutes))m" }
    private func badgeTone(_ s: Theme.TicketState) -> DSBadge.Tone {
        switch s { case .fresh: .success; case .cooking: .warning; case .late: .danger }
    }
    private func ageIcon(_ s: Theme.TicketState) -> String {
        switch s { case .fresh: "clock"; case .cooking: "flame.fill"; case .late: "exclamationmark.triangle.fill" }
    }
    private func stateLabel(_ s: Theme.TicketState) -> String {
        switch s { case .fresh: "fresh"; case .cooking: "cooking"; case .late: "late" }
    }

    // Cached formatters — `parseISO` runs on every periodic tick for every ticket,
    // and ISO8601DateFormatter init is costly. `nonisolated(unsafe)` because the
    // type isn't Sendable but access is confined to the main actor (KDS rendering),
    // so there's no real race.
    nonisolated(unsafe) private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    nonisolated(unsafe) private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    private static func parseISO(_ s: String) -> Date? {
        if let d = isoFractional.date(from: s) { return d }
        return isoPlain.date(from: s)
    }
}

#if DEBUG
// Order has no cross-module memberwise init (Models.swift), so the preview
// decodes a sample rather than constructing one.
private enum KDSTicketPreviewData {
    static let order: Order = {
        let json = """
        {"id":"#A-204","locationSlug":"krakow","status":"preparing","fulfillmentType":"dine_in",
         "customerName":"Ada","customerPhone":"+48500100200",
         "items":[{"menuItemId":"pizza-margherita","name":"Margherita","quantity":2,"unitPrice":2790,"notes":"no basil"},
                  {"menuItemId":"espresso","name":"Espresso","quantity":1,"unitPrice":900,"notes":null}],
         "totalAmount":6480,"slotDate":"2026-06-26","slotTime":"19:00",
         "createdAt":"2026-06-26T18:52:00.000Z","estimatedReadyAt":null}
        """
        return (try? JSONDecoder().decode(Order.self, from: Data(json.utf8)))!
    }()
}

#Preview("KDSTicket · KDS") {
    ScrollView {
        KDSTicket(order: KDSTicketPreviewData.order, bumpTitle: "Bump → Ready") {}
            .padding()
            .frame(maxWidth: 360)
    }
    .environment(\.theme, .kds)
    .background(Theme.kds.color.surface)
    .preferredColorScheme(.dark)
}
#endif
