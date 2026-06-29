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

/// A generic operator list screen: header KPI strip (optional) + a themed list
/// with consistent empty/error/loading states. Concrete screens supply the
/// loader and a row builder, keeping each admin surface to a few lines.
public struct OperatorListView<T: Identifiable & Sendable, Row: View>: View {
    @Environment(\.theme) private var theme
    private let title: String
    private let emptyText: String
    @State private var loader: OperatorListLoader<T>
    /// Optional KPI strip rendered above the rows. Type-erased so the generic
    /// surface stays two-parameter (robust inference) — it's one header, not hot.
    private let header: (([T]) -> AnyView)?
    /// Optional trailing toolbar action (a write surface — e.g. "Log reading").
    /// Receives a `reload` closure so the action can refresh the list after a
    /// successful mutation. Type-erased to keep the generic two-parameter.
    private let toolbar: ((@escaping () async -> Void) -> AnyView)?
    /// Optional searchable projection: each item → the text the search bar matches
    /// against. When supplied, the surface gains a `.searchable` jump bar and the
    /// header KPIs stay computed over the *full* set (search narrows rows only).
    /// Nil (default) = no search bar, so every existing call site is unchanged.
    private let searchKey: ((T) -> String)?
    /// Optional row → detail-sheet projection. When supplied, every row becomes
    /// tappable (with a chevron affordance) and presents this sheet — the native
    /// twin of the web admin's inspect dialog. Nil (default) = inert rows, so
    /// existing call sites are unchanged.
    private let detail: ((T) -> AnyView)?
    private let row: (T) -> Row
    @State private var query = ""
    @State private var selected: T?

    public init(
        title: String,
        emptyText: String = "Nothing here yet.",
        loader: OperatorListLoader<T>,
        header: (([T]) -> AnyView)? = nil,
        toolbar: ((@escaping () async -> Void) -> AnyView)? = nil,
        search: ((T) -> String)? = nil,
        detail: ((T) -> AnyView)? = nil,
        @ViewBuilder row: @escaping (T) -> Row
    ) {
        self.title = title
        self.emptyText = emptyText
        _loader = State(initialValue: loader)
        self.header = header
        self.toolbar = toolbar
        self.searchKey = search
        self.detail = detail
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

    /// Rows after the search query is applied. KPIs in `header` deliberately keep
    /// seeing the unfiltered set — search is a row finder, not a metric filter.
    private func visible(_ items: [T]) -> [T] {
        guard let searchKey else { return items }
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return items }
        return items.filter { searchKey($0).localizedCaseInsensitiveContains(q) }
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
                .modifier(OptionalSearchable(active: searchKey != nil, text: $query, prompt: "Search \(title.lowercased())"))
                .sheet(item: $selected) { item in
                    if let detail { detail(item) }
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let toolbar {
                ToolbarItem(placement: .topBarTrailing) { toolbar({ await loader.load() }) }
            }
        }
        .task { await loader.load() }
        .refreshable { await loader.load() }
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
