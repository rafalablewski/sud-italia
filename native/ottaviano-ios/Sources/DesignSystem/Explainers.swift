import SwiftUI

// Native twin of the web `MetricExplainer` / `InfoButton` (src/admin-v3/ui/
// Explainer.tsx) — the operator app's enforcement of Rule #12: every ⓘ on a KPI,
// metric or what-if lever renders ALL FIVE sections, in this exact order, with
// these exact labels:
//   description → INSTITUTIONAL ANALYSIS → IN PLAIN TERMS →
//   TIPS — HOW TO PUSH THIS LEVER → METHODOLOGY — HOW THIS IS DETERMINED
// All five inputs are REQUIRED (no defaults) so a half-written explanation won't
// compile — the same guarantee the web component's required props give.

public struct MetricExplainer: View {
    @Environment(\.theme) private var theme
    private let description: String
    private let institutional: String
    private let plain: String
    private let tips: String
    private let methodology: String

    public init(description: String, institutional: String, plain: String, tips: String, methodology: String) {
        self.description = description
        self.institutional = institutional
        self.plain = plain
        self.tips = tips
        self.methodology = methodology
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            Text(description).textRole(.callout).foregroundStyle(theme.color.textPrimary)
            rail("INSTITUTIONAL ANALYSIS", "building.columns.fill", Color(hex: 0x64748B), institutional)
            rail("IN PLAIN TERMS", "text.bubble.fill", theme.color.accent, plain)
            rail("TIPS — HOW TO PUSH THIS LEVER", "lightbulb.fill", theme.color.success, tips)
            rail("METHODOLOGY — HOW THIS IS DETERMINED", "function", theme.info, methodology)
        }
    }

    private func rail(_ label: String, _ icon: String, _ accent: Color, _ body: String) -> some View {
        HStack(alignment: .top, spacing: theme.space.sm) {
            RoundedRectangle(cornerRadius: 2).fill(accent).frame(width: 3)
            VStack(alignment: .leading, spacing: theme.space.xs) {
                Label(label, systemImage: icon)
                    .textRole(.caption).fontWeight(.bold).tracking(0.4)
                    .foregroundStyle(accent)
                Text(body).textRole(.caption).foregroundStyle(theme.color.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// The ⓘ trigger. Tap to present the metric's `MetricExplainer` as a sheet. Mirrors
/// the web `InfoButton({ title, ...explainer })` — same required five inputs, so it
/// can't ship a description-only stub.
public struct InfoButton: View {
    @Environment(\.theme) private var theme
    @State private var show = false
    private let title: String
    private let description: String
    private let institutional: String
    private let plain: String
    private let tips: String
    private let methodology: String

    public init(title: String, description: String, institutional: String, plain: String, tips: String, methodology: String) {
        self.title = title
        self.description = description
        self.institutional = institutional
        self.plain = plain
        self.tips = tips
        self.methodology = methodology
    }

    public var body: some View {
        Button { show = true } label: {
            Image(systemName: "info.circle").imageScale(.small)
                .foregroundStyle(theme.color.textSecondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("About \(title)")
        .sheet(isPresented: $show) {
            NavigationStack {
                ScrollView {
                    MetricExplainer(description: description, institutional: institutional,
                                    plain: plain, tips: tips, methodology: methodology)
                        .padding(theme.space.lg)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(theme.color.surface)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) { Button("Done") { show = false }.fontWeight(.semibold) }
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}
