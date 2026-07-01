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
    /// Shared radius scale — pulled from the web Core `--r-*` tokens (generated,
    /// see Tokens.generated.swift). Radius isn't brand-specific so both skins share it.
    public struct RadiusScale: Sendable {
        public let sm = GeneratedTokens.radiusSM
        public let md = GeneratedTokens.radiusMD
        public let lg = GeneratedTokens.radiusLG
        public let xl = GeneratedTokens.radiusXL
        public let pill = GeneratedTokens.radiusPill
    }
    /// Elevation is material-first (DESIGN-SYSTEM §2.3); these shadow tokens are
    /// reserved for cards that must lift off content. Tuned to the web Core `--sh-*` feel.
    public struct Elevation: Sendable {
        public struct Shadow: Sendable {
            public let color: Color, radius: CGFloat, x: CGFloat, y: CGFloat
            public init(_ color: Color, _ radius: CGFloat, _ x: CGFloat, _ y: CGFloat) {
                self.color = color; self.radius = radius; self.x = x; self.y = y
            }
        }
        public let card = Shadow(.black.opacity(0.18), 10, 0, 4)
        public let pop = Shadow(.black.opacity(0.32), 28, 0, 16)
    }
    /// Spring-based, interruptible motion (DESIGN-SYSTEM §2.4). Reduce Motion is
    /// honoured at the call site via `.dsAnimation` / `@Environment(\.accessibilityReduceMotion)`.
    public struct Motion: Sendable {
        public let snappy = Animation.spring(duration: 0.28, bounce: 0.18)
        public let smooth = Animation.spring(duration: 0.42, bounce: 0.0)
        public let immediate = Animation.spring(duration: 0.18, bounce: 0.0)
    }
    public let color: Palette
    public let space = Spacing()
    public let radius = RadiusScale()
    public let elevation = Elevation()
    public let motion = Motion()
    public let cornerRadius: CGFloat
    /// Editorial serif design echoing the web's Cormorant/Lora pairing. iOS has
    /// no Cormorant bundled, so we lean on the system serif face — same mood,
    /// zero font files to ship.
    public let headingDesign: Font.Design
    /// When true, surfaces render in the 2026 "Liquid Glass" material (translucent
    /// Material fill + specular rim + aurora backdrop) — the native mirror of the
    /// web `liquid-glass` Core skin. Only the operator (kds) skin opts in; the
    /// customer app keeps its V8 Tuscany paper look. A required member (both skins
    /// set it) so the synthesized memberwise init always exposes it.
    public let glassy: Bool
    public let snappy = Animation.spring(duration: 0.28, bounce: 0.18)

    // The two skins' palettes + corner radii are GENERATED from the web token CSS
    // (`GeneratedTokens` in Tokens.generated.swift) so they cannot drift from the
    // storefront / Core themes — see scripts/gen-native-tokens.ts. Only the
    // editorial type design (a native structural choice) is set here.

    /// Ottaviano (customer) — V8 Tuscany: oxblood + terracotta on warm parchment.
    public static let ottaviano = Theme(
        color: GeneratedTokens.ottaviano,
        cornerRadius: GeneratedTokens.ottavianoCornerRadius,
        headingDesign: .serif,
        glassy: false
    )

    /// OttavianoKDS (operator) — the dark web Core skin (near-black panels,
    /// brand-red primary, amber/green/red status) carried verbatim from
    /// themes/core/tokens.css so the operator app matches the Core surfaces 1:1.
    public static let kds = Theme(
        color: GeneratedTokens.kds,
        cornerRadius: GeneratedTokens.kdsCornerRadius,
        headingDesign: .default,
        glassy: true
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
                    let shape = RoundedRectangle(cornerRadius: theme.cornerRadius, style: .continuous)
                    if prominent { shape.fill(theme.color.accent) }
                    else { shape.strokeBorder(theme.color.accent, lineWidth: 1.5) }
                }
        }
        .buttonStyle(DSPressStyle())
        .sensoryFeedback(.impact(weight: .light), trigger: title)
    }
}

/// The Apple "alive" press: a quick spring dip in scale + opacity while held.
/// Honours Reduce Motion (the scale drops out, the dim stays). Reusable on any
/// `Button` whose label already carries its own background (DSButton, chips).
public struct DSPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    public init() {}
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.86 : 1)
            .animation(.spring(duration: 0.25, bounce: 0.2), value: configuration.isPressed)
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

// MARK: - Typography ramp (DESIGN-SYSTEM §2.2)

/// Semantic text roles. Built on Dynamic-Type text styles so every role scales
/// with the user's setting — DS rule #1 ("Dynamic Type or it doesn't ship"). No
/// fixed `.system(size:)` in feature code; reach for a role.
public enum TextRole: Sendable {
    case displayXL, display, titleL, title, headline, body, bodyEmphasis, callout, caption, mono
}

