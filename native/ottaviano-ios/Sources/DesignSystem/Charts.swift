import SwiftUI

// Lightweight, hand-rolled chart primitives for the operator analytics surfaces
// (Reports, Insights, Menu engineering). Built on Path/Shape rather than the
// Swift Charts framework so they render identically across OS versions and carry
// no framework-API surface. All colour from the active `Theme`.

// MARK: - OperatorBarChart — a simple vertical bar series

public struct OperatorBarChart: View {
    @Environment(\.theme) private var theme
    private let values: [Double]
    private let leadingLabel: String
    private let trailingLabel: String
    private let height: CGFloat

    public init(values: [Double], leadingLabel: String = "", trailingLabel: String = "", height: CGFloat = 150) {
        self.values = values; self.leadingLabel = leadingLabel; self.trailingLabel = trailingLabel; self.height = height
    }

    public var body: some View {
        let maxV = max(values.max() ?? 1, 0.0001)
        VStack(spacing: theme.space.sm) {
            HStack(alignment: .bottom, spacing: 5) {
                ForEach(values.indices, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 4)
                        .fill(LinearGradient(
                            colors: [theme.color.accent, theme.color.accent.opacity(0.35)],
                            startPoint: .top, endPoint: .bottom))
                        .frame(maxWidth: .infinity)
                        .frame(height: max(4, CGFloat(values[i] / maxV) * height))
                }
            }
            .frame(height: height, alignment: .bottom)
            if !leadingLabel.isEmpty || !trailingLabel.isEmpty {
                HStack {
                    Text(leadingLabel); Spacer(); Text(trailingLabel)
                }
                .textRole(.caption).foregroundStyle(theme.color.textSecondary)
            }
        }
        .accessibilityLabel("Bar chart, \(values.count) values")
    }
}

// MARK: - OperatorDonut — a ring chart with a center readout

public struct OperatorDonutSegment: Sendable {
    public let label: String
    public let value: Double
    public let color: Color
    public init(label: String, value: Double, color: Color) {
        self.label = label; self.value = value; self.color = color
    }
}

public struct OperatorDonut: View {
    @Environment(\.theme) private var theme
    private let segments: [OperatorDonutSegment]
    private let centerValue: String
    private let centerLabel: String
    private let diameter: CGFloat

    public init(segments: [OperatorDonutSegment], centerValue: String, centerLabel: String, diameter: CGFloat = 130) {
        self.segments = segments; self.centerValue = centerValue; self.centerLabel = centerLabel; self.diameter = diameter
    }

    public var body: some View {
        let total = max(segments.reduce(0) { $0 + $1.value }, 0.0001)
        let spans = cumulative(total: total)
        ZStack {
            ForEach(spans.indices, id: \.self) { i in
                Circle()
                    .trim(from: spans[i].start, to: spans[i].end)
                    .stroke(spans[i].color, style: StrokeStyle(lineWidth: diameter * 0.17, lineCap: .butt))
                    .rotationEffect(.degrees(-90))
            }
            VStack(spacing: 1) {
                Text(centerValue).textRole(.titleL).foregroundStyle(theme.color.textPrimary).monospacedDigit()
                Text(centerLabel).textRole(.caption).foregroundStyle(theme.color.textSecondary)
            }
        }
        .frame(width: diameter, height: diameter)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Ring chart, \(centerValue) \(centerLabel)")
    }

    private func cumulative(total: Double) -> [(start: CGFloat, end: CGFloat, color: Color)] {
        var acc = 0.0
        return segments.map { seg in
            let start = acc / total
            acc += seg.value
            return (CGFloat(start), CGFloat(acc / total), seg.color)
        }
    }
}

// MARK: - OperatorBarRow — a labelled horizontal magnitude bar (rankings)

public struct OperatorBarRow: View {
    @Environment(\.theme) private var theme
    private let fraction: Double
    public init(fraction: Double) { self.fraction = max(0, min(1, fraction)) }
    public var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(theme.color.textSecondary.opacity(0.15))
                Capsule().fill(theme.color.accent).frame(width: geo.size.width * fraction)
            }
        }
        .frame(height: 8)
    }
}
