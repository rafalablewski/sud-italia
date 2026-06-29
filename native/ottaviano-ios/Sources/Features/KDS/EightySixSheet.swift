import SwiftUI
import OttavianoKit

/// 86 (eighty-six) — quick item availability for the line, the native twin of the
/// web KDS `EightySix` dialog. Availability is per-location (menu item ids are
/// location-prefixed), and the native KDS board streams chain-wide, so the sheet
/// carries its own **location picker**: pick a truck, see its menu, tap to 86 /
/// restore. Reads `GET /api/v1/admin/menu?location=` and writes
/// `PATCH /api/v1/admin/menu` ({ itemId, available }) — manager+.
struct EightySixSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let api: APIClient

    @State private var locations: [Location] = []
    @State private var locationSlug: String = ""
    @State private var menu: [AdminMenuItem] = []
    @State private var loading = true
    @State private var busyId: String?
    @State private var error: String?

    private let cols = [GridItem(.adaptive(minimum: 150), spacing: 8)]

    private var off: [AdminMenuItem] { menu.filter { !$0.available } }
    private var on: [AdminMenuItem] { menu.filter { $0.available } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: theme.space.lg) {
                    if locations.count > 1 {
                        Picker("Location", selection: $locationSlug) {
                            ForEach(locations) { loc in Text(loc.name).tag(loc.slug) }
                        }
                        .pickerStyle(.segmented)
                    }

                    if let error {
                        DSEmptyState("Couldn’t update", systemImage: "exclamationmark.triangle", message: error)
                    }

                    if loading {
                        ProgressView().frame(maxWidth: .infinity).padding(theme.space.xl)
                    } else {
                        if !off.isEmpty {
                            DSSectionHeader("86’d · tap to restore") { DSBadge("\(off.count)", tone: .danger) }
                            LazyVGrid(columns: cols, spacing: theme.space.sm) {
                                ForEach(off) { item in chip(item, makeAvailable: true) }
                            }
                        }
                        DSSectionHeader("On the menu · tap to 86")
                        if on.isEmpty {
                            Text("Nothing available.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                        } else {
                            LazyVGrid(columns: cols, spacing: theme.space.sm) {
                                ForEach(on) { item in chip(item, makeAvailable: false) }
                            }
                        }
                    }
                }
                .padding(theme.space.lg)
            }
            .background(theme.color.surface)
            .navigationTitle("86 — availability")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .task { await loadLocations() }
            .onChange(of: locationSlug) { _, slug in
                Task { await loadMenu(slug) }
            }
        }
    }

    private func chip(_ item: AdminMenuItem, makeAvailable: Bool) -> some View {
        Button {
            Task { await toggle(item, makeAvailable: makeAvailable) }
        } label: {
            HStack(spacing: theme.space.xs) {
                Text(item.name).textRole(.caption).lineLimit(1)
                if makeAvailable { Image(systemName: "arrow.uturn.backward").font(.caption2) }
            }
            .padding(.horizontal, theme.space.md).frame(maxWidth: .infinity, minHeight: 40)
            .background(makeAvailable ? theme.dangerSoft : theme.color.surface2, in: Capsule())
            .foregroundStyle(makeAvailable ? theme.color.danger : theme.color.textPrimary)
            .overlay(Capsule().strokeBorder(theme.color.line, lineWidth: 1))
            .opacity(busyId == item.id ? 0.4 : 1)
        }
        .buttonStyle(.plain)
        .disabled(busyId != nil)
    }

    private func loadLocations() async {
        do {
            let locs = try await api.send(.locations())
            locations = locs
            if locationSlug.isEmpty, let first = locs.first?.slug {
                locationSlug = first // triggers onChange → loadMenu
            } else {
                await loadMenu(locationSlug)
            }
        } catch {
            self.error = "Couldn’t load locations"
            loading = false
        }
    }

    private func loadMenu(_ slug: String) async {
        // No location to load (e.g. the operator has none in scope) — clear the
        // spinner instead of hanging on it.
        guard !slug.isEmpty else { loading = false; return }
        loading = true
        defer { loading = false }
        do {
            menu = try await api.send(.adminMenu(location: slug))
            error = nil
        } catch let e as APIError {
            if case .api(_, let m, _) = e { error = m } else { error = "You appear to be offline" }
            menu = []
        } catch {
            self.error = "Couldn’t load the menu"
            menu = []
        }
    }

    private func toggle(_ item: AdminMenuItem, makeAvailable: Bool) async {
        busyId = item.id
        defer { busyId = nil }
        do {
            _ = try await api.send(.adminSet86(itemId: item.id, available: makeAvailable))
            await loadMenu(locationSlug) // reconcile to server truth
        } catch let e as APIError {
            if case .api(_, let m, _) = e { error = m } else { error = "You appear to be offline" }
        } catch {
            self.error = "Couldn’t update \(item.name)"
        }
    }
}
