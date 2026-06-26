// swift-tools-version: 6.0
import PackageDescription

// OttavianoKit — the shared spine both apps depend on (ARCHITECTURE §3, APP-SHELL
// §1). The two app targets (Ottaviano, OttavianoKDS) are Xcode app targets in the
// extracted repo; they import these libraries and add the thin composition roots
// under Apps/. Dependency direction is enforced: Features → OttavianoKit; an app
// imports Features + OttavianoKit; nothing imports an app.
let package = Package(
    name: "OttavianoKit",
    platforms: [.iOS(.v26)],
    products: [
        .library(name: "OttavianoKit", targets: ["OttavianoKit"]),
        .library(name: "Features", targets: ["FeatureMenu"]),
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
        .target(
            name: "FeatureMenu",
            dependencies: ["OttavianoKit"],
            path: "Sources/Features/Menu"
        ),
        .testTarget(name: "NetworkingTests", dependencies: ["Networking"]),
    ]
)
