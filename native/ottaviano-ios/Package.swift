// swift-tools-version: 6.0
import PackageDescription

// OttavianoKit — the shared spine both apps depend on (ARCHITECTURE §3, APP-SHELL
// §1). The two app targets (Ottaviano, OttavianoKDS) are Xcode app targets in the
// extracted repo; they import these libraries and add the thin composition roots
// under Apps/. Dependency direction is enforced: AppFeatures → OttavianoKit; an
// app imports AppFeatures + OttavianoKit; nothing imports an app.
let package = Package(
    name: "OttavianoKit",
    // iOS 18 deployment target: builds with the latest SDK but runs on a far
    // wider device base. Everything the apps use (TabView's Tab builder,
    // @Observable, ContentUnavailableView, sensoryFeedback, NavigationSplitView)
    // is available at 18, so there's no reason to gate on 26.
    platforms: [.iOS(.v18)],
    products: [
        .library(name: "OttavianoKit", targets: ["OttavianoKit"]),
        .library(name: "AppFeatures", targets: ["AppFeatures"]),
    ],
    targets: [
        .target(name: "CoreModels"),
        .target(name: "DesignSystem", dependencies: ["CoreModels"]),
        .target(name: "Networking", dependencies: ["CoreModels"]),
        .target(name: "AppInfra", dependencies: ["Networking", "CoreModels"]),
        // Umbrella: `import OttavianoKit` re-exports the four leaf modules.
        .target(
            name: "OttavianoKit",
            dependencies: ["CoreModels", "Networking", "DesignSystem", "AppInfra"]
        ),
        // One feature module (Menu / Auth / Rewards / Orders / KDS subfolders).
        .target(
            name: "AppFeatures",
            dependencies: ["OttavianoKit"],
            path: "Sources/Features"
        ),
        .testTarget(name: "NetworkingTests", dependencies: ["Networking"]),
        .testTarget(name: "DesignSystemTests", dependencies: ["DesignSystem"]),
    ]
)
