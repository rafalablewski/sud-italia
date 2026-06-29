import Foundation
import AudioToolbox
#if canImport(UIKit)
import UIKit
#endif

/// Audible/haptic alert for the kitchen display. The web KDS rings a chime when a
/// new ticket lands; on the iPad line we do the same with a short system sound
/// (no bundled asset to ship) plus a notification haptic where the device has one.
///
/// `soundID` is a built-in iOS system sound — operator-tunable, and trivially
/// swappable for a bundled `.caf` later via `AudioServicesCreateSystemSoundID`.
/// `AudioServicesPlaySystemSound` honours the hardware mute switch, which is the
/// right behaviour for a counter iPad the manager can silence.
public enum KDSChime {
    /// "Tink" — a short, clean alert that exists on every iOS device.
    private static let newTicketSound: SystemSoundID = 1057

    /// Ring for a newly-arrived ticket. No-op cost is negligible; callers gate on
    /// the operator's sound toggle + the board's pause state.
    public static func newTicket() {
        AudioServicesPlaySystemSound(newTicketSound)
        #if canImport(UIKit)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        #endif
    }
}

/// Kiosk-mode side effects that need UIKit (keep the screen awake on the line).
/// Gated so the package still type-checks on platforms without UIKit.
public enum KioskMode {
    public static func keepAwake(_ on: Bool) {
        #if canImport(UIKit)
        UIApplication.shared.isIdleTimerDisabled = on
        #endif
    }
}
