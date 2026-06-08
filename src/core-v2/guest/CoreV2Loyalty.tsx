"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreV2Shell } from "@/core-v2/shell/CoreV2Shell";
import { CoreV2Dialog } from "@/core-v2/ui/Dialog";
import { useCoreToast } from "@/core-v2/ui/Toast";
import type { CustomerIntelligence } from "@/lib/customer-intelligence";
import { guestTabs } from "./guestTabs";

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
const TIERS = ["all", "platinum", "gold", "silver", "bronze"];
const zl = (g: number) => (g / 100).toLocaleString("pl-PL", { maximumFractionDigits: 0 });
const CHANNEL_LABEL: Record<string, string> = { "dine-in": "Dine-in", takeout: "Takeaway", delivery: "Delivery", whatsapp: "WhatsApp", web: "Web" };
const chanLabel = (k: string) => CHANNEL_LABEL[k] ?? (k ? k[0].toUpperCase() + k.slice(1) : "—");
const riskTone = (r: string) => (r === "lost" ? "bad" : r === "watch" ? "warn" : "ok");
const fmtDays = (d: number) => (d < 1 ? "today" : `${Math.round(d)}d ago`);

/**
 * Core v2 · Guest · Loyalty — members, wallets, redemptions, win-back, wired to
 * the same engine as today's /core/guest/loyalty: GET members/wallets/
 * wallet-redemptions/retention, points via members/points, wallet dissolve via
 * DELETE wallets, win-back approve via POST retention. Own cv- UI.
 */
