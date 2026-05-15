import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies an incoming Meta WhatsApp webhook against the configured
 * app secret. Meta sends the signature in `X-Hub-Signature-256` as
 * `sha256=<hex>` over the *raw* request body. Anything that re-parses
 * or normalizes the JSON will break the check.
 */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

/**
 * Handles the GET hub.challenge handshake that Meta runs once when an
 * operator subscribes the webhook in the Developer Console. Returns
 * `null` when the request shouldn't be accepted; the route handler
 * turns that into a 403.
 */
export function verifyHubChallenge(
  searchParams: URLSearchParams,
  expectedToken: string,
): string | null {
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode !== "subscribe") return null;
  if (!token || !expectedToken) return null;
  if (token !== expectedToken) return null;
  return challenge ?? "";
}
