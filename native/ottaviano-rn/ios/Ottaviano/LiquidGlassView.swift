import UIKit
import SwiftUI

// LiquidGlassView — the first bridged native element in the RN app (ADR-001).
//
// A React Native container view whose backdrop is a real **SwiftUI** surface
// rendering Apple's iOS 26 "Liquid Glass" material (`.glassEffect`), hosted in a
// `UIHostingController`. RN composes its own children *on top* of the glass — the
// backdrop is non-interactive and always pinned to the back, so the JS layout is
// untouched and touches pass through to the RN subviews.
//
// This is the crux of the ADR-001 spike: prove that RN can host a SwiftUI element
// and that the element renders the genuine system glass on-device. On iOS < 26
// (the app's deployment floor is 18.0) it falls back to `.ultraThinMaterial`, so
// the same component is safe on every supported device.
@objc(LiquidGlassView)
final class LiquidGlassView: UIView {
    /// Corner radius of the glass panel (RN prop `glassCornerRadius`).
    @objc var glassCornerRadius: CGFloat = 14 { didSet { rebuild() } }
    /// `"regular"` | `"clear"` — the glass variant (RN prop `glassVariant`).
    @objc var glassVariant: NSString = "regular" { didSet { rebuild() } }

    private let backdrop = UIView()
    private var host: UIHostingController<AnyView>?

    override init(frame: CGRect) { super.init(frame: frame); setup() }
    required init?(coder: NSCoder) { super.init(coder: coder); setup() }

    private func setup() {
        backdrop.isUserInteractionEnabled = false
        backdrop.backgroundColor = .clear
        addSubview(backdrop)
        clipsToBounds = true
        rebuild()
    }

    private func rebuild() {
        layer.cornerRadius = glassCornerRadius
        host?.view.removeFromSuperview()
        let clear = (glassVariant as String) == "clear"
        let root = AnyView(GlassPanel(cornerRadius: glassCornerRadius, clear: clear))
        let controller = UIHostingController(rootView: root)
        controller.view.backgroundColor = .clear
        controller.view.isUserInteractionEnabled = false
        backdrop.addSubview(controller.view)
        host = controller
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        backdrop.frame = bounds
        host?.view.frame = backdrop.bounds
        sendSubviewToBack(backdrop)
    }
}

/// The SwiftUI glass surface. iOS 26 renders the real Liquid Glass material; older
/// systems get the closest stock material so the component is always safe.
private struct GlassPanel: View {
    let cornerRadius: CGFloat
    let clear: Bool

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        if #available(iOS 26.0, *) {
            Color.clear.glassEffect(clear ? .clear : .regular, in: shape)
        } else {
            shape.fill(clear ? AnyShapeStyle(.ultraThinMaterial) : AnyShapeStyle(.thinMaterial))
        }
    }
}
