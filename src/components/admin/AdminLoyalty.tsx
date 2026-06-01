"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  Coins,
  Crown,
  Gem,
  Heart,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { useToast } from "./v2/ui/Toast";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Tabs,
  Table,
  Textarea,
  type Column,
} from "./v2/ui";
import { KpiCard } from "./v2/charts";

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

const TIER_TONE: Record<LoyaltyTier, "neutral" | "info" | "warning" | "success"> = {
  bronze: "warning",
  silver: "neutral",
  gold: "warning",
  platinum: "info",
};

const TIER_LABEL: Record<LoyaltyTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function AdminLoyalty() {
  return <AdminLoyaltyDesktop />;
}

function AdminLoyaltyDesktop() {
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>("members");

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");

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

  const memberCols: Column<MemberRow>[] = [
    {
      key: "name",
      header: "Member",
      cell: (m) => (
        <Link href={`/admin/customers/${encodeURIComponent(m.phone)}`} className="v2-link-cell">
          <div className="v2-cell-stack">
            <span>{m.name || "Guest"}</span>
            <span className="v2-cell-sub mono">{m.phone}</span>
          </div>
        </Link>
      ),
      sortValue: (m) => m.name,
    },
    {
      key: "tier",
      header: "Tier",
      cell: (m) => (
        <Badge tone={TIER_TONE[m.tier]} variant="soft" dot>
          {TIER_LABEL[m.tier]}
        </Badge>
      ),
      sortValue: (m) => m.tier,
    },
    {
      key: "points",
      header: "Points",
      align: "right",
      cell: (m) => m.points.toLocaleString(),
      sortValue: (m) => m.points,
    },
    {
      key: "orders",
      header: "Orders",
      align: "right",
      cell: (m) => m.orders.toLocaleString(),
      sortValue: (m) => m.orders,
    },
    {
      key: "spent",
      header: "Lifetime spend",
      align: "right",
      cell: (m) => formatPrice(m.totalSpent),
      sortValue: (m) => m.totalSpent,
    },
    {
      key: "last",
      header: "Last order",
      cell: (m) => <span className="v2-muted">{fmtDate(m.lastOrder)}</span>,
      sortValue: (m) => m.lastOrder,
    },
    {
      key: "actions",
      header: "",
      cell: (m) => (
        <Button size="sm" variant="ghost" leadingIcon={<Coins className="h-3.5 w-3.5" />} onClick={() => setPointsDialog(m)}>
          Adjust
        </Button>
      ),
    },
  ];

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Loyalty</h1>
          <p className="v2-page-subtitle">
            Members, family wallets, and redemptions. Tiers calculated from earned + manually-adjusted points. To edit the programme itself — tier labels / thresholds / multipliers / perks + the rewards catalogue — go to <Link href="/admin/growth" className="v2-link">/admin/growth</Link>.
          </p>
        </div>
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as TabKey)}
          tabs={[
            { value: "members", label: "Members", icon: <Heart className="h-3.5 w-3.5" />, count: members.length },
            { value: "wallets", label: "Family wallets", icon: <Wallet className="h-3.5 w-3.5" />, count: wallets.length },
            { value: "redemptions", label: "Redemptions", icon: <Sparkles className="h-3.5 w-3.5" />, count: redemptions.length },
          ]}
          variant="pill"
          ariaLabel="Loyalty view"
        />
      </header>

      <section className="v2-kpi-grid">
        <KpiCard
          label="Total members"
          value={members.length}
          icon={Users}
          tone="info"
          hint={`${totals.repeat} repeat buyers`}
        />
        <KpiCard
          label="Platinum"
          value={tierCounts.platinum}
          icon={Gem}
          tone="info"
        />
        <KpiCard
          label="Gold"
          value={tierCounts.gold}
          icon={Crown}
          tone="warning"
        />
        <KpiCard
          label="Lifetime spend"
          value={totals.spent / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Award}
          tone="brand"
        />
      </section>

      {tab === "members" && (
        <>
          <div className="v2-filters">
            <div className="v2-filter-search">
              <Input
                placeholder="Search by name or phone…"
                leadingAdornment={<Search className="h-3.5 w-3.5" />}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Tabs
              value={tierFilter}
              onChange={(v) => setTierFilter(v as TierFilter)}
              tabs={[
                { value: "all", label: "All", count: tierCounts.all },
                { value: "platinum", label: "Platinum", count: tierCounts.platinum },
                { value: "gold", label: "Gold", count: tierCounts.gold },
                { value: "silver", label: "Silver", count: tierCounts.silver },
                { value: "bronze", label: "Bronze", count: tierCounts.bronze },
              ]}
              variant="pill"
              ariaLabel="Tier filter"
            />
          </div>

          {loading ? (
            <div className="v2-page-loading">Loading Loyalty…</div>
          ) : filteredMembers.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={Heart}
                  title={members.length === 0 ? "No members yet" : "No matches"}
                  description={
                    members.length === 0
                      ? "Members are auto-enrolled when they place a phone-verified order."
                      : "Try clearing filters."
                  }
                />
              </CardBody>
            </Card>
          ) : (
            <Card padding="none">
              <CardBody>
                <Table rows={filteredMembers} columns={memberCols} rowKey={(m) => m.phone} defaultSort={{ key: "points", dir: "desc" }} />
              </CardBody>
            </Card>
          )}
        </>
      )}

      {tab === "wallets" && (
        <WalletsPanel wallets={wallets} onDissolve={setPendingDeleteWallet} />
      )}

      {tab === "redemptions" && (
        <RedemptionsPanel rows={redemptions} />
      )}

      <PointsDialog
        member={pointsDialog}
        onClose={() => setPointsDialog(null)}
        onSubmit={submitPoints}
      />

      <ConfirmDialog
        open={pendingDeleteWallet !== null}
        onClose={() => setPendingDeleteWallet(null)}
        onConfirm={dissolveWallet}
        title="Dissolve family wallet?"
        description="All members of this wallet keep their orders and points individually. The shared pool ends."
        confirmLabel="Dissolve"
        destructive
      />
    </div>
  );
}

