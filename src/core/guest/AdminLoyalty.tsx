"use client";

import Link from "next/link";
import { useAdminBase } from "@/shared/useAdminBase";
import { withAdminBase } from "@/lib/admin-base";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Coins,
  Heart,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  TrendingDown,
  Trash2,
  Wallet,
} from "lucide-react";
import { CoreShell } from "@/core/shell/CoreShell";
import { GuestViewNav } from "@/core/guest/GuestViewNav";
import { Button, Dialog } from "@/ui";
import { useToast } from "@/ui/Toast";
import type { CustomerIntelligence } from "@/lib/customer-intelligence";
import type { WinBackCandidate, WinBackQueue } from "@/lib/retention";

type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

interface MemberRow {
  phone: string;
  name: string;
  points: number;
  tier: LoyaltyTier;
  orders: number;
  totalSpent: number;
  lastOrder: string;
  source: "order" | "signup";
  locations: string[];
}

interface WalletMember {
  phone: string;
  name?: string;
  status: "pending" | "active";
  invitedAt?: string;
  confirmedAt?: string;
}

interface WalletSummary {
  id: string;
  headPhone: string;
  createdAt: string;
  members: WalletMember[];
  pointsTotal?: number;
}

interface Redemption {
  id: string;
  walletId: string | null;
  phone: string;
  points: number;
  rewardId: string;
  createdAt: string;
}

type TierFilter = "all" | LoyaltyTier;
type TabKey = "members" | "wallets" | "redemptions" | "winback";
type SortKey = "name" | "tier" | "points" | "orders" | "spent" | "last";

const TIER_LABEL: Record<LoyaltyTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

/** Tier → core-suite `.badge` tone class (bronze/silver/gold added in suite.css). */
const TIER_BADGE: Record<LoyaltyTier, string> = {
  bronze: "bronze",
  silver: "silver",
  gold: "gold",
  platinum: "platinum",
};

const fmtPLN0 = (g: number) => `${Math.round(g / 100).toLocaleString("pl-PL")} zł`;
const fmtNum = (n: number) => n.toLocaleString("pl-PL");

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Loyalty — the fourth view of the unified Guest Engagement hub (Inbox /
 * Guests / Loyalty / Concierge). It shares the canonical customer record and
 * the one loyalty-points ledger with the other Guest modules (see
 * docs/design-system/core/modules/loyalty.md). The roster, family wallets and
 * redemption log live here; the programme *config* (tiers / rewards / referral)
 * is edited at /admin/growth.
 */
