import SwiftUI
import CoreModels

// KDSTicket — the single most performance-sensitive component (hundreds on a
// busy line). DESIGN-SYSTEM §4.2 + web `/core/kds` TicketCard parity: short id,
// channel chip, a predictive due countdown + SLA meter + at-risk tier (driven by
// the server prediction block), coursing callout, station-grouped lines with
// resolved modifiers (KDS-flag highlighted) + notes, an allergen line, the guest
// note, and the bump action. Value-driven + `Equatable` so a lane only redraws
// the tickets whose data changed; the live countdown ticks on a 1s TimelineView
// (web parity) and only the timer/meter nodes recompute per tick.
public struct KDSTicket: View, Equatable {
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let order: Order
    /// Focused station (nil = all). When all stations are shown and a ticket
    /// spans several, lines are grouped under station headers (web semantics);
    /// when a station is focused, off-station lines dim.
    private let station: String?
    private let bumpTitle: String?
    private let onBump: (() async -> Void)?

    public init(order: Order, station: String? = nil, bumpTitle: String? = nil, onBump: (() async -> Void)? = nil) {
        self.order = order; self.station = station; self.bumpTitle = bumpTitle; self.onBump = onBump
    }

    // Equatable on the render-affecting data only (closures don't affect render).
    // Order is Equatable, so a new SSE frame with a changed prediction / status /
    // lines re-renders, while an idle frame between ticks does not. `nonisolated`
    // because Equatable.== is a nonisolated requirement; it reads immutable
    // Sendable storage only (Swift 6 strict concurrency).
    nonisolated public static func == (lhs: KDSTicket, rhs: KDSTicket) -> Bool {
        lhs.order == rhs.order && lhs.station == rhs.station && lhs.bumpTitle == rhs.bumpTitle
    }

