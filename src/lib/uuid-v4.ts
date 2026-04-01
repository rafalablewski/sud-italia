/** RFC 4122 version-4 UUID (matches server validation for cart presence visitor ids). */
export const VISITOR_UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isVisitorUuidV4(s: string): boolean {
  return VISITOR_UUID_V4_RE.test(s);
}
