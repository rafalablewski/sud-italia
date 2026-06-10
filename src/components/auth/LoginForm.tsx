"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { AuthShell } from "./AuthShell";

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
    <AuthShell
      eyebrow={isAdmin ? "Owner console" : "Team sign-in"}
      footer={
        isAdmin ? (
          <p>
            Manager or staff? <a href="/login">Sign in here</a>
          </p>
        ) : (
          <>
            <p>
              Kitchen or till on a shared device? <a href="/terminal">Use the PIN terminal</a>
            </p>
            <p>
              Owner / admin? <a href="/admin/login">Admin sign-in</a>
            </p>
          </>
        )
      }
    >
      <form onSubmit={handleSubmit} className="av3-auth-form">
        <div className="av3-field">
          <label className="av3-field-label" htmlFor="login-email">
            {isAdmin ? "Email · optional" : "Email"}
          </label>
          <input
            id="login-email"
            type="email"
            placeholder={isAdmin ? "shared owner session if blank" : "you@ottaviano.pl"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="av3-input"
            disabled={loading || keyLoading}
            // Staff need an email; the owner door doesn't — so land the
            // caret where the user actually types first (MFA steals it below).
            autoFocus={!isAdmin && !mfaRequired}
          />
        </div>

        <div className="av3-field">
          <label className="av3-field-label" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="av3-input"
            disabled={loading || keyLoading}
            autoFocus={isAdmin && !mfaRequired}
          />
        </div>

        {mfaRequired && (
          <div className="av3-field">
            <label className="av3-field-label" htmlFor="login-totp">Authenticator code</label>
            <input
              id="login-totp"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="one-time-code"
              className="av3-input av3-auth-otp"
              disabled={loading || keyLoading}
              autoFocus
            />
          </div>
        )}

        {error && <p className="av3-auth-error">{error}</p>}

        <button type="submit" disabled={loading || keyLoading || !password} className="av3-btn av3-btn-primary">
          {loading ? "Signing in…" : (<><LogIn className="av3-btn-ico" /> {isAdmin ? "Enter console" : "Sign in"}</>)}
        </button>

        <button type="button" onClick={handleSecurityKey} disabled={loading || keyLoading} className="av3-auth-passkey">
          <KeyRound />
          {keyLoading ? "Waiting for key…" : "Use passkey / security key"}
        </button>
      </form>
    </AuthShell>
  );
}