    public var body: some View {
        // 1s tick for the live countdown + meter (web ticks the kitchen clock at
        // 1s). The heavy layout (grouping, modifiers) is stable across ticks.
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let nowMs = ctx.date.timeIntervalSince1970 * 1000
            ticket(nowMs: nowMs)
        }
    }

    private func ticket(nowMs: Double) -> some View {
        let due = order.kdsDue(nowMs: nowMs)
        let accent = color(for: due.tone)
        let atRisk = order.isAtRisk
        let groups = order.groupedItems()
        let grouped = station == nil && groups.count > 1
        let allergens = order.ticketAllergens
        let held = order.coursing?.held ?? []

        return VStack(alignment: .leading, spacing: theme.space.sm) {
            // Informational content — one VoiceOver element that speaks the WHOLE
            // ticket (id · channel · tone · due · every line + flagged mods + notes ·
            // allergens · guest note), so a blind line cook hears what to make, not
            // just "order A-204". The bump button stays a SEPARATE element below so
            // it's independently actionable.
            VStack(alignment: .leading, spacing: theme.space.sm) {
                // Header — short id + channel chip · at-risk pill + due countdown.
                HStack(alignment: .firstTextBaseline) {
                    Text("#\(order.ticketShortId)").textRole(.bodyEmphasis).foregroundStyle(theme.color.textPrimary)
                    Text(order.channelTag).textRole(.caption).foregroundStyle(theme.color.textSecondary)
                    Spacer()
                    if atRisk {
                        DSBadge("At risk", tone: .warning, systemImage: "exclamationmark.triangle.fill")
                    }
                    Text(due.text).textRole(.mono).fontWeight(.semibold).foregroundStyle(accent)
                }

                if order.simulated == true {
                    Text("Simulation — not a real order")
                        .textRole(.caption).foregroundStyle(theme.color.textSecondary)
                }

                if !held.isEmpty {
                    // Coursed check — the ⊘ courses are FIRED-later; the cook must
                    // not start them yet (web `/core/kds` held-`⊘` marker). One chip
                    // per held course so it reads at a glance on the line.
                    HStack(spacing: theme.space.xs) {
                        Image(systemName: "hourglass").font(.caption2)
                        Text("Held").textRole(.caption).fontWeight(.bold)
                        ForEach(held, id: \.self) { c in
                            Text("⊘ \(courseLabel(c))")
                                .textRole(.caption)
                                .padding(.horizontal, 6).padding(.vertical, 1)
                                .background(theme.infoSoft, in: Capsule())
                        }
                    }
                    .foregroundStyle(theme.info)
                }

                // Lines — station-grouped when showing all stations.
                ForEach(groups) { group in
                    if grouped {
                        Text(group.label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
                            .padding(.top, 2)
                    }
                    ForEach(group.items) { line in
                        lineRow(line, accent: accent, dim: station != nil && line.category != station)
                    }
                }

                if !allergens.isEmpty {
                    // Allergen callout — a filled danger banner the line can't miss
                    // (web `.core-tk-alrg` large-danger). Icon + colour, never colour
                    // alone (DESIGN-SYSTEM §5, colour-blind cooks).
                    Label {
                        Text("Allergens · \(allergens.joined(separator: " · "))")
                            .textRole(.caption).fontWeight(.bold)
                    } icon: {
                        Image(systemName: "allergens")
                    }
                    .foregroundStyle(theme.color.danger)
                    .padding(.horizontal, theme.space.sm).padding(.vertical, 4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(theme.dangerSoft, in: RoundedRectangle(cornerRadius: theme.radius.sm, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: theme.radius.sm, style: .continuous)
                        .strokeBorder(theme.color.danger.opacity(0.4), lineWidth: 1))
                }

                if let note = order.specialInstructions, !note.isEmpty {
                    HStack(alignment: .firstTextBaseline, spacing: theme.space.xs) {
                        Text("Note").textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textPrimary)
                        Text(note).textRole(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                }

                // Cook-time meter (0 fresh → 1 due), tinted to the live tone.
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(theme.color.line.opacity(0.5))
                        Capsule().fill(accent)
                            .frame(width: max(0, geo.size.width * order.slaFraction(nowMs: nowMs)))
                    }
                }
                .frame(height: 4)
                .accessibilityHidden(true)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(voiceLabel(due: due, groups: groups, allergens: allergens))

            if let bumpTitle, let onBump {
                Button { Task { await onBump() } } label: {
                    Label(bumpTitle, systemImage: "checkmark.circle.fill").textRole(.bodyEmphasis)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .foregroundStyle(theme.color.onAccent)
                        .background(accent, in: RoundedRectangle(cornerRadius: theme.radius.md, style: .continuous))
                        .contentShape(RoundedRectangle(cornerRadius: theme.radius.md, style: .continuous))
                }
                .buttonStyle(DSPressStyle())
                .sensoryFeedback(.success, trigger: order.status)
                .accessibilityLabel("\(bumpTitle), order \(order.ticketShortId)")
                .accessibilityHint("Advances this order to the next kitchen stage")
            }
        }
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2, style: .continuous).fill(accent)
                .frame(width: 4).padding(.vertical, theme.space.xs)
        }
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous).strokeBorder(
            due.tone == .late ? theme.color.danger : .clear, lineWidth: 1.5))
        .dsAnimation(theme.motion.snappy, value: due.tone, reduceMotion: reduceMotion)
    }

    /// The full ticket spoken as one phrase for VoiceOver — every line (with
    /// flagged modifiers + notes), allergens and the guest note, so the kitchen is
    /// usable eyes-free / by a low-vision cook. Built off the same resolved data
    /// the visual rows render (Rule #1 — nothing invented).
    private func voiceLabel(due: (text: String, tone: KdsTone), groups: [KdsItemGroup], allergens: [String]) -> String {
        var parts: [String] = ["Order \(order.ticketShortId)", order.channelTag, toneLabel(due.tone)]
        if order.isAtRisk { parts.append("at risk") }
        parts.append("due \(due.text)")
        for group in groups {
            for line in group.items {
                var l = "\(line.quantity) \(line.name)"
                let flagged = (line.modifiers ?? []).filter(\.flag).map(\.label)
                if !flagged.isEmpty { l += ", \(flagged.joined(separator: ", "))" }
                if let n = line.notes, !n.isEmpty { l += ", \(n)" }
                parts.append(l)
            }
        }
        if !allergens.isEmpty { parts.append("Allergens: \(allergens.joined(separator: ", "))") }
        if let note = order.specialInstructions, !note.isEmpty { parts.append("Note: \(note)") }
        return parts.joined(separator: ". ")
    }

    private func lineRow(_ line: OrderLine, accent: Color, dim: Bool) -> some View {
        HStack(alignment: .top, spacing: theme.space.xs) {
            Text("\(line.quantity)×").textRole(.mono).foregroundStyle(accent)
            VStack(alignment: .leading, spacing: 1) {
                Text(line.name).textRole(.body).foregroundStyle(theme.color.textPrimary)
                let mods = line.modifiers ?? []
                ForEach(mods.indices, id: \.self) { i in
                    // A KDS-flagged option (e.g. BUFALO MOZZ) is the cook's callout.
                    Text(mods[i].flag ? mods[i].label.uppercased() : mods[i].label)
                        .textRole(.caption)
                        .foregroundStyle(mods[i].flag ? theme.color.warning : theme.color.textSecondary)
                }
                if let notes = line.notes, !notes.isEmpty {
                    Text(notes).textRole(.caption).italic().foregroundStyle(theme.color.warning)
                }
            }
        }
        .opacity(dim ? 0.45 : 1)
    }

    // MARK: tone → colour (web `t-*` tones)

    private func color(for tone: KdsTone) -> Color {
        switch tone {
        case .ready: theme.color.success
        case .late: theme.color.danger
        case .risk: theme.risk
        case .warn: theme.color.warning
        case .firing: theme.info
        case .queued: theme.color.textSecondary
        }
    }

    private func toneLabel(_ tone: KdsTone) -> String {
        switch tone {
        case .ready: "ready"; case .late: "late"; case .risk: "at risk"
        case .warn: "due soon"; case .firing: "firing"; case .queued: "queued"
        }
    }

    // POS course → label (web POS_COURSE_LABELS).
    private func courseLabel(_ c: String) -> String {
        switch c {
        case "starter": "Starters"; case "main": "Mains"
        case "dessert": "Desserts"; case "drink": "Drinks"
        default: c.prefix(1).uppercased() + c.dropFirst()
        }
    }
}

