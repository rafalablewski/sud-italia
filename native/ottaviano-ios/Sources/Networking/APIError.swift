import Foundation

/// Machine-readable error codes, 1:1 with the server envelope's `error.code`.
public enum APIErrorCode: String, Sendable {
    case badRequest = "bad_request"
    case unauthorized
    case forbidden
    case notFound = "not_found"
    case conflict
    case rateLimited = "rate_limited"
    case validationFailed = "validation_failed"
    case serviceUnavailable = "service_unavailable"
    case internalError = "internal"
    case unknown
}

/// The typed failure surface the app branches on — never a raw string.
public enum APIError: Error, Sendable {
    /// A structured `{ error }` envelope from the server.
    case api(code: APIErrorCode, message: String, status: Int)
    /// Transport / connectivity failure (offline, timeout, DNS).
    case transport(underlying: String)
    /// A 2xx body that didn't decode to the expected shape.
    case decoding(String)
    /// Auth could not be refreshed — the caller should route to sign-in.
    case authExpired

    public var isOffline: Bool {
        if case .transport = self { return true }
        return false
    }
}
