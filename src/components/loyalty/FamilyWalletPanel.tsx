"use client";

import { useState } from "react";
import { useCustomer } from "@/store/customer";
import { WALLET_MAX_PHONES } from "@/lib/constants";
import { Users, Crown, UserMinus, Loader2 } from "lucide-react";

function formatInvitePhone(raw: string): string {
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("48") && cleaned.length >= 11) return `+${cleaned}`;
  if (cleaned.length >= 9) return `+48${cleaned.slice(-9)}`;
  return raw.trim();
}

export function FamilyWalletPanel() {
  const { customer, identify } = useCustomer();
  const [inviteInput, setInviteInput] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const wallet = customer?.wallet ?? null;
  const phone = customer?.phone;

  const refresh = async () => {
    if (phone) await identify(phone);
  };

  const handleCreate = async () => {
    if (!phone) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/customer/wallet/create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Could not create wallet");
        return;
      }
      setMsg("Family wallet created. Invite up to three other numbers.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = async () => {
    if (!phone) return;
    const formatted = formatInvitePhone(inviteInput);
    if (formatted.replace(/\D/g, "").length < 9) {
      setMsg("Enter a valid Polish mobile number.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/customer/wallet/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formatted }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Invite failed");
        return;
      }
      setInviteInput("");
      if (process.env.NODE_ENV === "development" && data.devCode) {
        setMsg(`Invite sent. Dev code for ${formatted}: ${data.devCode}`);
      } else {
        setMsg(
          data.resent
            ? "New confirmation code sent (valid 10 min)."
            : "Invite sent. They must sign in with that number and enter the code."
        );
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!phone) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/customer/wallet/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: confirmCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Confirmation failed");
        return;
      }
      setConfirmCode("");
      setMsg("You joined the family wallet. Points from your orders now pool with the family.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (targetPhone: string) => {
    if (!phone) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/customer/wallet/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: targetPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Remove failed");
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!phone) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/customer/wallet/leave", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Could not leave wallet");
        return;
      }
      setMsg("You left the family wallet.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!customer) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-5 w-5 text-italia-gold" />
        <h2 className="font-heading font-bold text-lg text-italia-dark">
          Family wallet
        </h2>
      </div>
      <p className="text-sm text-italia-gray mb-4">
        Up to {WALLET_MAX_PHONES} numbers share one points pool. Each person checks out with their own
        phone; points go to the pool after they confirm the invite.
      </p>

      {!wallet && (
        <div className="space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={handleCreate}
            className="w-full px-4 py-3 rounded-xl bg-italia-gold text-white font-semibold hover:bg-italia-gold-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create family wallet
          </button>
        </div>
      )}

      {wallet && wallet.myStatus === "pending" && (
        <div className="space-y-3 rounded-xl border border-amber-200/80 bg-amber-50/90 p-4">
          <p className="text-sm font-medium text-italia-dark">
            You have a pending invite. Enter the 6-digit code you received.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Code"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ""))}
              className="pub-input flex-1 min-h-[44px] text-base"
            />
            <button
              type="button"
              disabled={busy || confirmCode.length < 4}
              onClick={handleConfirm}
              className="px-4 py-2 rounded-xl bg-italia-dark text-white font-semibold text-sm disabled:opacity-40"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {wallet && wallet.myStatus === "active" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-center text-sm">
            <div className="rounded-xl bg-italia-cream/80 p-3">
              <p className="text-italia-gray text-xs">Pool earned</p>
              <p className="font-heading font-bold text-italia-gold text-lg">
                {wallet.poolEarned.toLocaleString()} pts
              </p>
            </div>
            <div className="rounded-xl bg-italia-cream/80 p-3">
              <p className="text-italia-gray text-xs">Available to spend</p>
              <p className="font-heading font-bold text-italia-dark text-lg">
                {wallet.spendablePool.toLocaleString()} pts
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-italia-gray mb-2">Members</p>
            <ul className="space-y-2">
              {wallet.members.map((m) => (
                <li
                  key={m.phone}
                  className="flex items-center justify-between gap-2 text-sm rounded-lg border border-gray-100 px-3 py-2"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {m.isHead ? (
                      <span className="flex-shrink-0" title="Wallet owner">
                        <Crown className="h-4 w-4 text-italia-gold" aria-hidden />
                      </span>
                    ) : null}
                    <span className="truncate font-mono text-xs">{m.phone}</span>
                    {m.status === "pending" ? (
                      <span className="text-[10px] uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                        pending
                      </span>
                    ) : null}
                  </span>
                  <span className="text-italia-gold-dark font-semibold flex-shrink-0">
                    {m.contributedPoints.toLocaleString()} pts
                  </span>
                  {wallet.role === "head" && !m.isHead ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRemove(m.phone)}
                      className="p-1.5 rounded-lg text-italia-gray hover:bg-red-50 hover:text-italia-red"
                      aria-label="Remove member"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          {wallet.role === "head" && wallet.members.length < WALLET_MAX_PHONES && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-italia-gray">Invite another number</p>
              <div className="flex gap-2">
                <input
                  type="tel"
                  placeholder="+48 …"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  className="pub-input flex-1 min-h-[44px] text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleInvite}
                  className="px-4 py-2 rounded-xl bg-italia-red text-white font-semibold text-sm disabled:opacity-40"
                >
                  Invite
                </button>
              </div>
            </div>
          )}

          {wallet.role === "member" && (
            <button
              type="button"
              disabled={busy}
              onClick={handleLeave}
              className="text-sm text-italia-gray underline hover:text-italia-red"
            >
              Leave this wallet
            </button>
          )}
        </div>
      )}

      {msg && (
        <p className="mt-3 text-sm text-italia-dark bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
          {msg}
        </p>
      )}
    </div>
  );
}
