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

/**
 * V8 family wallet panel. Lives at the top of the /rewards Overview
 * tab. Three states:
 *   - No wallet → basil-tinted "Create family wallet" CTA.
 *   - Wallet exists, myStatus = "pending" → ochre confirm-code panel.
 *   - Wallet exists, myStatus = "active" → pool / spendable stats grid
 *     + member roster + invite (head only) / leave (member only).
 *
 * Every business behaviour stays: /api/customer/wallet/create / invite
 * / confirm / remove / leave, dev-mode invite code surfacing, refresh
 * via identify() after every mutation.
 */
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
    <div className="v8-rewards-wallet">
      <div className="v8-rewards-card-head" style={{ marginBottom: 4 }}>
        <h2 className="v8-rewards-card-title">
          <Users className="h-5 w-5" aria-hidden />
          Family wallet <span className="v8-rewards-section-it">· famiglia condivisa</span>
        </h2>
      </div>
      <p className="v8-rewards-wallet-sub">
        Up to {WALLET_MAX_PHONES} numbers share one points pool. Each person checks out with their own phone; points join the pool once they confirm the invite.
      </p>

      {!wallet && (
        <button type="button" disabled={busy} onClick={handleCreate} className="v8-rewards-wallet-create">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Create family wallet · crea famiglia
        </button>
      )}

      {wallet && wallet.myStatus === "pending" && (
        <div className="v8-rewards-wallet-pending">
          <p>
            <em>Invito in attesa</em> — you have a pending invite. Enter the 6-digit code you received.
          </p>
          <div className="v8-rewards-wallet-confirm-row">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Code"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ""))}
              className="v8-rewards-input"
              style={{ flex: 1, fontFamily: "var(--font-heading)", letterSpacing: 4 }}
            />
            <button
              type="button"
              disabled={busy || confirmCode.length < 4}
              onClick={handleConfirm}
              className="v8-rewards-wallet-confirm-cta"
            >
              Confirm · conferma
            </button>
          </div>
        </div>
      )}

      {wallet && wallet.myStatus === "active" && (
        <>
          <div className="v8-rewards-wallet-stats">
            <div className="v8-rewards-wallet-stat">
              <div className="v8-rewards-wallet-stat-label">Pool earned · accumulati</div>
              <div className="v8-rewards-wallet-stat-num is-ochre">{wallet.poolEarned.toLocaleString()} pts</div>
            </div>
            <div className="v8-rewards-wallet-stat">
              <div className="v8-rewards-wallet-stat-label">Available · disponibili</div>
              <div className="v8-rewards-wallet-stat-num is-espresso">{wallet.spendablePool.toLocaleString()} pts</div>
            </div>
          </div>

          <div className="v8-rewards-wallet-members-label">
            Members · <em style={{ fontFamily: "var(--font-body)", fontWeight: 400 }}>membri</em>
          </div>
          {wallet.members.map((m) => (
            <div key={m.phone} className="v8-rewards-wallet-member">
              <div className="v8-rewards-wallet-member-left">
                {m.isHead && <Crown className="h-4 w-4" aria-label="Wallet owner" />}
                <span className="v8-rewards-wallet-member-phone">{m.phone}</span>
                {m.status === "pending" && (
                  <span className="v8-rewards-wallet-member-pending">pending</span>
                )}
              </div>
              <span className="v8-rewards-wallet-member-pts">
                {m.contributedPoints.toLocaleString()} pts
              </span>
              {wallet.role === "head" && !m.isHead && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleRemove(m.phone)}
                  className="v8-rewards-wallet-member-remove"
                  aria-label="Remove member"
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {wallet.role === "head" && wallet.members.length < WALLET_MAX_PHONES && (
            <div className="v8-rewards-wallet-invite">
              <div className="v8-rewards-wallet-invite-label">
                Invite another number · invita un&apos;altra persona
              </div>
              <div className="v8-rewards-wallet-invite-row">
                <input
                  type="tel"
                  placeholder="+48 …"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  className="v8-rewards-input"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleInvite}
                  className="v8-rewards-wallet-invite-cta"
                >
                  Invite · invita
                </button>
              </div>
            </div>
          )}

          {wallet.role === "member" && (
            <button
              type="button"
              disabled={busy}
              onClick={handleLeave}
              className="v8-rewards-wallet-leave"
            >
              Leave this wallet · lascia
            </button>
          )}
        </>
      )}

      {msg && <p className="v8-rewards-wallet-msg">{msg}</p>}
    </div>
  );
}
