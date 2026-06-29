import SwiftUI
import OttavianoKit

/// Agent HQ (/admin/agent-hq) — the autonomous-agent command center. Live fleet
/// KPIs with a 7-day success gauge, a cost-by-agent donut, the agent spend
/// leaderboard, and the recent-activity timeline — all from real store reads via
/// `/api/v1/admin/agent-hq` (Rule #1). Fleet KPIs carry the five-section ⓘ.
public struct OperatorAgentHQView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    @State private var data: AgentHQ?
    @State private var error: String?

    public init(api: APIClient) { self.api = api }

    private let cols = [GridItem(.adaptive(minimum: 150), spacing: 12)]
    private var palette: [Color] { [theme.color.accent, theme.color.success, theme.color.warning, theme.info, theme.risk, theme.color.danger] }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let error, data == nil {
                    ContentUnavailableView("Couldn't load Agent HQ", systemImage: "cpu", description: Text(error))
                        .padding(.top, theme.space.xxl)
                } else if let d = data {
                    kpis(d.fleet)
                    HStack(alignment: .top, spacing: theme.space.md) {
                        successCard(d.fleet)
                        costCard(d.agents)
                    }
                    spendBoard(d.agents)
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

    // MARK: KPIs

    private func kpis(_ f: AgentHQ.Fleet) -> some View {
        LazyVGrid(columns: cols, spacing: theme.space.md) {
            OperatorKPICard(label: "Runs today", value: "\(f.runsToday)", icon: "play.circle.fill", tint: theme.color.accent, info: Self.runsInfo)
            OperatorKPICard(label: "Runs (7d)", value: "\(f.runs7d)", icon: "calendar", tint: theme.color.accent)
            OperatorKPICard(label: "Cost (7d)", value: MoneyText.format(f.cost7dGrosze), icon: "creditcard.fill", tint: theme.color.warning, info: Self.costInfo)
            OperatorKPICard(label: "Cost (month)", value: MoneyText.format(f.costMonthGrosze), icon: "creditcard.fill", tint: theme.color.warning)
        }
    }

    private func successCard(_ f: AgentHQ.Fleet) -> some View {
        // successRate7d may arrive 0–1 or 0–100; normalise to a fraction.
        let raw = f.successRate7d
        let frac = raw.map { $0 <= 1 ? $0 : $0 / 100 }
        let pct = frac.map { Int(($0 * 100).rounded()) }
        let tint: Color = (frac ?? 0) >= 0.9 ? theme.color.success : ((frac ?? 0) >= 0.7 ? theme.color.warning : theme.color.danger)
        return card("Success rate", subtitle: "last 7 days", info: Self.successInfo) {
            HStack { Spacer()
                OperatorGauge(fraction: frac ?? 0, centerValue: pct.map { "\($0)%" } ?? "—",
                              centerLabel: "of runs", tint: tint, diameter: 116)
                Spacer() }
        }
    }

    private func costCard(_ agents: [AgentHQ.Agent]) -> some View {
        let spenders = agents.filter { $0.spendTodayGrosze > 0 }
        let total = spenders.reduce(0) { $0 + $1.spendTodayGrosze }
        return card("Cost by agent", subtitle: "today", info: nil) {
            if spenders.isEmpty {
                Text("No agent spend today.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 110)
            } else {
                HStack(spacing: theme.space.md) {
                    OperatorDonut(segments: spenders.enumerated().map { i, a in
                        .init(label: a.name, value: Double(a.spendTodayGrosze), color: palette[i % palette.count])
                    }, centerValue: MoneyText.format(total), centerLabel: "today", diameter: 110)
                    VStack(alignment: .leading, spacing: theme.space.xs) {
                        ForEach(Array(spenders.prefix(4).enumerated()), id: \.element.id) { i, a in
                            HStack(spacing: 5) {
                                RoundedRectangle(cornerRadius: 2).fill(palette[i % palette.count]).frame(width: 9, height: 9)
                                Text(a.name).textRole(.caption).foregroundStyle(theme.color.textPrimary).lineLimit(1)
                            }
                        }
                    }
                }
            }
        }
    }

    private func spendBoard(_ agents: [AgentHQ.Agent]) -> some View {
        let ranked = agents.sorted { $0.spendTodayGrosze > $1.spendTodayGrosze }
        let maxSpend = max(agents.map(\.spendTodayGrosze).max() ?? 1, 1)
        return card("Agents", subtitle: "spend today", info: nil) {
            VStack(spacing: theme.space.md) {
                ForEach(Array(ranked.enumerated()), id: \.element.id) { i, a in
                    HStack(spacing: theme.space.sm) {
                        Text("\(i + 1)").font(.caption.weight(.bold)).monospacedDigit()
                            .foregroundStyle(i < 3 ? theme.color.warning : theme.color.textSecondary).frame(width: 18)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(a.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary).lineLimit(1)
                                statusTag(a.status)
                            }
                            OperatorBarRow(fraction: Double(a.spendTodayGrosze) / Double(maxSpend))
                            Text(a.title).textRole(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(1)
                        }
                        Spacer(minLength: theme.space.sm)
                        MoneyText(a.spendTodayGrosze).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                    }
                }
            }
        }
    }

    private func timeline(_ events: [AgentHQ.Event]) -> some View {
        card("Recent activity", subtitle: nil, info: nil) {
            if events.isEmpty {
                Text("No agent activity yet.").font(.footnote).foregroundStyle(theme.color.textSecondary)
            } else {
                VStack(alignment: .leading, spacing: theme.space.sm) {
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
        }
    }

    private func statusTag(_ s: String) -> some View {
        let on = s.lowercased() == "active" || s.lowercased() == "on"
        return Text(s.capitalized).font(.caption2.weight(.bold))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background((on ? theme.color.success : theme.color.textSecondary).opacity(0.18), in: Capsule())
            .foregroundStyle(on ? theme.color.success : theme.color.textSecondary)
    }

    private func card<Content: View>(_ title: String, subtitle: String?, info: InfoButton?,
                                     @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).foregroundStyle(theme.color.textPrimary)
                    if let subtitle { Text(subtitle).textRole(.caption).foregroundStyle(theme.color.textSecondary) }
                }
                Spacer()
                if let info { info }
            }
            content()
        }
        .padding(theme.space.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func load() async {
        do { data = try await api.send(.adminAgentHQ()); error = nil }
        catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { self.error = "Something went wrong" }
    }
}

