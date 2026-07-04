"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreShell } from "@/core/shell/CoreShell";
import { CoreSurfToolbar } from "@/core/shell/CoreSurfToolbar";
import { RefreshIcon } from "@/core/shell/toolIcons";
import { useCoreCache } from "@/lib/useCoreCache";
import { CoreDialog } from "@/core/ui/Dialog";
import { useCoreToast } from "@/core/ui/Toast";
import type { CustomerIntelligence } from "@/lib/customer-intelligence";
import { guestTabs } from "./guestTabs";
import { GuestGlyph } from "./glyphs";

interface MemberRow {
  phone: string;
  name: string;
  points: number;
  tier: string;
  orders: number;
  totalSpent: number;
  lastOrder: string;
  source: "order" | "signup";
  locations: string[];
}
interface WalletSummary {
  id: string;
  headPhone: string;
  members: { phone: string; name?: string; status?: string }[];
  spendablePool?: number;
}
interface Redemption {
  id: string;
  phone: string;
  points: number;
  rewardId: string;
  createdAt: string;
}
interface WinBack {
  phone: string;
  name: string;
  risk: string;
  valueAtRiskGrosze: number;
  bonusPoints: number;
  channel: string;
  message: string;
  topDish: string;
  daysSinceLast: number;
}

type Tab = "members" | "wallets" | "redemptions" | "winback";
const TABS: { key: Tab; label: string }[] = [
  { key: "members", label: "Members" },
  { key: "wallets", label: "Wallets" },
  { key: "redemptions", label: "Redemptions" },
  { key: "winback", label: "Win-back" },
];
type SortKey = "points" | "orders" | "name";
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const initials = (name: string) =>
  name.trim().split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "··";
// Wallet avatars vary by metal in the mockup — map tier → gradient class.
const avTier = (tier: string): string => ({ platinum: "p", gold: "g", silver: "s", bronze: "b" }[tier] ?? "");
// Family-wallet SVG glyph (mockup uses a line wallet, not the 🎁 emoji).
const WalletGlyph = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--basil)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M17 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2M21 9v6h-5a3 3 0 0 1 0-6z" />
  </svg>
);
const zl = (g: number) => (g / 100).toLocaleString("pl-PL", { maximumFractionDigits: 0 });
const CHANNEL_LABEL: Record<string, string> = { "dine-in": "Dine-in", takeout: "Takeaway", delivery: "Delivery", whatsapp: "WhatsApp", web: "Web" };
const chanLabel = (k: string) => CHANNEL_LABEL[k] ?? (k ? k[0].toUpperCase() + k.slice(1) : "—");
const riskTone = (r: string) => (r === "lost" ? "bad" : r === "watch" ? "warn" : "ok");
const fmtDays = (d: number) => (d < 1 ? "today" : `${Math.round(d)}d ago`);

/**
 * Core · Guest · Loyalty — members, wallets, redemptions, win-back, wired to
 * the same engine as today's /core/guest/loyalty: GET members/wallets/
 * wallet-redemptions/retention, points via members/points, wallet dissolve via
 * DELETE wallets, win-back approve via POST retention. Own core- UI.
 */
