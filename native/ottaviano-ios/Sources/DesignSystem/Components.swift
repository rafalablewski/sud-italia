import SwiftUI

// Core design-system components (DESIGN-SYSTEM §4.1–4.2). Each is small, themed
// through `@Environment(\.theme)`, and previewed in both skins below — that
// gallery IS the Storybook (§6). Never hand-roll one of these in a feature.

// MARK: - DSCard — the layout unit

public struct DSCard<Content: View>: View {
    @Environment(\.theme) private var theme
    private let elevated: Bool
    private let accent: Color?
    @ViewBuilder private let content: () -> Content

    public init(elevated: Bool = false, accent: Color? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.elevated = elevated; self.accent = accent; self.content = content
    }

    public var body: some View {
        content()
            .padding(theme.space.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
            .overlay(alignment: .leading) { accentEdge }
            // .clear / 0 keeps the type stable when not elevated (no branch).
            .shadow(
                color: elevated ? theme.elevation.card.color : .clear,
                radius: elevated ? theme.elevation.card.radius : 0,
                x: 0,
                y: elevated ? theme.elevation.card.y : 0
            )
    }

    @ViewBuilder private var accentEdge: some View {
        if let accent {
            RoundedRectangle(cornerRadius: 2, style: .continuous).fill(accent)
                .frame(width: 4).padding(.vertical, theme.space.xs)
        }
    }
}

// MARK: - DSBadge — status pill

public struct DSBadge: View {
    public enum Tone: Sendable { case neutral, success, warning, danger, info, accent }
    @Environment(\.theme) private var theme
    private let text: String
    private let tone: Tone
    /// Optional SF Symbol — KDS/status badges carry an icon so colour is never the
    /// only signal (DESIGN-SYSTEM §5, color-blind line cooks).
    private let systemImage: String?

    public init(_ text: String, tone: Tone = .neutral, systemImage: String? = nil) {
        self.text = text; self.tone = tone; self.systemImage = systemImage
    }

    public var body: some View {
        Label {
            Text(text)
        } icon: {
            if let systemImage { Image(systemName: systemImage) }
        }
        .labelStyle(.titleAndIcon)
        .textRole(.caption)
        .fontWeight(.semibold)
        .padding(.horizontal, theme.space.sm).padding(.vertical, 3)
        .foregroundStyle(fg)
        .background(bg, in: Capsule())
        .overlay(Capsule().strokeBorder(fg.opacity(0.25), lineWidth: 1))
        .accessibilityLabel(text)
    }

    private var fg: Color {
        switch tone {
        case .neutral: theme.color.textSecondary
        case .success: theme.color.success
        case .warning: theme.color.warning
        case .danger: theme.color.danger
        case .info: theme.info
        case .accent: theme.color.accent
        }
    }
    private var bg: Color {
        switch tone {
        case .neutral: theme.color.surface
        case .success: theme.successSoft
        case .warning: theme.warningSoft
        case .danger: theme.dangerSoft
        case .info: theme.infoSoft
        case .accent: theme.color.accent.opacity(0.16)
        }
    }
}

// MARK: - DSSectionHeader

public struct DSSectionHeader<Trailing: View>: View {
    @Environment(\.theme) private var theme
    private let title: String
    private let subtitle: String?
    @ViewBuilder private let trailing: () -> Trailing

    public init(
        _ title: String,
        subtitle: String? = nil,
        @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }
    ) {
        self.title = title; self.subtitle = subtitle; self.trailing = trailing
    }

    public var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).textRole(.title).foregroundStyle(theme.color.textPrimary)
                if let subtitle {
                    Text(subtitle).textRole(.caption).foregroundStyle(theme.color.textSecondary)
                }
            }
            Spacer(minLength: theme.space.md)
            trailing()
        }
    }
}

// MARK: - DSEmptyState

public struct DSEmptyState: View {
    private let title: String
    private let systemImage: String
    private let message: String?

    public init(_ title: String, systemImage: String = "tray", message: String? = nil) {
        self.title = title; self.systemImage = systemImage; self.message = message
    }

    public var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            if let message { Text(message) }
        }
    }
}

// MARK: - DSStepper — large-target −/＋ with haptics

