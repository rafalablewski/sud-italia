import XCTest
@testable import AppFeatures

/// The period-over-period delta + date-window math drive every KPI's "vs prior"
/// number and every range-scoped fetch. A wrong window silently mis-states the
/// numbers, so it's tested against fixed dates.
final class AnalyticsSupportTests: XCTestCase {

    private func warsawNoon(_ y: Int, _ m: Int, _ d: Int) -> Date {
        var c = DateComponents()
        c.year = y; c.month = m; c.day = d; c.hour = 12
        c.timeZone = TimeZone(identifier: "Europe/Warsaw")
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Warsaw")!
        return cal.date(from: c)!
    }

    func testPeriodDelta() {
        XCTAssertEqual(periodDelta(120, 100)!, 0.2, accuracy: 0.0001)
        XCTAssertEqual(periodDelta(80, 100)!, -0.2, accuracy: 0.0001)
        XCTAssertEqual(periodDelta(100, 100)!, 0.0, accuracy: 0.0001)
    }

    func testPeriodDeltaNilWhenNoBase() {
        XCTAssertNil(periodDelta(100, 0), "no prior base → no fabricated delta")
        XCTAssertNil(periodDelta(100, -5))
    }

    func testWeekWindowAndPriorWindow() {
        let now = warsawNoon(2026, 6, 29)
        let w = AnalyticsDates.window(for: .week, now: now)
        XCTAssertEqual(w.to, "2026-06-29")          // today
        XCTAssertEqual(w.from, "2026-06-23")        // 7-day window inclusive
        XCTAssertEqual(w.priorTo, "2026-06-22")     // day before the window
        XCTAssertEqual(w.priorFrom, "2026-06-16")   // equal-length prior window
    }

    func testMonthWindowLength() {
        let now = warsawNoon(2026, 6, 29)
        let w = AnalyticsDates.window(for: .month, now: now)
        XCTAssertEqual(w.to, "2026-06-29")
        XCTAssertEqual(w.from, "2026-05-31")        // 30-day inclusive window
        XCTAssertEqual(w.priorTo, "2026-05-30")
    }

    func testForwardDateHelper() {
        let now = warsawNoon(2026, 6, 29)
        XCTAssertEqual(AnalyticsDates.iso(daysFromNow: 30, now: now), "2026-07-29")
        XCTAssertEqual(AnalyticsDates.iso(daysFromNow: -1, now: now), "2026-06-28")
        XCTAssertEqual(AnalyticsDates.iso(daysFromNow: 0, now: now), "2026-06-29")
    }

    func testRangeLabels() {
        XCTAssertEqual(PeriodRange.week.label, "7d")
        XCTAssertEqual(PeriodRange.month.label, "30d")
        XCTAssertEqual(PeriodRange.quarter.label, "90d")
        XCTAssertEqual(PeriodRange.allCases.count, 3)
    }
}
