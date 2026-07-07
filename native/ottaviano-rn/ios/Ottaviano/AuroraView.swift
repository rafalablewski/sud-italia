import UIKit
import SwiftUI

// AuroraView — the second bridged SwiftUI element (ADR-001). A full-bleed ambient
// backdrop of soft, slowly-drifting brand blooms (terracotta · amber · basil ·
// indigo) over espresso. Its only job is to give the Liquid Glass panels above it
// real colour to refract — glass reads as glass only over dynamic content. RN
// places it as the POS background; the glass surfaces float on top.
@objc(AuroraView)
final class AuroraView: UIView {
    private var host: UIHostingController<AuroraCanvas>?

    override init(frame: CGRect) { super.init(frame: frame); setup() }
    required init?(coder: NSCoder) { super.init(coder: coder); setup() }

    private func setup() {
        backgroundColor = UIColor(red: 0.078, green: 0.059, blue: 0.051, alpha: 1) // #140f0d
        isUserInteractionEnabled = false
        let controller = UIHostingController(rootView: AuroraCanvas())
        controller.view.backgroundColor = .clear
        controller.view.isUserInteractionEnabled = false
        addSubview(controller.view)
        host = controller
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        host?.view.frame = bounds
    }
}

private struct AuroraCanvas: View {
    @State private var drift = false
    var body: some View {
        ZStack {
            bloom(Color(red: 0.91, green: 0.40, blue: 0.24), 0.55)   // terracotta
                .offset(x: drift ? -60 : -110, y: -230)
            bloom(Color(red: 0.91, green: 0.64, blue: 0.24), 0.34)   // amber
                .offset(x: drift ? 150 : 110, y: -120)
            bloom(Color(red: 0.44, green: 0.69, blue: 0.33), 0.30)   // basil
                .offset(x: drift ? 130 : 170, y: 320)
            bloom(Color(red: 0.23, green: 0.29, blue: 0.42), 0.42)   // indigo
                .offset(x: drift ? -140 : -100, y: 260)
        }
        .ignoresSafeArea()
        .onAppear {
            guard !UIAccessibility.isReduceMotionEnabled else { return }
            withAnimation(.easeInOut(duration: 14).repeatForever(autoreverses: true)) { drift.toggle() }
        }
    }
    private func bloom(_ c: Color, _ opacity: Double) -> some View {
        Circle().fill(c.opacity(opacity)).frame(width: 460, height: 460).blur(radius: 90)
    }
}
