"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, LogIn } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from "@/lib/password";

const locations = getActiveLocations();

/**
 * Shared-terminal login. A pizzaiolo, chef or waiter picks the location once
 * (it sticks for the device) and taps their PIN; the server routes them to the
 * KDS or POS. Designed for touch: big targets, numeric keypad, no keyboard.
 */
export default function TerminalLoginPage() {
  const router = useRouter();
  const [slug, setSlug] = useState(locations[0]?.slug ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Remember the device's location so staff only re-enter a PIN.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("terminal-location") : null;
    if (saved && locations.some((l) => l.slug === saved)) setSlug(saved);
  }, []);

  const pickLocation = (next: string) => {
    setSlug(next);
    setError("");
    try {
      window.localStorage.setItem("terminal-location", next);
    } catch {
      /* private mode — non-fatal */
    }
  };

  const press = (digit: string) => {
    setError("");
    setPin((p) => (p.length >= PIN_MAX_LENGTH ? p : p + digit));
  };
  const backspace = () => setPin((p) => p.slice(0, -1));

  const submit = async () => {
    if (pin.length < PIN_MIN_LENGTH) {
      setError(`Enter your ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digit PIN`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/terminal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pin }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Invalid PIN");
        setPin("");
        return;
      }
      router.push(typeof data?.landing === "string" ? data.landing : "/admin");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="glass-card rounded-3xl p-8">
          <div className="flex justify-center mb-5">
            <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-italia-red to-italia-red-dark flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-italia-red/25">
              SI
            </span>
          </div>
          <h1 className="text-2xl font-bold text-center mb-1 font-heading gradient-text">
            Sud Italia
          </h1>
          <p className="admin-text-dim text-center mb-6 text-sm">Staff terminal</p>

          {locations.length > 1 && (
            <div className="flex gap-2 mb-5">
              {locations.map((l) => (
                <button
                  key={l.slug}
                  type="button"
                  onClick={() => pickLocation(l.slug)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
                    slug === l.slug
                      ? "bg-italia-red text-white"
                      : "glass-input admin-text-dim"
                  }`}
                >
                  {l.city}
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-center gap-2 mb-5" aria-label="PIN entry">
            {Array.from({ length: Math.max(PIN_MIN_LENGTH, pin.length) }).map((_, i) => (
              <span
                key={i}
                className={`w-3 h-3 rounded-full ${
                  i < pin.length ? "bg-italia-red" : "bg-white/20"
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => press(d)}
                className="py-4 glass-input rounded-xl text-xl font-semibold admin-text active:scale-95 transition"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={backspace}
              className="py-4 glass-input rounded-xl flex items-center justify-center admin-text-dim active:scale-95 transition"
              aria-label="Delete"
            >
              <Delete className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => press("0")}
              className="py-4 glass-input rounded-xl text-xl font-semibold admin-text active:scale-95 transition"
            >
              0
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={loading || pin.length < PIN_MIN_LENGTH}
              className="py-4 glass-btn text-white rounded-xl flex items-center justify-center disabled:opacity-50 active:scale-95 transition"
              aria-label="Log in"
            >
              <LogIn className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <p className="text-sm text-[var(--danger)] text-center bg-[var(--danger-soft)] rounded-lg py-2 mt-5">
              {error}
            </p>
          )}

          <p className="admin-text-dim text-center mt-6 text-xs">
            Manager or owner?{" "}
            <a href="/admin/login" className="underline">
              Sign in with email
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
