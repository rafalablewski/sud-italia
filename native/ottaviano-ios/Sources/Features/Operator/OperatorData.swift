import SwiftUI
import OttavianoKit

/// A tiny async list loader for the operator admin screens — one place for the
/// loading / loaded / failed lifecycle so every `/api/v1/admin/*` screen behaves
/// identically (APP-SHELL §3: views do no I/O; a store owns the fetch).
@MainActor
@Observable
public final class OperatorListLoader<T: Sendable> {
    public enum State: Sendable { case loading, loaded([T]), failed(String) }
    public private(set) var state: State = .loading
    private let fetch: () async throws -> [T]

    public init(fetch: @escaping () async throws -> [T]) { self.fetch = fetch }

    public func load() async {
        state = .loading
        do { state = .loaded(try await fetch()) }
        catch let e as APIError { state = .failed(Self.message(e)) }
        catch { state = .failed("Something went wrong") }
    }

    static func message(_ e: APIError) -> String {
        switch e {
        case .transport: "You appear to be offline"
        case .api(_, let m, _): m
        case .authExpired: "Your session expired — sign in again"
        case .decoding: "Couldn't read the response"
        }
    }
}

/// A named quick-filter for an operator list — a chip the operator taps to narrow
/// the rows without scrolling (the touch-friendly way to handle a dense board).
public struct OperatorFilter<T> {
    public let label: String
    public let systemImage: String?
    public let predicate: (T) -> Bool
    public init(_ label: String, systemImage: String? = nil, _ predicate: @escaping (T) -> Bool) {
        self.label = label; self.systemImage = systemImage; self.predicate = predicate
    }
}

/// A named sort order, surfaced as a toolbar sort menu.
public struct OperatorSortOption<T> {
    public let label: String
    public let comparator: (T, T) -> Bool
    public init(_ label: String, _ comparator: @escaping (T, T) -> Bool) {
        self.label = label; self.comparator = comparator
    }
}

/// A generic operator list screen: header KPI strip (optional) + quick-filter
/// chips + a sort menu + pinned search + a themed list with consistent
/// empty/error/loading states. Concrete screens supply the loader and a row
/// builder, keeping each admin surface to a few lines. Filters/sort are optional
/// and additive — every existing call site keeps working and gains the base
/// ergonomics (pinned search, result count, polished chrome) for free.
public struct OperatorListView<T: Identifiable & Sendable, Row: View>: View {
    @Environment(\.theme) private var theme
    private let title: String
    private let emptyText: String
    @State private var loader: OperatorListLoader<T>
    private let header: (([T]) -> AnyView)?
    private let toolbar: ((@escaping () async -> Void) -> AnyView)?
    private let searchKey: ((T) -> String)?
    private let detail: ((T, @escaping () async -> Void) -> AnyView)?
    /// Quick-filter chips (tap to narrow). Empty = no chip bar.
    private let filters: [OperatorFilter<T>]
    /// Sort orders (toolbar menu). Empty = no sort menu, rows keep server order.
    private let sorts: [OperatorSortOption<T>]
    private let row: (T) -> Row
    @State private var query = ""
    @State private var selected: T?
    @State private var filterIndex = 0   // 0 = All
    @State private var sortIndex = 0

    public init(
        title: String,
        emptyText: String = "Nothing here yet.",
        loader: OperatorListLoader<T>,
        header: (([T]) -> AnyView)? = nil,
        toolbar: ((@escaping () async -> Void) -> AnyView)? = nil,
        search: ((T) -> String)? = nil,
        detail: ((T, @escaping () async -> Void) -> AnyView)? = nil,
        filters: [OperatorFilter<T>] = [],
        sorts: [OperatorSortOption<T>] = [],
        @ViewBuilder row: @escaping (T) -> Row
    ) {
        self.title = title
        self.emptyText = emptyText
        _loader = State(initialValue: loader)
        self.header = header
        self.toolbar = toolbar
        self.searchKey = search
        self.detail = detail
        self.filters = filters
        self.sorts = sorts
        self.row = row
    }

