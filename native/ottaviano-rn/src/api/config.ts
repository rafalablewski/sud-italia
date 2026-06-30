/**
 * The single host reference for both apps (ARCHITECTURE §2.1). Because the
 * contract paths are relative to this one base, the backend can leave Vercel with
 * no client release. Change this constant (or wire a build-time config) to point
 * at a staging/self-hosted origin.
 */
export const API_BASE_URL = "https://sud-italia.vercel.app/api/v1";

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
