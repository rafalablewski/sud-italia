import SwiftUI
import CoreModels

// Native design system (DESIGN-SYSTEM.md). Tokens resolved through a `Theme` in
// the environment — never global constants — so the same component renders in
// either brand skin. The customer palette mirrors the web storefront's "V8
// Tuscany" tokens (themes/homepage/tokens.css): parchment, oxblood, terracotta,
// basil, ochre, ink. The operator palette is the dark kitchen-display skin.

public struct Theme: Sendable {
    public struct Palette: Sendable {
        public let accent: Color        // primary action (terracotta / ochre)
        public let onAccent: Color      // text on the accent
        public let brand: Color         // wordmark + hero fields (oxblood / ochre)
        public let surface: Color       // page canvas (parchment / near-black)
        public let surface2: Color      // raised cards (parchment-deep / panel)
        public let line: Color          // hairline borders
        public let textPrimary: Color
        public let textSecondary: Color
        public let success: Color       // basil
        public let warning: Color       // ochre
        public let danger: Color
    }
    public struct Spacing: Sendable {
        public let xs: CGFloat = 4, sm: CGFloat = 8, md: CGFloat = 12
        public let lg: CGFloat = 16, xl: CGFloat = 24, xxl: CGFloat = 32
    }
    public let color: Palette
    public let space = Spacing()
    public let cornerRadius: CGFloat
    /// Editorial serif design echoing the web's Cormorant/Lora pairing. iOS has
    /// no Cormorant bundled, so we lean on the system serif face — same mood,
    /// zero font files to ship.
    public let headingDesign: Font.Design
    public let snappy = Animation.spring(duration: 0.28, bounce: 0.18)

    /// Ottaviano (customer) — V8 Tuscany: oxblood + terracotta on warm parchment.
    public static let ottaviano = Theme(
        color: .init(
            accent: Color(hex: 0xB85C38),       // terracotta — primary action
            onAccent: Color(hex: 0xF8EFDE),     // parchment
            brand: Color(hex: 0x7A2B2B),        // oxblood — brand burgundy
            surface: Color(hex: 0xF8EFDE),      // parchment
            surface2: Color(hex: 0xFBF5E9),     // parchment, lifted
            line: Color(hex: 0xE0CFA8),         // line-soft
            textPrimary: Color(hex: 0x2C1810),  // ink
            textSecondary: Color(hex: 0x8C6F4F),// muted
            success: Color(hex: 0x4A7C59),      // basil
            warning: Color(hex: 0xC9A23E),      // ochre
            danger: Color(hex: 0xB23A3A)
        ),
        cornerRadius: 16,
        headingDesign: .serif
    )

    /// OttavianoKDS (operator) — dark, dense, status-forward; ochre accent to
    /// match the app icon and the brand's editorial gold.
    public static let kds = Theme(
        color: .init(
            accent: Color(hex: 0xE8B23A),       // ochre
            onAccent: Color(hex: 0x11161F),
            brand: Color(hex: 0xE8B23A),
            surface: Color(hex: 0x0B0F16),
            surface2: Color(hex: 0x16202C),
            line: Color(hex: 0x2B3A4D),
            textPrimary: .white,
            textSecondary: Color(white: 0.62),
            success: Color(hex: 0x33C26A),
            warning: Color(hex: 0xE8B23A),
            danger: Color(hex: 0xE1556B)
        ),
        cornerRadius: 14,
        headingDesign: .default
    )
}

public extension Color {
    /// 0xRRGGBB literal → Color. Keeps the palette readable against the web hex.
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

private struct ThemeKey: EnvironmentKey { static let defaultValue = Theme.ottaviano }
public extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

// MARK: - Components

/// Primary / secondary action button. `prominent` = filled accent; otherwise a
/// hairline-outlined button on the surface (for lower-emphasis actions).
public struct DSButton: View {
    @Environment(\.theme) private var theme
    private let title: String
    private let prominent: Bool
    private let action: () -> Void
    public init(_ title: String, prominent: Bool = true, action: @escaping () -> Void) {
        self.title = title; self.prominent = prominent; self.action = action
    }
    public var body: some View {
        Button(action: action) {
            Text(title)
                .fontWeight(.semibold)
                .frame(maxWidth: .infinity, minHeight: 50)
                .foregroundStyle(prominent ? theme.color.onAccent : theme.color.accent)
                .background {
                    let shape = RoundedRectangle(cornerRadius: theme.cornerRadius)
                    if prominent { shape.fill(theme.color.accent) }
                    else { shape.strokeBorder(theme.color.accent, lineWidth: 1.5) }
                }
        }
        .sensoryFeedback(.impact(weight: .light), trigger: title)
    }
}

/// The serif wordmark used on the storefront hero and the loyalty card.
public struct BrandWordmark: View {
    @Environment(\.theme) private var theme
    private let subtitle: String?
    private let onBrand: Bool
    public init(subtitle: String? = nil, onBrand: Bool = false) {
        self.subtitle = subtitle; self.onBrand = onBrand
    }
    public var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Ottaviano")
                .font(.system(.largeTitle, design: .serif).weight(.bold))
                .foregroundStyle(onBrand ? theme.color.onAccent : theme.color.brand)
            if let subtitle {
                Text(subtitle)
                    .font(.system(.subheadline, design: .serif).italic())
                    .foregroundStyle(onBrand ? theme.color.onAccent.opacity(0.85) : theme.color.textSecondary)
            }
        }
    }
}

/// Small capsule for dietary / category tags (vegetariana, piccante, …).
public struct TagChip: View {
    @Environment(\.theme) private var theme
    private let text: String
    public init(_ text: String) { self.text = text }
    public var body: some View {
        Text(text.capitalized)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .foregroundStyle(theme.color.textSecondary)
            .background(theme.color.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(theme.color.line, lineWidth: 1))
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