public extension Theme {
    /// Resolve a role to a Font. Headings use the skin's `headingDesign` (serif on
    /// the customer app, default on KDS); `mono` uses monospaced for numerics/timers.
    func font(_ role: TextRole) -> Font {
        switch role {
        case .displayXL:    return .system(.largeTitle, design: headingDesign).weight(.bold)
        case .display:      return .system(.title, design: headingDesign).weight(.semibold)
        case .titleL:       return .system(.title2, design: headingDesign).weight(.bold)
        case .title:        return .system(.title3, design: headingDesign).weight(.semibold)
        case .headline:     return .system(.headline)
        case .body:         return .system(.body)
        case .bodyEmphasis: return .system(.body).weight(.semibold)
        case .callout:      return .system(.callout)
        case .caption:      return .system(.caption)
        case .mono:         return .system(.body, design: .monospaced)
        }
    }
}

private struct TextRoleModifier: ViewModifier {
    @Environment(\.theme) private var theme
    let role: TextRole
    func body(content: Content) -> some View {
        content.font(theme.font(role)).modifier(MonoDigits(on: role == .mono))
    }
}
private struct MonoDigits: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View { on ? AnyView(content.monospacedDigit()) : AnyView(content) }
}

public extension View {
    /// `Text("Margherita").textRole(.title)` — themed, Dynamic-Type-scaling type.
    func textRole(_ role: TextRole) -> some View { modifier(TextRoleModifier(role: role)) }

    /// Apply a card/pop shadow token.
    func dsShadow(_ s: Theme.Elevation.Shadow) -> some View {
        shadow(color: s.color, radius: s.radius, x: s.x, y: s.y)
    }

    /// Reduce-Motion-aware animation: drops to no animation when the user asks.
    @ViewBuilder
    func dsAnimation<V: Equatable>(_ animation: Animation, value: V, reduceMotion: Bool) -> some View {
        self.animation(reduceMotion ? nil : animation, value: value)
    }
}

// MARK: - Status + KDS-ticket lifecycle colors (DESIGN-SYSTEM §2.1)

public extension Theme {
    // Soft fills mirror the web Core `*-wash` tokens, which are the base hue at
    // ~16% alpha — so deriving them by opacity is faithful, not a fudge.
    var successSoft: Color { color.success.opacity(0.16) }
    var warningSoft: Color { color.warning.opacity(0.16) }
    var dangerSoft: Color { color.danger.opacity(0.16) }
    /// Informational accent — the web Core `--info` blue (shared; not brand).
    var info: Color { Color(hex: 0x5B8BD0) }
    var infoSoft: Color { info.opacity(0.16) }
    /// Predictive at-risk tier — the web KDS violet "At risk" tone, between warn
    /// (ochre) and late (red). Shared across skins like `info`, not brand.
    var risk: Color { Color(hex: 0x8B5BD0) }
    var riskSoft: Color { risk.opacity(0.16) }

    /// A KDS ticket ages through three states by elapsed minutes (DESIGN-SYSTEM
    /// §4.2 KDSTicket): fresh → cooking → late. Thresholds are operator-tunable.
    enum TicketState: Sendable, Equatable { case fresh, cooking, late }
    func ticketState(elapsedMinutes: Double, cooking: Double = 5, late: Double = 12) -> TicketState {
        if elapsedMinutes >= late { return .late }
        if elapsedMinutes >= cooking { return .cooking }
        return .fresh
    }
    func ticketColor(_ s: TicketState) -> Color {
        switch s {
        case .fresh: return color.success
        case .cooking: return color.warning
        case .late: return color.danger
        }
    }
}

// MARK: - Liquid Glass materials (operator skin — mirrors the web `liquid-glass` Core skin)

public extension View {
    /// Frosted-glass surface: a translucent Material fill, a specular rim, and a
    /// soft float — the native equivalent of the web skin's backdrop-blur + rim +
    /// shadow. `Material` gives real blur/vibrancy on device (no image capture).
    func dsGlassSurface(cornerRadius: CGFloat, elevated: Bool = true) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        return self
            .background(.regularMaterial, in: shape)
            .overlay(
                shape.strokeBorder(
                    LinearGradient(
                        colors: [.white.opacity(0.35), .white.opacity(0.06), .clear],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
            )
            .shadow(color: .black.opacity(elevated ? 0.45 : 0), radius: elevated ? 18 : 0, x: 0, y: elevated ? 10 : 0)
    }
}

/// Ambient aurora backdrop — soft brand / info / warn / success blooms behind the
/// glass so the Material has colour to refract. Mirrors the web skin's aurora.
/// Honours Reduce Motion implicitly (it's static — no animation to disable).
public struct AuroraBackground: View {
    @Environment(\.theme) private var theme
    public init() {}
    public var body: some View {
        ZStack {
            theme.color.surface
            bloom(theme.color.accent, 0.55).offset(x: -140, y: -260)
            bloom(theme.info, 0.40).offset(x: 150, y: 300)
            bloom(theme.color.warning, 0.30).offset(x: 120, y: -120)
            bloom(theme.color.success, 0.24).offset(x: -120, y: 220)
        }
        .ignoresSafeArea()
    }
    private func bloom(_ c: Color, _ opacity: Double) -> some View {
        Circle().fill(c.opacity(opacity)).frame(width: 460, height: 460).blur(radius: 90)
    }
}
