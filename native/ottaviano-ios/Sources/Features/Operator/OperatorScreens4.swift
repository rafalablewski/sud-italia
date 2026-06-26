import SwiftUI
import OttavianoKit

// Wave 4 operator surfaces — the generic Settings renderer (covers 8 config
// pages), Insights, Multi-location, Expansion, Scheduled bundles, and a static
// Welcome. All live off /api/v1/admin, dark operator skin.

// MARK: - Generic settings (covers /admin/settings, /payments, /qr-ordering,
//          /integrations, /currency, /languages, /upsell, /crosssell)

public struct OperatorSettingsView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    private let surface: String
    private let title: String
    @State private var data: SettingsSurface?
    @State private var error: String?

    public init(api: APIClient, surface: String, title: String) {
        self.api = api; self.surface = surface; self.title = title
    }

    public var body: some View {
        Group {
            if let error, data == nil {
                ContentUnavailableView("Couldn't load \(title.lowercased())", systemImage: "wifi.slash", description: Text(error))
            } else if let data {
                if data.fields.isEmpty {
                    ContentUnavailableView(data.title, systemImage: "gearshape", description: Text("Nothing configured yet."))
                } else {
                    List {
                        ForEach(Array(data.fields.enumerated()), id: \.offset) { _, f in
                            HStack(alignment: .top) {
                                Text(f.label).font(.caption).foregroundStyle(theme.color.textSecondary)
                                Spacer(minLength: theme.space.md)
                                Text(f.value).font(.subheadline).foregroundStyle(theme.color.textPrimary)
                                    .multilineTextAlignment(.trailing)
                            }
                        }
                    }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(theme.color.surface)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do { data = try await api.send(.adminSettings(surface: surface)); error = nil }
        catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { error = "Something went wrong" }
    }
}

// MARK: - Insights (/admin/ai)

public struct OperatorInsightsView: View {
    @Environment(\.dependencies) private var deps
    @Environment(\.theme) private var theme
    @State private var data: AdminInsights?
    @State private var error: String?

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let error, data == nil {
                    ContentUnavailableView("Couldn't load insights", systemImage: "brain", description: Text(error))
                        .padding(.top, theme.space.xxl)
                } else if let d = data {
                    HStack(spacing: theme.space.sm) {
                        OperatorStatChip("Items/order", String(format: "%.1f", d.avgItemsPerOrder), tint: theme.color.accent)
                        OperatorStatChip("Cancelled", "\(d.cancelledOrders)", tint: theme.color.danger)
                        OperatorStatChip("Cancel %", String(format: "%.0f%%", d.cancellationRate), tint: theme.color.warning)
                    }
                    list("Top sellers", d.topSellers)
                    list("Worst sellers", d.worstSellers)
                    peak(d.peakHours)
                    locations(d.locationComparison)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Insights")
        .task { await load() }
        .refreshable { await load() }
    }

    private func list(_ title: String, _ items: [AdminInsights.NamedSale]) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text(title).font(.headline).foregroundStyle(theme.color.textPrimary)
            ForEach(items) { s in
                HStack {
                    Text(s.name).font(.subheadline).foregroundStyle(theme.color.textPrimary)
                    Spacer()
                    Text("×\(s.quantity)").font(.caption).monospacedDigit().foregroundStyle(theme.color.textSecondary)
                    MoneyText(s.revenue).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                }
                .padding(theme.space.sm)
                .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
            }
        }
    }

    private func peak(_ hours: [AdminInsights.PeakHour]) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text("Peak hours").font(.headline).foregroundStyle(theme.color.textPrimary)
            ForEach(hours) { h in
                HStack {
                    Text(String(format: "%02d:00", h.hour)).font(.caption.monospaced()).foregroundStyle(theme.color.textSecondary)
                    Spacer()
                    Text("\(h.orderCount) ord").font(.caption).monospacedDigit().foregroundStyle(theme.color.textSecondary)
                    MoneyText(h.revenue).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                }
                .padding(.vertical, 1)
            }
        }
    }

    private func locations(_ rows: [AdminLocationKPI]) -> some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            if !rows.isEmpty { Text("By location").font(.headline).foregroundStyle(theme.color.textPrimary) }
            ForEach(rows) { LocationKPIRow(kpi: $0) }
        }
    }

    private func load() async {
        do { data = try await deps.api.send(.adminInsights()); error = nil }
        catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { error = "Something went wrong" }
    }
}

