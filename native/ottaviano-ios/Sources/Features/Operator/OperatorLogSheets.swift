import SwiftUI
import OttavianoKit

// Operator write actions for the read-only list surfaces (interaction-depth
// parity): a HACCP temperature reading and a waste entry. Each is a toolbar
// button → a Form sheet that POSTs to /api/v1/admin/* and reloads the list.
// Availability/logs are per-location and the admin lists are chain-wide, so the
// sheets carry their own location picker (like the KDS 86 sheet).

// MARK: - HACCP — log a temperature reading

struct LogTempButton: View {
    let api: APIClient
    let reload: () async -> Void
    @State private var show = false
    var body: some View {
        Button { show = true } label: { Label("Log reading", systemImage: "plus.circle.fill") }
            .sheet(isPresented: $show) { LogTempSheet(api: api) { await reload() } }
    }
}

private struct LogTempSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let api: APIClient
    let onLogged: () async -> Void

    @State private var locations: [Location] = []
    @State private var locationSlug = ""
    @State private var sensor = ""
    @State private var tempText = ""
    @State private var busy = false
    @State private var error: String?

    private var tempC: Double? { Double(tempText.replacingOccurrences(of: ",", with: ".")) }
    private var valid: Bool { !locationSlug.isEmpty && !sensor.trimmingCharacters(in: .whitespaces).isEmpty && tempC != nil }

    var body: some View {
        NavigationStack {
            Form {
                if locations.count > 1 {
                    Picker("Location", selection: $locationSlug) {
                        ForEach(locations) { Text($0.name).tag($0.slug) }
                    }
                }
                Section("Reading") {
                    TextField("Sensor (e.g. Walk-in fridge)", text: $sensor)
                    TextField("Temperature °C", text: $tempText).keyboardType(.numbersAndPunctuation)
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(theme.color.danger)
                }
                Section {
                    DSButton(busy ? "Saving…" : "Save reading") { Task { await submit() } }
                        .disabled(busy || !valid)
                }
            }
            .navigationTitle("Log temperature")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
            .task {
                if let locs = try? await api.send(.locations()) {
                    locations = locs
                    if locationSlug.isEmpty { locationSlug = locs.first?.slug ?? "" }
                }
            }
        }
    }

    private func submit() async {
        guard let c = tempC else { return }
        busy = true; defer { busy = false }
        do {
            // tempCelsius is tenths of a degree (server divides by 10).
            _ = try await api.send(.adminLogTemp(
                locationSlug: locationSlug,
                sensor: sensor.trimmingCharacters(in: .whitespaces),
                tempCelsius: Int((c * 10).rounded())))
            await onLogged()
            dismiss()
        } catch let e as APIError {
            error = OperatorListLoader<AdminTempLog>.message(e)
        } catch { self.error = "Something went wrong" }
    }
}

// MARK: - Cash — open a till session (manager)

struct OpenCashButton: View {
    let api: APIClient
    let reload: () async -> Void
    @State private var show = false
    var body: some View {
        Button { show = true } label: { Label("Open session", systemImage: "plus.circle.fill") }
            .sheet(isPresented: $show) { OpenCashSheet(api: api) { await reload() } }
    }
}

private struct OpenCashSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let api: APIClient
    let onOpened: () async -> Void

    @State private var locations: [Location] = []
    @State private var locationSlug = ""
    @State private var floatText = ""
    @State private var notes = ""
    @State private var busy = false
    @State private var error: String?

    private var float: Double? { Double(floatText.replacingOccurrences(of: ",", with: ".")) }
    private var valid: Bool { !locationSlug.isEmpty && (float ?? -1) >= 0 }

    var body: some View {
        NavigationStack {
            Form {
                if locations.count > 1 {
                    Picker("Location", selection: $locationSlug) {
                        ForEach(locations) { Text($0.name).tag($0.slug) }
                    }
                }
                Section("Opening float") {
                    TextField("Opening float in zł", text: $floatText).keyboardType(.decimalPad)
                    TextField("Notes (optional)", text: $notes)
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(theme.color.danger)
                }
                Section {
                    DSButton(busy ? "Opening…" : "Open session") { Task { await submit() } }
                        .disabled(busy || !valid)
                }
            }
            .navigationTitle("Open till")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
            .task {
                if let locs = try? await api.send(.locations()) {
                    locations = locs
                    if locationSlug.isEmpty { locationSlug = locs.first?.slug ?? "" }
                }
            }
        }
    }

    private func submit() async {
        guard let f = float else { return }
        busy = true; defer { busy = false }
        do {
            _ = try await api.send(.adminOpenCashSession(
                locationSlug: locationSlug,
                openingFloat: Int((f * 100).rounded()),
                notes: notes.trimmingCharacters(in: .whitespaces).isEmpty ? nil : notes.trimmingCharacters(in: .whitespaces)))
            await onOpened()
            dismiss()
        } catch let e as APIError {
            error = OperatorListLoader<AdminCashSession>.message(e)
        } catch { self.error = "Something went wrong" }
    }
}

