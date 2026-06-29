import XCTest
import SwiftUI
@testable import DesignSystem

/// The hand-rolled chart primitives carry the only non-trivial pure math in the
/// design system (delta formatting + point normalisation). Tested so a refactor
/// can't silently change what an operator reads off a KPI.
final class AnalyticsMathTests: XCTestCase {

    func testTrendBadgeFormat() {
        // ≥10% → no decimals; <10% → one decimal; always signed.
        XCTAssertEqual(TrendBadge.format(0.123), "+12%")
        XCTAssertEqual(TrendBadge.format(-0.20), "-20%")
        XCTAssertEqual(TrendBadge.format(0.05), "+5.0%")
        XCTAssertEqual(TrendBadge.format(0.0), "+0.0%")
    }

    func testSparklinePointCount() {
        let size = CGSize(width: 100, height: 40)
        XCTAssertEqual(OperatorSparkline.points([], in: size).count, 0)
        XCTAssertEqual(OperatorSparkline.points([5], in: size).count, 1)
        XCTAssertEqual(OperatorSparkline.points([1, 2, 3, 4], in: size).count, 4)
    }

    func testSparklineSpansFullWidth() {
        let size = CGSize(width: 120, height: 40)
        let pts = OperatorSparkline.points([10, 20, 30], in: size)
        XCTAssertEqual(pts.first!.x, 0, accuracy: 0.5)
        XCTAssertEqual(pts.last!.x, 120, accuracy: 0.5)
    }

    func testSparklineHighValueSitsAboveLowValue() {
        // Higher data value → smaller y (closer to top).
        let size = CGSize(width: 100, height: 40)
        let pts = OperatorSparkline.points([0, 100], in: size)
        XCTAssertLessThan(pts.last!.y, pts.first!.y)
    }
}
