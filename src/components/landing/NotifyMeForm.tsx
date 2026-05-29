"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";

/**
 * V8 "Notify me when we open" email signup. Lives inside the closed-
 * location cards on the homepage LocationsGrid (the `.v8-loc-notify`
 * block already styles the headline above it).
 *
 * Submitted state flips to a basil-tinted confirmation line —
 * "Ti avviseremo — we'll let you know." No backend wiring yet; the
 * email is logged to the console as a TODO marker so a future
 * /api/notify-me endpoint can pick it up without changing the UI.
 */
export function NotifyMeForm({ city }: { city: string }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    // TODO: POST to /api/notify-me once the backend ledger lands.
    // The component-level wiring change is one-line at that point.
    console.log(`[Notify Me] ${email} wants to know when ${city} opens`);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="v8-notify-confirmed" role="status">
        <Check className="h-4 w-4" aria-hidden />
        <span>
          <em>Ti avviseremo</em> — we&apos;ll let you know.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="v8-notify">
      <div className="v8-notify-input-wrap">
        <Bell className="v8-notify-input-icon h-3.5 w-3.5" aria-hidden />
        <input
          type="email"
          placeholder="ale@esempio.it"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="v8-notify-input"
          aria-label="Email"
        />
      </div>
      <button
        type="submit"
        className="v8-notify-cta"
        disabled={!email.trim()}
      >
        Notify · avvisami
      </button>
    </form>
  );
}
