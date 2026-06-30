import SwiftUI
import OttavianoKit

/// Guest — the native twin of web `/core/guest`, now at full five-tab parity:
/// **Inbox** (live WhatsApp conversations + operator reply), **Guests** (the CRM
/// with a full profile), **Loyalty** (the enrolment roster), **Concierge** (the
/// MCP capability layer an agent reaches) and **Book** (the slot+table booking
/// console). Tab order mirrors the web subbar (`guestTabs.ts`). All real data off
/// `/api/v1/admin/*` (Rule #1).
public struct OperatorGuestView: View {
    @Environment(\.theme) private var theme
    @State private var tab: GuestTab = .inbox
    private let api: APIClient
    public init(api: APIClient) { self.api = api }
    enum GuestTab: Hashable { case inbox, crm, loyalty, concierge, book }

    public var body: some View {
        VStack(spacing: 0) {
            DSSegmented($tab, options: [(value: .inbox, label: "Inbox"),
                                        (value: .crm, label: "Guests"),
                                        (value: .loyalty, label: "Loyalty"),
                                        (value: .concierge, label: "Concierge"),
                                        (value: .book, label: "Book")])
                .padding(.horizontal, theme.space.lg).padding(.vertical, theme.space.sm)
                .background(theme.color.surface)
            Divider().overlay(theme.color.line)
            switch tab {
            case .inbox: GuestInboxTab(api: api)
            case .crm: GuestCRMTab(api: api)
            case .loyalty: GuestLoyaltyTab(api: api)
            case .concierge: GuestConciergeTab(api: api)
            case .book: GuestBookTab(api: api)
            }
        }
        .background(theme.color.surface)
        .navigationTitle("Guest")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Inbox (live WhatsApp conversations)

/// Relative "time-ago" label for a WhatsApp timestamp (web `clock`/`fmtAgo`
/// analogue). Now-relative, so it lives in the view layer (not KDSClock).
private func waAgo(_ iso: String) -> String {
    guard let ms = KDSClock.parseMs(iso) else { return "" }
    let secs = max(0, Date().timeIntervalSince1970 - ms / 1000)
    if secs < 60 { return "now" }
    if secs < 3600 { return "\(Int(secs / 60))m" }
    if secs < 86400 { return "\(Int(secs / 3600))h" }
    return "\(Int(secs / 86400))d"
}

@MainActor
@Observable
final class GuestInboxStore {
    var inbox: WaInbox?
    var loading = true
    var error: String?
    private let api: APIClient
    init(api: APIClient) { self.api = api }

    var conversations: [WaConversation] { inbox?.conversations ?? [] }

    func load() async {
        loading = inbox == nil
        do { inbox = try await api.send(.adminWhatsAppInbox()); error = nil }
        catch let e as APIError { if inbox == nil { error = OperatorListLoader<Int>.message(e) } }
        catch { if inbox == nil { self.error = "Something went wrong" } }
        loading = false
    }
}

/// Guest → Inbox — the WhatsApp conversation list (live sessions overlaid on
/// historic transcripts), with a derived channel KPI strip. Tapping a row opens
/// the transcript thread + operator reply composer. Mirrors web `CoreInbox`.
struct GuestInboxTab: View {
    @Environment(\.theme) private var theme
    @State private var store: GuestInboxStore
    @State private var selected: WaConversation?
    private let api: APIClient
    init(api: APIClient) { self.api = api; _store = State(initialValue: GuestInboxStore(api: api)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let m = store.inbox?.metrics { kpis(m) }
                if store.loading && store.inbox == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
                } else if let error = store.error, store.inbox == nil {
                    ContentUnavailableView("Couldn't load the inbox", systemImage: "bubble.left.and.exclamationmark.bubble.right", description: Text(error))
                } else if store.conversations.isEmpty {
                    ContentUnavailableView("No conversations yet", systemImage: "bubble.left.and.bubble.right",
                                           description: Text("WhatsApp chats appear here as guests message the truck."))
                        .padding(.top, theme.space.xl)
                } else {
                    VStack(spacing: theme.space.sm) {
                        ForEach(store.conversations) { c in
                            Button { selected = c } label: { ConversationRow(c: c) }.buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .task { await store.load() }
        .refreshable { await store.load() }
        .sheet(item: $selected) { c in
            GuestThreadSheet(conversation: c, api: api, onSent: { Task { await store.load() } })
        }
    }

    private func kpis(_ m: WaMetricsLite) -> some View {
        HStack(spacing: theme.space.sm) {
            OperatorStatChip("Chats", "\(m.totalConversations)", tint: theme.color.accent)
            OperatorStatChip("Live", "\(m.activeSessions)", tint: theme.color.success)
            OperatorStatChip("To pay", "\(m.awaitingPayment)", tint: theme.color.warning)
            OperatorStatChip("Conv 7d", "\(Int((m.conversionRateLast7d * 100).rounded()))%", tint: theme.color.textPrimary)
        }
    }
}

private struct ConversationRow: View {
    @Environment(\.theme) private var theme
    let c: WaConversation

    var body: some View {
        HStack(spacing: theme.space.sm) {
            Avatar(name: c.customerName ?? c.phone)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: theme.space.xs) {
                    Text(c.customerName ?? c.phone).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary).lineLimit(1)
                    if c.hasActiveSession {
                        Text("LIVE").font(.caption2.weight(.bold)).foregroundStyle(theme.color.success)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(theme.color.success.opacity(0.16), in: Capsule())
                    }
                }
                Text(c.lastBody.isEmpty ? "—" : c.lastBody).textRole(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(1)
                if c.cartCount > 0 || c.pendingPaymentUrl != nil {
                    HStack(spacing: theme.space.xs) {
                        if c.cartCount > 0 {
                            Label("\(c.cartCount) in cart · \(MoneyText.format(c.cartSubtotalGrosze))", systemImage: "cart")
                                .font(.caption2).foregroundStyle(theme.color.textSecondary)
                        }
                        if c.pendingPaymentUrl != nil {
                            Label("awaiting pay", systemImage: "creditcard").font(.caption2).foregroundStyle(theme.color.warning)
                        }
                    }
                }
            }
            Spacer(minLength: theme.space.sm)
            Text(waAgo(c.lastAt)).font(.caption2).monospacedDigit().foregroundStyle(theme.color.textSecondary)
        }
        .padding(theme.space.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
        // One spoken element per conversation; the row's Button already adds the
        // .isButton trait + the "opens transcript" affordance.
        .accessibilityElement(children: .combine)
        .accessibilityLabel(voiceLabel)
        .accessibilityHint("Opens the conversation")
    }

    private var voiceLabel: String {
        var parts = [c.customerName ?? c.phone]
        if c.hasActiveSession { parts.append("live") }
        if c.cartCount > 0 { parts.append("\(c.cartCount) in cart") }
        if c.pendingPaymentUrl != nil { parts.append("awaiting payment") }
        parts.append(c.lastBody.isEmpty ? "no messages" : c.lastBody)
        parts.append(waAgo(c.lastAt))
        return parts.joined(separator: ", ")
    }
}

@MainActor
@Observable
final class GuestThreadStore {
    var messages: [WaThreadMessage] = []
    var loading = true
    var sending = false
    var toast: String?
    let phone: String
    private let api: APIClient
    init(phone: String, api: APIClient) { self.phone = phone; self.api = api }

    func load() async {
        do { messages = try await api.send(.adminWhatsAppThread(phone: phone)).messages }
        catch { /* keep prior on refresh */ }
        loading = false
    }
    func send(_ text: String) async {
        sending = true
        defer { sending = false }
        do {
            _ = try await api.send(.adminWhatsAppSend(phone: phone, body: text))
            await load()
            toast = "Sent"
        } catch let e as APIError {
            // Outside Meta's 24h window or provider unconfigured → the facade
            // 503s; surface the real reason rather than faking a delivery.
            toast = OperatorListLoader<Int>.message(e)
        } catch { toast = "Couldn't send" }
    }
}

/// The transcript thread + operator reply composer for one guest.
struct GuestThreadSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var store: GuestThreadStore
    @State private var draft = ""
    private let conversation: WaConversation
    private let onSent: () -> Void

    init(conversation: WaConversation, api: APIClient, onSent: @escaping () -> Void) {
        self.conversation = conversation
        self.onSent = onSent
        _store = State(initialValue: GuestThreadStore(phone: conversation.phone, api: api))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: theme.space.sm) {
                        if store.loading && store.messages.isEmpty {
                            ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
                        } else if store.messages.isEmpty {
                            Text("No messages in this thread.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                                .frame(maxWidth: .infinity).padding(.top, theme.space.xl)
                        } else {
                            ForEach(store.messages) { m in MessageBubble(m: m) }
                        }
                    }
                    .padding(theme.space.lg)
                }
                Divider().overlay(theme.color.line)
                composer
            }
            .background(theme.color.surface)
            .navigationTitle(conversation.customerName ?? conversation.phone)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            .task { await store.load() }
            .presentationDetents([.large])
            .dsToast(Binding(get: { store.toast }, set: { store.toast = $0 }))
            .onChange(of: store.toast) { _, v in if v == "Sent" { onSent() } }
        }
    }

