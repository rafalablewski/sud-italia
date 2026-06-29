import SwiftUI
import OttavianoKit

/// The owner fleet (Atlas) store — polls `GET /api/v1/admin/kds/fleet` every 6s
/// (web cadence) while the Fleet view is on screen. Owner-only server-side; a
/// non-owner token 403s, surfaced as an error rather than faked.
@MainActor
@Observable
public final class KDSFleetStore {
    public private(set) var board: FleetBoard?
    public private(set) var error: String?

    private let api: APIClient
    private var pollTask: Task<Void, Never>?

    public init(api: APIClient) { self.api = api }

    public func start() {
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                do {
                    board = try await api.send(.adminKdsFleet())
                    error = nil
                } catch let e as APIError {
                    if board == nil {
                        if case .api(_, let m, _) = e { error = m } else { error = "You appear to be offline" }
                    }
                } catch {
                    if board == nil { error = "Could not load the fleet board" }
                }
                if Task.isCancelled { break }
                try? await Task.sleep(for: .seconds(6))
            }
        }
    }

    public func stop() { pollTask?.cancel(); pollTask = nil }
}