    /// A row, made tappable when a `detail:` sheet is provided. The chevron is the
    /// only added chrome so rows that already carry trailing content still read cleanly.
    @ViewBuilder private func rowView(_ item: T) -> some View {
        if detail != nil {
            Button { selected = item } label: {
                HStack(spacing: theme.space.sm) {
                    row(item)
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(theme.color.textSecondary.opacity(0.5))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            row(item)
        }
    }

    /// Rows after the active filter chip → search query → sort are applied. KPIs in
    /// `header` deliberately keep seeing the unfiltered set.
    private func visible(_ items: [T]) -> [T] {
        var base = items
        if filterIndex > 0, filterIndex - 1 < filters.count {
            base = base.filter(filters[filterIndex - 1].predicate)
        }
        if let searchKey {
            let q = query.trimmingCharacters(in: .whitespaces)
            if !q.isEmpty { base = base.filter { searchKey($0).localizedCaseInsensitiveContains(q) } }
        }
        if !sorts.isEmpty, sortIndex < sorts.count {
            base = base.sorted(by: sorts[sortIndex].comparator)
        }
        return base
    }

    private func isNarrowed(_ items: [T], _ shown: [T]) -> Bool {
        filterIndex > 0 || !query.trimmingCharacters(in: .whitespaces).isEmpty || shown.count != items.count
    }

    public var body: some View {
        Group {
            switch loader.state {
            case .loading:
                List { ForEach(0..<6, id: \.self) { _ in OperatorRowSkeleton() } }
            case .failed(let message):
                ContentUnavailableView("Couldn't load \(title.lowercased())", systemImage: "wifi.slash", description: Text(message))
            case .loaded(let items) where items.isEmpty:
                ContentUnavailableView(title, systemImage: "tray", description: Text(emptyText))
            case .loaded(let items):
                let shown = visible(items)
                VStack(spacing: 0) {
                    if !filters.isEmpty { filterBar(items, shown: shown) }
                    List {
                        if let header {
                            header(items)
                                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                                .listRowBackground(Color.clear)
                        }
                        if shown.isEmpty {
                            ContentUnavailableView.search(text: query)
                                .listRowBackground(Color.clear)
                        } else {
                            ForEach(shown) { rowView($0) }
                        }
                    }
                }
                .modifier(OptionalSearchable(active: searchKey != nil, text: $query, prompt: "Search \(title.lowercased())"))
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !sorts.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        ForEach(sorts.indices, id: \.self) { i in
                            Button {
                                sortIndex = i
                            } label: {
                                if sortIndex == i { Label(sorts[i].label, systemImage: "checkmark") } else { Text(sorts[i].label) }
                            }
                        }
                    } label: { Image(systemName: "arrow.up.arrow.down") }
                    .accessibilityLabel("Sort")
                }
            }
            if let toolbar {
                ToolbarItem(placement: .topBarTrailing) { toolbar({ await loader.load() }) }
            }
        }
        .sheet(item: $selected) { item in
            if let detail { detail(item) { await loader.load() } }
        }
        .task { await loader.load() }
        .refreshable { await loader.load() }
    }

    // MARK: - filter chip bar

    private func filterBar(_ items: [T], shown: [T]) -> some View {
        VStack(spacing: 6) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: theme.space.sm) {
                    filterChip("All", icon: nil, count: items.count, active: filterIndex == 0) { filterIndex = 0 }
                    ForEach(filters.indices, id: \.self) { i in
                        let c = items.filter(filters[i].predicate).count
                        filterChip(filters[i].label, icon: filters[i].systemImage, count: c, active: filterIndex == i + 1) {
                            filterIndex = i + 1
                        }
                    }
                }
                .padding(.horizontal, theme.space.lg)
            }
            if isNarrowed(items, shown) {
                HStack {
                    Text("\(shown.count) of \(items.count)").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                    Spacer()
                }
                .padding(.horizontal, theme.space.lg)
            }
        }
        .padding(.vertical, theme.space.sm)
        .background(theme.color.surface)
        .overlay(alignment: .bottom) { Divider().overlay(theme.color.line) }
    }

    private func filterChip(_ label: String, icon: String?, count: Int, active: Bool, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            HStack(spacing: 5) {
                if let icon { Image(systemName: icon).font(.caption2) }
                Text(label).textRole(.caption).fontWeight(.semibold)
                Text("\(count)").font(.caption2.weight(.bold)).monospacedDigit()
                    .padding(.horizontal, 5).padding(.vertical, 1)
                    .background((active ? theme.color.onAccent : theme.color.accent).opacity(0.2), in: Capsule())
            }
            .padding(.horizontal, theme.space.md).frame(height: 32)
            .foregroundStyle(active ? theme.color.onAccent : theme.color.textPrimary)
            .background(active ? theme.color.accent : theme.color.surface2, in: Capsule())
            .overlay(Capsule().strokeBorder(theme.color.line, lineWidth: active ? 0 : 1))
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: active)
    }
}

/// Applies `.searchable` only when the surface opted into search — keeps the
/// search bar off screens that didn't supply a `search:` projection.
private struct OptionalSearchable: ViewModifier {
    let active: Bool
    @Binding var text: String
    let prompt: String
    func body(content: Content) -> some View {
        if active {
            content.searchable(text: $text, placement: .navigationBarDrawer(displayMode: .automatic), prompt: prompt)
        } else {
            content
        }
    }
}

struct OperatorRowSkeleton: View {
    @Environment(\.theme) private var theme
    var body: some View {
        RoundedRectangle(cornerRadius: 8).fill(theme.color.surface2).frame(height: 44)
            .redacted(reason: .placeholder)
    }
}

/// A compact KPI chip used in operator list headers (counts, averages, totals).
public struct OperatorStatChip: View {
    @Environment(\.theme) private var theme
    let label: String
    let value: String
    let tint: Color
    public init(_ label: String, _ value: String, tint: Color) {
        self.label = label; self.value = value; self.tint = tint
    }
    public var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.title3.weight(.bold)).monospacedDigit().foregroundStyle(tint)
            Text(label).font(.caption2).foregroundStyle(theme.color.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, theme.space.sm)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }
}