export function AdminLoyalty() {
  const toast = useToast();
  const base = useAdminBase();
  const [tab, setTab] = useState<TabKey>("members");

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "points", dir: "desc" });

  const [pointsDialog, setPointsDialog] = useState<MemberRow | null>(null);
  const [intelMember, setIntelMember] = useState<MemberRow | null>(null);
  const [pendingDeleteWallet, setPendingDeleteWallet] = useState<WalletSummary | null>(null);

  // Win-back queue is heavier (scans all orders), so it loads lazily the first
  // time the operator opens the tab, and refreshes after an action.
  const [winback, setWinback] = useState<WinBackQueue | null>(null);
  const [winbackLoading, setWinbackLoading] = useState(false);
  const [comms, setComms] = useState<{ sms: boolean; email: boolean } | null>(null);
  const [actingPhone, setActingPhone] = useState<string | null>(null);
  const [confirmSendAll, setConfirmSendAll] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);

  const loadWinback = useCallback(async () => {
    setWinbackLoading(true);
    try {
      const res = await fetch("/api/admin/retention");
      const j = res.ok ? await res.json() : null;
      setWinback((j?.queue as WinBackQueue) ?? null);
      setComms((j?.comms as { sms: boolean; email: boolean }) ?? null);
    } finally {
      setWinbackLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "winback" && winback === null && !winbackLoading) void loadWinback();
  }, [tab, winback, winbackLoading, loadWinback]);

  const approveWinBack = async (cand: WinBackCandidate) => {
    setActingPhone(cand.phone);
    try {
      const res = await fetch("/api/admin/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cand.phone,
          bonusPoints: cand.bonusPoints,
          channel: cand.channel ?? "none",
          message: cand.message,
          risk: cand.risk,
          valueAtRiskGrosze: cand.valueAtRiskGrosze,
        }),
      });
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { sent?: boolean };
        toast.success(
          j.sent ? "Win-back sent" : "Incentive granted",
          j.sent
            ? `${(cand.channel ?? "").toUpperCase()} · +${cand.bonusPoints} pts · ${cand.name}`
            : `+${cand.bonusPoints} pts · ${cand.name}${cand.channel ? " · message logged (no provider)" : ""}`,
        );
        setWinback((q) => {
          if (!q) return q;
          const candidates = q.candidates.filter((c) => c.phone !== cand.phone);
          return {
            ...q,
            candidates,
            summary: {
              count: candidates.length,
              totalValueAtRiskGrosze: candidates.reduce((s, c) => s + c.valueAtRiskGrosze, 0),
              reachable: candidates.filter((c) => c.channel !== null).length,
              needsConsent: candidates.filter((c) => c.channel === null).length,
            },
          };
        });
      } else {
        toast.error("Could not run win-back");
      }
    } finally {
      setActingPhone(null);
    }
  };

  const sendAllReachable = async () => {
    setSendingAll(true);
    try {
      const res = await fetch("/api/admin/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" }),
      });
      if (res.ok) {
        const j = (await res.json()) as { processed: number; sent: number };
        toast.success("Win-back run complete", `${j.sent}/${j.processed} sent`);
        await loadWinback();
      } else {
        toast.error("Could not run win-back");
      }
    } finally {
      setSendingAll(false);
      setConfirmSendAll(false);
    }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [m, w, r] = await Promise.all([
        fetch("/api/admin/members").then((res) => (res.ok ? res.json() : { members: [] })),
        fetch("/api/admin/wallets").then((res) => (res.ok ? res.json() : { wallets: [] })),
        fetch("/api/admin/wallet-redemptions").then((res) => (res.ok ? res.json() : { redemptions: [] })),
      ]);
      setMembers(Array.isArray(m.members) ? m.members : []);
      setWallets(Array.isArray(w.wallets) ? w.wallets : []);
      setRedemptions(Array.isArray(r.redemptions) ? r.redemptions : Array.isArray(r) ? r : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (tierFilter !== "all" && m.tier !== tierFilter) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.phone.includes(q);
    });
  }, [members, query, tierFilter]);

  const sortedMembers = useMemo(() => {
    const { key, dir } = sort;
    const tierRank: Record<LoyaltyTier, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3 };
    const val = (m: MemberRow): number | string => {
      switch (key) {
        case "name":
          return m.name || "";
        case "tier":
          return tierRank[m.tier] ?? 0;
        case "points":
          return m.points ?? 0;
        case "orders":
          return m.orders ?? 0;
        case "spent":
          return m.totalSpent ?? 0;
        case "last":
          return m.lastOrder || "";
      }
    };
    const arr = [...filteredMembers].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredMembers, sort]);

  const sortedRedemptions = useMemo(
    () => [...redemptions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [redemptions],
  );

  const tierCounts = useMemo(() => {
    const c: Record<LoyaltyTier, number> & { all: number } = {
      all: members.length,
      bronze: 0,
      silver: 0,
      gold: 0,
      platinum: 0,
    };
    for (const m of members) c[m.tier]++;
    return c;
  }, [members]);

  const totals = useMemo(() => {
    const spent = members.reduce((acc, m) => acc + m.totalSpent, 0);
    const orders = members.reduce((acc, m) => acc + m.orders, 0);
    const repeat = members.filter((m) => m.orders >= 2).length;
    return { spent, orders, repeat };
  }, [members]);

  const submitPoints = async (amount: number, reason: string) => {
    if (!pointsDialog) return;
    const res = await fetch("/api/admin/members/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: pointsDialog.phone, amount, reason: reason.trim() || undefined }),
    });
    if (res.ok) {
      toast.success("Points adjusted", `${amount > 0 ? "+" : ""}${amount}`);
      setPointsDialog(null);
      await fetchAll();
    } else {
      toast.error("Could not adjust points");
    }
  };

  const dissolveWallet = async () => {
    if (!pendingDeleteWallet) return;
    const res = await fetch("/api/admin/wallets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletId: pendingDeleteWallet.id }),
    });
    if (res.ok) {
      toast.success("Wallet dissolved");
      await fetchAll();
    } else {
      toast.error("Could not dissolve wallet");
    }
    setPendingDeleteWallet(null);
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" || key === "tier" || key === "last" ? "asc" : "desc" },
    );

  const sortArrow = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "");

  const kpis: { l: string; v: string; sub?: string }[] = [
    { l: "Total members", v: fmtNum(members.length), sub: `${totals.repeat} repeat buyers` },
    { l: "Platinum", v: fmtNum(tierCounts.platinum) },
    { l: "Gold", v: fmtNum(tierCounts.gold) },
    { l: "Lifetime spend", v: fmtPLN0(totals.spent) },
  ];

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: "members", label: "Members", count: members.length },
    { key: "wallets", label: "Family wallets", count: wallets.length },
    { key: "redemptions", label: "Redemptions", count: redemptions.length },
    { key: "winback", label: "Win-back", count: winback?.summary.count },
  ];

  const TIER_CHIPS: { key: TierFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: tierCounts.all },
    { key: "platinum", label: "Platinum", count: tierCounts.platinum },
    { key: "gold", label: "Gold", count: tierCounts.gold },
    { key: "silver", label: "Silver", count: tierCounts.silver },
    { key: "bronze", label: "Bronze", count: tierCounts.bronze },
  ];

  return (
    <CoreShell
      eyebrow="Guest Engagement"
      viewnav={<GuestViewNav current="loyalty" counts={{ loyalty: members.length }} />}
      right={
        <button type="button" className="btn ghost icon" onClick={() => void fetchAll()} title="Refresh">
          <RefreshCw className={loading ? "crm-spin" : ""} />
        </button>
      }
    >
      <div className="loy">
        <div className="loy-kpis">
          {kpis.map((k) => (
            <div key={k.l} className="bk">
              <div className="l">{k.l}</div>
              <div className="v tnum">{k.v}</div>
              {k.sub && <div className="sub">{k.sub}</div>}
            </div>
          ))}
        </div>

        <p className="loy-sub">
          Members, family wallets and redemptions. Tiers are calculated from earned + manually-adjusted
          points — the same ledger guests earn on at the POS, online, or by WhatsApp. To edit the
          programme itself (tier labels / thresholds / multipliers / perks + the rewards catalogue),
          go to <Link href={withAdminBase(base, "/admin/growth")}>/admin/growth</Link>.
        </p>

        <div className="loy-head">
          <div className="seg">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={tab === t.key ? "on" : ""}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {typeof t.count === "number" && <span className="n">{t.count}</span>}
              </button>
            ))}
          </div>
        </div>

        {tab === "members" && (
          <>
            <div className="loy-filters">
              <div className="book-search">
                <Search />
                <input
                  className="input"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or phone…"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="filters">
                {TIER_CHIPS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`fchip${tierFilter === c.key ? " on" : ""}`}
                    aria-pressed={tierFilter === c.key}
                    onClick={() => setTierFilter(c.key)}
                  >
                    {c.label}
                    <span className="n">{c.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="loy-body">
              {loading ? (
                <div className="pane-msg">Loading Loyalty…</div>
              ) : sortedMembers.length === 0 ? (
                <div className="loy-empty">
                  <Heart />
                  <div className="t">{members.length === 0 ? "No members yet" : "No matches"}</div>
                  <div className="d">
                    {members.length === 0
                      ? "Members are auto-enrolled when they place a phone-verified order."
                      : "Try clearing the search or tier filter."}
                  </div>
                </div>
              ) : (
                <div className="loy-card">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>
                          <button type="button" className="th-sort" onClick={() => toggleSort("name")}>
                            Member{sortArrow("name")}
                          </button>
                        </th>
                        <th>
                          <button type="button" className="th-sort" onClick={() => toggleSort("tier")}>
                            Tier{sortArrow("tier")}
                          </button>
                        </th>
                        <th style={{ textAlign: "right" }}>
                          <button type="button" className="th-sort" onClick={() => toggleSort("points")}>
                            Points{sortArrow("points")}
                          </button>
                        </th>
                        <th style={{ textAlign: "right" }}>
                          <button type="button" className="th-sort" onClick={() => toggleSort("orders")}>
                            Orders{sortArrow("orders")}
                          </button>
                        </th>
                        <th style={{ textAlign: "right" }}>
                          <button type="button" className="th-sort" onClick={() => toggleSort("spent")}>
                            Lifetime spend{sortArrow("spent")}
                          </button>
                        </th>
                        <th>
                          <button type="button" className="th-sort" onClick={() => toggleSort("last")}>
                            Last order{sortArrow("last")}
                          </button>
                        </th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMembers.map((m) => (
                        <tr key={m.phone}>
                          <td>
                            <Link href={`${withAdminBase(base, "/admin/customers")}/${encodeURIComponent(m.phone)}`} className="loy-member">
                              <span className="nm">{m.name || "Guest"}</span>
                              <span className="mono sub">{m.phone}</span>
                            </Link>
                          </td>
                          <td>
                            <span className={`badge ${TIER_BADGE[m.tier]}`}>
                              <i className="d" />
                              {TIER_LABEL[m.tier]}
                            </span>
                          </td>
                          <td className="num" style={{ textAlign: "right" }}>
                            {fmtNum(m.points)}
                          </td>
                          <td className="num" style={{ textAlign: "right" }}>
                            {fmtNum(m.orders)}
                          </td>
                          <td className="num" style={{ textAlign: "right" }}>
                            {fmtPLN0(m.totalSpent)}
                          </td>
                          <td className="muted">{fmtDate(m.lastOrder)}</td>
                          <td style={{ textAlign: "right" }}>
                            <div className="loy-row-actions">
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() => setIntelMember(m)}
                                title="Customer intelligence"
                              >
                                <Brain width={14} height={14} />
                                Intelligence
                              </button>
                              <button type="button" className="btn ghost" onClick={() => setPointsDialog(m)}>
                                <Coins width={14} height={14} />
                                Adjust
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "wallets" &&
          (loading ? (
            <div className="loy-body">
              <div className="pane-msg">Loading wallets…</div>
            </div>
          ) : wallets.length === 0 ? (
            <div className="loy-body">
              <div className="loy-empty">
                <Wallet />
                <div className="t">No family wallets yet</div>
                <div className="d">Members can pair up to 6 phones into a shared points wallet via the customer site.</div>
              </div>
            </div>
          ) : (
            <div className="loy-wallets">
              {wallets.map((w) => (
                <div key={w.id} className="loy-wallet">
                  <div className="loy-wallet-h">
                    <Wallet width={15} height={15} />
                    <div>
                      <div className="id mono">{w.id.slice(-6).toUpperCase()}</div>
                      <div className="sub">Head {w.headPhone}</div>
                    </div>
                    <button type="button" className="btn ghost" onClick={() => setPendingDeleteWallet(w)}>
                      <Trash2 width={14} height={14} />
                      Dissolve
                    </button>
                  </div>
                  <ul className="loy-wallet-members">
                    {w.members.map((m) => (
                      <li key={m.phone}>
                        <span className="mono">{m.phone}</span>
                        {m.name && <span className="nm">{m.name}</span>}
                        <span className={`badge ${m.status === "active" ? "success" : "warning"}`}>
                          <i className="d" />
                          {m.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}

        {tab === "redemptions" && (
          <div className="loy-body">
            {loading ? (
              <div className="pane-msg">Loading redemptions…</div>
            ) : redemptions.length === 0 ? (
              <div className="loy-empty">
                <Sparkles />
                <div className="t">No redemptions yet</div>
                <div className="d">When members redeem rewards, the log appears here.</div>
              </div>
            ) : (
              <div className="loy-card">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Customer</th>
                      <th>Wallet</th>
                      <th>Reward</th>
                      <th style={{ textAlign: "right" }}>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRedemptions.map((r) => (
                        <tr key={r.id}>
                          <td className="muted">{fmtDateTime(r.createdAt)}</td>
                          <td>
                            <Link href={`${withAdminBase(base, "/admin/customers")}/${encodeURIComponent(r.phone)}`} className="mono loy-link">
                              {r.phone}
                            </Link>
                          </td>
                          <td>
                            {r.walletId ? (
                              <span className="mono">{r.walletId.slice(-6).toUpperCase()}</span>
                            ) : (
                              <span className="muted">solo</span>
                            )}
                          </td>
                          <td>{r.rewardId}</td>
                          <td className="num" style={{ textAlign: "right" }}>
                            −{fmtNum(r.points)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {tab === "winback" && (
          <div className="loy-body">
            {winbackLoading ? (
              <div className="pane-msg">Scanning regulars for churn risk…</div>
            ) : !winback || winback.candidates.length === 0 ? (
              <div className="loy-empty">
                <TrendingDown />
                <div className="t">No regulars at risk right now</div>
                <div className="d">
                  When a high-value regular starts slipping, the system queues a win-back here — who,
                  what incentive, which consented channel, and the drafted message.
                </div>
              </div>
            ) : (
              <>
                <div className="wb-summary">
                  <div className="wb-stat">
                    <span className="l">Regulars at risk</span>
                    <span className="v">{winback.summary.count}</span>
                  </div>
                  <div className="wb-stat">
                    <span className="l">Value at risk</span>
                    <span className="v">{fmtPLN0(winback.summary.totalValueAtRiskGrosze)}</span>
                  </div>
                  <div className="wb-stat">
                    <span className="l">Reachable now</span>
                    <span className="v">
                      {winback.summary.reachable}
                      {winback.summary.needsConsent > 0 && (
                        <span className="wb-needs"> · {winback.summary.needsConsent} need consent</span>
                      )}
                    </span>
                  </div>
                  <div className="wb-summary-actions">
                    {winback.summary.reachable > 0 && (
                      <button
                        type="button"
                        className="btn primary"
                        disabled={sendingAll}
                        onClick={() => setConfirmSendAll(true)}
                      >
                        <Send width={14} height={14} />
                        {sendingAll ? "Sending…" : `Send all reachable (${winback.summary.reachable})`}
                      </button>
                    )}
                    <button type="button" className="btn ghost" onClick={() => void loadWinback()}>
                      <RefreshCw width={14} height={14} /> Refresh
                    </button>
                  </div>
                </div>
                {comms && (!comms.sms || !comms.email) && (
                  <div className="wb-comms">{commsLabel(comms)}</div>
                )}
                <div className="wb-list">
                  {winback.candidates.map((c) => (
                    <WinBackCard
                      key={c.phone}
                      c={c}
                      busy={actingPhone === c.phone}
                      onApprove={() => approveWinBack(c)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <PointsDialog member={pointsDialog} onClose={() => setPointsDialog(null)} onSubmit={submitPoints} />

      <MemberIntelligenceDialog member={intelMember} onClose={() => setIntelMember(null)} />

      <Dialog
        open={confirmSendAll}
        onClose={() => setConfirmSendAll(false)}
        theme="core"
        size="sm"
        title="Send win-back to all reachable regulars?"
        description={`Grants each their incentive and messages them on their consented channel${
          winback ? ` (${winback.summary.reachable} reachable).` : "."
        }`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmSendAll(false)} disabled={sendingAll}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={sendAllReachable}
              loading={sendingAll}
              leadingIcon={<Send className="h-3.5 w-3.5" />}
            >
              Send all
            </Button>
          </>
        }
      >
        <div />
      </Dialog>

      <Dialog
        open={pendingDeleteWallet !== null}
        onClose={() => setPendingDeleteWallet(null)}
        theme="core"
        size="sm"
        title="Dissolve family wallet?"
        description="All members of this wallet keep their orders and points individually. The shared pool ends."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDeleteWallet(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={dissolveWallet} leadingIcon={<Trash2 className="h-3.5 w-3.5" />}>
              Dissolve
            </Button>
          </>
        }
      >
        <div />
      </Dialog>
    </CoreShell>
  );
}

interface PointsDialogProps {
  member: MemberRow | null;
  onClose: () => void;
  onSubmit: (amount: number, reason: string) => Promise<void> | void;
}

function PointsDialog({ member, onClose, onSubmit }: PointsDialogProps) {
  const [amountStr, setAmountStr] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (member) {
      setAmountStr("");
      setReason("");
      setBusy(false);
    }
  }, [member]);

  if (!member) return <Dialog open={false} onClose={onClose} theme="core" />;

  const submit = async () => {
    const amt = Number(amountStr);
    if (!Number.isFinite(amt) || amt === 0) return;
    setBusy(true);
    await onSubmit(amt, reason);
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      theme="core"
      size="sm"
      title={`Adjust points · ${member.name || member.phone}`}
      description={`Current balance: ${member.points.toLocaleString("pl-PL")} pts (${TIER_LABEL[member.tier]}).`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} leadingIcon={<Plus className="h-3.5 w-3.5" />}>
            Apply adjustment
          </Button>
        </>
      }
    >
      <div className="loy-dialog-form">
        <label className="loy-field">
          <span className="loy-field-label">Amount</span>
          <input
            className="v2-input"
            type="number"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="e.g. 50 or -20"
          />
          <span className="loy-field-hint">Signed integer — positive grants, negative deducts.</span>
        </label>
        <label className="loy-field">
          <span className="loy-field-label">Reason</span>
          <textarea
            className="v2-input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. 'Compensation for cold pizza'"
            style={{ resize: "none" }}
          />
        </label>
      </div>
    </Dialog>
  );
}

/* ====================== Customer Intelligence ====================== */

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function confBadge(c: CustomerIntelligence["confidence"]): string {
  return c === "high" ? "ok" : c === "medium" ? "info" : "muted";
}
function riskBadge(r: CustomerIntelligence["churn"]["risk"]): string {
  return r === "low" ? "ok" : r === "watch" ? "warn" : "bad";
}
function prettyTemporal(t: CustomerIntelligence["temporal"]): string {
  if (t.topDayOfWeek == null || !t.label) return "—";
  const time = t.label.split("~")[1] ?? "";
  return `${DOW_SHORT[t.topDayOfWeek]} ${time}`.trim();
}
const pct = (share: number) => `${Math.round(share * 100)}%`;

/* ====================== Win-back (Phase 2 retention) ====================== */

function commsLabel(c: { sms: boolean; email: boolean }): string {
  if (!c.sms && !c.email) {
    return "Delivery is logged-only — set Twilio (SMS) and/or Mailgun (email) env to send for real. Incentives still apply.";
  }
  const live = [c.sms ? "SMS" : null, c.email ? "email" : null].filter(Boolean).join(" + ");
  const off = [!c.sms ? "SMS" : null, !c.email ? "email" : null].filter(Boolean).join(" + ");
  return `${live} live · ${off} logged-only (set the provider env to send).`;
}

function WinBackCard({
  c,
  busy,
  onApprove,
}: {
  c: WinBackCandidate;
  busy: boolean;
  onApprove: () => void;
}) {
  const base = useAdminBase();
  const ChannelIcon = c.channel === "email" ? Mail : c.channel === "sms" ? MessageCircle : AlertTriangle;
  return (
    <div className="wb-card">
      <div className="wb-card-head">
        <div className="wb-who">
          <Link href={`${withAdminBase(base, "/admin/customers")}/${encodeURIComponent(c.phone)}`} className="wb-name">
            {c.name}
          </Link>
          <span className="wb-phone mono">{c.phone}</span>
        </div>
        <span className={`badge ${c.risk === "lost" ? "danger" : "warning"}`}>
          <i className="d" />
          {c.risk}
        </span>
        <div className="wb-var">
          <span className="l">at risk</span>
          <span className="v tnum">{fmtPLN0(c.valueAtRiskGrosze)}</span>
        </div>
      </div>
      <div className="wb-meta">
        <span>{c.orderCount} orders</span>
        {c.cadenceDays != null && <span>~{c.cadenceDays}d cadence</span>}
        <span>{c.daysSinceLast}d since last</span>
        <span>{fmtPLN0(c.lifetimeSpendGrosze)} lifetime</span>
        {c.topDish && <span>loves {c.topDish}</span>}
      </div>
      <div className="wb-reason">{c.reason}</div>
      <div className="wb-msg">
        <div className="wb-msg-head">
          <span className={`wb-chan ${c.channel ?? "none"}`}>
            <ChannelIcon width={12} height={12} />
            {c.channel ? c.channel.toUpperCase() : "No consented channel"}
          </span>
          <span className="wb-bonus">+{c.bonusPoints} pts incentive</span>
        </div>
        <div className="wb-msg-body">{c.message}</div>
      </div>
      <div className="wb-actions">
        <button type="button" className="btn primary" onClick={onApprove} disabled={busy}>
          <Send width={14} height={14} />
          {busy
            ? "Working…"
            : c.channel
              ? `Approve & send · +${c.bonusPoints} pts`
              : `Grant +${c.bonusPoints} pts`}
        </button>
      </div>
    </div>
  );
}

function MemberIntelligenceDialog({
  member,
  onClose,
}: {
  member: MemberRow | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<CustomerIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!member) {
      setData(null);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    setData(null);
    fetch(`/api/admin/customer-intelligence?phone=${encodeURIComponent(member.phone)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((j) => {
        if (!cancelled) setData((j.intelligence as CustomerIntelligence) ?? null);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [member]);

  if (!member) return <Dialog open={false} onClose={onClose} theme="core" />;

  return (
    <Dialog
      open
      onClose={onClose}
      theme="core"
      size="lg"
      title={`Customer intelligence · ${member.name || member.phone}`}
      description="Behavioural graph + next-order prediction, derived live from this guest's real order history."
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? (
        <div className="ci-msg">Reading order history…</div>
      ) : error ? (
        <div className="ci-msg">Couldn&apos;t load intelligence.</div>
      ) : !data || data.orderCount === 0 ? (
        <div className="ci-msg">No counted orders yet for this guest — nothing to model.</div>
      ) : (
        <div className="ci-body">
          <div className="ci-headline">
            <div className="ci-eyebrow">
              <span>Next-order prediction</span>
              <span className={`ci-badge ${confBadge(data.confidence)}`}>{data.confidence} confidence</span>
            </div>
            <div className="ci-headline-text">{data.nextOrder.headline}</div>
            {data.nextOrder.when && (
              <div className="ci-headline-when">
                Expected around {fmtDate(data.nextOrder.when)}
                {data.nextOrder.whenLabel ? ` · ${data.nextOrder.whenLabel}` : ""}
              </div>
            )}
          </div>

          <div className="ci-grid">
            <div className="ci-panel">
              <div className="ci-h">Rhythm &amp; retention</div>
              <div className="ci-kv">
                <span>Churn risk</span>
                <span className={`ci-badge ${riskBadge(data.churn.risk)}`}>{data.churn.risk}</span>
              </div>
              <div className="ci-note">{data.churn.reason}</div>
              <div className="ci-kv">
                <span>Orders</span>
                <b>{data.orderCount}</b>
              </div>
              {data.cadence.medianIntervalDays != null && (
                <div className="ci-kv">
                  <span>Cadence</span>
                  <b>~{Math.round(data.cadence.medianIntervalDays)}d</b>
                </div>
              )}
              {data.cadence.daysSinceLast != null && (
                <div className="ci-kv">
                  <span>Last order</span>
                  <b>{Math.round(data.cadence.daysSinceLast)}d ago</b>
                </div>
              )}
              <div className="ci-kv">
                <span>Avg order</span>
                <b>{fmtPLN0(data.avgOrderValueGrosze)}</b>
              </div>
            </div>

            <div className="ci-panel">
              <div className="ci-h">When &amp; how</div>
              {data.temporal.label ? (
                <div className="ci-kv">
                  <span>Time pattern</span>
                  <b>{prettyTemporal(data.temporal)}</b>
                </div>
              ) : (
                <div className="ci-note">No clear time pattern yet.</div>
              )}
              {data.preferredChannel && (
                <div className="ci-kv">
                  <span>Prefers</span>
                  <b>{data.preferredChannel}</b>
                </div>
              )}
              <div className="ci-bars">
                {data.channelMix.map((c) => (
                  <div key={c.channel} className="ci-bar-row">
                    <span className="ci-bar-lbl">{c.channel}</span>
                    <div className="ci-bar">
                      <i style={{ width: pct(c.share) }} />
                    </div>
                    <span className="ci-pct">{pct(c.share)}</span>
                  </div>
                ))}
              </div>
              {data.party.avg != null && (
                <div className="ci-kv">
                  <span>Avg party (dine-in)</span>
                  <b>{data.party.avg.toFixed(1)}</b>
                </div>
              )}
            </div>

            <div className="ci-panel ci-span2">
              <div className="ci-h">Go-to dishes</div>
              <div className="ci-bars">
                {data.topItems.map((it) => (
                  <div key={it.name} className="ci-bar-row">
                    <span className="ci-bar-lbl">{it.name}</span>
                    <div className="ci-bar">
                      <i style={{ width: pct(it.share) }} />
                    </div>
                    <span className="ci-pct">{pct(it.share)}</span>
                  </div>
                ))}
              </div>
            </div>

            {data.attachRules.length > 0 && (
              <div className="ci-panel ci-span2">
                <div className="ci-h">Attach patterns</div>
                {data.attachRules.map((r) => (
                  <div key={`${r.trigger}-${r.item}`} className="ci-attach">
                    <Sparkles width={13} height={13} />
                    <span>
                      Adds <b>{r.item}</b> {r.trigger}
                    </span>
                    <span className="ci-lift">{r.lift.toFixed(1)}× lift</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
