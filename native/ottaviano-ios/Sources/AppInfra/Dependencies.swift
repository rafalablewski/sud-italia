import SwiftUI
import Networking

/// The composition-root DI container (APP-SHELL §3): a struct of services built
/// once at app launch and threaded through the environment. Compile-checked, no
/// framework, no singletons-by-default. Feature stores receive only the services
/// they need (constructor injection), never the whole bag.
public struct Dependencies: Sendable {
    public let api: APIClient
    public let sse: SSEClient
    public let tokens: TokenStore
    public let baseURL: URL

    public init(api: APIClient, sse: SSEClient, tokens: TokenStore, baseURL: URL) {
        self.api = api
        self.sse = sse
        self.tokens = tokens
        self.baseURL = baseURL
    }

    /// Build the real graph for an app audience. `OTTAVIANO_API_BASE_URL` is the
    /// only host reference — so the Vercel exit needs no code change (§2.1).
    public static func live(audience: TokenAudience) -> Dependencies {
        let base = ProcessInfo.processInfo.environment["OTTAVIANO_API_BASE_URL"]
            .flatMap(URL.init(string:)) ?? URL(string: "http://localhost:3000/api/v1")!
        let tokens = TokenStore(baseURL: base, audience: audience)
        return Dependencies(
            api: APIClient(baseURL: base, tokens: tokens),
            sse: SSEClient(baseURL: base, tokens: tokens),
            tokens: tokens,
            baseURL: base
        )
    }
}

private struct DependenciesKey: EnvironmentKey {
    static let defaultValue = Dependencies.live(audience: .customer)
}
public extension EnvironmentValues {
    var dependencies: Dependencies {
        get { self[DependenciesKey.self] }
        set { self[DependenciesKey.self] = newValue }
    }
}
