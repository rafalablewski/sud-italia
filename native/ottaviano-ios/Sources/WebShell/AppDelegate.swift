import UIKit

// AppDelegate — minimal UIKit entry point shared by both apps.
//
// `@main` lives here (not in a SwiftUI `App`): the apps are pure UIKit. All the
// per-app difference is data in Info.plist (see WebAppConfig), so this file —
// like every file in WebShell — compiles unchanged into both Ottaviano and
// OttavianoKDS. Scene lifecycle is handled by SceneDelegate.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
