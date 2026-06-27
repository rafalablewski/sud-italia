import SwiftUI
import OttavianoKit

/// Agent HQ (/admin/agent-hq) — the autonomous-agent command center. Live fleet
/// KPIs, the agent roster with today's spend, and the recent activity timeline,
/// all from real store reads via `/api/v1/admin/agent-hq`.
public struct OperatorAgentHQView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    @State private var data: AgentHQ?
    @State private var error: String?

    public init(api: APIClient) { self.api = api }

    private let cols = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let error, data == nil {
                    ContentUnavailableView("Couldn't load Agent HQ", systemImage: "cpu", description: Text(error))
                        .padding(.top, theme.space.xxl)
                } else if let d = data {
                    LazyVGrid(columns: cols, spacing: theme.space.md) {
                        tile("Runs today", "\(d.fleet.runsToday)", theme.color.accent)
                        tile("Runs (7d)", "\(d.fleet.runs7d)", theme.color.accent)
                        tile("Success (7d)", d.fleet.successRate7d.map { "\(Int($0 * ($0 <= 1 ? 100 : 1)))%" } ?? "—", theme.color.success)
                        moneyTile("Cost (7d)", d.fleet.cost7dGrosze, theme.color.warning)
                        moneyTile("Cost (month)", d.fleet.costMonthGrosze, theme.color.warning)
                    }
                    agents(d.agents)
                    timeline(d.events)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Agent HQ")
        .task { await load() }
        .refreshable { await load() }
    }

    private func agents(_ list: [AgentHQ.Agent]) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text("Agents").font(.headline).foregroundStyle(theme.color.textPrimary)
            ForEach(list) { a in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(a.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text(a.title).font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    if a.spendTodayGrosze > 0 {
                        MoneyText(a.spendTodayGrosze).font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    statusTag(a.status)
                }
                .padding(theme.space.sm)
                .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
            }
        }
    }

    private func timeline(_ events: [AgentHQ.Event]) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text("Recent activity").font(.headline).foregroundStyle(theme.color.textPrimary)
            if events.isEmpty {
                Text("No agent activity yet.").font(.footnote).foregroundStyle(theme.color.textSecondary)
            }
            ForEach(events) { e in
                HStack(alignment: .top, spacing: theme.space.sm) {
                    Circle().fill(e.ok == false ? theme.color.danger : theme.color.success).frame(width: 8, height: 8).padding(.top, 6)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(e.summary).font(.subheadline).foregroundStyle(theme.color.textPrimary).lineLimit(2)
                        HStack(spacing: theme.space.xs) {
                            Text(e.agentId).font(.caption2).foregroundStyle(theme.color.textSecondary)
                            Text("· \(e.type)").font(.caption2).foregroundStyle(theme.color.textSecondary)
                            if let c = e.costGrosze, c > 0 { Text("·").font(.caption2).foregroundStyle(theme.color.textSecondary); MoneyText(c).font(.caption2).foregroundStyle(theme.color.textSecondary) }
                        }
                    }
                    Spacer()
                    Text(e.at.prefix(10)).font(.caption2.monospaced()).foregroundStyle(theme.color.textSecondary)
                }
            }
        }
    }

    private func statusTag(_ s: String) -> some View {
        let on = s.lowercased() == "active" || s.lowercased() == "on"
        return Text(s.capitalized).font(.caption2.weight(.bold))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background((on ? theme.color.success : theme.color.textSecondary).opacity(0.18), in: Capsule())
            .foregroundStyle(on ? theme.color.success : theme.color.textSecondary)
    }

    private func tile(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: theme.space.xs) {
            Text(value).textRole(.titleL).monospacedDigit().foregroundStyle(theme.color.textPrimary)
            Text(label).font(.caption).foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
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
        do { data = try await api.send(.adminAgentHQ()); error = nil }
        catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { self.error = "Something went wrong" }
    }
}
