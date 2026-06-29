import Foundation

// Pure Kitchen Display ticket logic — the tone tiers, SLA meter, due countdown,
// channel tag, station grouping and allergen dedupe the KDS card renders. No
// SwiftUI, no colour: 1:1 with the web `src/lib/kds-prediction.ts` (ticketTone)
// + `src/core/kds/CoreKds.tsx` (dueLabel / slaPct) + `kds-board.ts` (grouping),
// so the native card draws byte-for-byte the same as the web board. Shared by
// `KDSTicket` (presentation) and the board KPIs (counts), exactly like the web
// shares these helpers — kept framework-free so it's trivially testable.

/// Live tone for a ticket (web `ticketTone`): ready → late → at-risk → warn →
/// firing/queued. Drives both the card accent and the due-text colour.
public enum KdsTone: Sendable, Equatable {
    case queued, firing, warn, risk, late, ready
}

public enum KDSClock {
    /// mm:ss for a positive (absolute) seconds value — the caller prepends any
    /// minus sign (web `fmtClock`). Used for the due timer + age KPIs.
    public static func clock(_ seconds: Double) -> String {
        let total = abs(Int(seconds.rounded()))
        return String(format: "%02d:%02d", total / 60, total % 60)
    }

    // Cached ISO parsers — `parseMs` runs on every periodic tick for every ticket
    // and ISO8601DateFormatter init is costly, so the formatters are reused.
    // `parseMs` is `public static` over `Sendable` types, so it can't assume a
    // single actor: a lock serializes the (uncontended, main-actor in practice)
    // access, since ISO8601DateFormatter mutation isn't guaranteed thread-safe.
    private static let parseLock = NSLock()
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

    /// ISO-8601 → ms epoch, tolerant of fractional seconds.
    public static func parseMs(_ iso: String) -> Double? {
        parseLock.lock()
        defer { parseLock.unlock() }
        if let d = isoFractional.date(from: iso) { return d.timeIntervalSince1970 * 1000 }
        if let d = isoPlain.date(from: iso) { return d.timeIntervalSince1970 * 1000 }
        return nil
    }
}

/// One station's lines on a ticket — `Identifiable` (by category) so the KDS
/// card can group multi-station tickets without index/keypath gymnastics.
public struct KdsItemGroup: Identifiable, Sendable {
    public var id: String { category }
    public let label: String
    public let category: String
    public let items: [OrderLine]
}

public extension Order {
    /// Elapsed-timer anchor (ms epoch) — paid time, else created (web
    /// `buildKdsTicket` paidAtMs).
    var paidAtMs: Double {
        KDSClock.parseMs(paidAt ?? createdAt) ?? Date().timeIntervalSince1970 * 1000
    }

    /// Promised-ready instant (ms epoch) from the prediction block, flattened.
    private var promisedMs: Double? { prediction.flatMap { $0.promisedReadyAtMs } }

    /// Live tone (web `ticketTone`). With a prediction block this is the
    /// SLA/at-risk model; without one (off-board single reads) it falls back to
    /// elapsed age so the card still reads sensibly.
    func kdsTone(nowMs: Double) -> KdsTone {
        if status == .ready { return .ready }
        guard prediction != nil else {
            let mins = max(0, (nowMs - paidAtMs) / 60_000)
            if mins >= 12 { return .late }
            if mins >= 5 { return .warn }
            return status == .confirmed ? .queued : .firing
        }
        if let promised = promisedMs {
            let slaRem = promised - nowMs
            if slaRem < 0 { return .late }
            if let predicted = prediction?.predictedReadyAtMs, predicted > promised { return .risk }
            if slaRem < 180_000 { return .warn }
        }
        return status == .confirmed ? .queued : .firing
    }

    /// Due text + its tone (web `dueLabel`): "done" when ready, "−mm:ss" when
    /// past the promise, the SLA countdown, or the predicted-ready countdown.
    func kdsDue(nowMs: Double) -> (text: String, tone: KdsTone) {
        let tone = kdsTone(nowMs: nowMs)
        if status == .ready { return ("done", tone) }
        if let promised = promisedMs {
            let slaRemSec = (promised - nowMs) / 1000
            if slaRemSec < 0 { return ("−" + KDSClock.clock(-slaRemSec), tone) }
            return (KDSClock.clock(slaRemSec), tone)
        }
        if let predicted = prediction?.predictedReadyAtMs {
            return (KDSClock.clock(max(0, (predicted - nowMs) / 1000)), tone)
        }
        return (KDSClock.clock(max(0, (nowMs - paidAtMs) / 1000)), tone)
    }

    /// Cook-time meter fill, 0 (fresh) → 1 (due) — web `slaPct` / 100.
    func slaFraction(nowMs: Double) -> Double {
        if status == .ready { return 1 }
        if let promised = promisedMs {
            let slaRemSec = (promised - nowMs) / 1000
            if slaRemSec < 0 { return 1 }
            let window = max(60, (promised - paidAtMs) / 1000)
            return min(1, max(0, 1 - slaRemSec / window))
        }
        let elapsed = max(0, (nowMs - paidAtMs) / 1000)
        let predRem = max(0, ((prediction?.predictedReadyAtMs ?? nowMs) - nowMs) / 1000)
        return min(0.95, elapsed / max(60, predRem + elapsed))
    }

    /// Past the promised-ready time and not yet plated — the board "Late" count.
    func isLate(nowMs: Double) -> Bool {
        guard status != .ready, let promised = promisedMs else { return false }
        return promised < nowMs
    }

    /// Model predicts a miss before it's actually late — the board "At risk" count.
    var isAtRisk: Bool { status != .ready && (prediction?.atRisk ?? false) }

    /// KDS channel chip (web `channelTag`): Dine-in (+ party size) / Delivery /
    /// Takeaway. Tolerates both `dine-in` (DTO) and `dine_in` (legacy) spellings.
    var channelTag: String {
        switch fulfillmentType {
        case "dine-in", "dine_in":
            return "Dine-in" + (partySize.map { " · \($0)p" } ?? "")
        case "delivery":
            return "Delivery"
        default:
            return "Takeaway"
        }
    }

    /// Canonical station order for grouping a multi-station ticket's lines
    /// (web `CATEGORY_ORDER`).
    static let kdsCategoryOrder = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"]

    static func kdsCategoryLabel(_ c: String) -> String {
        c.isEmpty ? c : c.prefix(1).uppercased() + c.dropFirst()
    }

    /// Group lines by station in canonical order (web `groupItems`).
    func groupedItems() -> [KdsItemGroup] {
        var buckets: [String: [OrderLine]] = [:]
        var seen: [String] = []
        for it in items {
            let c = it.category ?? "other"
            if buckets[c] == nil { seen.append(c) }
            buckets[c, default: []].append(it)
        }
        func rank(_ c: String) -> Int { Self.kdsCategoryOrder.firstIndex(of: c) ?? 99 }
        return seen.sorted { rank($0) < rank($1) }
            .map { KdsItemGroup(label: Self.kdsCategoryLabel($0), category: $0, items: buckets[$0]!) }
    }

    /// Deduped allergens across the ticket's lines, in first-seen order — the
    /// KDS allergen callout (web `allergens` dedupe).
    var ticketAllergens: [String] {
        var seen = Set<String>()
        var out: [String] = []
        for it in items {
            for a in (it.allergens ?? []) where !a.isEmpty && !seen.contains(a) {
                seen.insert(a)
                out.append(a)
            }
        }
        return out
    }
}
