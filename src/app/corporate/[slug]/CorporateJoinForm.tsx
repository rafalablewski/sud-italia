"use client";

import { useState } from "react";

interface CorporateJoinFormProps {
  slug: string;
  companyName: string;
}

const PHONE_PATTERN = /^[\d\s\-()]{7,}$/;

/**
 * Employee-side join intake (audit §3.4). Collects a PL phone, hits
 * /api/corporate/[slug]/join which sends a 6-digit OTP via Twilio (no-op
 * when unset). The invitee then enters the OTP through the existing wallet
 * confirm flow at /rewards.
 */
export function CorporateJoinForm({ slug, companyName }: CorporateJoinFormProps) {
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const valid = PHONE_PATTERN.test(phone.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!valid) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/corporate/${slug}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: `+48${phone.trim()}` }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Could not send invite");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error — try again");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="mt-5 p-4 rounded-xl border border-italia-green/30 bg-italia-green/5">
        <p className="font-semibold text-sm text-italia-dark">Check your messages</p>
        <p className="text-xs text-italia-gray mt-1 leading-relaxed">
          We texted a 6-digit code. Open the loyalty page and enter it to finish joining {companyName}.
        </p>
        <a
          href="/rewards"
          className="inline-block mt-3 px-4 py-2 rounded-lg bg-italia-red text-white text-xs font-semibold"
        >
          Open /rewards
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 flex gap-2">
      <div className="flex items-center gap-0 flex-1 min-w-0">
        <span
          className="inline-flex items-center px-2.5 min-h-[44px] rounded-l-[0.625rem] border-y-[1.5px] border-l-[1.5px] border-r-0 border-gray-200 bg-gray-50 text-sm font-medium text-italia-gray select-none"
          aria-hidden
        >
          +48
        </span>
        <input
          type="tel"
          autoComplete="tel"
          placeholder="Your work phone (we'll text a join code)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="pub-input min-h-[44px] rounded-l-none text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={!valid || submitting}
        className="px-4 py-2 rounded-[0.625rem] bg-italia-red text-white font-semibold text-sm hover:bg-italia-red-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Sending…" : `Join ${companyName}`}
      </button>
      {error && (
        <p className="absolute mt-12 text-xs text-italia-red">{error}</p>
      )}
    </form>
  );
}
