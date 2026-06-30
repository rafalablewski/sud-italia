import UIKit
import WebKit

// WebAppViewController — the entire UI of both apps.
//
// "Retire SwiftUI" + "reflect the web 1:1": the surest way to mirror the web app
// is to BE the web app. This controller hosts one WKWebView pinned to the window
// and renders the live site, so every screen — KDS lanes, POS, the whole admin
// back-office, the customer storefront — is the exact web UI, and it can never
// drift from the web because there is no second implementation to maintain.
//
// What the wrapper adds over Safari (so it feels like a real app, not a browser):
//   • a persistent data store, so the operator/customer session survives relaunch
//   • a native-app user-agent token, so the web can hide the "install PWA" prompt
//   • pull-to-refresh, swipe-back/forward, and a slim top progress bar
//   • a branded splash + offline retry screen instead of Safari's error page
//   • system handling of tel:/mailto:/maps: links and new-window (_blank) targets
//
// It is plain UIKit + WebKit — no SwiftUI, no SwiftPM feature package.
final class WebAppViewController: UIViewController {
    private let config: WebAppConfig
    private var webView: WKWebView!
    private let progressBar = UIProgressView(progressViewStyle: .bar)
    private lazy var errorView = OfflineRetryView { [weak self] in self?.reloadFromStart() }
    private var progressObservation: NSKeyValueObservation?

    init(config: WebAppConfig) {
        self.config = config
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        config.lightStatusBar ? .lightContent : .darkContent
    }

    override func loadView() {
        let container = UIView()
        container.backgroundColor = UIColor(hex: config.backgroundHex) ?? .systemBackground
        view = container

        webView = makeWebView()
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.isOpaque = false
        webView.backgroundColor = container.backgroundColor
        webView.scrollView.backgroundColor = container.backgroundColor
        container.addSubview(webView)

        progressBar.translatesAutoresizingMaskIntoConstraints = false
        // Leave progressTintColor unset so it inherits the window's brand tint.
        progressBar.trackTintColor = .clear
        progressBar.alpha = 0
        container.addSubview(progressBar)

        errorView.translatesAutoresizingMaskIntoConstraints = false
        errorView.isHidden = true
        container.addSubview(errorView)

        NSLayoutConstraint.activate([
            // The web view owns the whole window — it manages its own safe-area
            // insets via the page's CSS env(safe-area-inset-*) (viewport-fit=cover).
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor),

            progressBar.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor),
            progressBar.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            progressBar.trailingAnchor.constraint(equalTo: container.trailingAnchor),

            errorView.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor),
            errorView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            errorView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            errorView.bottomAnchor.constraint(equalTo: container.safeAreaLayoutGuide.bottomAnchor),
        ])
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        observeProgress()
        reloadFromStart()
    }

    // MARK: - Web view setup

    private func makeWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // A persistent store keeps cookies/localStorage between launches, so a
        // signed-in operator/customer stays signed in like a real native app.
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let pagePrefs = WKWebpagePreferences()
        pagePrefs.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = pagePrefs

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        // Keep the system user agent and append our token so server code can
        // branch on the native wrapper (e.g. suppress the PWA install button).
        webView.applicationNameForUserAgent = "\(config.userAgentToken)/\(Bundle.main.shortVersion) NativeWrapper"

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(handlePullToRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        return webView
    }

    private func observeProgress() {
        progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] webView, _ in
            guard let self else { return }
            let progress = Float(webView.estimatedProgress)
            self.progressBar.setProgress(progress, animated: true)
            let loading = progress < 1
            UIView.animate(withDuration: 0.2) { self.progressBar.alpha = loading ? 1 : 0 }
            if !loading { self.progressBar.setProgress(0, animated: false) }
        }
    }

    // MARK: - Loading

    private func reloadFromStart() {
        errorView.isHidden = true
        webView.isHidden = false
        webView.load(URLRequest(url: config.startURL))
    }

    @objc private func handlePullToRefresh() {
        // If a load already failed there's nothing to reload — go back to start.
        if webView.url == nil { reloadFromStart() } else { webView.reload() }
    }

    private func showError() {
        webView.isHidden = true
        errorView.isHidden = false
    }
}

// MARK: - Navigation policy

extension WebAppViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow); return
        }

        // Hand non-web schemes (phone, mail, maps, app links) to the system.
        if let scheme = url.scheme?.lowercased(), !["http", "https", "about"].contains(scheme) {
            if UIApplication.shared.canOpenURL(url) { UIApplication.shared.open(url) }
            decisionHandler(.cancel); return
        }

        // Everything on our own origin (incl. the Stripe checkout redirect, which
        // navigates within the flow) stays in the web view so the app is seamless.
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.scrollView.refreshControl?.endRefreshing()
        errorView.isHidden = true
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleLoadFailure(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleLoadFailure(error)
    }

    private func handleLoadFailure(_ error: Error) {
        webView.scrollView.refreshControl?.endRefreshing()
        // -999 is "another request superseded this one" (e.g. a fast re-tap) —
        // not a real failure, so don't flash the offline screen for it.
        if (error as NSError).code == NSURLErrorCancelled { return }
        // Only show the full offline screen when nothing is on screen yet;
        // a sub-resource failing mid-session shouldn't blank a working page.
        if webView.url == nil { showError() }
    }
}

// MARK: - New windows (target="_blank")

extension WebAppViewController: WKUIDelegate {
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        // There is only one web view, so a `_blank` link would otherwise be
        // dropped. Load it in-place if it targets our app; open externally if not.
        if let url = navigationAction.request.url {
            if url.host == config.baseURL.host {
                webView.load(navigationAction.request)
            } else if UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url)
            }
        }
        return nil
    }
}
