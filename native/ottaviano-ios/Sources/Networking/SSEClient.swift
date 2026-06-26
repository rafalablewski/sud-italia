import Foundation

/// Reads a Server-Sent-Events stream as an `AsyncStream` of decoded frames — the
/// native realtime spine (ARCHITECTURE §4). Used by the operator live board
/// (`/orders/stream`) and the customer order tracker
/// (`/customer/orders/:id/stream`). URLSession sends the Bearer header (which
/// `EventSource` can't), reconnecting is the caller's concern.
public struct SSEClient: Sendable {
    private let baseURL: URL
    private let tokens: TokenStore
    private let session: URLSession

    public init(baseURL: URL, tokens: TokenStore, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokens = tokens
        self.session = session
    }

    /// Stream `data:` frames from `path`, decoding each JSON payload to `Frame`.
    /// Non-decodable frames and `: ping` heartbeats are skipped.
    public func stream<Frame: Decodable & Sendable>(
        _ path: String,
        query: [String: String] = [:],
        as: Frame.Type = Frame.self
    ) -> AsyncThrowingStream<Frame, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var components = URLComponents(
                        url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false
                    )!
                    if !query.isEmpty {
                        components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
                    }
                    var req = URLRequest(url: components.url!)
                    req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    let token = try await tokens.validAccessToken()
                    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

                    let (bytes, response) = try await session.bytes(for: req)
                    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                        throw APIError.api(code: .unknown, message: "stream failed", status: -1)
                    }
                    let decoder = JSONDecoder()
                    for try await line in bytes.lines {
                        guard line.hasPrefix("data:") else { continue } // skip ": ping"
                        let json = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        guard let data = json.data(using: .utf8),
                              let frame = try? decoder.decode(Frame.self, from: data) else { continue }
                        continuation.yield(frame)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

/// Frame wrappers matching the stream payloads.
public struct OrderBoardFrame<Model: Decodable & Sendable>: Decodable, Sendable {
    public let orders: [Model]
}
public struct OrderTrackFrame<Model: Decodable & Sendable>: Decodable, Sendable {
    public let order: Model
}
