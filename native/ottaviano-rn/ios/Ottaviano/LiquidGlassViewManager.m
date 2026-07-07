#import <React/RCTViewManager.h>

// ObjC bridge that exposes the Swift `LiquidGlassViewManager` + its view props to
// React Native's module registry (ADR-001). The Swift class is resolved at runtime
// by its `@objc(LiquidGlassViewManager)` name, so no bridging header is needed.
@interface RCT_EXTERN_MODULE(LiquidGlassViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(glassCornerRadius, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(glassVariant, NSString)

@end

// Ambient backdrop the glass refracts (no props).
@interface RCT_EXTERN_MODULE(AuroraViewManager, RCTViewManager)
@end
