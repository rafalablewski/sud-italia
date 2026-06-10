"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, LogIn } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
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
    <AuthShell
      eyebrow="Staff terminal"
      footer={
        <p>
          Manager or owner? <a href="/login">Sign in with email</a>
        </p>
      }
    >
      {locations.length > 1 && (
        <div className="av3-auth-locs">
          {locations.map((l) => (
            <button
              key={l.slug}
              type="button"
              onClick={() => pickLocation(l.slug)}
              className={`av3-auth-loc${slug === l.slug ? " is-active" : ""}`}
              aria-pressed={slug === l.slug}
            >
              {l.city}
            </button>
          ))}
        </div>
      )}

      <div className="av3-auth-dots" aria-label="PIN entry">
        {Array.from({ length: Math.max(PIN_MIN_LENGTH, pin.length) }).map((_, i) => (
          <span key={i} className={`av3-auth-dot${i < pin.length ? " is-on" : ""}`} />
        ))}
      </div>

      <div className="av3-auth-keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="av3-auth-key">
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={backspace}
          className="av3-auth-key av3-auth-key-del"
          aria-label="Delete"
        >
          <Delete />
        </button>
        <button type="button" onClick={() => press("0")} className="av3-auth-key">
          0
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={loading || pin.length < PIN_MIN_LENGTH}
          className="av3-auth-key av3-auth-key-go"
          aria-label="Log in"
        >
          <LogIn />
        </button>
      </div>

      {error && <p className="av3-auth-error">{error}</p>}
    </AuthShell>
  );
}
