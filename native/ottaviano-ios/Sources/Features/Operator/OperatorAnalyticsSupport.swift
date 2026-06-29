import Foundation

// Shared analytics scaffolding for the range-scoped operator boards (Dashboard,
// Reports). A `PeriodRange` resolves to real ISO date windows that the
// `/api/v1/admin/summary?from=&to=` facade scopes on (`s.date >= from && <= to`,
// yyyy-MM-dd), plus the equal-length PRIOR window so every KPI can show a true
// period-over-period delta — never a mocked one (Rule #1).

public enum PeriodRange: Int, CaseIterable, Sendable, Hashable {
    case week = 7, month = 30, quarter = 90

    public var label: String {
        switch self {
        case .week: "7d"
        case .month: "30d"
        case .quarter: "90d"
        }
    }
    public var caption: String {
        switch self {
        case .week: "last 7 days"
        case .month: "last 30 days"
        case .quarter: "last 90 days"
        }
    }
    public var leadingLabel: String {
        switch self {
        case .week: "7d ago"
        case .month: "30d ago"
        case .quarter: "90d ago"
        }
    }
}

/// A resolved current + prior window as ISO `yyyy-MM-dd` strings for the facade.
public struct DateWindow: Sendable {
    public let from: String
    public let to: String
    public let priorFrom: String
    public let priorTo: String
}

public enum AnalyticsDates {
    /// Warsaw business calendar — the chain's operating timezone, so "today" lines
    /// up with the till day, not the device's UTC offset.
    private static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Warsaw") ?? .current
        return c
    }
    private static var formatter: DateFormatter {
        let f = DateFormatter()
        f.calendar = calendar
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = calendar.timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }

    public static func iso(_ date: Date) -> String { formatter.string(from: date) }

    /// The current `range`-length window ending today, and the equal-length window
    /// immediately before it.
    public static func window(for range: PeriodRange, now: Date = Date()) -> DateWindow {
        let cal = calendar
        let n = range.rawValue
        let today = cal.startOfDay(for: now)
        let from = cal.date(byAdding: .day, value: -(n - 1), to: today) ?? today
        let priorTo = cal.date(byAdding: .day, value: -1, to: from) ?? from
        let priorFrom = cal.date(byAdding: .day, value: -(n - 1), to: priorTo) ?? priorTo
        return DateWindow(from: iso(from), to: iso(today),
                          priorFrom: iso(priorFrom), priorTo: iso(priorTo))
    }
}

/// Period-over-period fraction (0.12 = +12%). nil when there's no prior base to
/// divide by — the KPI then shows a muted "—" rather than a fabricated delta.
public func periodDelta(_ current: Double, _ prior: Double) -> Double? {
    guard prior > 0 else { return nil }
    return (current - prior) / prior
}
