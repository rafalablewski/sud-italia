import SwiftUI
import UIKit

// DSTextField + DSToast (DESIGN-SYSTEM §4.1). Themed input with label/error/icon
// slots and full keyboard config, and a transient toast with an auto-dismiss
// modifier. Both read the theme from the environment.

// MARK: - DSTextField

public struct DSTextField: View {
    @Environment(\.theme) private var theme
    private let label: String
    @Binding private var text: String
    private let placeholder: String?
    private let secure: Bool
    private let error: String?
    private let systemImage: String?
    private let keyboard: UIKeyboardType
    private let contentType: UITextContentType?
    private let autocapitalization: TextInputAutocapitalization
    private let autocorrect: Bool

    public init(
        _ label: String,
        text: Binding<String>,
        placeholder: String? = nil,
        secure: Bool = false,
        error: String? = nil,
        systemImage: String? = nil,
        keyboard: UIKeyboardType = .default,
        contentType: UITextContentType? = nil,
        autocapitalization: TextInputAutocapitalization = .sentences,
        autocorrect: Bool = true
    ) {
        self.label = label
        _text = text
        self.placeholder = placeholder
        self.secure = secure
        self.error = error
        self.systemImage = systemImage
        self.keyboard = keyboard
        self.contentType = contentType
        self.autocapitalization = autocapitalization
        self.autocorrect = autocorrect
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: theme.space.xs) {
            if !label.isEmpty {
                Text(label).textRole(.caption).foregroundStyle(theme.color.textSecondary)
            }
            HStack(spacing: theme.space.sm) {
                if let systemImage {
                    Image(systemName: systemImage).foregroundStyle(theme.color.textSecondary)
                }
                inputField
                    .textInputAutocapitalization(autocapitalization)
                    .autocorrectionDisabled(!autocorrect)
                    .keyboardType(keyboard)
                    .textContentType(contentType)
                    .foregroundStyle(theme.color.textPrimary)
            }
            .padding()
            .background(theme.color.surface2, in: RoundedRectangle(cornerRadius: theme.cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: theme.cornerRadius)
                    .strokeBorder(error == nil ? theme.color.line : theme.color.danger, lineWidth: 1)
            )
            if let error {
                Text(error).textRole(.caption).foregroundStyle(theme.color.danger)
                    .accessibilityLabel("Error: \(error)")
            }
        }
    }

    @ViewBuilder private var inputField: some View {
        if secure {
            SecureField(placeholder ?? label, text: $text)
        } else {
            TextField(placeholder ?? label, text: $text)
        }
    }
}

// MARK: - DSToast

public struct DSToast: View {
    public enum Kind: Sendable { case success, warning, danger, info }
    @Environment(\.theme) private var theme
    private let message: String
    private let kind: Kind

    public init(_ message: String, kind: Kind = .info) {
        self.message = message; self.kind = kind
    }

    public var body: some View {
        Label {
            Text(message).textRole(.bodyEmphasis)
        } icon: {
            Image(systemName: icon)
        }
        .foregroundStyle(fg)
        .padding(.horizontal, theme.space.lg)
        .padding(.vertical, theme.space.md)
        .background(bg, in: Capsule())
        .overlay(Capsule().strokeBorder(fg.opacity(0.25), lineWidth: 1))
        .dsShadow(theme.elevation.card)
        .accessibilityElement(children: .combine)
    }

    private var icon: String {
        switch kind {
        case .success: "checkmark.circle.fill"
        case .warning: "exclamationmark.triangle.fill"
        case .danger: "xmark.octagon.fill"
        case .info: "info.circle.fill"
        }
    }
    private var fg: Color {
        switch kind {
        case .success: theme.color.success
        case .warning: theme.color.warning
        case .danger: theme.color.danger
        case .info: theme.info
        }
    }
    private var bg: Color {
        switch kind {
        case .success: theme.successSoft
        case .warning: theme.warningSoft
        case .danger: theme.dangerSoft
        case .info: theme.infoSoft
        }
    }
}

public extension View {
    /// Present a transient toast from the top while `message` is non-nil, then
    /// clear it automatically. Bind a `@State var toast: String?`.
    func dsToast(_ message: Binding<String?>, kind: DSToast.Kind = .info, seconds: Double = 2.2) -> some View {
        modifier(DSToastModifier(message: message, kind: kind, seconds: seconds))
    }
}

private struct DSToastModifier: ViewModifier {
    @Binding var message: String?
    let kind: DSToast.Kind
    let seconds: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let message {
                DSToast(message, kind: kind)
                    .padding(.top, 8)
                    .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                    .task(id: message) {
                        try? await Task.sleep(for: .seconds(seconds))
                        self.message = nil
                    }
            }
        }
        .animation(reduceMotion ? nil : .spring(duration: 0.3), value: message)
    }
}

#if DEBUG
private struct InputsDemo: View {
    @State private var name = ""
    @State private var phone = "500"
    @State private var toast: String? = nil
    var body: some View {
        VStack(spacing: 16) {
            DSTextField("Name", text: $name, placeholder: "Walk-in", systemImage: "person")
            DSTextField("Phone", text: $phone, error: phone.count < 7 ? "Too short for a receipt" : nil,
                        systemImage: "phone", keyboard: .phonePad, contentType: .telephoneNumber)
            DSButton("Toast") { toast = "Sent to kitchen" }
            Spacer()
        }
        .padding()
        .dsToast($toast, kind: .success)
    }
}
#Preview("Inputs · KDS") {
    InputsDemo().environment(\.theme, .kds).background(Theme.kds.color.surface).preferredColorScheme(.dark)
}
#endif