public struct DSStepper: View {
    @Environment(\.theme) private var theme
    @Binding private var value: Int
    private let range: ClosedRange<Int>

    public init(value: Binding<Int>, range: ClosedRange<Int> = 0...99) {
        _value = value; self.range = range
    }

    public var body: some View {
        HStack(spacing: theme.space.md) {
            key("minus") { if value > range.lowerBound { value -= 1 } }
            Text("\(value)").textRole(.mono).frame(minWidth: 28)
                .foregroundStyle(theme.color.textPrimary)
            key("plus") { if value < range.upperBound { value += 1 } }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Quantity")
        .accessibilityValue("\(value)")
        .accessibilityAdjustableAction { dir in
            switch dir {
            case .increment: if value < range.upperBound { value += 1 }
            case .decrement: if value > range.lowerBound { value -= 1 }
            @unknown default: break
            }
        }
    }

    private func key(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.headline).frame(width: 44, height: 44)
        }
        .buttonStyle(.plain)
        .foregroundStyle(theme.color.accent)
        .background(theme.color.surface, in: Circle())
        .overlay(Circle().strokeBorder(theme.color.line, lineWidth: 1))
        .sensoryFeedback(.impact(weight: .light), trigger: value)
    }
}

// MARK: - MetricTile — the analytics unit

public struct MetricTile: View {
    @Environment(\.theme) private var theme
    private let label: String
    private let value: String
    private let delta: String?
    private let deltaUp: Bool
    private let icon: String?
    private let tint: Color?
    /// Optional Rule #12 ⓘ — when present, the tile is self-explaining.
    private let info: InfoButton?

    public init(label: String, value: String, delta: String? = nil, deltaUp: Bool = true, icon: String? = nil, tint: Color? = nil, info: InfoButton? = nil) {
        self.label = label; self.value = value; self.delta = delta; self.deltaUp = deltaUp; self.icon = icon; self.tint = tint; self.info = info
    }

    public var body: some View {
        DSCard {
            VStack(alignment: .leading, spacing: theme.space.xs) {
                HStack(spacing: theme.space.xs) {
                    Text(label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
                    Spacer()
                    if let icon { Image(systemName: icon).foregroundStyle(tint ?? theme.color.accent) }
                    if let info { info }
                }
                Text(value).textRole(.titleL).foregroundStyle(theme.color.textPrimary)
                if let delta {
                    Label(delta, systemImage: deltaUp ? "arrow.up.right" : "arrow.down.right")
                        .textRole(.caption)
                        .foregroundStyle(deltaUp ? theme.color.success : theme.color.danger)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Gallery (the living Storybook — DESIGN-SYSTEM §6)

#if DEBUG
private struct DSGallery: View {
    @State private var qty = 2
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                DSSectionHeader("Components", subtitle: "rendered in the active skin") {
                    DSBadge("live", tone: .success, systemImage: "dot.radiowaves.left.and.right")
                }
                HStack { DSButton("Primary") {}; DSButton("Secondary", prominent: false) {} }
                HStack(spacing: 8) {
                    DSBadge("New", tone: .info)
                    DSBadge("86'd", tone: .danger, systemImage: "xmark.octagon.fill")
                    DSBadge("Late", tone: .warning, systemImage: "clock.fill")
                }
                HStack(spacing: 12) {
                    MetricTile(label: "Covers", value: "128", delta: "+12%", icon: "person.2.fill")
                    MetricTile(label: "Revenue", value: "4 980 zł", delta: "-3%", deltaUp: false, icon: "banknote.fill")
                }
                DSCard(elevated: true, accent: nil) {
                    VStack(alignment: .leading) {
                        Text("Elevated card").textRole(.bodyEmphasis)
                        DSStepper(value: $qty)
                    }
                }
                DSEmptyState("All clear", systemImage: "checkmark.seal.fill", message: "No open tickets on the line.")
                    .frame(height: 180)
            }
            .padding()
        }
    }
}

#Preview("Gallery · Ottaviano") {
    DSGallery().environment(\.theme, .ottaviano).background(Theme.ottaviano.color.surface)
}
#Preview("Gallery · KDS") {
    DSGallery().environment(\.theme, .kds).background(Theme.kds.color.surface)
        .preferredColorScheme(.dark)
}
#endif
