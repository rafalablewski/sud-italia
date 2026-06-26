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

    /// The deployed backend the installed apps talk to. An installed iOS app
    /// can't read process env vars, so the production host is baked in here —
    /// this is the ONE place to change when the backend moves (the Vercel exit,
    /// §2.1). Not a secret; just config. A `localhost` dev override is still
    /// honoured via the env var so the simulator can hit a local `next dev`.
    public static let productionBaseURL = URL(string: "https://sud-italia.vercel.app/api/v1")!

    /// Build the real graph for an app audience.
    public static func live(audience: TokenAudience) -> Dependencies {
        let base = ProcessInfo.processInfo.environment["OTTAVIANO_API_BASE_URL"]
            .flatMap(URL.init(string:)) ?? productionBaseURL
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