interface Reward { id: string; name: string; pointsCost: number; }
export function CoreLoyalty({ rewards = [] }: { rewards?: Reward[] }) {
  const toast = useCoreToast();
  // Next reward for a member = the cheapest active reward they can't yet afford
  // (or the top one, fully earned) — drives the live NEXT REWARD progress bar.
  const nextReward = (points: number): { name: string; have: number; need: number } | null => {
    if (rewards.length === 0) return null;
    const next = rewards.find((r) => r.pointsCost > points);
    const r = next ?? rewards[rewards.length - 1];
    return { name: r.name, have: Math.min(points, r.pointsCost), need: r.pointsCost };
  };
  const [tab, setTab] = useState<Tab>("members");
  // Chain-wide loyalty data, cached so returning to Loyalty re-renders the last
  // roster/wallets/redemptions instantly; the mount/poll fetch revalidates.
  const [members, setMembers] = useCoreCache<MemberRow[]>("core:loyalty:members", []);
  const [wallets, setWallets] = useCoreCache<WalletSummary[]>("core:loyalty:wallets", []);
  const [redemptions, setRedemptions] = useCoreCache<Redemption[]>("core:loyalty:redemptions", []);
  // NOT cached: winback is lazily fetched by an effect gated on `winback === null`
  // (it refetches on remount). Caching it across the remount would pin it non-null
  // and it would never revalidate for the session — so it stays plain useState.
  const [winback, setWinback] = useState<WinBack[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Member smart-filter chip: "all" | "goldplus" | "risk" | "loc:<slug>"
  const [mfilter, setMfilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("points");
  const [adjust, setAdjust] = useState<MemberRow | null>(null);
  const [ptAmount, setPtAmount] = useState("");
  const [ptReason, setPtReason] = useState("");
  const [intelOf, setIntelOf] = useState<MemberRow | null>(null);
  const [intel, setIntel] = useState<CustomerIntelligence | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const openIntel = useCallback((m: MemberRow) => {
    setIntelOf(m);
    setIntel(null);
    setIntelLoading(true);
    fetch(`/api/admin/customer-intelligence?phone=${encodeURIComponent(m.phone)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIntel(d?.intelligence ?? null))
      .catch(() => setIntel(null))
      .finally(() => setIntelLoading(false));
  }, []);

  const load = useCallback(async () => {
    const [m, w, r] = await Promise.all([
      fetch("/api/admin/members").then((x) => (x.ok ? x.json() : { members: [] })),
      fetch("/api/admin/wallets").then((x) => (x.ok ? x.json() : { wallets: [] })),
      fetch("/api/admin/wallet-redemptions?limit=200").then((x) => (x.ok ? x.json() : { redemptions: [] })),
    ]);
    setMembers(m.members ?? []);
    setWallets(w.wallets ?? []);
    setRedemptions(r.redemptions ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Load the win-back queue for the Win-back tab AND for the "At churn risk"
  // member filter — the queue's phones are the real at-risk set (no fabrication).
  useEffect(() => {
    if (winback !== null) return;
    if (tab !== "winback" && mfilter !== "risk") return;
    fetch("/api/admin/retention")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWinback(d?.queue?.candidates ?? []))
      .catch(() => setWinback([]));
  }, [tab, winback, mfilter]);
  const riskPhones = useMemo(() => new Set((winback ?? []).map((w) => w.phone)), [winback]);
  // Distinct member locations → per-location filter chips (real data).
  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) for (const l of m.locations ?? []) set.add(l);
    return [...set].sort();
  }, [members]);

  // Dense-console stat strip + tier mix — every figure from live loyalty data
  // (Rule #1). Outstanding points are a real liability (100 pts = 1 zł).
  const stat = useMemo(() => {
    const liability = members.reduce((s, m) => s + m.points, 0);
    const goldPlus = members.filter((m) => ["gold", "platinum"].includes(m.tier.toLowerCase())).length;
    const avg = members.length ? Math.round(liability / members.length) : 0;
    return {
      members: members.length,
      liability,
      redemptions: redemptions.length,
      goldPlus,
      goldPct: members.length ? Math.round((goldPlus / members.length) * 100) : 0,
      avg,
      wallets: wallets.length,
    };
  }, [members, redemptions, wallets]);
  // Tier-mix breakdown for the right rail (mockup).
  const tierMix = useMemo(() => {
    const order = ["platinum", "gold", "silver", "bronze"] as const;
    const counts = Object.fromEntries(order.map((t) => [t, 0])) as Record<string, number>;
    for (const m of members) { const t = m.tier.toLowerCase(); if (t in counts) counts[t]++; }
    const max = Math.max(1, ...order.map((t) => counts[t]));
    return order.map((t) => ({ tier: t, count: counts[t], pct: Math.round((counts[t] / max) * 100) }));
  }, [members]);
  // Primary family wallet — the shared-balance panel, real when a wallet exists.
  const primaryWallet = useMemo(() => {
    const w = wallets[0];
    if (!w) return null;
    const byPhone = new Map(members.map((m) => [m.phone, m]));
    const rows = w.members.map((mm) => {
      const mem = byPhone.get(mm.phone);
      return {
        phone: mm.phone,
        name: mm.name ?? mem?.name ?? mm.phone,
        status: mm.status ?? "member",
        points: mem?.points ?? 0,
        tier: (mem?.tier ?? "").toLowerCase(),
      };
    });
    const pool = w.spendablePool ?? rows.reduce((s, r) => s + r.points, 0);
    // Household name from the owner's surname (derived, not fabricated).
    const owner = rows.find((r) => r.status === "owner") ?? rows[0];
    const surname = owner?.name ? owner.name.trim().split(/\s+/).slice(-1)[0] : "";
    const household = surname && /[a-zA-Zà-żÀ-Ż]/.test(surname) ? `${surname} household` : "";
    return { id: w.id, rows, pool, household };
  }, [wallets, members]);

  const visibleMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = members.filter((m) => {
      const t = m.tier.toLowerCase();
      const passFilter =
        mfilter === "all" ? true
        : mfilter === "goldplus" ? t === "gold" || t === "platinum"
        : mfilter === "risk" ? riskPhones.has(m.phone)
        : mfilter.startsWith("loc:") ? (m.locations ?? []).includes(mfilter.slice(4))
        : true;
      return passFilter && (!q || m.name.toLowerCase().includes(q) || m.phone.includes(q));
    });
    rows.sort((a, b) => {
      switch (sort) {
        case "orders": return b.orders - a.orders;
        case "name": return a.name.localeCompare(b.name);
        default: return b.points - a.points;
      }
    });
    return rows;
  }, [members, mfilter, riskPhones, query, sort]);
  const memberChips = useMemo(
    () => [
      { key: "all", label: "All tiers" },
      { key: "goldplus", label: "Gold+" },
      { key: "risk", label: "At churn risk" },
      ...locations.map((l) => ({ key: `loc:${l}`, label: cap(l) })),
    ],
    [locations],
  );
  const tabCount: Record<Tab, number | null> = {
    members: members.length,
    wallets: wallets.length,
    redemptions: redemptions.length,
    winback: winback?.length ?? null,
  };

  const applyPoints = async () => {
    const amt = parseInt(ptAmount, 10);
    if (!adjust || !Number.isFinite(amt) || amt === 0) return;
    const res = await fetch("/api/admin/members/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: adjust.phone, amount: amt, reason: ptReason.trim() || "Manual adjustment" }),
    });
    if (res.ok) {
      toast(`${amt > 0 ? "+" : ""}${amt} points · ${adjust.name}`, "success");
      setAdjust(null);
      setPtAmount("");
      setPtReason("");
      void load();
    } else toast("Could not adjust points", "danger");
  };

  const approve = async (w: WinBack) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: w.phone, bonusPoints: w.bonusPoints, channel: w.channel, message: w.message, risk: w.risk, valueAtRiskGrosze: w.valueAtRiskGrosze }),
      });
      if (res.ok) {
        setWinback((q) => (q ?? []).filter((x) => x.phone !== w.phone));
        toast(`Win-back sent · ${w.name}`, "success");
      } else toast("Could not send", "danger");
    } finally {
      setBusy(false);
    }
  };
  const sendAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setWinback([]);
        toast(`Sent ${d.sent ?? "all"} win-back offers`, "success");
      } else toast("Could not send", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CoreShell eyebrow="Guest Engagement" tabs={guestTabs("loyalty")}>
      <div className="core-guest-inbox">
        {/* Unified ActionBar — identity (Guest · Loyalty) · the Members|Wallets|
            Redemptions|Win-back view switch on the left · Refresh right. */}
        <CoreSurfToolbar
          ariaLabel="Loyalty controls"
          sub={<>members · wallets · redemptions · win-back</>}
          left={
            /* Members|Wallets|Redemptions|Win-back — the view switch. */
            <div className="core-seg" role="tablist" aria-label="Loyalty views">
              <span className="sglab">View</span>
              {TABS.map((t) => {
                const c = tabCount[t.key];
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    className={tab === t.key ? "on" : undefined}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label}
                    {c != null && <span className="c">{c.toLocaleString("pl-PL")}</span>}
                  </button>
                );
              })}
            </div>
          }
          right={<button type="button" className="core-iconbtn" title="Refresh" aria-label="Refresh" onClick={() => void load()}><RefreshIcon /></button>}
        />

        {/* dense-console 6-up stat strip — every figure from live loyalty data (Rule #1). */}
        <div className="core-statstrip" role="group" aria-label="Loyalty metrics">
          <div className="cell">
            <span className="lab">Members</span>
            <span className="val">{stat.members}</span>
            <span className="delta">{stat.wallets} wallet{stat.wallets === 1 ? "" : "s"}</span>
          </div>
          <div className="cell">
            <span className="lab">Points outstanding</span>
            <span className="val info">{stat.liability.toLocaleString("pl-PL")}</span>
            <span className="delta">≈ {Math.round(stat.liability / 100).toLocaleString("pl-PL")} zł liability</span>
          </div>
          <div className="cell">
            <span className="lab">Redemptions</span>
            <span className="val basil">{stat.redemptions}</span>
            <span className="delta">to date</span>
          </div>
          <div className="cell">
            <span className="lab">Gold+</span>
            <span className="val gold">{stat.goldPlus}</span>
            <span className="delta">{stat.goldPct}% of members</span>
          </div>
          {/* Breakage % = expired/never-redeemed share of issued points. No issuance
              ledger is exposed yet, so it's honestly flagged (DATA NEEDED). */}
          <div className="cell">
            <span className="lab">Breakage</span>
            <span className="val muted">—</span>
            <span className="delta">no issuance data</span>
          </div>
          <div className="cell">
            <span className="lab">Avg points</span>
            <span className="val">{stat.avg.toLocaleString("pl-PL")}</span>
            <span className="delta">per member</span>
          </div>
        </div>

        {tab === "members" && (
          <div className="core-loy-grid">
            <div className="core-crm-table-wrap">
              {/* table title bar — title + text tier-filter chips + compact search */}
              <div className="core-tbar">
                <span className="t">Members</span>
                <div className="r">
                  {memberChips.map((c) => (
                    <button
                      key={c.key}
                      className={`core-chipf${mfilter === c.key ? " on" : ""}`}
                      onClick={() => setMfilter(c.key)}
                      aria-pressed={mfilter === c.key}
                    >
                      {c.label}
                    </button>
                  ))}
                  <div className="core-search core-tbar-search">
                    <GuestGlyph name="search" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label="Search members" />
                  </div>
                </div>
              </div>
              <table className="core-tbl">
                <thead>
                  <tr>
                    <th className={`core-th-sort${sort === "name" ? " on" : ""}`} onClick={() => setSort("name")}>Member</th>
                    <th>Tier</th>
                    <th className={`num core-th-sort${sort === "points" ? " on" : ""}`} onClick={() => setSort("points")}>Points</th>
                    <th className={`num core-th-sort${sort === "orders" ? " on" : ""}`} onClick={() => setSort("orders")}>Visits</th>
                    <th style={{ width: 170 }}>Next reward</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMembers.map((m) => (
                    <tr key={m.phone} onClick={() => setAdjust(m)}>
                      <td>
                        <div className="core-mname">
                          <span className="core-g-av">{initials(m.name)}</span>
                          <div><div className="core-cust-nm">{m.name}</div><div className="core-cust-sub">{m.phone}</div></div>
                        </div>
                      </td>
                      <td><span className={`core-gem ${m.tier.toLowerCase()}`}><i className="g" />{m.tier.toUpperCase()}</span></td>
                      <td className="num mono">{m.points.toLocaleString("pl-PL")}</td>
                      <td className="num mono">{m.orders}</td>
                      <td>
                        {(() => {
                          const nr = nextReward(m.points);
                          if (!nr) return <span className="core-cust-sub">—</span>;
                          const pct = Math.round((nr.have / nr.need) * 100);
                          const tone = pct >= 100 ? "hi" : pct >= 60 ? "mid" : "lo";
                          return (
                            <div className="core-nextreward">
                              <div className="nr-h"><span className="nm">{nr.name}</span><span className="pr mono">{nr.have}/{nr.need}</span></div>
                              <div className="track"><i className={tone} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                            </div>
                          );
                        })()}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="core-intel-btn"
                          title="Customer intelligence"
                          aria-label={`Intelligence for ${m.name}`}
                          onClick={(e) => { e.stopPropagation(); openIntel(m); }}
                        >
                          ◆
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* right rail — family wallet (real when one exists) + tier mix */}
            <div className="core-loy-rail">
              {primaryWallet && (
                <div className="core-frame">
                  <div className="core-frame-h">
                    <span className="t"><WalletGlyph />Family wallet</span>
                    <span className="fbadge">shared · {primaryWallet.rows.length}</span>
                  </div>
                  <div className="core-frame-b">
                    <div className="core-loy-pool">{primaryWallet.pool.toLocaleString("pl-PL")}<small> pts</small></div>
                    <div className="core-loy-poolsub">{primaryWallet.household ? `${primaryWallet.household} · combined balance` : "combined balance"}</div>
                    <div className="core-avstack">
                      {primaryWallet.rows.slice(0, 4).map((r) => (
                        <span className={`core-g-av ${avTier(r.tier)}`} key={r.phone}>{initials(r.name)}</span>
                      ))}
                    </div>
                    <div className="core-loy-wmembers">
                      {primaryWallet.rows.map((r) => (
                        <div className="row" key={r.phone}>
                          <span className={`core-g-av ${avTier(r.tier)}`}>{initials(r.name)}</span>
                          <div className="who"><div className="nm">{r.name}</div><div className="mt">{r.status}{r.tier ? ` · ${cap(r.tier)}` : ""}</div></div>
                          <span className="pts mono">{r.points.toLocaleString("pl-PL")} pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="core-frame">
                <div className="core-frame-h"><span className="t">Tier mix</span></div>
                <div className="core-frame-b">
                  {tierMix.map((t) => (
                    <div className={`core-tiermix ${t.tier}`} key={t.tier}>
                      <span className="ml"><i className="g" />{t.tier.toUpperCase()}</span>
                      <div className="track"><i className={t.tier} style={{ width: `${t.pct}%` }} /></div>
                      <span className="mono n">{t.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "wallets" && (
          <div className="core-crm-table-wrap" style={{ padding: 16 }}>
            {wallets.length === 0 ? (
              <div className="core-kds-empty pad">No family wallets yet. Members pair up to 6 phones into a shared points wallet.</div>
            ) : (
              <div className="core-wallet-grid">
                {wallets.map((w) => (
                  <div className="core-wallet" key={w.id}>
                    <div className="core-wallet-h">
                      <span className="mono id">{w.id.slice(-6).toUpperCase()}</span>
                      <button className="core-btn ghost" onClick={async () => { const r = await fetch("/api/admin/wallets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletId: w.id }) }); if (r.ok) { setWallets((x) => x.filter((y) => y.id !== w.id)); toast("Wallet dissolved", "success"); } }}>Dissolve</button>
                    </div>
                    <div className="core-cust-sub">Head {w.headPhone}{w.spendablePool != null ? ` · ${zl(w.spendablePool)} zł pool` : ""}</div>
                    <ul className="core-wallet-members">
                      {w.members.map((m) => <li key={m.phone}><span className="mono">{m.phone}</span>{m.name && <span>{m.name}</span>}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "redemptions" && (
          <div className="core-crm-table-wrap">
            {redemptions.length === 0 ? (
              <div className="core-kds-empty pad">No redemptions yet. When members redeem rewards, the log appears here.</div>
            ) : (
              <table className="core-tbl">
                <thead><tr><th>Phone</th><th>Reward</th><th className="num">Points</th><th>When</th></tr></thead>
                <tbody>
                  {redemptions.map((r) => (
                    <tr key={r.id}><td className="mono">{r.phone}</td><td>{r.rewardId}</td><td className="num mono">−{r.points}</td><td className="core-cust-sub">{new Date(r.createdAt).toLocaleDateString("pl-PL")}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "winback" && (
          <div className="core-crm-table-wrap" style={{ padding: 16 }}>
            {winback === null ? (
              <div className="core-kds-empty pad">Loading win-back queue…</div>
            ) : winback.length === 0 ? (
              <div className="core-kds-empty pad">No win-back candidates — everyone is recent.</div>
            ) : (
              <>
                <div className="core-winback-head">
                  <span className="core-cust-sub">{winback.length} at-risk members · ranked by value at risk</span>
                  <button className="core-btn primary" disabled={busy} onClick={() => setConfirmAll(true)}>Send all ({winback.length})</button>
                </div>
                <div className="core-winback">
                  {winback.map((w) => (
                    <div className="core-wb" key={w.phone}>
                      <div className="core-wb-h">
                        <span className={`core-risk ${w.risk}`}>{w.risk}</span>
                        <b>{w.name}</b>
                        <span className="core-cust-sub">{w.daysSinceLast}d gone · usually {w.topDish}</span>
                        <span className="mono var">{zl(w.valueAtRiskGrosze)} zł at risk</span>
                      </div>
                      <div className="core-wb-msg">{w.message}</div>
                      <div className="core-wb-f">
                        <span className="core-cust-sub">+{w.bonusPoints} pts · {w.channel}</span>
                        <button className="core-btn primary sm" disabled={busy} onClick={() => void approve(w)}>Send</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <CoreDialog
        open={!!adjust}
        onClose={() => setAdjust(null)}
        title={`Adjust points · ${adjust?.name ?? ""}`}
        footer={
          <>
            <button className="core-btn ghost" onClick={() => setAdjust(null)}>Cancel</button>
            <button className="core-btn primary" onClick={() => void applyPoints()}>Apply</button>
          </>
        }
      >
        {adjust && (
          <div className="core-points-row" style={{ marginBottom: 0 }}>
            <input className="core-inp" value={ptAmount} onChange={(e) => setPtAmount(e.target.value)} placeholder="e.g. 50 or -20" autoFocus />
            <input className="core-inp" style={{ flex: 1 }} value={ptReason} onChange={(e) => setPtReason(e.target.value)} placeholder="Reason (e.g. comp for cold pizza)" />
          </div>
        )}
      </CoreDialog>

      {/* customer intelligence */}
      <CoreDialog open={intelOf != null} onClose={() => setIntelOf(null)} title={`Intelligence · ${intelOf?.name ?? ""}`} width={640}>
        {intelLoading ? (
          <div className="core-kds-empty pad">Modelling order history…</div>
        ) : !intel ? (
          <div className="core-kds-empty pad">Not enough order history to model this member yet.</div>
        ) : (
          <div className="core-intel">
            <div className="core-intel-headline">
              <p>{intel.nextOrder.headline}</p>
              <span className={`core-conf ${intel.confidence}`}>{intel.confidence} confidence</span>
            </div>

            <div className="core-intel-cards">
              <div className="core-intel-card">
                <div className="t">Churn risk</div>
                <div className={`core-intel-risk ${riskTone(intel.churn.risk)}`}>{intel.churn.risk}</div>
                <p className="core-cust-sub">{intel.churn.reason}</p>
              </div>
              <div className="core-intel-card">
                <div className="t">Cadence</div>
                <div className="core-intel-v">every ~{Math.round(intel.cadence.avgIntervalDays ?? 0)}d</div>
                <p className="core-cust-sub">last order {fmtDays(intel.cadence.daysSinceLast ?? 0)} · usually {intel.temporal.label}</p>
              </div>
            </div>

            <h4 className="core-profile-h">Channel mix</h4>
            <div className="core-intel-bars">
              {intel.channelMix.map((c) => (
                <div key={c.channel} className="core-intel-bar">
                  <span className="lab">{chanLabel(c.channel)}</span>
                  <div className="core-track"><i style={{ width: `${Math.round(c.share * 100)}%` }} /></div>
                  <span className="pv">{Math.round(c.share * 100)}%</span>
                </div>
              ))}
            </div>

            <h4 className="core-profile-h">Favourite dishes</h4>
            <div className="core-intel-items">
              {intel.topItems.slice(0, 5).map((it) => (
                <div key={it.name} className="core-intel-item">
                  <span>{it.name}</span>
                  <span className="core-cust-sub">{it.qty}× · {Math.round(it.share * 100)}%</span>
                </div>
              ))}
            </div>

            {intel.attachRules.length > 0 && (
              <>
                <h4 className="core-profile-h">Attach patterns</h4>
                <div className="core-intel-items">
                  {intel.attachRules.slice(0, 4).map((r, i) => (
                    <div key={i} className="core-intel-item">
                      <span>{r.item}</span>
                      <span className="core-cust-sub">{r.trigger} · {r.lift.toFixed(1)}× lift</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="core-intel-foot core-cust-sub">
              {intel.orderCount} orders · {zl(intel.avgOrderValueGrosze)} zł avg · prefers {chanLabel(intel.preferredChannel ?? "")}
              {intel.party.avg ? ` · party ~${intel.party.avg}` : ""}
            </div>
          </div>
        )}
      </CoreDialog>

      {/* send-all win-back confirm */}
      <CoreDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Send all win-back offers"
        footer={
          <>
            <button className="core-btn ghost" onClick={() => setConfirmAll(false)} disabled={busy}>Cancel</button>
            <button className="core-btn primary" disabled={busy} onClick={() => { setConfirmAll(false); void sendAll(); }}>
              Send {winback?.length ?? 0}
            </button>
          </>
        }
      >
        <p className="core-tender-note" style={{ lineHeight: 1.55 }}>
          Approves and sends a win-back offer to all <b>{winback?.length ?? 0}</b> at-risk members, each with its bonus
          points. Reachable members get an SMS/email; the rest are logged for the next visit.
        </p>
      </CoreDialog>
    </CoreShell>
  );
}
