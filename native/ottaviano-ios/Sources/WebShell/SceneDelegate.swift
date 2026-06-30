import UIKit

// SceneDelegate — builds the single-window scene that hosts the web view.
//
// It loads the per-app WebAppConfig from Info.plist and roots the window in the
// WebAppViewController. The window background is tinted to the app's brand colour
// so the very first frame (before the web view paints) is on-brand, not white.
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let config = WebAppConfig.load()
        let window = UIWindow(windowScene: windowScene)
        // Brand the UIKit chrome (the progress bar, the Retry button, text
        // selection) so it matches the web. KDS is the amber operator accent on
        // the dark shell; the customer app is the warm Tuscany red.
        window.tintColor = config.lightStatusBar
            ? (UIColor(hex: "#F5A623") ?? .systemOrange)   // KDS operator accent
            : (UIColor(hex: "#C8102E") ?? .systemRed)        // Ottaviano brand red
        window.rootViewController = WebAppViewController(config: config)
        window.makeKeyAndVisible()
        self.window = window
    }
}
