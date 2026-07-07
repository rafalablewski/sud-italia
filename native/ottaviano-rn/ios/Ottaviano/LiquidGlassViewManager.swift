import React

// RN view manager for `LiquidGlassView` (ADR-001 spike). Legacy `RCTViewManager`
// path — the app has no Fabric codegen wired, and RN 0.79's interop layer renders
// legacy views fine under the New Architecture. JS reaches this via
// `requireNativeComponent("LiquidGlassView")` (the manager name minus "Manager").
@objc(LiquidGlassViewManager)
final class LiquidGlassViewManager: RCTViewManager {
    override func view() -> UIView! { LiquidGlassView() }
    override static func requiresMainQueueSetup() -> Bool { true }
}
