import SwiftUI
import CoreModels

// POSKeypad (DESIGN-SYSTEM §4.2) — the till amount pad: huge keys, classic
// digit-shift decimal entry (tap 1·2·3·4 → 12,34 zł), quick-cash shortcuts, and
// hardware-keyboard support on iPad. Amount is held in minor units (grosze) so it
// stays integer-exact — no float drift on money. Formatting is MoneyText, the one
// place currency lives.
public struct POSKeypad: View {
    @Environment(\.theme) private var theme
    @Binding private var grosze: Grosze
    private let quickCash: [Grosze]

    /// Max enterable amount (99 999,99 zł) — guards against runaway multiply.
    private static let maxGrosze: Grosze = 9_999_999

    public init(grosze: Binding<Grosze>, quickCash: [Grosze] = [5_000, 10_000, 20_000]) {
        _grosze = grosze
        self.quickCash = quickCash
    }

    private let keys: [String] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"]
    private var columns: [GridItem] { Array(repeating: GridItem(.flexible(), spacing: theme.space.sm), count: 3) }

    public var body: some View {
        VStack(spacing: theme.space.md) {
            // amount display
            HStack(alignment: .firstTextBaseline) {
                Text("PLN").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                Spacer()
                MoneyText(grosze).textRole(.displayXL).foregroundStyle(theme.color.textPrimary)
            }
            .padding(.horizontal, theme.space.sm)

            // quick cash
            if !quickCash.isEmpty {
                HStack(spacing: theme.space.sm) {
                    ForEach(quickCash, id: \.self) { amt in
                        Button { set(amt) } label: {
                            MoneyText(amt).textRole(.bodyEmphasis)
                                .frame(maxWidth: .infinity, minHeight: 40)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(theme.color.accent)
                        .background(theme.color.accent.opacity(0.14), in: RoundedRectangle(cornerRadius: theme.radius.md))
                        .accessibilityLabel("Exact \(MoneyText.format(amt))")
                    }
                }
            }

            LazyVGrid(columns: columns, spacing: theme.space.sm) {
                ForEach(keys, id: \.self) { key($0) }
            }
        }
    }

    private func key(_ k: String) -> some View {
        Button { press(k) } label: {
            Text(k).textRole(.title).monospacedDigit()
                .frame(maxWidth: .infinity, minHeight: 64)
        }
        .buttonStyle(.plain)
        .foregroundStyle(theme.color.textPrimary)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.md))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.md).strokeBorder(theme.color.line, lineWidth: 1))
        .sensoryFeedback(.impact(flexibility: .rigid), trigger: grosze)
        .modifier(KeyShortcut(key: k))
        .accessibilityLabel(k == "⌫" ? "Delete" : k)
    }

    private func press(_ k: String) {
        switch k {
        case "⌫": grosze = grosze / 10
        case "00": set(grosze * 100)
        default:
            if let d = Int(k) { set(grosze * 10 + d) }
        }
    }
    private func set(_ v: Grosze) { grosze = min(max(0, v), Self.maxGrosze) }
}

/// Hardware-keyboard shortcuts (iPad) — digit keys + delete drive the same pad.
private struct KeyShortcut: ViewModifier {
    let key: String
    func body(content: Content) -> some View {
        let shortcut: KeyEquivalent? = {
            if key == "⌫" { return .delete }
            if key.count == 1, let ch = key.first { return KeyEquivalent(ch) }
            return nil
        }()
        return Group {
            if let shortcut {
                content.keyboardShortcut(shortcut, modifiers: [])
            } else {
                content
            }
        }
    }
}

#if DEBUG
private struct POSKeypadDemo: View {
    @State private var amount: Grosze = 0
    var body: some View {
        VStack { POSKeypad(grosze: $amount).padding() }
    }
}
#Preview("POSKeypad · KDS") {
    POSKeypadDemo()
        .environment(\.theme, .kds)
        .background(Theme.kds.color.surface)
        .preferredColorScheme(.dark)
}
#Preview("POSKeypad · Ottaviano") {
    POSKeypadDemo()
        .environment(\.theme, .ottaviano)
        .background(Theme.ottaviano.color.surface)
}
#endif
