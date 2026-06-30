import Foundation

// WebAppConfig — the per-app settings the shell reads at launch.
//
// Both apps share ONE codebase (this WebShell target). What differs between
// Ottaviano (customer) and OttavianoKDS (operator) is purely data: which web URL
// to open, the user-agent token the server uses to recognise the wrapper, and
// the chrome (status-bar style). That data lives in each app's Info.plist under
// the `OTTWeb*` keys, so the same Swift compiles into both apps and there is no
// per-app Swift to drift — the one thing that *could* drift (the UI) is the web
// app itself, rendered 1:1 (DESIGN-SYSTEM §1).
//
// Resolution order for the base URL (first hit wins) so a build can be pointed
// at staging/local without editing code:
//   1. `OTTAVIANO_WEB_BASE_URL` process env (set in the Xcode scheme for dev)
//   2. `OTTWebBaseURL` in Info.plist (the shipped production host)
struct WebAppConfig {
    /// The origin the wrapper renders, e.g. `https://ottaviano.pl`.
    let baseURL: URL
    /// Path the app opens on launch — `/` for the customer app, `/operator` for KDS.
    let startPath: String
    /// Appended to the default WKWebView user agent so the server can detect the
    /// native wrapper (e.g. to suppress the "Install this app" PWA prompt that
    /// makes no sense inside an already-installed native app).
    let userAgentToken: String
    /// Pre-web-load background + launch tint, so there is no white flash before
    /// the page paints. Hex like `#070A0F`.
    let backgroundHex: String
    /// `light` → white status-bar glyphs (dark KDS), else dark glyphs.
    let lightStatusBar: Bool

    /// The full URL the app opens on a cold launch (base + start path).
    var startURL: URL { url(forPath: startPath) }

    /// Resolve a web path against the configured origin. Absolute URLs pass
    /// through unchanged (used by the navigation policy for same-origin checks).
    func url(forPath path: String) -> URL {
        URL(string: path, relativeTo: baseURL)?.absoluteURL ?? baseURL
    }

    /// Build the config from the app's Info.plist (+ the dev env override).
    static func load(from bundle: Bundle = .main,
                     environment: [String: String] = ProcessInfo.processInfo.environment) -> WebAppConfig {
        func info(_ key: String) -> String? {
            (bundle.object(forInfoDictionaryKey: key) as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .nonEmpty
        }

        let rawBase = environment["OTTAVIANO_WEB_BASE_URL"]?.nonEmpty
            ?? info("OTTWebBaseURL")
            ?? "https://ottaviano.pl"
        // A trailing slash on the origin keeps relative-path resolution correct.
        let normalizedBase = rawBase.hasSuffix("/") ? rawBase : rawBase + "/"

        return WebAppConfig(
            baseURL: URL(string: normalizedBase) ?? URL(string: "https://ottaviano.pl/")!,
            startPath: info("OTTWebStartPath") ?? "/",
            userAgentToken: info("OTTAppUAToken") ?? "OttavianoApp",
            backgroundHex: info("OTTBackgroundHex") ?? "#FFFFFF",
            lightStatusBar: (info("OTTStatusBarStyle") ?? "dark").lowercased() == "light"
        )
    }
}

private extension String {
    /// `nil` instead of an empty string, so missing/blank Info.plist keys fall
    /// through to the next source in the resolution chain.
    var nonEmpty: String? { isEmpty ? nil : self }
}
