import Constants from "expo-constants";

/**
 * The single host reference for both apps (ARCHITECTURE §2.1). Read from the
 * Expo config `extra.apiBaseUrl` (overridable per build via app.config), falling
 * back to the deployed origin. Because the contract paths are relative to this
 * one base, the backend can leave Vercel with no client release.
 */
const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? fromExtra ?? "https://sud-italia.vercel.app/api/v1";

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
