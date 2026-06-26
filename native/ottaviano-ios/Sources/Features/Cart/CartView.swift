import SwiftUI
import OttavianoKit

/// The cart + checkout sheet — the customer-facing twin of the web cart/checkout
/// (`/components/cart`, `/order-confirmation`). Three phases in one flow: review
/// lines → checkout details (fulfilment + guest name/phone) → confirmation. Order
/// pricing is authoritative server-side (`POST /api/v1/orders`); the client only
/// sends intent. Guest-capable (Rule #6) — sign-in is never required to order.
public struct CartView: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    private let cart: CartStore
    private let api: APIClient
    private let profile: CustomerProfile?

    @State private var phase: Phase = .review
    @State private var fulfillment = "pickup"
    @State private var name = ""
    @State private var phone = ""
    @State private var tableNumber = ""
    @State private var busy = false
    @State private var error: String?
    @State private var placed: Order?

    private enum Phase { case review, checkout, done }

    public init(cart: CartStore, api: APIClient, profile: CustomerProfile?) {
        self.cart = cart; self.api = api; self.profile = profile
    }

    public var body: some View {
        NavigationStack {
            Group {
                switch phase {
                case .review: review
                case .checkout: checkout
                case .done: confirmation
                }
            }
            .background(theme.color.surface)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .onAppear {
            name = profile?.name ?? ""
            phone = profile?.phone ?? ""
        }
    }

    private var title: String {
        switch phase { case .review: "Your cart"; case .checkout: "Checkout"; case .done: "Order placed" }
    }

    // MARK: Review

    private var review: some View {
        VStack(spacing: 0) {
            if cart.isEmpty {
                ContentUnavailableView("Your cart is empty", systemImage: "bag", description: Text("Add a few dishes from the menu."))
            } else {
                List {
                    ForEach(cart.lines) { line in
                        HStack(spacing: theme.space.md) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(line.item.name).font(.system(.subheadline, design: .serif).weight(.semibold))
                                    .foregroundStyle(theme.color.textPrimary)
                                MoneyText(line.item.price).font(.caption).foregroundStyle(theme.color.textSecondary)
                            }
                            Spacer()
                            Stepper(value: Binding(
                                get: { line.quantity },
                                set: { cart.setQuantity($0, for: line.item) }
                            ), in: 0...99) {
                                Text("\(line.quantity)").monospacedDigit().foregroundStyle(theme.color.textPrimary)
                            }
                            .labelsHidden().fixedSize()
                            MoneyText(line.subtotal).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.brand)
                        }
                    }
                    .onDelete { idx in idx.map { cart.lines[$0].item }.forEach(cart.remove) }
                }
                checkoutBar(label: "Checkout") { phase = .checkout }
            }
        }
    }

    // MARK: Checkout

    private var checkout: some View {
        VStack(spacing: 0) {
            Form {
                Section("Fulfilment") {
                    Picker("How", selection: $fulfillment) {
                        Text("Pickup").tag("pickup")
                        Text("Delivery").tag("delivery")
                        Text("Dine-in").tag("dinein")
                    }
                    .pickerStyle(.segmented)
                    if fulfillment == "dinein" {
                        TextField("Table number", text: $tableNumber).keyboardType(.numberPad)
                    }
                }
                Section("Your details") {
                    TextField("Name", text: $name).textContentType(.name)
                    TextField("Phone", text: $phone).keyboardType(.phonePad).textContentType(.telephoneNumber)
                }
                Section {
                    HStack {
                        Text("Total").font(.headline).foregroundStyle(theme.color.textPrimary)
                        Spacer()
                        MoneyText(cart.subtotal).font(.headline).foregroundStyle(theme.color.brand)
                    }
                    Text("Final price is confirmed by the kitchen — taxes & any deal discounts apply server-side.")
                        .font(.caption).foregroundStyle(theme.color.textSecondary)
                }
                if let error {
                    Section { Text(error).font(.footnote).foregroundStyle(theme.color.danger) }
                }
            }
            checkoutBar(label: busy ? "Placing…" : "Place order", disabled: !canPlace) { Task { await place() } }
        }
    }

    private var canPlace: Bool {
        !busy && !cart.isEmpty && !name.isEmpty && phone.count >= 7
    }

    // MARK: Confirmation

    private var confirmation: some View {
        VStack(spacing: theme.space.lg) {
            Spacer()
            Image(systemName: "checkmark.seal.fill").font(.system(size: 64)).foregroundStyle(theme.color.success)
            Text("Grazie, \(name.isEmpty ? "amico" : name)!").font(.system(.title, design: .serif).weight(.bold))
                .foregroundStyle(theme.color.textPrimary)
            if let placed {
                Text("Order \(placed.id)").font(.subheadline.monospaced()).foregroundStyle(theme.color.textSecondary)
                Text("We've sent it to the kitchen. Track it live from your Orders tab.")
                    .font(.subheadline).foregroundStyle(theme.color.textSecondary)
                    .multilineTextAlignment(.center).padding(.horizontal, theme.space.xl)
            }
            DSButton("Done") { dismiss() }.padding(.horizontal, theme.space.xxl)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Bar + action

    private func checkoutBar(label: String, disabled: Bool = false, action: @escaping () -> Void) -> some View {
        VStack(spacing: theme.space.sm) {
            HStack {
                Text("\(cart.itemCount) item\(cart.itemCount == 1 ? "" : "s")")
                    .font(.subheadline).foregroundStyle(theme.color.textSecondary)
                Spacer()
                MoneyText(cart.subtotal).font(.headline).foregroundStyle(theme.color.textPrimary)
            }
            DSButton(label, action: action).disabled(disabled)
        }
        .padding(theme.space.lg)
        .background(.bar)
    }

    private func place() async {
        busy = true; error = nil
        defer { busy = false }
        let req = cart.makeRequest(
            fulfillment: fulfillment,
            name: name, phone: phone,
            tableNumber: fulfillment == "dinein" ? tableNumber : nil
        )
        do {
            let order = try await api.send(.createOrder(req))
            placed = order
            cart.clear()
            phase = .done
        } catch let e as APIError {
            if case .api(_, let m, _) = e { error = m }
            else if case .transport = e { error = "You appear to be offline" }
            else { error = "Couldn't place the order" }
        } catch { self.error = "Something went wrong" }
    }
}
