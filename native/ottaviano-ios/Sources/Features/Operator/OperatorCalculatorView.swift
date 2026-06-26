import SwiftUI
import OttavianoKit

/// The Calculator (/admin/simulation) — the native twin of the web what-if P&L.
/// Live year-one projection from the saved scenario, computed by the SAME pure
/// `projectTwelveMonths` engine the web uses (real numbers, no duplicated math).
/// Read-only for now; editing the levers is a later increment.
public struct OperatorCalculatorView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    @State private var data: AdminSimulation?
    @State private var error: String?

    public init(api: APIClient) { self.api = api }

    private let cols = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let error, data == nil {
                    ContentUnavailableView("Couldn't load the calculator", systemImage: "function", description: Text(error))
                        .padding(.top, theme.space.xxl)
                } else if let d = data {
                    LazyVGrid(columns: cols, spacing: theme.space.md) {
                        moneyTile("Year-1 revenue", d.year1.revenue, theme.color.success)
                        moneyTile("Year-1 net profit", d.year1.netProfit, d.year1.netProfit >= 0 ? theme.color.success : theme.color.danger)
                        moneyTile("Year-1 COGS", d.year1.cogs, theme.color.warning)
                        moneyTile("Year-1 labour", d.year1.labor, theme.color.accent)
                        moneyTile("Year-1 fixed", d.year1.fixed, theme.color.textSecondary)
                        moneyTile("Year-1 card fees", d.year1.payment, theme.color.textSecondary)
                    }
                    assumptions(d.assumptions)
                    monthly(d.months)
                    Text("Read-only projection — what-if levers land in a later update.")
                        .font(.caption).foregroundStyle(theme.color.textSecondary)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Calculator")
        .task { await load() }
        .refreshable { await load() }
    }

    private func assumptions(_ a: AdminSimulation.Assumptions) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text("Assumptions").font(.headline).foregroundStyle(theme.color.textPrimary)
            row("Orders / day", "\(a.ordersPerDay)")
            row("Avg ticket", MoneyText.format(a.avgTicketGrosze))
            row("Days open / month", "\(a.daysOpenPerMonth)")
            row("Food cost", String(format: "%.0f%%", a.cogsPct * 100))
            if let p = a.paymentProcessorPct { row("Card processor", String(format: "%.1f%%", p * 100)) }
            if let s = a.setupCostGrosze { row("Setup cost", MoneyText.format(s)) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.lg)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func monthly(_ months: [AdminSimulation.MonthRow]) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text("12-month projection").font(.headline).foregroundStyle(theme.color.textPrimary)
            ForEach(months) { m in
                HStack {
                    Text(m.month).font(.caption.monospaced()).foregroundStyle(theme.color.textSecondary).frame(width: 64, alignment: .leading)
                    Spacer()
                    MoneyText(m.revenue).font(.caption).foregroundStyle(theme.color.textSecondary)
                    MoneyText(m.netProfit).font(.subheadline.weight(.semibold))
                        .foregroundStyle(m.netProfit >= 0 ? theme.color.success : theme.color.danger)
                        .frame(minWidth: 80, alignment: .trailing)
                }
                .padding(.vertical, 1)
            }
        }
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack {
            Text(k).font(.subheadline).foregroundStyle(theme.color.textSecondary)
            Spacer()
            Text(v).font(.subheadline.weight(.medium)).monospacedDigit().foregroundStyle(theme.color.textPrimary)
        }
    }

    private func moneyTile(_ label: String, _ grosze: Grosze, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: theme.space.xs) {
            MoneyText(grosze).textRole(.titleL).foregroundStyle(theme.color.textPrimary)
            Text(label).font(.caption).foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func load() async {
        do { data = try await api.send(.adminSimulation()); error = nil }
        catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { self.error = "Something went wrong" }
    }
}
