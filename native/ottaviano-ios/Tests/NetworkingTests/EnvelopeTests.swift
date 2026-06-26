import Testing
import Foundation
@testable import Networking

// A couple of pure decode checks — the envelope is the contract seam, so its
// success/error shapes must decode exactly as the server emits them. (Run on a
// Mac: `swift test`.)

@Test func decodesSuccessEnvelope() throws {
    struct Payload: Decodable, Equatable { let ok: Bool }
    let json = #"{"data":{"ok":true},"meta":{"count":1}}"#.data(using: .utf8)!
    let env = try JSONDecoder().decode(SuccessEnvelope<Payload>.self, from: json)
    #expect(env.data == Payload(ok: true))
}

@Test func decodesErrorEnvelope() throws {
    let json = #"{"error":{"code":"not_found","message":"Order not found"}}"#.data(using: .utf8)!
    let env = try JSONDecoder().decode(ErrorEnvelope.self, from: json)
    #expect(env.error.code == "not_found")
    #expect(APIErrorCode(rawValue: env.error.code) == .notFound)
}