export function CoreV2Loyalty() {
  const toast = useCoreToast();
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

  const kpis = useMemo(() => {
    // Outstanding points are a real liability: the standard 100 pts = 1 zł.
    const liability = members.reduce((s, m) => s + m.points, 0);
    return [
      { l: "Members", v: String(members.length) },
      { l: "Points out", v: liability.toLocaleString("pl-PL"), s: `≈ ${Math.round(liability / 100).toLocaleString("pl-PL")} zł liability` },
      { l: "Redemptions", v: String(redemptions.length) },
      { l: "Wallets", v: String(wallets.length) },
    ] as { l: string; v: string; s?: string }[];
  }, [members, redemptions, wallets]);

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
    <CoreV2Shell
      eyebrow="Guest Engagement"
      tabs={guestTabs("loyalty")}
      subRight={
        <div className="cv-seg">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="cv-guest-inbox">
        <div className="cv-kpi-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {kpis.map((k) => (
            <div className="k" key={k.l}>
              <div className="kl">{k.l}</div>
              <div className="kv mono">{k.v}</div>
              {k.s && <div className="cv-kpi-sub">{k.s}</div>}
            </div>
          ))}
        </div>

        {tab === "members" && (
          <>
            <div className="cv-crm-filters">
              <div className="cv-search" style={{ maxWidth: 240 }}>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or phone…" />
              </div>
              <div className="cv-segs">
                {TIERS.map((t) => (
                  <button key={t} className={tier === t ? "on" : ""} onClick={() => setTier(t)}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <div className="cv-sp" />
              <div className="cv-seg">
                {(["points", "spent", "orders", "name"] as const).map((s) => (
                  <button key={s} className={sort === s ? "on" : ""} onClick={() => setSort(s)}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="cv-crm-table-wrap">
              <table className="cv-tbl">
                <thead>
                  <tr><th>Member</th><th>Tier</th><th className="num">Points</th><th className="num">Orders</th><th className="num">Lifetime</th><th>Last</th><th></th></tr>
                </thead>
                <tbody>
                  {visibleMembers.map((m) => (
                    <tr key={m.phone} onClick={() => setAdjust(m)}>
                      <td><div className="cv-cust-nm">{m.name}</div><div className="cv-cust-sub">{m.phone}</div></td>
                      <td><span className={`cv-tierbadge ${m.tier.toLowerCase()}`}>{m.tier}</span></td>
                      <td className="num mono">{m.points.toLocaleString("pl-PL")}</td>
                      <td className="num mono">{m.orders}</td>
                      <td className="num mono">{zl(m.totalSpent)} zł</td>
                      <td className="cv-cust-sub">{m.lastOrder}</td>
                      <td>
                        <button
                          type="button"
                          className="cv-intel-btn"
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
          </>
        )}

        {tab === "wallets" && (
          <div className="cv-crm-table-wrap" style={{ padding: 16 }}>
            {wallets.length === 0 ? (
              <div className="cv-kds-empty pad">No family wallets yet. Members pair up to 6 phones into a shared points wallet.</div>
            ) : (
              <div className="cv-wallet-grid">
                {wallets.map((w) => (
                  <div className="cv-wallet" key={w.id}>
                    <div className="cv-wallet-h">
                      <span className="mono id">{w.id.slice(-6).toUpperCase()}</span>
                      <button className="cv-btn ghost" onClick={async () => { const r = await fetch("/api/admin/wallets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletId: w.id }) }); if (r.ok) { setWallets((x) => x.filter((y) => y.id !== w.id)); toast("Wallet dissolved", "success"); } }}>Dissolve</button>
                    </div>
                    <div className="cv-cust-sub">Head {w.headPhone}{w.spendablePool != null ? ` · ${zl(w.spendablePool)} zł pool` : ""}</div>
                    <ul className="cv-wallet-members">
                      {w.members.map((m) => <li key={m.phone}><span className="mono">{m.phone}</span>{m.name && <span>{m.name}</span>}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "redemptions" && (
          <div className="cv-crm-table-wrap">
            {redemptions.length === 0 ? (
              <div className="cv-kds-empty pad">No redemptions yet. When members redeem rewards, the log appears here.</div>
            ) : (
              <table className="cv-tbl">
                <thead><tr><th>Phone</th><th>Reward</th><th className="num">Points</th><th>When</th></tr></thead>
                <tbody>
                  {redemptions.map((r) => (
                    <tr key={r.id}><td className="mono">{r.phone}</td><td>{r.rewardId}</td><td className="num mono">−{r.points}</td><td className="cv-cust-sub">{new Date(r.createdAt).toLocaleDateString("pl-PL")}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "winback" && (
          <div className="cv-crm-table-wrap" style={{ padding: 16 }}>
            {winback === null ? (
              <div className="cv-kds-empty pad">Loading win-back queue…</div>
            ) : winback.length === 0 ? (
              <div className="cv-kds-empty pad">No win-back candidates — everyone is recent.</div>
            ) : (
              <>
                <div className="cv-winback-head">
                  <span className="cv-cust-sub">{winback.length} at-risk members · ranked by value at risk</span>
                  <button className="cv-btn primary" disabled={busy} onClick={() => setConfirmAll(true)}>Send all ({winback.length})</button>
                </div>
                <div className="cv-winback">
                  {winback.map((w) => (
                    <div className="cv-wb" key={w.phone}>
                      <div className="cv-wb-h">
                        <span className={`cv-risk ${w.risk}`}>{w.risk}</span>
                        <b>{w.name}</b>
                        <span className="cv-cust-sub">{w.daysSinceLast}d gone · usually {w.topDish}</span>
                        <span className="mono var">{zl(w.valueAtRiskGrosze)} zł at risk</span>
                      </div>
                      <div className="cv-wb-msg">{w.message}</div>
                      <div className="cv-wb-f">
                        <span className="cv-cust-sub">+{w.bonusPoints} pts · {w.channel}</span>
                        <button className="cv-btn primary sm" disabled={busy} onClick={() => void approve(w)}>Send</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <CoreV2Dialog
        open={!!adjust}
        onClose={() => setAdjust(null)}
        title={`Adjust points · ${adjust?.name ?? ""}`}
        footer={
          <>
            <button className="cv-btn ghost" onClick={() => setAdjust(null)}>Cancel</button>
            <button className="cv-btn primary" onClick={() => void applyPoints()}>Apply</button>
          </>
        }
      >
        {adjust && (
          <div className="cv-points-row" style={{ marginBottom: 0 }}>
            <input className="cv-inp" value={ptAmount} onChange={(e) => setPtAmount(e.target.value)} placeholder="e.g. 50 or -20" autoFocus />
            <input className="cv-inp" style={{ flex: 1 }} value={ptReason} onChange={(e) => setPtReason(e.target.value)} placeholder="Reason (e.g. comp for cold pizza)" />
          </div>
        )}
      </CoreV2Dialog>

      {/* customer intelligence */}
      <CoreV2Dialog open={intelOf != null} onClose={() => setIntelOf(null)} title={`Intelligence · ${intelOf?.name ?? ""}`} width={640}>
        {intelLoading ? (
          <div className="cv-kds-empty pad">Modelling order history…</div>
        ) : !intel ? (
          <div className="cv-kds-empty pad">Not enough order history to model this member yet.</div>
        ) : (
          <div className="cv-intel">
            <div className="cv-intel-headline">
              <p>{intel.nextOrder.headline}</p>
              <span className={`cv-conf ${intel.confidence}`}>{intel.confidence} confidence</span>
            </div>

            <div className="cv-intel-cards">
              <div className="cv-intel-card">
                <div className="t">Churn risk</div>
                <div className={`cv-intel-risk ${riskTone(intel.churn.risk)}`}>{intel.churn.risk}</div>
                <p className="cv-cust-sub">{intel.churn.reason}</p>
              </div>
              <div className="cv-intel-card">
                <div className="t">Cadence</div>
                <div className="cv-intel-v">every ~{Math.round(intel.cadence.avgIntervalDays ?? 0)}d</div>
                <p className="cv-cust-sub">last order {fmtDays(intel.cadence.daysSinceLast ?? 0)} · usually {intel.temporal.label}</p>
              </div>
            </div>

            <h4 className="cv-profile-h">Channel mix</h4>
            <div className="cv-intel-bars">
              {intel.channelMix.map((c) => (
                <div key={c.channel} className="cv-intel-bar">
                  <span className="lab">{chanLabel(c.channel)}</span>
                  <div className="cv-track"><i style={{ width: `${Math.round(c.share * 100)}%` }} /></div>
                  <span className="pv">{Math.round(c.share * 100)}%</span>
                </div>
              ))}
            </div>

            <h4 className="cv-profile-h">Favourite dishes</h4>
            <div className="cv-intel-items">
              {intel.topItems.slice(0, 5).map((it) => (
                <div key={it.name} className="cv-intel-item">
                  <span>{it.name}</span>
                  <span className="cv-cust-sub">{it.qty}× · {Math.round(it.share * 100)}%</span>
                </div>
              ))}
            </div>

            {intel.attachRules.length > 0 && (
              <>
                <h4 className="cv-profile-h">Attach patterns</h4>
                <div className="cv-intel-items">
                  {intel.attachRules.slice(0, 4).map((r, i) => (
                    <div key={i} className="cv-intel-item">
                      <span>{r.item}</span>
                      <span className="cv-cust-sub">{r.trigger} · {r.lift.toFixed(1)}× lift</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="cv-intel-foot cv-cust-sub">
              {intel.orderCount} orders · {zl(intel.avgOrderValueGrosze)} zł avg · prefers {chanLabel(intel.preferredChannel ?? "")}
              {intel.party.avg ? ` · party ~${intel.party.avg}` : ""}
            </div>
          </div>
        )}
      </CoreV2Dialog>

      {/* send-all win-back confirm */}
      <CoreV2Dialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Send all win-back offers"
        footer={
          <>
            <button className="cv-btn ghost" onClick={() => setConfirmAll(false)} disabled={busy}>Cancel</button>
            <button className="cv-btn primary" disabled={busy} onClick={() => { setConfirmAll(false); void sendAll(); }}>
              Send {winback?.length ?? 0}
            </button>
          </>
        }
      >
        <p className="cv-tender-note" style={{ lineHeight: 1.55 }}>
          Approves and sends a win-back offer to all <b>{winback?.length ?? 0}</b> at-risk members, each with its bonus
          points. Reachable members get an SMS/email; the rest are logged for the next visit.
        </p>
      </CoreV2Dialog>
    </CoreV2Shell>
  );
}
