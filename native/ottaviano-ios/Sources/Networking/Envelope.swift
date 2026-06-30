import Foundation

// The one /api/v1 envelope (mirrors src/lib/api/v1/envelope.ts):
//   success → { "data": T, "meta": {...}? }
//   failure → { "error": { "code", "message", "details"? } }

struct SuccessEnvelope<T: Decodable>: Decodable {
    let data: T
}

struct ErrorEnvelope: Decodable {
    struct Body: Decodable {
        let code: String
        let message: String
    }
    let error: Body
}
