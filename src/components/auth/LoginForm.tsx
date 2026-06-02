"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";

/**
 * Shared sign-in form for both login doors:
 *  - portal="admin"  → /admin/login, owner-only (the API rejects non-owners).
 *  - portal="staff"  → /login, the universal door for managers + staff +
 *                       kitchen (and owners too); routes each role to its
 *                       surface (kitchen → KDS, floor → POS, otherwise /admin).
 *
 * Email + password (+ optional TOTP) or a passwordless passkey. The `portal`
 * is sent on every call so the server can enforce the owner-only admin door.
 */
export function LoginForm({ portal }: { portal: "admin" | "staff" }) {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [totp, setTotp] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [keyLoading, setKeyLoading] = useState(false);
  const router = useRouter();

  const isAdmin = portal === "admin";

  const land = (data: { landing?: unknown } | null) =>
    router.push(typeof data?.landing === "string" ? data.landing : "/admin");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          email: email.trim() || undefined,
          totp: totp.trim() || undefined,
          portal,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.mfaRequired) {
          setMfaRequired(true);
          setError(totp ? "Invalid MFA code" : "Enter the 6-digit code from your authenticator app");
          return;
        }
        setError(data?.error || "Invalid password");
        return;
      }
      land(data);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSecurityKey = async () => {
    if (!email.trim()) {
      setError("Enter your email, then tap your security key.");
      return;
    }
    setError("");
    setKeyLoading(true);
    try {
      const begin = await fetch("/api/admin/webauthn/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "begin", email: email.trim(), portal }),
      });
      const options = await begin.json().catch(() => null);
      if (!begin.ok) {
        setError(options?.error || "No security key registered for this email.");
        return;
      }
      const assertion = await startAuthentication({ optionsJSON: options });
      const finish = await fetch("/api/admin/webauthn/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish", email: email.trim(), response: assertion, portal }),
      });
      const data = await finish.json().catch(() => null);
      if (!finish.ok) {
        setError(data?.error || "Security key sign-in failed");
        return;
      }
      land(data);
    } catch (err) {
      setError(err instanceof Error && /abort|cancel/i.test(err.message) ? "Cancelled" : "Security key sign-in failed");
    } finally {
      setKeyLoading(false);
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
          <p className="admin-text-dim text-center mb-6 text-sm">
            {isAdmin ? "Admin sign-in (owner)" : "Team sign-in"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder={isAdmin ? "Email (optional for the shared owner session)" : "Email"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full px-4 py-3 glass-input rounded-xl text-base"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-4 py-3 glass-input rounded-xl text-base"
              autoFocus
            />

            {mfaRequired && (
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="6-digit authenticator code"
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                autoComplete="one-time-code"
                className="w-full px-4 py-3 glass-input rounded-xl text-base tracking-widest text-center"
                autoFocus
              />
            )}

            {error && (
              <p className="text-sm text-[var(--danger)] text-center bg-[var(--danger-soft)] rounded-lg py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 glass-btn text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? "Logging in..." : (<><LogIn className="h-4 w-4" /> Log In</>)}
            </button>

            <div className="flex items-center gap-3 my-1">
              <span className="flex-1 h-px bg-white/10" />
              <span className="admin-text-dim text-xs">or</span>
              <span className="flex-1 h-px bg-white/10" />
            </div>

            <button
              type="button"
              onClick={handleSecurityKey}
              disabled={keyLoading}
              className="w-full py-3 glass-input rounded-xl font-medium admin-text flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              {keyLoading ? "Waiting for key…" : "Sign in with passkey / security key"}
            </button>
          </form>

          <div className="admin-text-dim text-center mt-6 text-xs space-y-1">
            {isAdmin ? (
              <p>
                Manager or staff?{" "}
                <a href="/login" className="underline">Sign in here</a>
              </p>
            ) : (
              <>
                <p>
                  Kitchen or till on a shared device?{" "}
                  <a href="/terminal" className="underline">Use the PIN terminal</a>
                </p>
                <p>
                  Owner / admin?{" "}
                  <a href="/admin/login" className="underline">Admin sign-in</a>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