#if DEBUG
// Order has no cross-module memberwise init (Models.swift), so the preview
// decodes a sample rather than constructing one.
private enum KDSTicketPreviewData {
    static let order: Order = {
        let json = """
        {"id":"#A-204","shortId":"A-204","locationSlug":"krakow","status":"preparing","fulfillmentType":"dine-in",
         "partySize":4,"channel":"web","customerName":"Ada","customerPhone":"+48500100200",
         "specialInstructions":"Allergy table — keep nuts away",
         "items":[{"menuItemId":"pizza-margherita","name":"Margherita","category":"pizza","quantity":2,"unitPrice":2790,"notes":"no basil",
                   "modifiers":[{"label":"Bufala mozzarella","flag":true}],"allergens":["gluten","milk"]},
                  {"menuItemId":"espresso","name":"Espresso","category":"drinks","quantity":1,"unitPrice":900,"notes":null,
                   "modifiers":[],"allergens":[]}],
         "totalAmount":6480,"slotDate":"2026-06-26","slotTime":"19:00",
         "createdAt":"2026-06-26T18:52:00.000Z","estimatedReadyAt":"2026-06-26T19:05:00.000Z",
         "coursing":{"fired":["starter"],"held":["main"]},"simulated":false,
         "prediction":{"promisedReadyAtMs":1782507900000,"predictedReadyAtMs":1782508050000,"predSeconds":420,"atRisk":true}}
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
