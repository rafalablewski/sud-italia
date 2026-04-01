import { isVisitorUuidV4 } from "@/lib/uuid-v4";

const STORAGE_KEY = "sud-italia-cart-visitor";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function writeVisitorCookie(id: string): void {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 400;
  const secure =
    typeof location !== "undefined" && location.protocol === "https:" ? ";Secure" : "";
  document.cookie = `${STORAGE_KEY}=${encodeURIComponent(id)};path=/;max-age=${maxAge};SameSite=Lax${secure}`;
}

function randomUuidV4(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Anonymous id for cart presence; localStorage with cookie mirror (ITP / private mode fallback). */
export function getOrCreateCartVisitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && isVisitorUuidV4(existing)) {
      writeVisitorCookie(existing);
      return existing;
    }
    const fromCookie = readCookie(STORAGE_KEY);
    if (fromCookie && isVisitorUuidV4(fromCookie)) {
      try {
        window.localStorage.setItem(STORAGE_KEY, fromCookie);
      } catch {
        /* ignore */
      }
      writeVisitorCookie(fromCookie);
      return fromCookie;
    }
    const id = randomUuidV4();
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    writeVisitorCookie(id);
    return id;
  } catch {
    const fromCookie = readCookie(STORAGE_KEY);
    if (fromCookie && isVisitorUuidV4(fromCookie)) return fromCookie;
    const id = randomUuidV4();
    writeVisitorCookie(id);
    return id;
  }
}
