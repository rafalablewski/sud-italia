import SwiftUI
import OttavianoKit

/// Phone-OTP sign-in (Rule #6). Two steps: enter phone → enter the 6-digit code.
/// Pure projection over `CustomerSession`; the view does no networking itself
/// beyond calling session intents.
public struct AuthView: View {
    @Environment(\.theme) private var theme
    private let session: CustomerSession

    @State private var phone = ""
    @State private var code = ""
    @State private var step: Step = .phone
    @State private var busy = false
    @State private var error: String?
    @State private var devHint: String?

    private enum Step { case phone, code }

    public init(session: CustomerSession) { self.session = session }

    public var body: some View {
        VStack(spacing: theme.space.lg) {
            Spacer()
            BrandWordmark(subtitle: "Soci e amici")
            Text("Join the famiglia — sign in with your phone, no password.")
                .font(.subheadline).foregroundStyle(theme.color.textSecondary)
                .multilineTextAlignment(.center)

            switch step {
            case .phone:
                TextField("512 ··· ···", text: $phone)
                    .keyboardType(.phonePad).textContentType(.telephoneNumber)
                    .padding().background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
                DSButton(busy ? "…" : "Send code", action: sendCode).disabled(busy || phone.count < 7)
            case .code:
                TextField("123456", text: $code)
                    .keyboardType(.numberPad).textContentType(.oneTimeCode)
                    .padding().background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
                DSButton(busy ? "…" : "Verify", action: verify).disabled(busy || code.count != 6)
                Button("Use a different number") { step = .phone; code = ""; error = nil }
                    .font(.footnote).foregroundStyle(theme.color.textSecondary)
            }

            if let devHint { Text("Dev code: \(devHint)").font(.footnote.monospaced()).foregroundStyle(theme.color.warning) }
            if let error { Text(error).font(.footnote).foregroundStyle(theme.color.danger) }
            Spacer()
        }
        .padding(theme.space.xl)
        .background(theme.color.surface)
    }

    private func sendCode() {
        busy = true; error = nil; devHint = nil
        Task {
            defer { busy = false }
            do {
                let result = try await session.requestCode(phone: phone)
                devHint = result.devCode
                step = .code
            } catch let e as APIError {
                error = message(e)
            } catch { self.error = "Couldn't send the code" }
        }
    }

    private func verify() {
        busy = true; error = nil
        Task {
            defer { busy = false }
            do { try await session.verify(phone: phone, code: code) }
            catch let e as APIError { error = message(e) }
            catch { self.error = "Sign-in failed" }
        }
    }

    private func message(_ e: APIError) -> String {
        switch e {
        case .transport: return "You appear to be offline"
        case .api(_, let m, _): return m
        default: return "Something went wrong"
        }
    }
}
