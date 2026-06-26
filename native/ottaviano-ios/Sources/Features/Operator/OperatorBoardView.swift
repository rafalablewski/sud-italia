import SwiftUI
import OttavianoKit

/// The operations board — a live, sectioned overview of every order off
/// `GET /api/v1/orders` (operator-scoped). Read-and-refresh; the bump-through
/// happens on the Kitchen lanes (`KDSBoardView`). Dark operator skin.
public struct OperatorBoardView: View {
    @Environment(\.dependencies) private var deps
    @Environment(\.theme) private var theme
    @State private var orders: [Order] = []
    @State private var loaded = false
    @State private var error: String?

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(spacing: theme.space.lg) {
                summary
                if let error, orders.isEmpty {
                    ContentUnavailableView("Couldn't load the board", systemImage: "exclamationmark.triangle", description: Text(error))
                        .padding(.top, theme.space.xxl)
                } else if loaded && orders.isEmpty {
                    ContentUnavailableView("No orders yet", systemImage: "tray", description: Text("New orders land here the moment they're placed."))
                        .padding(.top, theme.space.xxl)
                } else {
                    section("Incoming", orders.filter { [.pending, .confirmed].contains($0.status) }, accent: theme.color.accent)
                    section("Cooking", orders.filter { $0.status == .preparing }, accent: theme.color.warning)
                    section("Ready", orders.filter { $0.status == .ready }, accent: theme.color.success)
                    section("Done", orders.filter { [.completed, .delivered, .pickedUp].contains($0.status) }, accent: theme.color.textSecondary)
                }
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Orders")
        .task { await load() }
        .refreshable { await load() }
    }

    private var summary: some View {
        HStack(spacing: theme.space.md) {
            stat("New", orders.filter { [.pending, .confirmed].contains($0.status) }.count, theme.color.accent)
            stat("Cooking", orders.filter { $0.status == .preparing }.count, theme.color.warning)
            stat("Ready", orders.filter { $0.status == .ready }.count, theme.color.success)
        }
    }

    private func stat(_ label: String, _ count: Int, _ accent: Color) -> some View {
        VStack(spacing: 2) {
            Text("\(count)").font(.system(size: 30, weight: .bold)).monospacedDigit().foregroundStyle(accent)
            Text(label).font(.caption).foregroundStyle(theme.color.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }

    @ViewBuilder
    private func section(_ title: String, _ list: [Order], accent: Color) -> some View {
        if !list.isEmpty {
            VStack(alignment: .leading, spacing: theme.space.sm) {
                HStack {
                    Text(title).font(.headline).foregroundStyle(theme.color.textPrimary)
                    Text("\(list.count)").font(.caption.weight(.bold)).foregroundStyle(accent)
                }
                ForEach(list) { OperatorOrderRow(order: $0, accent: accent) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func load() async {
        do {
            orders = try await deps.api.send(.operatorBoard(location: nil))
            error = nil
        } catch let e as APIError {
            if case .api(_, let m, _) = e { error = m } else { error = "You appear to be offline" }
        } catch { self.error = "Something went wrong" }
        loaded = true
    }
}

struct OperatorOrderRow: View {
    @Environment(\.theme) private var theme
    let order: Order
    let accent: Color

    var body: some View {
        HStack(alignment: .top, spacing: theme.space.md) {
            RoundedRectangle(cornerRadius: 2).fill(accent).frame(width: 4)
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(order.id).font(.subheadline.weight(.bold)).foregroundStyle(theme.color.textPrimary)
                    Text(order.fulfillmentType.capitalized).font(.caption).foregroundStyle(theme.color.textSecondary)
                }
                Text(order.customerName).font(.caption).foregroundStyle(theme.color.textSecondary)
                Text(order.items.map { "\($0.quantity)× \($0.name)" }.joined(separator: ", "))
                    .font(.caption).foregroundStyle(theme.color.textSecondary).lineLimit(2)
            }
            Spacer(minLength: theme.space.sm)
            VStack(alignment: .trailing, spacing: 4) {
                MoneyText(order.totalAmount).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                Text(order.status.rawValue.capitalized)
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, theme.space.sm).padding(.vertical, 3)
                    .background(accent.opacity(0.18), in: Capsule())
                    .foregroundStyle(accent)
                if !order.slotTime.isEmpty {
                    Text(order.slotTime).font(.caption2).foregroundStyle(theme.color.textSecondary)
                }
            }
        }
        .padding(theme.space.md)
        .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
        .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
    }
}

/// Account / session surface for the operator app — identity + sign out.
public struct OperatorAccountView: View {
    @Environment(\.theme) private var theme
    private let session: OperatorSession
    public init(session: OperatorSession) { self.session = session }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space.lg) {
                if let user = session.user {
                    VStack(alignment: .leading, spacing: theme.space.sm) {
                        Text(user.name ?? "Owner").font(.title2.weight(.bold)).foregroundStyle(theme.color.textPrimary)
                        if let email = user.email { row("Email", email) }
                        row("Role", user.role.capitalized)
                        row("Locations", user.scope == "*" ? "All locations" : user.scope)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(theme.space.lg)
                    .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
                    .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius).strokeBorder(theme.color.line, lineWidth: 1))
                }
                DSButton("Sign out", prominent: false) { Task { await session.signOut() } }
                Spacer()
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("Account")
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundStyle(theme.color.textSecondary)
            Spacer()
            Text(value).font(.subheadline.weight(.medium)).foregroundStyle(theme.color.textPrimary)
        }
    }
}
