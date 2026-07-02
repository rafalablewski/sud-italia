"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreShell } from "@/core/shell/CoreShell";
import { CoreDialog } from "@/core/ui/Dialog";
import { useCoreToast } from "@/core/ui/Toast";
import type { CustomerIntelligence } from "@/lib/customer-intelligence";
import { guestTabs } from "./guestTabs";
import { GuestGlyph, type GuestGlyphName } from "./glyphs";

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
const TABS: { key: Tab; label: string; icon: GuestGlyphName }[] = [
  { key: "members", label: "Members", icon: "members" },
  { key: "wallets", label: "Wallets", icon: "wallets" },
  { key: "redemptions", label: "Redemptions", icon: "redemptions" },
  { key: "winback", label: "Win-back", icon: "winback" },
];
const TIERS = ["all", "platinum", "gold", "silver", "bronze"] as const;
// Glyph-only tier filter — "All" gets a layer-stack, each tier a gem tinted by
// its metal (`.t-<tier>`); the label survives as a tooltip + aria-label.
const TIER_META: Record<(typeof TIERS)[number], { label: string; icon: GuestGlyphName }> = {
  all: { label: "All tiers", icon: "tierAll" },
  platinum: { label: "Platinum", icon: "gem" },
  gold: { label: "Gold", icon: "gem" },
  silver: { label: "Silver", icon: "gem" },
  bronze: { label: "Bronze", icon: "gem" },
};
type SortKey = "points" | "spent" | "orders" | "name";
const SORTS: { key: SortKey; label: string; icon: GuestGlyphName }[] = [
  { key: "points", label: "Sort by points", icon: "points" },
  { key: "spent", label: "Sort by lifetime spend", icon: "spent" },
  { key: "orders", label: "Sort by orders", icon: "orders" },
  { key: "name", label: "Sort by name", icon: "name" },
];
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
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [winback, setWinback] = useState<WinBack[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"points" | "spent" | "orders" | "name">("points");
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

  useEffect(() => {
    if (tab !== "winback" || winback !== null) return;
    fetch("/api/admin/retention")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWinback(d?.queue?.candidates ?? []))
      .catch(() => setWinback([]));
  }, [tab, winback]);

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
    const ptsByPhone = new Map(members.map((m) => [m.phone, m.points]));
    const rows = w.members.map((mm) => ({ phone: mm.phone, name: mm.name ?? mm.phone, status: mm.status ?? "member", points: ptsByPhone.get(mm.phone) ?? 0 }));
    const pool = w.spendablePool ?? rows.reduce((s, r) => s + r.points, 0);
    return { id: w.id, rows, pool };
  }, [wallets, members]);

  const visibleMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = members.filter((m) => (tier === "all" || m.tier.toLowerCase() === tier) && (!q || m.name.toLowerCase().includes(q) || m.phone.includes(q)));
    rows.sort((a, b) => {
      switch (sort) {
        case "spent": return b.totalSpent - a.totalSpent;
        case "orders": return b.orders - a.orders;
        case "name": return a.name.localeCompare(b.name);
        default: return b.points - a.points;
      }
    });
    return rows;
  }, [members, tier, query, sort]);

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
        <div className="core-crumb">
          CORE — GUEST · LOYALTY · <b>liquid glass</b> · <span className="fix">dense console</span>
        </div>
        <div className="core-sectionhead">
          <h1>Guest · Loyalty</h1>
          <span className="sub">members · wallets · redemptions · win-back</span>
        </div>
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
            <span className="val amber">{stat.goldPlus}</span>
            <span className="delta">{stat.goldPct}% of members</span>
          </div>
          <div className="cell">
            <span className="lab">Avg points</span>
            <span className="val">{stat.avg.toLocaleString("pl-PL")}</span>
            <span className="delta">per member</span>
          </div>
          <div className="cell">
            <span className="lab">Wallets</span>
            <span className="val brand">{stat.wallets}</span>
            <span className="delta">shared balances</span>
          </div>
        </div>

        <div className="core-gfilters">
          {/* view switcher */}
          <div className="core-seg icons" role="group" aria-label="View">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={tab === t.key ? "on" : ""}
                onClick={() => setTab(t.key)}
                title={t.label}
                aria-label={t.label}
                aria-pressed={tab === t.key}
              >
                <GuestGlyph name={t.icon} />
              </button>
            ))}
          </div>
          {tab === "members" && (
            <>
              {/* search — grows to fill the bar */}
              <div className="core-search">
                <GuestGlyph name="search" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or phone…" aria-label="Search members" />
              </div>
              {/* tier filter — glyph-only, gem tinted per metal */}
              <div className="core-seg icons core-tierseg" role="group" aria-label="Tier">
                {TIERS.map((t) => (
                  <button
                    key={t}
                    className={`t-${t}${tier === t ? " on" : ""}`}
                    onClick={() => setTier(t)}
                    title={TIER_META[t].label}
                    aria-label={TIER_META[t].label}
                    aria-pressed={tier === t}
                  >
                    <GuestGlyph name={TIER_META[t].icon} />
                  </button>
                ))}
              </div>
              {/* sort */}
              <div className="core-seg icons" role="group" aria-label="Sort by">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    className={sort === s.key ? "on" : ""}
                    onClick={() => setSort(s.key)}
                    title={s.label}
                    aria-label={s.label}
                    aria-pressed={sort === s.key}
                  >
                    <GuestGlyph name={s.icon} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {tab === "members" && (
          <div className="core-loy-grid">
            <div className="core-crm-table-wrap">
              <table className="core-tbl">
                <thead>
                  <tr><th>Member</th><th>Tier</th><th className="num">Points</th><th className="num">Visits</th><th>Next reward</th><th></th></tr>
                </thead>
                <tbody>
                  {visibleMembers.map((m) => (
                    <tr key={m.phone} onClick={() => setAdjust(m)}>
                      <td><div className="core-cust-nm">{m.name}</div><div className="core-cust-sub">{m.phone}</div></td>
                      <td><span className={`core-tierbadge ${m.tier.toLowerCase()}`}>{m.tier}</span></td>
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
                    <span className="t">🎁 Family wallet</span>
                    <span className="fbadge">shared · {primaryWallet.rows.length}</span>
                  </div>
                  <div className="core-frame-b">
                    <div className="core-loy-pool">{primaryWallet.pool.toLocaleString("pl-PL")}<small> pts</small></div>
                    <div className="core-loy-poolsub">combined balance</div>
                    <div className="core-loy-wmembers">
                      {primaryWallet.rows.map((r) => (
                        <div className="row" key={r.phone}>
                          <span className={`core-g-av ${r.status === "owner" ? "g" : "s"}`}>{r.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                          <div className="who"><div className="nm">{r.name}</div><div className="mt">{r.status}</div></div>
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
                    <div className="core-tiermix" key={t.tier}>
                      <span className={`core-tierbadge ${t.tier}`} style={{ minWidth: 78, textAlign: "center" }}>{t.tier}</span>
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