// MARK: - Announcements — post a team broadcast (owner)

struct NewAnnouncementButton: View {
    let api: APIClient
    let reload: () async -> Void
    @State private var show = false
    var body: some View {
        Button { show = true } label: { Label("New", systemImage: "megaphone.fill") }
            .sheet(isPresented: $show) { NewAnnouncementSheet(api: api) { await reload() } }
    }
}

private struct NewAnnouncementSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let api: APIClient
    let onPosted: () async -> Void

    @State private var title = ""
    @State private var text = ""
    @State private var pinned = false
    @State private var busy = false
    @State private var error: String?

    private var valid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty && !text.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Announcement") {
                    TextField("Title", text: $title)
                    TextField("Message", text: $text, axis: .vertical).lineLimit(3...8)
                    Toggle("Pin to top", isOn: $pinned)
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(theme.color.danger)
                }
                Section {
                    DSButton(busy ? "Posting…" : "Post announcement") { Task { await submit() } }
                        .disabled(busy || !valid)
                }
            }
            .navigationTitle("New announcement")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
        }
    }

    private func submit() async {
        busy = true; defer { busy = false }
        do {
            _ = try await api.send(.adminPostAnnouncement(
                title: title.trimmingCharacters(in: .whitespaces),
                body: text.trimmingCharacters(in: .whitespaces),
                pinned: pinned))
            await onPosted()
            dismiss()
        } catch let e as APIError {
            error = OperatorListLoader<AdminAnnouncement>.message(e)
        } catch { self.error = "Something went wrong" }
    }
}

// MARK: - Waste — log a discarded item

struct LogWasteButton: View {
    let api: APIClient
    let reload: () async -> Void
    @State private var show = false
    var body: some View {
        Button { show = true } label: { Label("Log waste", systemImage: "plus.circle.fill") }
            .sheet(isPresented: $show) { LogWasteSheet(api: api) { await reload() } }
    }
}

private struct LogWasteSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let api: APIClient
    let onLogged: () async -> Void

    // The server's accepted reasons, with friendly labels.
    private static let reasons: [(id: String, label: String)] = [
        ("spoilage", "Spoilage"), ("prep_error", "Prep error"), ("dropped", "Dropped"),
        ("overproduction", "Overproduction"), ("customer_return", "Customer return"),
        ("expired", "Expired"), ("other", "Other"),
    ]

    @State private var locations: [Location] = []
    @State private var locationSlug = ""
    @State private var item = ""
    @State private var qtyText = ""
    @State private var unit = "kg"
    @State private var reason = "spoilage"
    @State private var costText = ""
    @State private var busy = false
    @State private var error: String?

    private var qty: Double? { Double(qtyText.replacingOccurrences(of: ",", with: ".")) }
    private var valid: Bool {
        !locationSlug.isEmpty && !item.trimmingCharacters(in: .whitespaces).isEmpty
            && !unit.trimmingCharacters(in: .whitespaces).isEmpty && (qty ?? 0) > 0
    }

    var body: some View {
        NavigationStack {
            Form {
                if locations.count > 1 {
                    Picker("Location", selection: $locationSlug) {
                        ForEach(locations) { Text($0.name).tag($0.slug) }
                    }
                }
                Section("Item") {
                    TextField("Item (e.g. Margherita base)", text: $item)
                    HStack {
                        TextField("Quantity", text: $qtyText).keyboardType(.decimalPad)
                        TextField("Unit", text: $unit).frame(width: 80)
                    }
                    Picker("Reason", selection: $reason) {
                        ForEach(Self.reasons, id: \.id) { Text($0.label).tag($0.id) }
                    }
                    TextField("Est. cost in zł (optional)", text: $costText).keyboardType(.decimalPad)
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(theme.color.danger)
                }
                Section {
                    DSButton(busy ? "Saving…" : "Log waste") { Task { await submit() } }
                        .disabled(busy || !valid)
                }
            }
            .navigationTitle("Log waste")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
            .task {
                if let locs = try? await api.send(.locations()) {
                    locations = locs
                    if locationSlug.isEmpty { locationSlug = locs.first?.slug ?? "" }
                }
            }
        }
    }

    private func submit() async {
        guard let q = qty else { return }
        busy = true; defer { busy = false }
        let cost = Double(costText.replacingOccurrences(of: ",", with: "."))
        do {
            _ = try await api.send(.adminLogWaste(
                locationSlug: locationSlug,
                item: item.trimmingCharacters(in: .whitespaces),
                quantity: q,
                unit: unit.trimmingCharacters(in: .whitespaces),
                reason: reason,
                estimatedCostGrosze: cost.map { Int(($0 * 100).rounded()) }))
            await onLogged()
            dismiss()
        } catch let e as APIError {
            error = OperatorListLoader<AdminWasteEntry>.message(e)
        } catch { self.error = "Something went wrong" }
    }
}