// MARK: - Agent HQ explainers (Rule #12 — all five sections each)

private extension OperatorAgentHQView {
    static var runsInfo: InfoButton {
        InfoButton(title: "Runs today",
            description: "Autonomous-agent runs executed so far today across the fleet.",
            institutional: "Run volume is the fleet's work output — but it's only value if paired with success rate and cost. A spike in runs with a falling success rate is an agent looping or thrashing, burning budget for nothing; institutions watch the three together, never volume alone.",
            plain: "If the fleet did 42 runs today, that's 42 pieces of automated work attempted — reordering stock, drafting campaigns, triaging reviews. Check the success gauge to know how many actually landed.",
            tips: "Read runs alongside success + cost. If runs climb but success drops, pause the misbehaving agent (the spend board shows who) before it burns the daily cap.",
            methodology: "Count of agent runs since local midnight. Source: /admin/agent-hq.fleet.runsToday.")
    }
    static var successInfo: InfoButton {
        InfoButton(title: "Success rate",
            description: "Share of the last 7 days' agent runs that completed successfully.",
            institutional: "Success rate is the trust metric for autonomy — it decides how much you let the fleet run unsupervised. Above ~90% is delegate-with-confidence; below ~70% the agents need tighter prompts or human approval gates, and the ROI case weakens fast.",
            plain: "If 9 of every 10 runs succeed, that's 90% — reliable enough to leave running. If it slips to 60%, you're babysitting failures and paying for the retries.",
            tips: "Trace failures in the activity feed to the agent + task type, tighten that agent's prompt or add an approval gate, and re-check after the change.",
            methodology: "successful runs ÷ total runs over 7 days. Source: /admin/agent-hq.fleet.successRate7d.")
    }
    static var costInfo: InfoButton {
        InfoButton(title: "Cost (7d)",
            description: "Total model + tool spend across the fleet over the last 7 days.",
            institutional: "Agent cost is a real opex line that must be weighed against the labour it offsets — the gate is cost-per-successful-run vs the human-minutes saved. Uncapped agents are the failure mode institutions fear; a visible weekly cost with per-agent caps is the control.",
            plain: "If the fleet spent 180 zł this week to do work that would've taken a manager 6 hours, that's a good trade. The cost-by-agent donut shows where the money went.",
            tips: "Watch cost-per-run, set daily caps per agent, and retire or downgrade the model on agents whose output doesn't justify their spend.",
            methodology: "Σ run cost over 7 days. Source: /admin/agent-hq.fleet.cost7dGrosze; per-agent from agents[].spendTodayGrosze.")
    }
}
