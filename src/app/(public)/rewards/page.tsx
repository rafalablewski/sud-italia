"use client";

import { useEffect, useState } from "react";
import { useCustomer } from "@/store/customer";
import {
  LoyaltyTier,
  calculateTier,
  pointsToNextTier,
  getNextTier,
} from "@/lib/loyalty";
import { fetchPublicSettings, type PublicLoyaltySettings } from "@/lib/public-settings";
import {
  ACHIEVEMENTS,
  getActiveChallenges,
  generateReferralCode,
  getEarnedAchievements,
  REFERRAL_REWARD,
} from "@/lib/growth-engine";
import { COMBO_DEALS } from "@/lib/upsell";
import { FamilyWalletPanel } from "@/components/loyalty/FamilyWalletPanel";
import {
  Star,
  Trophy,
  Target,
  Gift,
  Share2,
  Copy,
  Check,
  Lock,
  Sparkles,
  Flame,
  Crown,
  Ticket,
  Percent,
  Clock,
  LogIn,
  UserPlus,
  LogOut,
  User,
  Heart,
} from "lucide-react";

function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000));
}

// QR placeholder cell map (5×5 grid; matches the previous component's
// pattern so the placeholder reads as a "QR code" without being one).
const QR_CELLS = new Set([0, 1, 2, 4, 5, 6, 10, 12, 14, 18, 19, 20, 22, 23, 24]);

function SignInSection() {
  const { identify } = useCustomer();
  const [phone, setPhone] = useState("");
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const getFullPhone = () => {
    const cleaned = phone.replace(/\D/g, "");
    return cleaned.startsWith("48") ? `+${cleaned}` : `+48${cleaned}`;
  };

  const handleSignIn = async () => {
    if (phone.replace(/\D/g, "").length < 7) return;
    setChecking(true);
    setNotFound(false);
    await identify(getFullPhone());
    setTimeout(() => setNotFound(true), 300);
    setChecking(false);
  };

  const handleSignUp = async () => {
    setChecking(true);
    await identify(getFullPhone(), true);
    setChecking(false);
  };

  return (
    <div className="v8-rewards-page">
      <div className="v8-rewards-signin">
        <div className="v8-rewards-signin-mark" aria-hidden="true">
          <Star className="h-10 w-10" fill="currentColor" fillOpacity="0.25" />
        </div>
        <h1 className="v8-rewards-signin-h1">
          <em>Soci e amici</em>
        </h1>
        <p className="v8-rewards-signin-sub">
          Sud Italia Rewards — earn points, unlock perks, share with the famiglia. Enter your phone to sign in or join (free).
        </p>

        <div className="v8-rewards-signin-row">
          <div className="v8-rewards-signin-phone">
            <span className="v8-rewards-signin-prefix" aria-hidden="true">+48</span>
            <input
              type="tel"
              placeholder="512 ··· ···"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setNotFound(false); }}
              onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
              className="v8-rewards-signin-input"
              aria-label="Phone number"
            />
          </div>
          <button
            onClick={handleSignIn}
            disabled={checking || phone.replace(/\D/g, "").length < 7}
            className="v8-rewards-signin-cta"
          >
            <LogIn className="h-4 w-4" />
            {checking ? "…" : "Sign in"}
          </button>
        </div>

        {notFound && (
          <div className="v8-rewards-signin-card">
            <p>
              <em>Nuovo qui?</em> Join Soci e amici — completely free.
            </p>
            <button
              onClick={handleSignUp}
              disabled={checking}
              className="v8-rewards-signin-join"
            >
              <UserPlus className="h-4 w-4" />
              Join · iscriviti
            </button>
          </div>
        )}

        <p className="v8-rewards-signin-hint">
          Just your phone number — no password, no email required.
        </p>
      </div>
    </div>
  );
}

