"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Coins,
  Heart,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import { CoreShell } from "./core/CoreShell";
import { GuestViewNav } from "./guest/GuestViewNav";
import { Button, Dialog } from "./v2/ui";
import { useToast } from "./v2/ui/Toast";

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
type TabKey = "members" | "wallets" | "redemptions";
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
  const [tab, setTab] = useState<TabKey>("members");

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "points", dir: "desc" });

  const [pointsDialog, setPointsDialog] = useState<MemberRow | null>(null);
  const [pendingDeleteWallet, setPendingDeleteWallet] = useState<WalletSummary | null>(null);

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
          return tierRank[m.tier];
        case "points":
          return m.points;
        case "orders":
          return m.orders;
        case "spent":
          return m.totalSpent;
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

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "members", label: "Members", count: members.length },
    { key: "wallets", label: "Family wallets", count: wallets.length },
    { key: "redemptions", label: "Redemptions", count: redemptions.length },
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
      active="guest"
      crumbs={
        <>
          Core / <b>Guest Engagement</b>
        </>
      }
      viewnav={<GuestViewNav current="loyalty" counts={{ loyalty: members.length }} />}
      topbarRight={
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
          go to <Link href="/admin/growth">/admin/growth</Link>.
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
                <span className="n">{t.count}</span>
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
                            <Link href={`/admin/customers/${encodeURIComponent(m.phone)}`} className="loy-member">
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
                            <button type="button" className="btn ghost" onClick={() => setPointsDialog(m)}>
                              <Coins width={14} height={14} />
                              Adjust
                            </button>
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
                    {[...redemptions]
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .map((r) => (
                        <tr key={r.id}>
                          <td className="muted">{fmtDateTime(r.createdAt)}</td>
                          <td>
                            <Link href={`/admin/customers/${encodeURIComponent(r.phone)}`} className="mono loy-link">
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
      </div>

      <PointsDialog member={pointsDialog} onClose={() => setPointsDialog(null)} onSubmit={submitPoints} />

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
