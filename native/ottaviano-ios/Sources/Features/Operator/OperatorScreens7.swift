import SwiftUI
import OttavianoKit

// Wave 7 operator surfaces — HACCP temperature log, Menu engineering matrix,
// Regulatory disclosures. All read-only off /api/v1/admin, dark operator skin.

// MARK: - HACCP (/admin/haccp)

public struct OperatorHaccpView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "HACCP log",
            emptyText: "No temperature readings yet.",
            loader: OperatorListLoader { try await api.send(.adminHaccp()) },
            header: { (items: [AdminTempLog]) in
                AnyView(HStack(spacing: theme.space.sm) {
                    OperatorStatChip("Readings", "\(items.count)", tint: theme.color.accent)
                    OperatorStatChip("Flagged", "\(items.filter { $0.status == "flagged" }.count)", tint: theme.color.danger)
                })
            },
            toolbar: { reload in AnyView(LogTempButton(api: api, reload: reload)) },
            row: { t in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(t.sensor).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(t.locationSlug.capitalized) · \(t.recordedAt.prefix(16).replacingOccurrences(of: "T", with: " "))")
                            .font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    Text(String(format: "%.1f°C", t.celsius))
                        .font(.subheadline.weight(.bold)).monospacedDigit()
                        .foregroundStyle(t.status == "flagged" ? theme.color.danger : theme.color.success)
                }
            }
        )
    }
}

// MARK: - Menu engineering (/admin/menu-engineering)

public struct OperatorMenuEngineeringView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Menu engineering",
            emptyText: "Not enough sales to classify yet.",
            loader: OperatorListLoader { try await api.send(.adminMenuEngineering()) },
            header: { (items: [AdminMenuEngineeringLine]) in
                AnyView(HStack(spacing: theme.space.xs) {
                    quadChip("Stars", items.filter { $0.quadrant == "star" }.count, theme.color.success)
                    quadChip("Plows", items.filter { $0.quadrant == "plowhorse" }.count, theme.color.accent)
                    quadChip("Puzzles", items.filter { $0.quadrant == "puzzle" }.count, theme.color.warning)
                    quadChip("Dogs", items.filter { $0.quadrant == "dog" }.count, theme.color.danger)
                })
            },
            row: { l in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(l.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("×\(l.unitsSold) · GP \(MoneyText.format(l.gpPerUnit))/unit").font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    quadrantTag(l.quadrant)
                }
            }
        )
    }
    private func quadChip(_ label: String, _ n: Int, _ c: Color) -> some View {
        OperatorStatChip(label, "\(n)", tint: c)
    }
    private func quadrantTag(_ q: String) -> some View {
        let c = q == "star" ? theme.color.success : q == "plowhorse" ? theme.color.accent : q == "puzzle" ? theme.color.warning : theme.color.danger
        return Text(q.capitalized).font(.caption2.weight(.bold))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(c.opacity(0.18), in: Capsule()).foregroundStyle(c)
    }
}

// MARK: - Regulatory disclosures (/admin/regulatory-compliance)

public struct OperatorRegulatoryView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Regulatory",
            emptyText: "No locations to disclose.",
            loader: OperatorListLoader { try await api.send(.adminRegulatory()) },
            row: { r in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(r.city).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Spacer()
                        Text(r.zone).font(.caption2.weight(.bold))
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(theme.color.accent.opacity(0.18), in: Capsule()).foregroundStyle(theme.color.accent)
                    }
                    HStack(spacing: theme.space.sm) {
                        if let g = r.dohGrade { flag("DOH \(g)") }
                        if r.calorieDisclosureRequired { flag("kcal labels") }
                        if r.halalCertId != nil { flag("Halal cert") }
                    }
                }
            }
        )
    }
    private func flag(_ t: String) -> some View {
        Text(t).font(.caption2)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(theme.color.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(theme.color.line, lineWidth: 1))
            .foregroundStyle(theme.color.textSecondary)
    }
}
