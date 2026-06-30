import SwiftUI
import OttavianoKit

/// The Ops Agent (/admin/ai/agent) — a chat with the operations copilot. Reuses
/// the server's `runAgentTurn` (tools, budget gate, persistence) via
/// `/api/v1/admin/agent`; non-streaming (one round per send, then reload). The
/// agent only sees data the signed-in operator may see (token scope + role).
@MainActor
@Observable
public final class OperatorAgentStore {
    public private(set) var messages: [AgentMessage] = []
    public private(set) var conversationId: String?
    public private(set) var loading = true
    public private(set) var sending = false
    public private(set) var error: String?
    private let api: APIClient
    public init(api: APIClient) { self.api = api }

    public func load() async {
        loading = true
        defer { loading = false }
        do {
            let thread = try await api.send(.adminAgentThread())
            conversationId = thread.conversationId
            messages = thread.messages
            error = nil
        } catch let e as APIError { error = OperatorListLoader<Int>.message(e) }
        catch { self.error = "Something went wrong" }
    }

    public func send(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !sending else { return }
        sending = true
        defer { sending = false }
        // Optimistic echo of the user's message; the reload reconciles to truth.
        let localId = "local-\(messages.count)"
        messages.append(AgentMessage(id: localId, role: "user", text: trimmed, createdAt: ""))
        do {
            let thread = try await api.send(.adminAgentTurn(message: trimmed, conversationId: conversationId))
            conversationId = thread.conversationId
            messages = thread.messages
            error = thread.error
        } catch let e as APIError {
            messages.removeAll { $0.id == localId }   // roll back the optimistic echo
            error = OperatorListLoader<Int>.message(e)
        } catch {
            messages.removeAll { $0.id == localId }
            self.error = "The agent could not respond"
        }
    }
}

public struct OperatorAgentView: View {
    @Environment(\.theme) private var theme
    @State private var store: OperatorAgentStore
    @State private var draft = ""

    public init(api: APIClient) { _store = State(initialValue: OperatorAgentStore(api: api)) }

    public var body: some View {
        VStack(spacing: 0) {
            if store.loading && store.messages.isEmpty {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.messages.isEmpty {
                ContentUnavailableView(
                    "Ask the Ops Agent",
                    systemImage: "bubble.left.and.text.bubble.right",
                    description: Text("Ask about sales, stock, staffing or today's service — it reads your live data.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: theme.space.sm) {
                            ForEach(store.messages) { bubble($0) }
                            if store.sending {
                                HStack { ProgressView(); Text("Thinking…").font(.caption).foregroundStyle(theme.color.textSecondary); Spacer() }
                                    .id("typing")
                            }
                        }
                        .padding(theme.space.lg)
                    }
                    .onChange(of: store.messages.count) { _, _ in
                        if let last = store.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                    }
                }
            }
            if let error = store.error {
                Text(error).font(.caption).foregroundStyle(theme.color.danger)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, theme.space.lg)
            }
            composer
        }
        .background(theme.color.surface)
        .navigationTitle("Ops Agent")
        .navigationBarTitleDisplayMode(.inline)
        .task { if store.loading { await store.load() } }
    }

    private func bubble(_ m: AgentMessage) -> some View {
        let mine = m.role == "user"
        return HStack {
            if mine { Spacer(minLength: 40) }
            Text(m.text)
                .font(.subheadline)
                .foregroundStyle(mine ? theme.color.onAccent : theme.color.textPrimary)
                .padding(.horizontal, theme.space.md).padding(.vertical, theme.space.sm)
                .background(mine ? theme.color.accent : theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius, style: .continuous).strokeBorder(theme.color.line, lineWidth: mine ? 0 : 1))
                .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
            if !mine { Spacer(minLength: 40) }
        }
        .id(m.id)
    }

    private var composer: some View {
        HStack(spacing: theme.space.sm) {
            TextField("Ask the agent…", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .padding(theme.space.sm)
                .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
            Button {
                let text = draft; draft = ""
                Task { await store.send(text) }
            } label: {
                Image(systemName: "arrow.up.circle.fill").font(.title2).foregroundStyle(theme.color.accent)
            }
            .disabled(store.sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(theme.space.md)
        .background(.bar)
    }
}
