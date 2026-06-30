import XCTest
@testable import AppFeatures

/// The Calculator's what-if engine is pure math anchored to the server's saved
/// projection — exactly the kind of logic that must be unit-tested (it drives the
/// P&L numbers an operator makes decisions on). These assert the two contracts
/// the engine promises: it reproduces the saved year-1 numbers EXACTLY at baseline
/// levers, and it scales sensibly as levers move.
final class CalcEngineTests: XCTestCase {

    /// A representative saved scenario (grosze). paymentBaseline = revenue × pct.
    private func baseline() -> CalcBaseline {
        CalcBaseline(
            revenue: 1_000_000, cogs: 300_000, labor: 250_000, fixed: 200_000,
            payment: 17_000, netProfit: 180_000,
            ordersPerDay: 200, avgTicket: 13_000, daysOpen: 26, cogsPct: 0.30, paymentPct: 0.017)
    }
    private func levers(_ b: CalcBaseline) -> CalcLevers {
        CalcLevers(ordersPerDay: Int(b.ordersPerDay), daysOpen: Int(b.daysOpen),
                   avgTicketGrosze: Int(b.avgTicket), cogsPct: b.cogsPct, paymentPct: b.paymentPct)
    }

    func testReproducesSavedYearOneAtBaseline() {
        let b = baseline()
        let r = CalcEngine.project(b, levers(b))
        XCTAssertEqual(r.revenue, b.revenue, accuracy: 0.5, "revenue must reproduce exactly")
        XCTAssertEqual(r.cogs, b.cogs, accuracy: 0.5, "COGS must reproduce exactly")
        XCTAssertEqual(r.net, b.netProfit, accuracy: 0.5, "net profit must reproduce exactly")
    }

    func testRevenueScalesLinearlyWithVolumeDrivers() {
        let b = baseline()
        var l = levers(b); l.ordersPerDay *= 2
        XCTAssertEqual(CalcEngine.project(b, l).revenue, b.revenue * 2, accuracy: 1)
        var t = levers(b); t.avgTicketGrosze = Int(b.avgTicket * 1.5)
        XCTAssertEqual(CalcEngine.project(b, t).revenue, b.revenue * 1.5, accuracy: 1)
    }

    func testHigherFoodCostLowersProfit() {
        let b = baseline()
        let base = CalcEngine.project(b, levers(b)).net
        var worse = levers(b); worse.cogsPct = 0.40   // +10pp food cost
        XCTAssertLessThan(CalcEngine.project(b, worse).net, base)
    }

    func testMoreOrdersRaisesProfit() {
        let b = baseline()
        let base = CalcEngine.project(b, levers(b)).net
        var more = levers(b); more.ordersPerDay = Int(b.ordersPerDay) + 40
        XCTAssertGreaterThan(CalcEngine.project(b, more).net, base)
    }

    func testMarginIsNetOverRevenue() {
        let b = baseline()
        let r = CalcEngine.project(b, levers(b))
        XCTAssertEqual(r.margin, r.net / r.revenue * 100, accuracy: 0.0001)
    }

    func testZeroOrdersZeroesRevenueButKeepsFixedCosts() {
        let b = baseline()
        var none = levers(b); none.ordersPerDay = 0
        let r = CalcEngine.project(b, none)
        XCTAssertEqual(r.revenue, 0, accuracy: 0.5)
        XCTAssertEqual(r.labor, b.labor, accuracy: 0.5, "labour is held at the saved baseline")
        XCTAssertEqual(r.fixed, b.fixed, accuracy: 0.5, "fixed overhead is held at the saved baseline")
        XCTAssertLessThan(r.net, 0, "no sales but committed costs → a loss")
    }
}
