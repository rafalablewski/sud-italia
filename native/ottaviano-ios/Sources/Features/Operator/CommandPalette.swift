import SwiftUI
import OttavianoKit

/// ⌘K command palette — the native twin of the web Core `CommandPalette`. A
/// keyboard-summoned overlay that jumps to any surface the signed-in role can
/// reach, from anywhere in the app (the sidebar search only works when the rail is
/// focused). Auto-focuses its field so the operator just types. Fed by the SAME
/// role-filtered IA as the rail (`filteredNav`), so it can never offer a surface
/// the role can't open — no fabricated destinations (Rule #1).
public struct CommandPalette: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    /// Role-filtered sections (the rail's `visibleSections` source).
    let sections: [OperatorNavSection]
    /// Jump handler — sets the split-view selection in the shell.
    let onPick: (OperatorNavItem) -> Void

    public init(sections: [OperatorNavSection], onPick: @escaping (OperatorNavItem) -> Void) {
        self.sections = sections; self.onPick = onPick
    }

    @State private var query = ""
    @FocusState private var focused: Bool

    private var results: [OperatorNavItem] {
        let all = sections.flatMap(\.items)
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return all }
        return all.filter {
            $0.label.localizedCaseInsensitiveContains(q)
            || $0.blurb.localizedCaseInsensitiveContains(q)
            || $0.id.localizedCaseInsensitiveContains(q)
        }
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchField
                Divider().overlay(theme.color.line)
                if results.isEmpty {
                    ContentUnavailableView.search(text: query)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(results) { item in
                        Button { onPick(item); dismiss() } label: { row(item) }
                            .listRowBackground(theme.color.surface2)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background {
                if theme.glassy { AuroraBackground() } else { theme.color.surface }
            }
            .navigationTitle("Jump to…")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
        }
        .onAppear { focused = true }
    }

    private var searchField: some View {
        HStack(spacing: theme.space.sm) {
            Image(systemName: "magnifyingglass").foregroundStyle(theme.color.textSecondary)
            TextField("Search \(sections.reduce(0) { $0 + $1.items.count }) surfaces", text: $query)
                .textFieldStyle(.plain)
                .foregroundStyle(theme.color.textPrimary)
                .focused($focused)
                .submitLabel(.go)
                .onSubmit { if let first = results.first { onPick(first); dismiss() } }
            if !query.isEmpty {
                Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(theme.color.textSecondary) }
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, theme.space.md).frame(height: 44)
        .background(theme.color.surface2, in: Capsule())
        .overlay(Capsule().strokeBorder(theme.color.line, lineWidth: 1))
        .padding(theme.space.md)
    }

    private func row(_ item: OperatorNavItem) -> some View {
        HStack(spacing: theme.space.md) {
            Image(systemName: item.icon).frame(width: 26).foregroundStyle(theme.color.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.label).foregroundStyle(theme.color.textPrimary)
                if !item.blurb.isEmpty {
                    Text(item.blurb).font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(1)
                }
            }
            Spacer()
            if item.kind == .scaffold {
                Text("soon").font(.caption2.weight(.semibold)).foregroundStyle(theme.color.textSecondary)
            }
            Image(systemName: "arrow.turn.down.left").font(.caption2).foregroundStyle(theme.color.textSecondary)
        }
    }
}
