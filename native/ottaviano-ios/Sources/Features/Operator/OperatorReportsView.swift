import SwiftUI
import OttavianoKit

/// Reports — the native twin of web `/admin/reports`. Live sales / cost / profit
/// rollup from `GET /api/v1/admin/summary`, with the top sellers and a daily
/// trend. Real data only (Rule #1).
public struct OperatorReportsView: View {
    @Environment(\.dependencies) private var deps
    @Environment(\.theme) private var theme
    @State private var summary: AdminSummary?
    @State private var error: String?
    @State private var loaded = false

    public init() {}

    private let cols = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let error, summary == nil {
                    ContentUnavailableView("Couldn't load reports", systemImage: "chart.bar", description: Text(error))
                        .padding(.top, theme.space.xxl)
                } else if let s = summary {
                    LazyVGrid(columns: cols, spacing: theme.space.md) {
                        moneyTile("Revenue", s.totalRevenue, theme.color.success)
                        moneyTile("Profit", s.totalProfit, theme.color.accent)
                        moneyTile("Cost", s.totalCost, theme.color.warning)
                        tile("Orders", "\(s.totalOrders)", theme.color.accent)
                        moneyTile("Avg ticket", Int(s.avgOrderValue.rounded()), theme.color.textSecondary)
                        tile("Margin", "\(Int(s.profitMargin.rounded()))%", theme.color.success)
                    }
                    mix(s)
                    topItems(s)
                    daily(s)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Reports")
        .task { if !loaded { await load() } }
        .refreshable { await load() }
    }

    private func mix(_ s: AdminSummary) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text("Fulfilment mix").font(.headline).foregroundStyle(theme.color.textPrimary)
            HStack(spacing: theme.space.sm) {
                OperatorStatChip("Takeout", "\(s.takeoutCount)", tint: theme.color.accent)
                OperatorStatChip("Delivery", "\(s.deliveryCount)", tint: theme.color.warning)
                OperatorStatChip("Dine-in", "\(s.dineInCount)", tint: theme.color.success)
            }
        }
    }

    private func topItems(_ s: AdminSummary) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text("Top sellers").font(.headline).foregroundStyle(theme.color.textPrimary)
            if s.topItems.isEmpty {
                Text("No sales in range.").font(.footnote).foregroundStyle(theme.color.textSecondary)
            }
            ForEach(s.topItems.prefix(8)) { item in
                HStack {
                    Text(item.name).font(.subheadline).foregroundStyle(theme.color.textPrimary)
                    Spacer()
                    Text("×\(item.quantity)").font(.caption).monospacedDigit().foregroundStyle(theme.color.textSecondary)
                    MoneyText(item.revenue).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                }
                .padding(theme.space.sm)
                .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
            }
        }
    }

    private func daily(_ s: AdminSummary) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text("By day").font(.headline).foregroundStyle(theme.color.textPrimary)
            ForEach(s.dailyStats.suffix(14).reversed()) { d in
                HStack {
                    Text(d.date).font(.caption.monospaced()).foregroundStyle(theme.color.textSecondary)
                    Spacer()
                    Text("\(d.orderCount) ord").font(.caption).monospacedDigit().foregroundStyle(theme.color.textSecondary)
                    MoneyText(d.revenue).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                }
                .padding(.vertical, 2)
            }
        }
    }

    private func tile(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: theme.space.xs) {
            Text(value).font(.system(size: 26, weight: .bold)).monospacedDigit().foregroundStyle(theme.color.textPrimary)
            Text(label).font(.caption).foregroundStyle(theme.color.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func moneyTile(_ label: String, _ grosze: Grosze, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: theme.space.xs) {
            MoneyText(grosze).font(.system(size: 22, weight: .bold)).foregroundStyle(theme.color.textPrimary)
            Text(label).font(.caption).foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func load() async {
        do { summary = try await deps.api.send(.adminSummary()); error = nil }
        catch let e as APIError {
            if case .api(_, let m, _) = e { error = m } else if case .transport = e { error = "You appear to be offline" }
            else { error = "Something went wrong" }
        } catch { self.error = "Something went wrong" }
        loaded = true
    }
}