interface WalletsPanelProps {
  wallets: WalletSummary[];
  onDissolve: (w: WalletSummary) => void;
}

function WalletsPanel({ wallets, onDissolve }: WalletsPanelProps) {
  if (wallets.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={Wallet}
            title="No family wallets yet"
            description="Members can pair up to 3 phones into a shared points wallet via the customer site."
          />
        </CardBody>
      </Card>
    );
  }
  return (
    <div className="v2-wallets-grid">
      {wallets.map((w) => (
        <Card key={w.id} padding="none">
          <CardHeader
            title={
              <div className="v2-wallet-title">
                <Wallet className="h-3.5 w-3.5 v2-muted" />
                <span className="mono">{w.id.slice(-6).toUpperCase()}</span>
              </div>
            }
            description={`Head ${w.headPhone}`}
            actions={
              <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => onDissolve(w)}>
                Dissolve
              </Button>
            }
          />
          <CardBody>
            <ul className="v2-wallet-members">
              {w.members.map((m) => (
                <li key={m.phone}>
                  <span className="mono">{m.phone}</span>
                  <span className="v2-muted">{m.name || ""}</span>
                  <Badge tone={m.status === "active" ? "success" : "warning"} variant="soft" dot>
                    {m.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function RedemptionsPanel({ rows }: { rows: Redemption[] }) {
  const cols: Column<Redemption>[] = [
    {
      key: "createdAt",
      header: "When",
      cell: (r) => (
        <span className="v2-muted">{new Date(r.createdAt).toLocaleString()}</span>
      ),
      sortValue: (r) => r.createdAt,
    },
    {
      key: "phone",
      header: "Customer",
      cell: (r) => (
        <Link href={`/admin/customers/${encodeURIComponent(r.phone)}`} className="v2-link-cell mono">
          {r.phone}
        </Link>
      ),
      sortValue: (r) => r.phone,
    },
    {
      key: "wallet",
      header: "Wallet",
      cell: (r) => (r.walletId ? <span className="mono">{r.walletId.slice(-6).toUpperCase()}</span> : <span className="v2-muted">solo</span>),
    },
    {
      key: "reward",
      header: "Reward",
      cell: (r) => r.rewardId,
      sortValue: (r) => r.rewardId,
    },
    {
      key: "points",
      header: "Points",
      align: "right",
      cell: (r) => <span className="tabular">−{r.points.toLocaleString()}</span>,
      sortValue: (r) => r.points,
    },
  ];

  if (rows.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState icon={Sparkles} title="No redemptions yet" description="When members redeem rewards, the log appears here." />
        </CardBody>
      </Card>
    );
  }
  return (
    <Card padding="none">
      <CardBody>
        <Table rows={rows} columns={cols} rowKey={(r) => r.id} defaultSort={{ key: "createdAt", dir: "desc" }} />
      </CardBody>
    </Card>
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

  if (!member) return <Dialog open={false} onClose={onClose} />;

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
      size="sm"
      title={`Adjust points · ${member.name || member.phone}`}
      description={`Current balance: ${member.points.toLocaleString()} pts (${TIER_LABEL[member.tier]}).`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} leadingIcon={<Plus className="h-3.5 w-3.5" />}>
            Apply adjustment
          </Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input
          label="Amount"
          type="number"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          description="Signed integer — positive grants, negative deducts."
        />
        <Textarea label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 'Compensation for cold pizza'" />
      </div>
    </Dialog>
  );
}
