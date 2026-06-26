import SwiftUI
import CoreModels

// Native design system (DESIGN-SYSTEM.md). Tokens resolved through a `Theme` in
// the environment — never global constants — so the same component renders in
// either brand skin. Trimmed to the slice the seed needs; the full token set +
// catalogue lands as the package grows.

public struct Theme: Sendable {
    public struct Palette: Sendable {
        public let accent: Color
        public let onAccent: Color
        public let surface: Color
        public let surface2: Color
        public let textPrimary: Color
        public let textSecondary: Color
        public let success: Color
        public let warning: Color
        public let danger: Color
    }
    public struct Spacing: Sendable {
        public let xs: CGFloat = 4, sm: CGFloat = 8, md: CGFloat = 12
        public let lg: CGFloat = 16, xl: CGFloat = 24, xxl: CGFloat = 32
    }
    public let color: Palette
    public let space = Spacing()
    public let cornerRadius: CGFloat
    public let snappy = Animation.spring(duration: 0.28, bounce: 0.18)

    /// Ottaviano (customer) — warm, brand-red on cream.
    public static let ottaviano = Theme(
        color: .init(
            accent: Color(red: 0.78, green: 0.06, blue: 0.18),
            onAccent: Color(red: 1.0, green: 0.97, blue: 0.94),
            surface: Color(red: 1.0, green: 0.97, blue: 0.94),
            surface2: Color(red: 0.97, green: 0.93, blue: 0.88),
            textPrimary: Color(red: 0.12, green: 0.10, blue: 0.09),
            textSecondary: Color(red: 0.40, green: 0.36, blue: 0.33),
            success: Color(red: 0.20, green: 0.48, blue: 0.24),
            warning: Color(red: 0.91, green: 0.70, blue: 0.23),
            danger: Color(red: 0.88, green: 0.11, blue: 0.21)
        ),
        cornerRadius: 16
    )

    /// OttavianoKDS (operator) — dark, dense, status-forward.
    public static let kds = Theme(
        color: .init(
            accent: Color(red: 0.91, green: 0.70, blue: 0.23),
            onAccent: Color(red: 0.07, green: 0.09, blue: 0.12),
            surface: Color(red: 0.07, green: 0.09, blue: 0.12),
            surface2: Color(red: 0.10, green: 0.13, blue: 0.18),
            textPrimary: .white,
            textSecondary: Color(white: 0.65),
            success: Color(red: 0.20, green: 0.76, blue: 0.42),
            warning: Color(red: 0.91, green: 0.70, blue: 0.23),
            danger: Color(red: 0.88, green: 0.33, blue: 0.42)
        ),
        cornerRadius: 12
    )
}

private struct ThemeKey: EnvironmentKey { static let defaultValue = Theme.ottaviano }
public extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

// MARK: - Components

public struct DSButton: View {
    @Environment(\.theme) private var theme
    private let title: String
    private let action: () -> Void
    public init(_ title: String, action: @escaping () -> Void) {
        self.title = title; self.action = action
    }
    public var body: some View {
        Button(action: action) {
            Text(title)
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(theme.color.onAccent)
                .background(theme.color.accent, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        }
        .sensoryFeedback(.impact(weight: .light), trigger: title)
    }
}

/// Formats minor units (grosze) → localized PLN. The ONE place currency is
/// formatted, per DESIGN-SYSTEM §4.2.
public struct MoneyText: View {
    private let grosze: Grosze
    public init(_ grosze: Grosze) { self.grosze = grosze }
    public var body: some View {
        Text(Self.format(grosze))
            .monospacedDigit()
    }
    public static func format(_ grosze: Grosze) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "PLN"
        f.locale = Locale(identifier: "pl_PL")
        return f.string(from: NSNumber(value: Double(grosze) / 100.0)) ?? "\(grosze) gr"
    }
}
