import Testing
import SwiftUI
import UIKit
@testable import DesignSystem

// DESIGN-SYSTEM §5 — contrast is a merge gate. This is the native twin of the
// backend repo's tests/native-contrast.test.ts: it asserts WCAG contrast on the
// SHIPPING Color values (not a JSON copy), so a re-skin that drops a pair below
// the bar fails the iOS CI run. Snapshot/Dynamic-Type tests (the rest of §6) also
// live in this target in the extracted repo; the #Preview galleries are the
// visual catalog reviewers sign off on.

private func luminance(_ color: Color) -> Double {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
    func lin(_ c: CGFloat) -> Double {
        let s = Double(c)
        return s <= 0.03928 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

private func ratio(_ a: Color, _ b: Color) -> Double {
    let l1 = luminance(a), l2 = luminance(b)
    return (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)
}

@Suite("Design system contrast")
struct ContrastTests {
    // Operator skin: full AA body (4.5) everywhere — the line reads it under glare.
    @Test func kdsMeetsAABody() {
        let p = Theme.kds.color
        #expect(ratio(p.textPrimary, p.surface) >= 4.5)
        #expect(ratio(p.textPrimary, p.surface2) >= 4.5)
        #expect(ratio(p.textSecondary, p.surface) >= 4.5)
        #expect(ratio(p.onAccent, p.accent) >= 4.5)
        #expect(ratio(p.success, p.surface) >= 4.5)
        #expect(ratio(p.warning, p.surface) >= 4.5)
        #expect(ratio(p.danger, p.surface) >= 4.5)
    }

    // Customer skin: AA body for primary text + on-brand; AA-large floor for
    // secondary text and the primary button label (semibold/large sizes).
    @Test func customerPrimaryMeetsAABody() {
        let p = Theme.ottaviano.color
        #expect(ratio(p.textPrimary, p.surface) >= 4.5)
        #expect(ratio(p.textPrimary, p.surface2) >= 4.5)
        #expect(ratio(p.onAccent, p.brand) >= 4.5)
    }

    @Test func customerSecondaryMeetsAALarge() {
        let p = Theme.ottaviano.color
        #expect(ratio(p.textSecondary, p.surface) >= 3.0)
        #expect(ratio(p.onAccent, p.accent) >= 3.0)
    }
}
