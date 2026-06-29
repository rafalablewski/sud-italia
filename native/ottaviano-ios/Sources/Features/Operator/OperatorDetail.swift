import SwiftUI
import OttavianoKit

// Wave A — detail drill-in. Tapping an operator list row opens a detail sheet
// (the native twin of the web admin's inspect dialogs). These are the shared
// pieces every detail sheet is built from, so each surface's sheet stays a thin,
// honest projection of the fields its /api/v1 DTO actually carries (Rule #1 —
// no fabricated sections; a field absent from the DTO is simply not shown).

// MARK: - OperatorStatTile — the small stat unit inside a sheet header

public struct OperatorStatTile: View {
    @Environment(\.theme) private var theme
    private let label: String
    private let value: String
    private let sub: String?
    private let subTone: Color?
    public init(_ label: String, _ value: String, sub: String? = nil, subTone: Color? = nil) {
        self.label = label; self.value = value; self.sub = sub; self.subTone = subTone
    }
    public var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
            Text(value).textRole(.title).foregroundStyle(theme.color.textPrimary).monospacedDigit()
                .minimumScaleFactor(0.7).lineLimit(1)
            if let sub {
                Text(sub).textRole(.caption).foregroundStyle(subTone ?? theme.color.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.md)
        .background(theme.color.surface.opacity(0.5), in: RoundedRectangle(cornerRadius: theme.radius.md))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.md).strokeBorder(theme.color.line, lineWidth: 1))
    }
}

// MARK: - OperatorMetaRow — an icon + text contact/identity line

public struct OperatorMetaRow: View {
    @Environment(\.theme) private var theme
    private let systemImage: String
    private let text: String
    public init(_ systemImage: String, _ text: String) { self.systemImage = systemImage; self.text = text }
    public var body: some View {
        Label {
            Text(text).textRole(.callout).foregroundStyle(theme.color.textSecondary)
        } icon: {
            Image(systemName: systemImage).foregroundStyle(theme.color.textSecondary).imageScale(.small)
        }
        .labelStyle(.titleAndIcon)
    }
}

// MARK: - OperatorDetailSheet — the reusable sheet scaffold

/// Standard chrome for a row's detail sheet: an avatar/icon + title + subtitle
/// lines + optional status badge in the header, then arbitrary content, on the
/// dark Core canvas, wrapped in a NavigationStack with a Done button. Concrete
/// surfaces (Customer, Staff, …) supply the header bits + content.
public struct OperatorDetailSheet<Content: View>: View {
    public enum Leading: Sendable { case initials(String), icon(String) }
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    private let leading: Leading
    private let title: String
    private let badge: (String, DSBadge.Tone)?
    private let meta: [OperatorMetaRow]
    private let content: Content

    public init(
        leading: Leading,
        title: String,
        badge: (String, DSBadge.Tone)? = nil,
        meta: [OperatorMetaRow] = [],
        @ViewBuilder content: () -> Content
    ) {
        self.leading = leading; self.title = title; self.badge = badge
        self.meta = meta; self.content = content()
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: theme.space.lg) {
                    header
                    content
                }
                .padding(theme.space.lg)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(theme.color.surface)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: theme.space.md) {
            avatar
            VStack(alignment: .leading, spacing: theme.space.xs) {
                HStack(spacing: theme.space.sm) {
                    Text(title).textRole(.titleL).foregroundStyle(theme.color.textPrimary)
                    if let badge { DSBadge(badge.0, tone: badge.1) }
                }
                ForEach(Array(meta.enumerated()), id: \.offset) { _, row in row }
            }
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder private var avatar: some View {
        switch leading {
        case .initials(let s):
            Text(initials(s))
                .font(.system(.title2, design: theme.headingDesign).weight(.bold))
                .foregroundStyle(theme.color.onAccent)
                .frame(width: 60, height: 60)
                .background(
                    LinearGradient(colors: [theme.color.accent, theme.color.accent.opacity(0.7)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: theme.radius.lg)
                )
        case .icon(let name):
            Image(systemName: name)
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(theme.color.accent)
                .frame(width: 60, height: 60)
                .background(theme.color.accent.opacity(0.14), in: RoundedRectangle(cornerRadius: theme.radius.lg))
        }
    }

    private func initials(_ s: String) -> String {
        let parts = s.split(separator: " ").prefix(2)
        let i = parts.compactMap { $0.first }.map(String.init).joined()
        return i.isEmpty ? "·" : i.uppercased()
    }
}

// MARK: - A 2-up / 3-up tile row helper

/// Lays out 2–4 `OperatorStatTile`s in an even grid for a sheet header band.
public struct OperatorStatBand: View {
    @Environment(\.theme) private var theme
    private let tiles: [OperatorStatTile]
    public init(_ tiles: [OperatorStatTile]) { self.tiles = tiles }
    public var body: some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: theme.space.sm), count: min(max(tiles.count, 1), 2))
        LazyVGrid(columns: cols, spacing: theme.space.sm) {
            ForEach(Array(tiles.enumerated()), id: \.offset) { _, t in t }
        }
    }
}
