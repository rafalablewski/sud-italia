"use client";

import { useState, useEffect } from "react";
import { useCustomer } from "@/store/customer";
import { Users, ShieldCheck, Loader2, KeyRound } from "lucide-react";
import { MAX_HOUSEHOLD_EXTRA_LABELS } from "@/lib/constants";

/**
 * Family wallet: up to 4 people on one number, shared points; only verified owner redeems / edits family list.
 */
export function HouseholdOwnerPanel() {
  const { customer, identify } = useCustomer();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>(["", "", ""]);

  const labelKey = (customer?.householdLabels ?? []).join("|");

  useEffect(() => {
    if (!customer) return;
    const next = [...(customer.householdLabels ?? []), "", "", ""].slice(
      0,
      MAX_HOUSEHOLD_EXTRA_LABELS
    );
    setDraft(next);
  }, [customer?.phone, labelKey]);

  if (!customer) return null;

  const isOwner = customer.isNumberOwner === true;
  const labels = customer.householdLabels ?? [];

  const syncDraftFromCustomer = () => {
    const next = [...labels, "", "", ""].slice(0, MAX_HOUSEHOLD_EXTRA_LABELS);
    setDraft(next);
  };

  const requestOtp = async () => {
    setBusy(true);
    setMsg(null);
    setDevHint(null);
    try {
      const res = await fetch("/api/customer/household/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: customer.phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Could not send code");
        return;
      }
      setMsg("Check your phone for a code. Enter it below.");
      if (typeof data.devCode === "string") {
        setDevHint(`Dev code: ${data.devCode}`);
      }
    } catch {
      setMsg("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (code.trim().length < 6) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/customer/household/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: customer.phone, code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Verification failed");
        return;
      }
      setCode("");
      setDevHint(null);
      await identify(customer.phone);
      setMsg("You are verified as the number owner. You can redeem rewards and manage family names.");
    } catch {
      setMsg("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const saveLabels = async () => {
    const cleaned = draft.map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/customer/household/labels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Could not save");
        return;
      }
      await identify(customer.phone);
      setMsg("Family list saved.");
    } catch {
      setMsg("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-italia-green/10 flex items-center justify-center flex-shrink-0">
          <Users className="h-5 w-5 text-italia-green" />
        </div>
        <div>
          <h2 className="font-heading font-bold text-lg text-italia-dark">
            Family on this number
          </h2>
          <p className="text-xs text-italia-gray mt-1 leading-relaxed">
            Up to four people can share one rewards balance (you plus{" "}
            {MAX_HOUSEHOLD_EXTRA_LABELS} names). Everyone earns on the same phone;
            only the verified number holder can redeem points and edit this list.
          </p>
        </div>
      </div>

      {isOwner ? (
        <div className="flex items-center gap-2 text-xs font-semibold text-italia-green">
          <ShieldCheck className="h-4 w-4" />
          Verified number owner
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-3 space-y-2">
          <p className="text-xs text-amber-950 font-medium flex items-center gap-2">
            <KeyRound className="h-4 w-4 flex-shrink-0" />
            Verify ownership to redeem rewards and unlock exclusive offers
          </p>
          <p className="text-[11px] text-amber-900/80">
            We send a one-time code (SMS when connected; dev mode shows code in console/API).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={requestOtp}
              className="px-3 py-2 rounded-xl bg-italia-red text-white text-xs font-semibold hover:bg-italia-red-dark disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send code"}
            </button>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="pub-input min-h-[40px] text-sm w-32"
            />
            <button
              type="button"
              disabled={busy || code.length !== 6}
              onClick={verifyOtp}
              className="px-3 py-2 rounded-xl bg-italia-green text-white text-xs font-semibold hover:bg-italia-green-dark disabled:opacity-50"
            >
              Verify
            </button>
          </div>
          {devHint && (
            <p className="text-[10px] font-mono text-italia-gray">{devHint}</p>
          )}
        </div>
      )}

      {isOwner && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-italia-gray uppercase tracking-wide">
            Extra earners (optional)
          </p>
          {draft.map((val, i) => (
            <input
              key={i}
              type="text"
              placeholder={`Family member ${i + 1}`}
              value={val}
              onChange={(e) => {
                const next = [...draft];
                next[i] = e.target.value;
                setDraft(next);
              }}
              className="pub-input min-h-[40px] text-sm w-full"
              maxLength={40}
            />
          ))}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={saveLabels}
              className="px-4 py-2 rounded-xl bg-italia-dark text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              Save family names
            </button>
            <button
              type="button"
              onClick={syncDraftFromCustomer}
              className="px-3 py-2 text-sm text-italia-gray hover:text-italia-dark"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className="text-xs text-italia-gray border-t border-gray-100 pt-3">{msg}</p>
      )}
    </div>
  );
}