    private var composer: some View {
        HStack(spacing: theme.space.sm) {
            TextField("Reply…", text: $draft, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(1...4)
            Button {
                let t = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !t.isEmpty else { return }
                draft = ""
                Task { await store.send(t) }
            } label: {
                Image(systemName: "paperplane.fill").font(.body.weight(.semibold))
            }
            .buttonStyle(.borderedProminent)
            .disabled(store.sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(theme.space.md)
        .background(theme.color.surface)
    }
}

private struct MessageBubble: View {
    @Environment(\.theme) private var theme
    let m: WaThreadMessage

    private var tint: Color {
        switch m.actor {
        case "operator": return theme.color.accent
        case "bot": return theme.color.success
        case "system": return theme.color.textSecondary
        default: return theme.color.surface2
        }
    }

    var body: some View {
        HStack {
            if !m.inbound { Spacer(minLength: 40) }
            VStack(alignment: m.inbound ? .leading : .trailing, spacing: 2) {
                Text(m.body).textRole(.callout)
                    .foregroundStyle(m.inbound ? theme.color.textPrimary : theme.color.onAccent)
                    .padding(.horizontal, theme.space.md).padding(.vertical, theme.space.sm)
                    .background(m.inbound ? theme.color.surface2 : tint,
                                in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
                Text("\(m.actor) · \(waAgo(m.at))").font(.caption2).foregroundStyle(theme.color.textSecondary)
            }
            if m.inbound { Spacer(minLength: 40) }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(m.inbound ? "Guest" : m.actor.capitalized), \(waAgo(m.at))")
        .accessibilityValue(m.body)
    }
}

// MARK: - Concierge (MCP capability layer)

@MainActor
@Observable
final class GuestConciergeStore {
    var info: ConciergeInfo?
    /// Live exposure, keyed by capability id. Kept beside `info` (whose structs are
    /// immutable) so a toggle can update optimistically and revert on failure.
    var exposure: [String: Bool] = [:]
    var busy: Set<String> = []
    var loading = true
    var error: String?
    var toast: String?
    private let api: APIClient
    init(api: APIClient) { self.api = api }

    var liveCount: Int { exposure.values.filter { $0 }.count }
    var total: Int { info?.totalCount ?? exposure.count }

    private func syncExposure(_ info: ConciergeInfo) {
        exposure = Dictionary(uniqueKeysWithValues: info.capabilities.map { ($0.id, $0.exposed) })
    }

    func load() async {
        loading = info == nil
        do {
            let fresh = try await api.send(.adminConcierge())
            info = fresh; syncExposure(fresh); error = nil
        }
        catch let e as APIError { if info == nil { error = OperatorListLoader<Int>.message(e) } }
        catch { if info == nil { self.error = "Something went wrong" } }
        loading = false
    }

    /// Flip one capability's exposure (toggle = saved). Optimistic, reverts on
    /// failure; reconciles from the server's authoritative response on success.
    func toggle(_ id: String) async {
        guard !busy.contains(id) else { return }
        let next = !(exposure[id] ?? true)
        exposure[id] = next            // optimistic
        busy.insert(id)
        defer { busy.remove(id) }
        do {
            let updated = try await api.send(.adminSetConciergeExposure(capability: id, exposed: next))
            info = updated; syncExposure(updated)
        } catch let e as APIError {
            exposure[id] = !next        // revert
            toast = OperatorListLoader<Int>.message(e)
        } catch {
            exposure[id] = !next
            toast = "Couldn't update exposure"
        }
    }
}

/// Guest → Concierge — the MCP capability layer an external agent (or the
/// WhatsApp bot) reaches. Each capability can be **exposed or hidden** to agents
/// right here (toggle = saved): the switch PATCHes `/api/v1/admin/concierge` and
/// the public `/api/agent/:capability` endpoint reads the same store, so the
/// change is live at once — full parity with web `CoreConcierge` (manager+).
struct GuestConciergeTab: View {
    @Environment(\.theme) private var theme
    @State private var store: GuestConciergeStore
    private let api: APIClient
    init(api: APIClient) { self.api = api; _store = State(initialValue: GuestConciergeStore(api: api)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if store.loading && store.info == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
                } else if let error = store.error, store.info == nil {
                    ContentUnavailableView("Couldn't load concierge", systemImage: "sparkles", description: Text(error))
                } else if let info = store.info {
                    kpis(info)
                    transportsCard(info)
                    capabilitiesCard(info)
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .task { await store.load() }
        .refreshable { await store.load() }
        .dsToast(Binding(get: { store.toast }, set: { store.toast = $0 }))
    }

    private func kpis(_ info: ConciergeInfo) -> some View {
        HStack(spacing: theme.space.sm) {
            OperatorStatChip("Live", "\(store.liveCount)/\(store.total)", tint: theme.color.accent)
            OperatorStatChip("WhatsApp", info.whatsAppConfigured ? "On" : "Off",
                             tint: info.whatsAppConfigured ? theme.color.success : theme.color.textSecondary)
        }
    }

    private func transportsCard(_ info: ConciergeInfo) -> some View {
        card("Transports") {
            VStack(alignment: .leading, spacing: theme.space.sm) {
                transportRow("MCP · HTTP read API", info.endpoints.httpReadApi, live: true)
                transportRow("WhatsApp webhook", info.endpoints.whatsAppWebhook, live: info.whatsAppConfigured)
            }
        }
    }

    private func transportRow(_ title: String, _ path: String, live: Bool) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                Text(path).font(.caption.monospaced()).foregroundStyle(theme.color.textSecondary)
            }
            Spacer()
            Text(live ? "Live" : "Off").font(.caption2.weight(.bold))
                .foregroundStyle(live ? theme.color.success : theme.color.textSecondary)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background((live ? theme.color.success : theme.color.textSecondary).opacity(0.16), in: Capsule())
        }
    }

    private func capabilitiesCard(_ info: ConciergeInfo) -> some View {
        card("MCP capabilities") {
            VStack(spacing: theme.space.md) {
                Text("Exposed capabilities are reachable by AI agents and the WhatsApp bot. Hide one to take it offline instantly.")
                    .textRole(.caption).foregroundStyle(theme.color.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                ForEach(info.capabilities) { cap in
                    capabilityRow(cap)
                    if cap.id != info.capabilities.last?.id { Divider().overlay(theme.color.line) }
                }
            }
        }
    }

    private func capabilityRow(_ cap: ConciergeCapability) -> some View {
        let isOn = store.exposure[cap.id] ?? cap.exposed
        return HStack(alignment: .center, spacing: theme.space.sm) {
            Text(cap.kind).font(.caption2.weight(.bold)).textCase(.uppercase)
                .foregroundStyle(cap.kind == "tool" ? theme.color.accent : theme.color.warning)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background((cap.kind == "tool" ? theme.color.accent : theme.color.warning).opacity(0.14), in: Capsule())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(cap.label).font(.subheadline.weight(.semibold).monospaced()).foregroundStyle(theme.color.textPrimary)
                Text(cap.desc).textRole(.caption).foregroundStyle(theme.color.textSecondary)
                Text("\(cap.kind) · \(cap.transport)").font(.caption2).foregroundStyle(theme.color.textSecondary)
            }
            Spacer(minLength: theme.space.sm)
            if store.busy.contains(cap.id) {
                ProgressView().controlSize(.small).frame(width: 51) // hold the switch's slot so the row doesn't jump
            } else {
                Toggle("", isOn: Binding(
                    get: { isOn },
                    set: { _ in Task { await store.toggle(cap.id) } }))
                    .labelsHidden()
                    .tint(theme.color.success)
            }
        }
        .padding(.vertical, 2)
        // The whole row is one VoiceOver switch: hearing the capability + its
        // description, toggled on/off, is enough — no stray decorative nodes.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(cap.label). \(cap.desc)")
        .accessibilityValue(isOn ? "Exposed to agents" : "Hidden")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Double tap to \(isOn ? "hide" : "expose")")
        .accessibilityAction { Task { await store.toggle(cap.id) } }
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            Text(title.uppercased()).textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
            content()
        }
        .padding(theme.space.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
    }
}

// MARK: - Guests (CRM)

/// CRM roster (reuses the OperatorListView substrate + Customer filters) whose
/// detail opens the rich profile with notes / points / consent writes.
struct GuestCRMTab: View {
    @Environment(\.theme) private var theme
    private let api: APIClient
    init(api: APIClient) { self.api = api }

    var body: some View {
        OperatorListView(
            title: "Guests",
            emptyText: "Guests appear here as orders come in.",
            loader: OperatorListLoader { try await api.send(.adminCustomers()) },
            header: { (items: [AdminCustomer]) in
                AnyView(HStack(spacing: theme.space.sm) {
                    OperatorStatChip("Guests", "\(items.count)", tint: theme.color.accent)
                    OperatorStatChip("VIPs", "\(items.filter { $0.totalSpentGrosze >= 50000 }.count)", tint: theme.color.warning)
                })
            },
            search: { [$0.name ?? "", $0.phone].joined(separator: " ") },
            detail: { c, reload in AnyView(CrmDetailSheet(phone: c.phone, fallbackName: c.name ?? c.phone, api: api, onChange: reload)) },
            filters: [
                OperatorFilter("VIP", systemImage: "star.fill") { $0.totalSpentGrosze >= 50000 },
                OperatorFilter("Members", systemImage: "gift.fill") { ($0.loyaltyPointsBalance + $0.manualPointsAdjust) > 0 },
                OperatorFilter("Lapsed", systemImage: "moon.zzz.fill") { ($0.lastOrderAt ?? "") < AnalyticsDates.window(for: .quarter).from },
            ],
            sorts: [
                OperatorSortOption("Top spend") { $0.totalSpentGrosze > $1.totalSpentGrosze },
                OperatorSortOption("Most orders") { $0.orderCount > $1.orderCount },
                OperatorSortOption("Name") { ($0.name ?? $0.phone).localizedCaseInsensitiveCompare($1.name ?? $1.phone) == .orderedAscending },
            ],
            row: { c in
                HStack(spacing: theme.space.sm) {
                    Avatar(name: c.name ?? c.phone)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.name ?? c.phone).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(c.orderCount) orders · \(c.phone)").font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer(minLength: theme.space.sm)
                    MoneyText(c.totalSpentGrosze).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                }
            }
        )
    }
}

@MainActor
@Observable
final class CrmDetailStore {
    var detail: CrmCustomerDetail?
    var loading = true
    var error: String?
    var busy = false
    let phone: String
    private let api: APIClient
    init(phone: String, api: APIClient) { self.phone = phone; self.api = api }

    func load() async {
        loading = detail == nil
        do { detail = try await api.send(.adminCustomerDetail(phone: phone)); error = nil }
        catch let e as APIError { if detail == nil { error = OperatorListLoader<Int>.message(e) } }
        catch { if detail == nil { self.error = "Something went wrong" } }
        loading = false
    }
    func addNote(_ text: String) async { busy = true; _ = try? await api.send(.adminAddCustomerNote(phone: phone, text: text)); await load(); busy = false }
    func deleteNote(_ id: String) async { _ = try? await api.send(.adminDeleteCustomerNote(phone: phone, id: id)); await load() }
    func adjustPoints(_ delta: Int, reason: String?) async { busy = true; _ = try? await api.send(.adminAdjustPoints(phone: phone, delta: delta, reason: reason)); await load(); busy = false }
    func setConsent(sms: Bool? = nil, email: Bool? = nil) async { _ = try? await api.send(.adminSetConsent(phone: phone, smsOptIn: sms, emailOptIn: email)); await load() }
}

/// The rich guest profile — lifetime + cadence, recent orders, points adjust,
/// consent toggles, and notes (add/delete). Writes go through the new
/// `/api/v1/admin/customers/:phone/*` facade.
struct CrmDetailSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var store: CrmDetailStore
    @State private var noteText = ""
    @State private var showPoints = false
    @State private var pointsText = ""
    private let fallbackName: String
    private let onChange: () async -> Void

    init(phone: String, fallbackName: String, api: APIClient, onChange: @escaping () async -> Void) {
        _store = State(initialValue: CrmDetailStore(phone: phone, api: api))
        self.fallbackName = fallbackName
        self.onChange = onChange
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: theme.space.lg) {
                    if let error = store.error, store.detail == nil {
                        ContentUnavailableView("Couldn't load guest", systemImage: "person.crop.circle.badge.exclamationmark", description: Text(error))
                    } else if let d = store.detail {
                        totals(d)
                        pointsCard(d)
                        consentCard(d)
                        notesCard(d)
                        ordersCard(d)
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, theme.space.xxl)
                    }
                }
                .padding(theme.space.lg)
            }
            .background(theme.color.surface)
            .navigationTitle(store.detail?.name ?? fallbackName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            .task { await store.load() }
            .presentationDetents([.large])
            .alert("Adjust points", isPresented: $showPoints) {
                TextField("Delta (e.g. 100 or -50)", text: $pointsText).keyboardType(.numbersAndPunctuation)
                Button("Apply") {
                    if let delta = Int(pointsText.trimmingCharacters(in: .whitespaces)), delta != 0 {
                        Task { await store.adjustPoints(delta, reason: "Operator adjustment"); await onChange() }
                    }
                    pointsText = ""
                }
                Button("Cancel", role: .cancel) { pointsText = "" }
            } message: { Text("Add or remove loyalty points for this guest.") }
        }
    }

    private func totals(_ d: CrmCustomerDetail) -> some View {
        OperatorStatBand([
            OperatorStatTile("Lifetime", MoneyText.format(d.totals.totalSpent)),
            OperatorStatTile("Orders", "\(d.totals.orderCount)"),
            OperatorStatTile("Avg ticket", MoneyText.format(d.totals.avgOrderValue)),
            OperatorStatTile("Points", "\(d.totals.spendablePoints)", sub: "redeemable", subTone: theme.color.accent),
        ])
    }

    private func pointsCard(_ d: CrmCustomerDetail) -> some View {
        card("Loyalty points") {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(d.totals.spendablePoints) pts").font(.title3.weight(.bold)).monospacedDigit().foregroundStyle(theme.color.textPrimary)
                    Text("earned \(d.totals.earnedPoints) · manual \(d.totals.manualPoints) · redeemed \(d.totals.redeemedPoints)")
                        .textRole(.caption).foregroundStyle(theme.color.textSecondary)
                }
                Spacer()
                Button { pointsText = ""; showPoints = true } label: {
                    Label("Adjust", systemImage: "plus.forwardslash.minus")
                }.buttonStyle(.bordered).controlSize(.small).disabled(store.busy)
            }
        }
    }

    private func consentCard(_ d: CrmCustomerDetail) -> some View {
        // Consent reflects the live rollup (smsOptIn/emailOptIn from the detail);
        // toggling persists via /consent and reloads so the state stays true.
        card("Marketing consent") {
            VStack(spacing: theme.space.sm) {
                Toggle("SMS", isOn: Binding(
                    get: { store.detail?.smsOptIn ?? true },
                    set: { v in Task { await store.setConsent(sms: v); await onChange() } }))
                Toggle("Email", isOn: Binding(
                    get: { store.detail?.emailOptIn ?? true },
                    set: { v in Task { await store.setConsent(email: v); await onChange() } }))
            }
            .tint(theme.color.accent)
        }
    }

    private func notesCard(_ d: CrmCustomerDetail) -> some View {
        card("Notes") {
            VStack(alignment: .leading, spacing: theme.space.sm) {
                HStack {
                    TextField("Add a note", text: $noteText, axis: .vertical).textFieldStyle(.roundedBorder)
                    Button("Add") {
                        let t = noteText.trimmingCharacters(in: .whitespaces)
                        if !t.isEmpty { Task { await store.addNote(t); noteText = "" } }
                    }.buttonStyle(.borderedProminent).disabled(noteText.trimmingCharacters(in: .whitespaces).isEmpty || store.busy)
                }
                if d.notes.isEmpty {
                    Text("No notes yet.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                }
                ForEach(d.notes) { n in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(n.body).textRole(.callout).foregroundStyle(theme.color.textPrimary)
                            Text("\(n.authoredBy ?? "—") · \(n.createdAt.prefix(10))").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                        }
                        Spacer()
                        Button(role: .destructive) { Task { await store.deleteNote(n.id) } } label: { Image(systemName: "trash").font(.caption) }
                            .buttonStyle(.plain).foregroundStyle(theme.color.danger)
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private func ordersCard(_ d: CrmCustomerDetail) -> some View {
        card("Recent orders") {
            if d.orders.isEmpty {
                Text("No orders in your locations.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                VStack(spacing: theme.space.sm) {
                    ForEach(d.orders.prefix(10)) { o in
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("\(o.createdAt.prefix(10)) · \(o.locationSlug.capitalized)").font(.subheadline).foregroundStyle(theme.color.textPrimary)
                                Text("\(o.itemCount) items · \(o.fulfillmentType)").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                            }
                            Spacer()
                            MoneyText(o.totalAmount).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        }
                    }
                }
            }
        }
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            Text(title.uppercased()).textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
            content()
        }
        .padding(theme.space.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
    }
}

// MARK: - Book (slot + table booking console)

@MainActor
@Observable
final class GuestBookStore {
    var location = "krakow"
    var locations: [Location] = []
    var slots: [AdminSlot] = []
    var tables: [FloorTable] = []
    var reservations: [Reservation] = []
    var loaded = false
    var message: String?
    private let api: APIClient
    init(api: APIClient) { self.api = api }

    /// Dine-in, active slots only — the bookable windows.
    var bookable: [AdminSlot] {
        slots.filter { $0.status == "active" && $0.fulfillmentTypes.contains { $0.contains("dine") } }
            .sorted { ($0.date, $0.time) < ($1.date, $1.time) }
    }
    func loadLocations() async { if locations.isEmpty { locations = (try? await api.send(.locations())) ?? [] } }
    func load() async {
        async let s = api.send(.adminSlots(location: location))
        async let t = api.send(.adminFloorTables(location: location))
        async let r = api.send(.adminReservations(location: location, date: nil))
        slots = (try? await s) ?? []
        tables = (try? await t) ?? []
        reservations = ((try? await r) ?? []).filter { $0.status == "booked" || $0.status == "seated" }
        loaded = true
    }
    func setLocation(_ slug: String) async { location = slug; loaded = false; await load() }
    func book(_ b: BookingBody) async {
        do { _ = try await api.send(.adminCreateBooking(b)); message = "Booked"; await load() }
        catch let e as APIError { message = OperatorListLoader<Int>.message(e) }
        catch { self.message = "Couldn't book" }
    }
    func cancel(_ id: String) async { _ = try? await api.send(.adminCancelReservation(id: id, location: location)); await load() }
}

struct GuestBookTab: View {
    @Environment(\.theme) private var theme
    @State private var store: GuestBookStore
    @State private var slotId = ""
    @State private var tableId = ""
    @State private var party = 2
    @State private var name = ""
    @State private var phone = ""
    @State private var forceOverride = false
    private let api: APIClient
    init(api: APIClient) { self.api = api; _store = State(initialValue: GuestBookStore(api: api)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if store.locations.count > 1 {
                    DSSegmented(Binding(get: { store.location }, set: { s in Task<Void, Never> { await store.setLocation(s) } }),
                                options: store.locations.map { (value: $0.slug, label: $0.city) })
                }
                bookingForm
                reservationsCard
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .task { await store.loadLocations(); if !store.loaded { await store.load() } }
        .refreshable { await store.load() }
        .dsToast(Binding(get: { store.message }, set: { store.message = $0 }))
    }

    private var fittingTables: [FloorTable] {
        store.tables.filter { $0.seats >= party && $0.status != "out-of-service" }
            .sorted { $0.seats < $1.seats }
    }

    private var bookingForm: some View {
        card("New booking") {
            VStack(alignment: .leading, spacing: theme.space.md) {
                if store.bookable.isEmpty {
                    Text("No dine-in slots open — add slots under Service.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                }
                Picker("Slot", selection: $slotId) {
                    Text("Pick a slot").tag("")
                    ForEach(store.bookable) { s in Text("\(s.date.suffix(5)) \(s.time) · \(s.currentOrders)/\(s.maxOrders)").tag(s.id) }
                }
                Stepper("Party: \(party)", value: $party, in: 1...50)
                Picker("Table", selection: $tableId) {
                    Text("Best fit").tag("")
                    ForEach(fittingTables) { t in Text("Table \(t.number) · \(t.seats) seats\(t.zone.map { " · \($0)" } ?? "")").tag(t.id) }
                }
                TextField("Guest name", text: $name).textFieldStyle(.roundedBorder).textContentType(.name)
                TextField("Phone (optional)", text: $phone).textFieldStyle(.roundedBorder).keyboardType(.phonePad)
                Toggle("Override conflicts", isOn: $forceOverride).tint(theme.color.accent)
                DSButton("Book table") {
                    let chosenTable = tableId.isEmpty ? fittingTables.first?.id : tableId
                    guard !slotId.isEmpty, let table = chosenTable else { store.message = "Pick a slot and a table"; return }
                    Task {
                        await store.book(BookingBody(
                            locationSlug: store.location, slotId: slotId, tableId: table,
                            customerName: name, customerPhone: phone.isEmpty ? nil : phone,
                            partySize: party, forceOverride: forceOverride))
                        if store.message == "Booked" { name = ""; phone = ""; slotId = ""; tableId = "" }
                    }
                }
                .disabled(slotId.isEmpty || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private var reservationsCard: some View {
        card("Upcoming bookings") {
            if store.reservations.isEmpty {
                Text("No bookings yet.").textRole(.caption).foregroundStyle(theme.color.textSecondary)
            } else {
                VStack(spacing: theme.space.sm) {
                    ForEach(store.reservations.sorted { ($0.date, $0.time) < ($1.date, $1.time) }) { r in
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("\(r.customerName) · \(r.partySize)p").font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                                Text("\(r.date.suffix(5)) \(r.time)\(r.tableId != nil ? " · seated" : "")").textRole(.caption).foregroundStyle(theme.color.textSecondary)
                            }
                            Spacer()
                            Button(role: .destructive) { Task { await store.cancel(r.id) } } label: { Image(systemName: "xmark.circle") }
                                .buttonStyle(.plain).foregroundStyle(theme.color.danger)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            Text(title.uppercased()).textRole(.caption).fontWeight(.bold).foregroundStyle(theme.color.textSecondary)
            content()
        }
        .padding(theme.space.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
    }
}
