import SwiftUI
import OttavianoKit

/// The customer "More" tab — the native home for everything the web storefront
/// puts below the menu: the famiglia story (AboutSection), the soci loyalty pitch
/// (LoyaltySection), the location list, privacy, and the guest's own identity
/// (sign in / out). Keeps the Order/Rewards/Orders tabs focused while still
/// giving the brand voice and info a discoverable home (Rule #5).
public struct AccountView: View {
    @Environment(\.theme) private var theme
    private let session: CustomerSession
    private let locations: LocationsStore
    @State private var presentingAuth = false
    @State private var showDeleteConfirm = false
    @State private var working = false
    @State private var message: String?
    @State private var exportJSON: String?

    public init(session: CustomerSession, locations: LocationsStore) {
        self.session = session; self.locations = locations
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: theme.space.xl) {
                identityCard
                famiglia
                sociPitch
                locationsCard
                aboutLinks
            }
            .padding(theme.space.lg)
        }
        .background(theme.color.surface)
        .navigationTitle("More")
        .task { await locations.load() }
        .dsToast($message)
        .sheet(item: Binding(get: { exportJSON.map { ExportPayload(text: $0) } }, set: { exportJSON = $0?.text })) { payload in
            DataExportSheet(json: payload.text)
        }
        .alert("Delete your account?", isPresented: $showDeleteConfirm) {
            Button("Delete account", role: .destructive) {
                Task {
                    working = true
                    defer { working = false }
                    do { _ = try await session.deleteAccount(); message = "Your account and data were deleted" }
                    catch { message = "Couldn't delete the account — please try again" }
                }
            }
            Button("Keep my account", role: .cancel) {}
        } message: {
            Text("This permanently erases your profile, loyalty points and saved details, and signs you out of every device. Your past order receipts are kept anonymised for tax records. This can't be undone.")
        }
        .sheet(isPresented: $presentingAuth) { AuthSheet(session: session) }
    }

    private var identityCard: some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            if session.state == .signedIn, let p = session.profile {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.name ?? p.phone).font(.title3.weight(.bold)).foregroundStyle(theme.color.textPrimary)
                        Text("\(p.tier.capitalized) · \(p.points) points").font(.subheadline).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                    Image(systemName: "star.circle.fill").font(.largeTitle).foregroundStyle(theme.color.accent)
                }
                Button("Sign out", role: .destructive) { Task { await session.signOut() } }
            } else {
                Text("Join the famiglia").font(.system(.title3, design: .serif).weight(.semibold))
                    .foregroundStyle(theme.color.textPrimary)
                Text("Sign in with your phone — no password, no account to create — to collect points and track orders.")
                    .font(.subheadline).foregroundStyle(theme.color.textSecondary)
                DSButton("Continue with phone") { presentingAuth = true }
            }
        }
        .panel(theme)
    }

    private var famiglia: some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Text("La famiglia").font(.system(.title2, design: .serif).weight(.semibold))
                .foregroundStyle(theme.color.brand)
            Text("“Pizza napoletana the way Napoli makes it — 00 flour, San Marzano, a 90-second turn in the wood-fired forno. We cook for friends, not customers.”")
                .font(.system(.body, design: .serif).italic())
                .foregroundStyle(theme.color.textSecondary)
        }
        .panel(theme)
    }

    private var sociPitch: some View {
        VStack(alignment: .leading, spacing: theme.space.sm) {
            Label("Soci e amici", systemImage: "star.fill").font(.headline).foregroundStyle(theme.color.onAccent)
            Text("A point for every złoty. Climb the tiers, unlock rewards, skip the queue.")
                .font(.subheadline).foregroundStyle(theme.color.onAccent.opacity(0.9))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(theme.space.lg)
        .background(theme.color.accent, in: RoundedRectangle(cornerRadius: theme.cornerRadius, style: .continuous))
    }

    private var locationsCard: some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            Text("Our tables").font(.headline).foregroundStyle(theme.color.textPrimary)
            if locations.locations.isEmpty {
                Text("Kraków · Warszawa").font(.subheadline).foregroundStyle(theme.color.textSecondary)
            }
            ForEach(locations.locations) { loc in
                HStack(alignment: .top, spacing: theme.space.sm) {
                    Image(systemName: "mappin.and.ellipse").foregroundStyle(theme.color.brand)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(loc.name).font(.subheadline.weight(.semibold)).foregroundStyle(theme.color.textPrimary)
                        Text(loc.address).font(.caption).foregroundStyle(theme.color.textSecondary)
                    }
                    Spacer()
                }
            }
        }
        .panel(theme)
    }

    private var aboutLinks: some View {
        VStack(alignment: .leading, spacing: theme.space.md) {
            Text("Privacy & data").font(.headline).foregroundStyle(theme.color.textPrimary)
            // Privacy policy is always reachable (Apple requires an accessible
            // policy); the data controls only apply to a signed-in guest.
            Link(destination: URL(string: "https://ottaviano.pl/privacy")!) {
                linkRow("Privacy policy", "lock.fill", trailing: "arrow.up.right")
            }
            if session.state == .signedIn {
                Divider().overlay(theme.color.line)
                Button { Task { await runExport() } } label: {
                    linkRow("Export my data", "square.and.arrow.up", trailing: working ? nil : "chevron.right")
                }.buttonStyle(.plain).disabled(working)
                Divider().overlay(theme.color.line)
                Button(role: .destructive) { showDeleteConfirm = true } label: {
                    HStack(spacing: theme.space.md) {
                        Image(systemName: "trash.fill").foregroundStyle(theme.color.danger).frame(width: 22)
                        Text("Delete account").foregroundStyle(theme.color.danger)
                        Spacer()
                    }
                }.buttonStyle(.plain).disabled(working)
            }
            Divider().overlay(theme.color.line)
            link("Pizza napoletana · forno a legna", "flame.fill")
        }
        .panel(theme)
    }

    /// Pull the guest's own data and hand it to the share sheet as pretty JSON.
    private func runExport() async {
        working = true
        defer { working = false }
        do {
            let data = try await session.exportData()
            let enc = JSONEncoder()
            enc.outputFormatting = [.prettyPrinted, .sortedKeys]
            if let blob = try? enc.encode(data), let text = String(data: blob, encoding: .utf8) {
                exportJSON = text
            } else {
                message = "Couldn't prepare the export"
            }
        } catch { message = "Couldn't export your data — please try again" }
    }

    private func link(_ title: String, _ icon: String) -> some View {
        linkRow(title, icon, trailing: nil)
    }

    private func linkRow(_ title: String, _ icon: String, trailing: String?) -> some View {
        HStack(spacing: theme.space.md) {
            Image(systemName: icon).foregroundStyle(theme.color.accent).frame(width: 22)
            Text(title).foregroundStyle(theme.color.textPrimary)
            Spacer()
            if let trailing { Image(systemName: trailing).font(.caption).foregroundStyle(theme.color.textSecondary) }
        }
    }
}

/// Identifiable wrapper so the export JSON can drive `.sheet(item:)`.
private struct ExportPayload: Identifiable {
    let text: String
    var id: String { String(text.count) }
}

/// Presents the guest's data export with a system share sheet (save to Files,
/// AirDrop, mail). Genuinely portable — satisfies the GDPR Art. 15 promise.
private struct DataExportSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let json: String

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(json)
                    .font(.caption.monospaced())
                    .foregroundStyle(theme.color.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
                    .padding(theme.space.lg)
            }
            .background(theme.color.surface)
            .navigationTitle("Your data")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: json) { Image(systemName: "square.and.arrow.up") }
                }
            }
        }
    }
}

/// AuthView in a sheet that dismisses itself once sign-in succeeds. (Mirror of the
/// SignInGate's private AuthSheet — kept local so Account doesn't depend on it.)
private struct AuthSheet: View {
    let session: CustomerSession
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        AuthView(session: session)
            .onChange(of: session.state) { _, new in if new == .signedIn { dismiss() } }
    }
}

private extension View {
    func panel(_ theme: Theme) -> some View {
        self
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(theme.space.lg)
            .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: theme.cornerRadius, style: .continuous).strokeBorder(theme.color.line, lineWidth: 1))
    }
}