function ProfileSection() {
  const { customer, updateProfile } = useCustomer();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(customer?.name || "");
  const [lastName, setLastName] = useState(customer?.lastName || "");
  const [nickname, setNickname] = useState(customer?.nickname || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!customer) return null;

  const handleSave = async () => {
    setSaving(true);
    const ok = await updateProfile({
      name: firstName.trim() || customer.name,
      lastName: lastName.trim(),
      nickname: nickname.trim(),
    });
    setSaving(false);
    if (ok) {
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="v8-rewards-card">
      <div className="v8-rewards-card-head">
        <h2 className="v8-rewards-card-title">
          <User className="h-5 w-5" aria-hidden />
          My profile <span className="v8-rewards-section-it">· il profilo</span>
        </h2>
        {saved ? (
          <span className="v8-rewards-profile-saved">
            <Check className="h-3 w-3" /> Saved
          </span>
        ) : !editing ? (
          <button onClick={() => setEditing(true)} className="v8-rewards-profile-edit">
            Edit · modifica
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="v8-rewards-profile-form">
          <div>
            <label className="v8-rewards-input-label">First name</label>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="v8-rewards-input" placeholder="First name" />
          </div>
          <div>
            <label className="v8-rewards-input-label">Last name</label>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="v8-rewards-input" placeholder="Last name" />
          </div>
          <div>
            <label className="v8-rewards-input-label">Nickname · soprannome</label>
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="v8-rewards-input" placeholder="What should we call you?" />
          </div>
          <div className="v8-rewards-form-actions">
            <button onClick={handleSave} disabled={saving} className="v8-rewards-save-cta">
              {saving ? "Saving…" : "Save · salva"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setFirstName(customer.name);
                setLastName(customer.lastName || "");
                setNickname(customer.nickname || "");
              }}
              className="v8-rewards-cancel-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="v8-rewards-profile-grid">
          <div>
            <div className="v8-rewards-profile-field-label">First name</div>
            <div className="v8-rewards-profile-field-val">{customer.name}</div>
          </div>
          <div>
            <div className="v8-rewards-profile-field-label">Last name</div>
            <div className="v8-rewards-profile-field-val">{customer.lastName || "—"}</div>
          </div>
          <div>
            <div className="v8-rewards-profile-field-label">Nickname</div>
            <div className="v8-rewards-profile-field-val">{customer.nickname || "—"}</div>
          </div>
          <div>
            <div className="v8-rewards-profile-field-label">Phone</div>
            <div className="v8-rewards-profile-field-val num">{customer.phone}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoyaltyCardSection() {
  return (
    <div className="v8-rewards-card">
      <div className="v8-rewards-card-head">
        <h2 className="v8-rewards-card-title">
          <Sparkles className="h-5 w-5" aria-hidden />
          Loyalty card <span className="v8-rewards-section-it">· tessera</span>
        </h2>
      </div>

      <div className="v8-rewards-loyalty-card">
        <div className="v8-rewards-loyalty-qr">
          <div className="v8-rewards-loyalty-qr-grid">
            {Array.from({ length: 25 }).map((_, i) => (
              <div
                key={i}
                className={`v8-rewards-loyalty-qr-cell${QR_CELLS.has(i) ? " is-on" : ""}`}
              />
            ))}
          </div>
          <div className="v8-rewards-loyalty-qr-center" aria-hidden="true">
            <span>SI</span>
          </div>
        </div>
        <p className="v8-rewards-loyalty-help">
          Show at pickup · <em>mostra al ritiro</em>
        </p>
        <p className="v8-rewards-loyalty-soon">QR scanning — coming soon · presto</p>
      </div>

      <button disabled className="v8-rewards-wallet-btn">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
        Add to Apple Wallet
        <span className="v8-rewards-wallet-soon">Soon</span>
      </button>
    </div>
  );
}

function RewardsDashboard() {
  const { customer, logout, identify } = useCustomer();
  const [copiedCode, setCopiedCode] = useState(false);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "rewards" | "achievements" | "offers">("overview");
  // Loyalty programme config (tier ladder + active rewards) — admin-edited
  // in /admin/loyalty, served via /api/settings/public. The dashboard
  // renders nothing until it arrives so we don't flash bronze defaults.
  const [loyalty, setLoyalty] = useState<PublicLoyaltySettings | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPublicSettings().then((s) => {
      if (!cancelled && s?.loyalty) setLoyalty(s.loyalty);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!customer || !loyalty) return null;

  const tiersCfg = loyalty.tiers;
  const tier = calculateTier(customer.points, tiersCfg);
  const tierConfig = tiersCfg[tier];
  const nextTier = getNextTier(tier);
  const toNext = pointsToNextTier(customer.points, tier, tiersCfg);
  const challenges = getActiveChallenges();
  const referralCode = generateReferralCode(customer.name);

  const earnedIds = getEarnedAchievements(customer);
  const earned = ACHIEVEMENTS.filter((a) => earnedIds.has(a.id));
  const locked = ACHIEVEMENTS.filter((a) => !earnedIds.has(a.id));

  const tierProgressPct = nextTier
    ? Math.min(
        ((customer.points - tiersCfg[tier].threshold) /
          (tiersCfg[nextTier].threshold - tiersCfg[tier].threshold)) * 100,
        100,
      )
    : 100;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Get ${REFERRAL_REWARD.refereeDiscountPLN} PLN off at Sud Italia!`,
        text: `Use my code ${referralCode} for ${REFERRAL_REWARD.refereeDiscountPLN} PLN off your first order at Sud Italia!`,
        url: `https://suditalia.pl?ref=${referralCode}`,
      }).catch(() => {});
    }
  };

  const handleRedeem = async (rewardId: string) => {
    setRedeemingId(rewardId);
    try {
      const res = await fetch("/api/customer/wallet/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardId }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Could not redeem");
        return;
      }
      await identify(customer.phone);
    } finally {
      setRedeemingId(null);
    }
  };

  const tabs = [
    { id: "overview" as const, label: "Overview", italian: "panoramica", icon: Star },
    { id: "rewards" as const, label: "Rewards", italian: "premi", icon: Gift },
    { id: "achievements" as const, label: "Achievements", italian: "traguardi", icon: Trophy },
    { id: "offers" as const, label: "Offers", italian: "offerte", icon: Percent },
  ];

  return (
    <div className="v8-rewards-page">
      {/* Tier card */}
      <div className="v8-rewards-tier">
        <div className="v8-rewards-tier-top">
          <div className="v8-rewards-tier-who">
            <div className="v8-rewards-tier-avatar" aria-hidden="true">
              <User className="h-6 w-6" />
            </div>
            <div>
              <div className="v8-rewards-tier-name">
                {customer.nickname || customer.name}
              </div>
              <div className="v8-rewards-tier-phone">{customer.phone}</div>
            </div>
          </div>
          <button onClick={logout} className="v8-rewards-tier-signout">
            <LogOut className="h-3 w-3" /> Sign out
          </button>
        </div>

        <div className="v8-rewards-tier-body">
          <div className="v8-rewards-tier-points">
            <div className="v8-rewards-tier-points-num">
              {customer.points.toLocaleString()}
            </div>
            <div className="v8-rewards-tier-points-label">
              <em>punti</em> — tier points earned
            </div>
            <div className="v8-rewards-tier-points-spendable">
              Available to spend:{" "}
              <strong>{customer.spendablePoints.toLocaleString()} pts</strong>
            </div>
          </div>
          <div>
            <span className="v8-rewards-tier-pill">
              <Crown className="h-4 w-4" />
              {tierConfig.label} <em style={{ opacity: 0.7 }}>· famiglia</em>
            </span>
            <div className="v8-rewards-tier-mult">{tierConfig.multiplier}× multiplier</div>
          </div>
        </div>

        {nextTier && (
          <div className="v8-rewards-tier-progress">
            <div className="v8-rewards-tier-progress-row">
              <span>{tierConfig.label}</span>
              <span>
                <strong>{toNext}</strong> pts to {tiersCfg[nextTier].label}
              </span>
            </div>
            <div className="v8-rewards-tier-rail">
              <div className="v8-rewards-tier-fill" style={{ width: `${tierProgressPct}%` }} />
            </div>
          </div>
        )}

        <div className="v8-rewards-tier-stats">
          <div className="v8-rewards-tier-stat">
            <div className="v8-rewards-tier-stat-num">{customer.ordersCount}</div>
            <div className="v8-rewards-tier-stat-label">Orders · ordini</div>
          </div>
          <div className="v8-rewards-tier-stat">
            <div className="v8-rewards-tier-stat-num">{tierConfig.multiplier}×</div>
            <div className="v8-rewards-tier-stat-label">Multiplier</div>
          </div>
          <div className="v8-rewards-tier-stat">
            <div className="v8-rewards-tier-stat-num">
              2 <Flame className="h-4 w-4" />
            </div>
            <div className="v8-rewards-tier-stat-label">Week streak</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="v8-rewards-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            className={`v8-rewards-tab${activeTab === t.id ? " is-on" : ""}`}
          >
            <t.icon className="h-4 w-4" />
            <span>{t.label}</span>
            <span className="v8-rewards-tab-it">· {t.italian}</span>
          </button>
        ))}
      </div>

      {/* === OVERVIEW TAB === */}
      {activeTab === "overview" && (
        <>
          <FamilyWalletPanel />

          <div className="v8-rewards-two-col">
            <ProfileSection />
            <LoyaltyCardSection />
          </div>

          <div className="v8-rewards-streak">
            <span className="v8-rewards-streak-icon" aria-hidden="true">
              <Flame className="h-7 w-7" />
            </span>
            <div>
              <div className="v8-rewards-streak-title">
                2-week streak · <em>due settimane</em>
              </div>
              <div className="v8-rewards-streak-sub">
                Order again this week to keep it going. <strong>3 weeks = +30 bonus pts.</strong>
              </div>
            </div>
          </div>

          <h2 className="v8-rewards-section-title">
            <Target className="h-5 w-5" aria-hidden />
            Weekly challenges <span className="v8-rewards-section-it">· sfide della settimana</span>
          </h2>
          <div className="v8-rewards-challenges" style={{ marginBottom: 22 }}>
            {challenges.map((ch) => (
              <div key={ch.id} className="v8-rewards-challenge">
                <div className="v8-rewards-challenge-head">
                  <div className="v8-rewards-challenge-title">{ch.title}</div>
                  <span className="v8-rewards-challenge-clock">
                    <Clock className="h-3 w-3" /> {daysUntil(ch.expiresAt)}d
                  </span>
                </div>
                <div className="v8-rewards-challenge-desc">{ch.description}</div>
                <div className="v8-rewards-challenge-rail">
                  <div className="v8-rewards-challenge-fill" style={{ width: "33%" }} />
                </div>
                <div className="v8-rewards-challenge-foot">
                  <span>
                    1 / <span className="num">{ch.target}</span>
                  </span>
                  <strong>+{ch.rewardPoints} pts</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="v8-rewards-referral">
            <h2 className="v8-rewards-referral-h2">
              <Share2 className="h-5 w-5" aria-hidden />
              Refer friends <em>· invita gli amici</em>
            </h2>
            <p className="v8-rewards-referral-sub">
              Share your code. Your friend gets <strong>{REFERRAL_REWARD.refereeDiscountPLN} PLN off</strong>, you get <strong>{REFERRAL_REWARD.referrerPoints} bonus pts</strong>.
            </p>
            <div className="v8-rewards-referral-row">
              <div className="v8-rewards-referral-code">{referralCode}</div>
              <button
                type="button"
                onClick={handleCopyCode}
                className={`v8-rewards-referral-copy${copiedCode ? " is-copied" : ""}`}
                aria-label="Copy referral code"
              >
                {copiedCode ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
            <button type="button" onClick={handleShare} className="v8-rewards-referral-share">
              <Share2 className="h-4 w-4" /> Share with friends · condividi
            </button>
          </div>

          <h2 className="v8-rewards-section-title">
            <Crown className="h-5 w-5" aria-hidden style={{ color: "var(--color-ochre)" }} />
            Tier roadmap <span className="v8-rewards-section-it">· la famiglia</span>
          </h2>
          <div className="v8-rewards-roadmap">
            {(["bronze", "silver", "gold", "platinum"] as LoyaltyTier[]).map((t) => {
              const cfg = tiersCfg[t];
              const isActive = t === tier;
              const isUnlocked = customer.points >= tiersCfg[t].threshold;
              const classes = [
                "v8-rewards-tier-tile",
                isActive ? "is-active" : "",
                !isUnlocked && !isActive ? "is-locked" : "",
              ].filter(Boolean).join(" ");
              return (
                <div key={t} className={classes}>
                  <div className="v8-rewards-tier-tile-head">
                    <span className="v8-rewards-tier-tile-name">
                      <Crown className="h-3 w-3" />
                      {cfg.label}
                    </span>
                    {isActive && <span className="v8-rewards-tier-tile-current">Current · attuale</span>}
                  </div>
                  <div className="v8-rewards-tier-tile-mult">{cfg.multiplier}× pts</div>
                  <div className="v8-rewards-tier-tile-sub">
                    <span className="num">{tiersCfg[t].threshold}</span> pts to unlock
                  </div>
                  <div className="v8-rewards-tier-tile-perks">
                    {cfg.perks.map((p, i) => (
                      <div key={i} className="v8-rewards-tier-tile-perk">
                        <Check className="h-3 w-3" /> {p}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* === REWARDS TAB === */}
      {activeTab === "rewards" && (
        <>
          <div className="v8-rewards-balance">
            <div className="v8-rewards-balance-label">
              Your balance <em>· il tuo saldo</em>
            </div>
            <div className="v8-rewards-balance-num">{customer.points.toLocaleString()} pts</div>
            <div className="v8-rewards-balance-sub">
              Available to spend: <strong>{customer.spendablePoints.toLocaleString()} pts</strong>
            </div>
          </div>

          <div className="v8-rewards-grid">
            {loyalty.rewards.map((reward) => {
              const canRedeem = customer.spendablePoints >= reward.pointsCost;
              return (
                <div key={reward.id} className={`v8-rewards-reward${canRedeem ? "" : " is-locked"}`}>
                  <div className="v8-rewards-reward-top">
                    <span className="v8-rewards-reward-icon" aria-hidden>
                      <Ticket className="h-5 w-5" />
                    </span>
                    <span className="v8-rewards-reward-cost num">{reward.pointsCost} pts</span>
                  </div>
                  <div className="v8-rewards-reward-name">{reward.name}</div>
                  <div className="v8-rewards-reward-desc">{reward.description}</div>
                  {canRedeem ? (
                    <button
                      type="button"
                      disabled={redeemingId === reward.id}
                      onClick={() => handleRedeem(reward.id)}
                      className="v8-rewards-reward-cta"
                    >
                      {redeemingId === reward.id ? "Redeeming…" : "Redeem now · riscatta"}
                    </button>
                  ) : (
                    <div className="v8-rewards-reward-locked">
                      <Lock className="h-4 w-4" />
                      Need <span className="num" style={{ fontWeight: 600 }}>{Math.max(0, reward.pointsCost - customer.spendablePoints)}</span> more pts
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* === ACHIEVEMENTS TAB === */}
      {activeTab === "achievements" && (
        <>
          <h2 className="v8-rewards-section-title">
            <Trophy className="h-5 w-5" aria-hidden style={{ color: "var(--color-ochre)" }} />
            Unlocked <span className="v8-rewards-section-it">· conquistati ({earned.length})</span>
          </h2>
          {earned.length > 0 ? (
            <div className="v8-rewards-achievements" style={{ marginBottom: 22 }}>
              {earned.map((a) => (
                <div key={a.id} className="v8-rewards-achievement">
                  <span className="v8-rewards-achievement-glyph">{a.emoji}</span>
                  <div className="v8-rewards-achievement-body">
                    <div className="v8-rewards-achievement-name">{a.name}</div>
                    <div className="v8-rewards-achievement-desc">{a.description}</div>
                    <div className="v8-rewards-achievement-pts">+{a.pointsReward} pts earned</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="v8-rewards-empty" style={{ marginBottom: 22 }}>
              Place your first order to start unlocking achievements.
            </div>
          )}

          <h2 className="v8-rewards-section-title">
            <Lock className="h-5 w-5" aria-hidden style={{ color: "var(--color-muted)" }} />
            Locked <span className="v8-rewards-section-it">· bloccati ({locked.length})</span>
          </h2>
          <div className="v8-rewards-achievements">
            {locked.map((a) => (
              <div key={a.id} className="v8-rewards-achievement is-locked">
                <span className="v8-rewards-achievement-glyph">{a.emoji}</span>
                <div className="v8-rewards-achievement-body">
                  <div className="v8-rewards-achievement-name">{a.name}</div>
                  <div className="v8-rewards-achievement-desc">{a.description}</div>
                  <div className="v8-rewards-achievement-pts">+{a.pointsReward} pts</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* === OFFERS TAB === */}
      {activeTab === "offers" && (
        <>
          <h2 className="v8-rewards-section-title">
            <Percent className="h-5 w-5" aria-hidden />
            Combo deals <span className="v8-rewards-section-it">· i combo</span>
          </h2>
          <div className="v8-rewards-combos" style={{ marginBottom: 22 }}>
            {COMBO_DEALS.map((deal) => (
              <div key={deal.id} className="v8-rewards-combo">
                <div className="v8-rewards-combo-head">
                  <div className="v8-rewards-combo-name">{deal.name}</div>
                  <span className="v8-rewards-combo-tag">−{deal.discountPercent}%</span>
                </div>
                <div className="v8-rewards-combo-desc">{deal.description}</div>
                <div className="v8-rewards-combo-cats">
                  Add {deal.categories.join(" + ")} — applies automatically.
                </div>
              </div>
            ))}
          </div>

          <h2 className="v8-rewards-section-title">
            <Sparkles className="h-5 w-5" aria-hidden style={{ color: "var(--color-ochre)" }} />
            Your tier perks <span className="v8-rewards-section-it">· i tuoi vantaggi</span>
          </h2>
          <div className="v8-rewards-perks-card" style={{ marginBottom: 18 }}>
            <span className="v8-rewards-tier-tile-name" style={{ marginBottom: 12, display: "inline-flex" }}>
              <Crown className="h-3 w-3" /> {tierConfig.label}
            </span>
            <div>
              {tierConfig.perks.map((perk, i) => (
                <div key={i} className="v8-rewards-perk-line">
                  <Check className="h-4 w-4" /> {perk}
                </div>
              ))}
            </div>
            {nextTier && (
              <div className="v8-rewards-next-tier">
                <div className="v8-rewards-next-tier-label">
                  Reach <strong>{tiersCfg[nextTier].label}</strong> (<span className="num">{toNext}</span> more pts) to unlock:
                </div>
                {tiersCfg[nextTier].perks.map((perk, i) => (
                  <div key={i} className="v8-rewards-perk-line is-locked">
                    <Lock className="h-3 w-3" /> {perk}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="v8-rewards-refer-card">
            <div className="v8-rewards-refer-card-icon" aria-hidden="true">
              <Heart className="h-7 w-7" fill="currentColor" fillOpacity="0.25" />
            </div>
            <h3 className="v8-rewards-refer-card-h3">
              Give <em>{REFERRAL_REWARD.refereeDiscountPLN} PLN</em>, get <em>{REFERRAL_REWARD.referrerPoints} pts</em>
            </h3>
            <p className="v8-rewards-refer-card-sub">
              Share your referral code with friends. They save, you earn.
            </p>
            <button type="button" onClick={handleShare} className="v8-rewards-referral-share" style={{ maxWidth: 280, margin: "0 auto" }}>
              <Share2 className="h-4 w-4" /> Share code · condividi
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function RewardsPage() {
  const { customer, loading } = useCustomer();

  if (loading) {
    return <div className="v8-rewards-loading">Loading…</div>;
  }

  return customer ? <RewardsDashboard /> : <SignInSection />;
}
