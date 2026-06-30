import SwiftUI
import OttavianoKit

// Operator surfaces that MUTATE — the menu 86 toggle and task done-state. Each
// owns a small @Observable store that loads then writes via the /api/v1/admin
// PATCH routes and reloads to server truth (no fabricated optimistic state).

// MARK: - Menu + 86-ing (/admin/menu)

@MainActor
@Observable
public final class OperatorMenuStore {
    public enum State: Sendable { case loading, loaded([AdminMenuItem]), failed(String) }
    public private(set) var state: State = .loading
    public private(set) var busyItemId: String?
    public let location: String
    private let api: APIClient

    public init(api: APIClient, location: String) { self.api = api; self.location = location }

    public func load() async {
        if case .loaded = state {} else { state = .loading }
        do { state = .loaded(try await api.send(.adminMenu(location: location))) }
        catch let e as APIError { state = .failed(OperatorListLoader<AdminMenuItem>.message(e)) }
        catch { state = .failed("Something went wrong") }
    }

    public func toggle86(_ item: AdminMenuItem) async {
        busyItemId = item.id
        defer { busyItemId = nil }
        do {
            _ = try await api.send(.adminSet86(itemId: item.id, available: !item.available))
            await load() // reconcile to server truth
        } catch {
            // surface nothing destructive — a failed toggle just leaves state as-is
        }
    }
}

public struct OperatorMenuView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorMenuStore

    public init(api: APIClient, location: String = "krakow") {
        _store = State(initialValue: OperatorMenuStore(api: api, location: location))
    }

    public var body: some View {
        Group {
            switch store.state {
            case .loading:
                List { ForEach(0..<8, id: \.self) { _ in OperatorRowSkeleton() } }
            case .failed(let m):
                ContentUnavailableView("Couldn't load the menu", systemImage: "wifi.slash", description: Text(m))
            case .loaded(let items):
                List {
                    ForEach(groupedCategories(items), id: \.self) { cat in
                        Section(cat.capitalized) {
                            ForEach(items.filter { $0.category == cat }) { row($0) }
                        }
                    }
                }
            }
        }
        .navigationTitle("Menu — \(store.location.capitalized)")
        .navigationBarTitleDisplayMode(.inline)
        .task { if case .loading = store.state { await store.load() } }
        .refreshable { await store.load() }
    }

    private func groupedCategories(_ items: [AdminMenuItem]) -> [String] {
        var seen = Set<String>(), out: [String] = []
        for i in items where !seen.contains(i.category) { seen.insert(i.category); out.append(i.category) }
        return out
    }

    private func row(_ item: AdminMenuItem) -> some View {
        HStack(spacing: theme.space.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).font(.subheadline.weight(.semibold))
                    .foregroundStyle(item.available ? theme.color.textPrimary : theme.color.textSecondary)
                HStack(spacing: theme.space.xs) {
                    MoneyText(item.price).font(.caption).foregroundStyle(theme.color.textSecondary)
                    if item.cost > 0 {
                        let margin = Int(round(Double(item.price - item.cost) / Double(item.price) * 100))
                        Text("· \(margin)% margin").font(.caption2).foregroundStyle(theme.color.textSecondary)
                    }
                }
            }
            Spacer()
            if store.busyItemId == item.id {
                ProgressView()
            } else {
                Toggle("", isOn: Binding(
                    get: { item.available },
                    set: { _ in Task { await store.toggle86(item) } }
                ))
                .labelsHidden()
                .tint(theme.color.success)
            }
        }
    }
}

// MARK: - Tasks + done toggle (/admin/comms/tasks)

@MainActor
@Observable
public final class OperatorTasksStore {
    public enum State: Sendable { case loading, loaded([AdminTask]), failed(String) }
    public private(set) var state: State = .loading
    public private(set) var busyId: String?
    private let api: APIClient
    public init(api: APIClient) { self.api = api }

    public func load() async {
        if case .loaded = state {} else { state = .loading }
        do { state = .loaded(try await api.send(.adminTasks())) }
        catch let e as APIError { state = .failed(OperatorListLoader<AdminTask>.message(e)) }
        catch { state = .failed("Something went wrong") }
    }

    public func toggleDone(_ task: AdminTask) async {
        busyId = task.id
        defer { busyId = nil }
        let next = task.status == "done" ? "open" : "done"
        do { _ = try await api.send(.adminSetTaskStatus(id: task.id, status: next)); await load() }
        catch { }
    }
}

public struct OperatorTasksView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorTasksStore

    public init(api: APIClient) { _store = State(initialValue: OperatorTasksStore(api: api)) }

    public var body: some View {
        Group {
            switch store.state {
            case .loading:
                List { ForEach(0..<6, id: \.self) { _ in OperatorRowSkeleton() } }
            case .failed(let m):
                ContentUnavailableView("Couldn't load tasks", systemImage: "wifi.slash", description: Text(m))
            case .loaded(let items) where items.isEmpty:
                ContentUnavailableView("Tasks", systemImage: "checklist", description: Text("No tasks assigned."))
            case .loaded(let items):
                List { ForEach(items) { row($0) } }
            }
        }
        .navigationTitle("Tasks")
        .navigationBarTitleDisplayMode(.inline)
        .task { if case .loading = store.state { await store.load() } }
        .refreshable { await store.load() }
    }

    private func row(_ task: AdminTask) -> some View {
        let done = task.status == "done"
        return HStack(spacing: theme.space.md) {
            if store.busyId == task.id {
                ProgressView().frame(width: 24)
            } else {
                Button { Task { await store.toggleDone(task) } } label: {
                    Image(systemName: done ? "checkmark.circle.fill" : "circle")
                        .font(.title3).foregroundStyle(done ? theme.color.success : theme.color.textSecondary)
                }
                .buttonStyle(.plain)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(task.title).font(.subheadline.weight(.semibold))
                    .strikethrough(done).foregroundStyle(done ? theme.color.textSecondary : theme.color.textPrimary)
                HStack(spacing: theme.space.xs) {
                    Text(task.assigneeName).font(.caption).foregroundStyle(theme.color.textSecondary)
                    if let due = task.dueDate { Text("· due \(due)").font(.caption).foregroundStyle(theme.color.textSecondary) }
                }
            }
            Spacer()
            priorityTag(task.priority)
        }
    }

    private func priorityTag(_ p: String) -> some View {
        let tint = p == "high" ? theme.color.danger : p == "low" ? theme.color.textSecondary : theme.color.warning
        return Text(p.capitalized).font(.caption2.weight(.bold))
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(tint.opacity(0.18), in: Capsule()).foregroundStyle(tint)
    }
}