/// Shared per-location KPI card — used by Insights and Multi-location.
struct LocationKPIRow: View {
    @Environment(\.theme) private var theme
    let kpi: AdminLocationKPI
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(kpi.city).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                Spacer()
                Text("\(Int(kpi.profitMargin.rounded()))% margin").font(.caption).foregroundStyle(theme.color.success)
            }
            HStack(spacing: theme.space.md) {
                metric("Revenue", MoneyText.format(kpi.revenue))
                metric("Profit", MoneyText.format(kpi.profit))
                metric("Orders", "\(kpi.orderCount)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }
    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value).font(.caption.weight(.bold)).monospacedDigit().foregroundStyle(theme.color.textPrimary)
            Text(label).font(.caption2).foregroundStyle(theme.color.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Multi-location (/admin/locations)

public struct OperatorMultiLocationView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Multi-location",
            emptyText: "No locations to compare yet.",
            loader: OperatorListLoader { try await api.send(.adminLocations()) },
            row: { LocationKPIRow(kpi: $0) }
        )
    }
}

// MARK: - Expansion (/admin/expansion)

public struct OperatorExpansionView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Expansion",
            emptyText: "No expansion sites tracked.",
            loader: OperatorListLoader { try await api.send(.adminExpansion()) },
            row: { e in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(e.city ?? e.locationSlug.capitalized).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Spacer()
                        Text("\(e.done)/\(e.total) · \(e.pct)%").font(.caption).monospacedDigit().foregroundStyle(theme.color.textSecondary)
                    }
                    ProgressView(value: Double(e.pct), total: 100).tint(e.pct == 100 ? theme.color.success : theme.color.accent)
                }
            }
        )
    }
}

// MARK: - Scheduled bundles (/admin/scheduled-bundles)

public struct OperatorScheduledBundlesView: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    public var body: some View {
        OperatorListView(
            title: "Scheduled bundles",
            emptyText: "No scheduled bundles yet.",
            loader: OperatorListLoader { try await api.send(.adminScheduledBundles()) },
            row: { b in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(b.bundleName).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(b.weekday.capitalized) \(b.readyAt) · \(b.locationSlug.capitalized) · \(b.itemCount) items")
                            .font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    Text(b.status.capitalized).font(.caption2.weight(.bold))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(tint(b.status).opacity(0.18), in: Capsule()).foregroundStyle(tint(b.status))
                }
            }
        )
    }
    private func tint(_ s: String) -> Color {
        switch s {
        case "active": theme.color.success
        case "paused": theme.color.warning
        case "cancelled": theme.color.danger
        default: theme.color.textSecondary
        }
    }
}

// MARK: - Welcome (/admin/welcome)

public struct OperatorWelcomeView: View {
    @Environment(\.theme) private var theme
    private let role: OperatorRole
    public init(role: OperatorRole) { self.role = role }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                VStack(alignment: .leading, spacing: theme.space.sm) {
                    Text("Benvenuto").font(.system(.largeTitle, design: .serif).weight(.bold)).foregroundStyle(theme.color.accent)
                    Text("OttavianoKDS — kitchen & operations").font(.subheadline).foregroundStyle(theme.color.textSecondary)
                }
                card("You're signed in as", role.displayName, "person.crop.circle")
                VStack(alignment: .leading, spacing: theme.space.sm) {
                    Text("Where to start").font(.headline).foregroundStyle(theme.color.textPrimary)
                    bullet("flame.fill", "Kitchen Display", "Bump tickets live as they come off the line.")
                    bullet("list.clipboard.fill", "Orders", "Every live order across fulfilment types.")
                    bullet("rectangle.3.group.fill", "Dashboard", "Covers, revenue and prep load at a glance.")
                    bullet("chart.bar.fill", "Reports", "Sales, cost and profit for any range.")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(theme.space.lg)
                .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
                .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Welcome")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func card(_ label: String, _ value: String, _ icon: String) -> some View {
        HStack(spacing: theme.space.md) {
            Image(systemName: icon).font(.title2).foregroundStyle(theme.color.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.caption).foregroundStyle(theme.color.textSecondary)
                Text(value).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
            }
            Spacer()
        }
        .padding(theme.space.lg)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }

    private func bullet(_ icon: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: theme.space.md) {
            Image(systemName: icon).foregroundStyle(theme.color.accent).frame(width: 24)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                Text(detail).font(.caption).foregroundStyle(theme.color.textSecondary)
            }
        }
    }
}
