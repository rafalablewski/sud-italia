"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  Coins,
  Crown,
  Gem,
  Gift,
  Heart,
  Rocket,
  Shield,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  Input,
  Table,
  Tabs,
  Textarea,
  type Column,
} from "./v2/ui";
import { KpiCard } from "./v2/charts";

interface Tier {
  threshold: number;
  multiplier: number;
  perks: string[];
}

interface Reward {
  id: string;
  name: string;
  pointsCost: number;
  description: string;
  active: boolean;
}

interface ReferralConfig {
  referrerPoints: number;
  refereeDiscountGrosze: number;
  active: boolean;
}

interface LoyaltySettings {
  tiers: {
    bronze: Tier;
    silver: Tier;
    gold: Tier;
    platinum: Tier;
  };
  rewards: Reward[];
  referral: ReferralConfig;
  liveActivity: {
    ordersInLastHour: boolean;
    currentlyPreparing: boolean;
    trendingItem: boolean;
    avgPrepTime: boolean;
  };
}

interface ReferralRow {
  code: string;
  owner: string;
  ownerPhone: string;
  used: number;
  earned: number;
  createdAt: string;
}

type TabKey = "rewards" | "tiers" | "referrals" | "live";

const TIER_KEYS = ["bronze", "silver", "gold", "platinum"] as const;

const TIER_ICON = {
  bronze: Shield,
  silver: Award,
  gold: Crown,
  platinum: Gem,
} as const;

export function AdminGrowth() {
  const toast = useToast();
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("rewards");
  const [editingReward, setEditingReward] = useState<Reward | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [g, r] = await Promise.all([
        fetch("/api/admin/growth").then((res) => (res.ok ? res.json() : null)),
        fetch("/api/admin/referrals").then((res) => (res.ok ? res.json() : { referrals: [] })),
      ]);
      setSettings(g);
      setReferrals(Array.isArray(r.referrals) ? r.referrals : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const persist = async (updates: Partial<LoyaltySettings>) => {
    const res = await fetch("/api/admin/growth", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const fresh = await res.json();
      setSettings(fresh);
      toast.success("Saved");
      return true;
    }
    toast.error("Could not save");
    return false;
  };

  const toggleReward = async (rewardId: string) => {
    if (!settings) return;
    const rewards = settings.rewards.map((r) =>
      r.id === rewardId ? { ...r, active: !r.active } : r,
    );
    setSettings({ ...settings, rewards });
    await persist({ rewards });
  };

  const upsertReward = async (reward: Reward) => {
    if (!settings) return;
    const exists = settings.rewards.some((r) => r.id === reward.id);
    const rewards = exists
      ? settings.rewards.map((r) => (r.id === reward.id ? reward : r))
      : [...settings.rewards, reward];
    setSettings({ ...settings, rewards });
    const ok = await persist({ rewards });
    if (ok) setEditingReward(null);
  };

  const deleteReward = async (rewardId: string) => {
    if (!settings) return;
    const rewards = settings.rewards.filter((r) => r.id !== rewardId);
    setSettings({ ...settings, rewards });
    await persist({ rewards });
  };

  const updateTier = async (key: typeof TIER_KEYS[number], patch: Partial<Tier>) => {
    if (!settings) return;
    const tiers = { ...settings.tiers, [key]: { ...settings.tiers[key], ...patch } };
    setSettings({ ...settings, tiers });
    await persist({ tiers });
  };

  const updateReferral = async (patch: Partial<ReferralConfig>) => {
    if (!settings) return;
    const referral = { ...settings.referral, ...patch };
    setSettings({ ...settings, referral });
    await persist({ referral });
  };

  const toggleLive = async (key: keyof LoyaltySettings["liveActivity"]) => {
    if (!settings) return;
    const liveActivity = { ...settings.liveActivity, [key]: !settings.liveActivity[key] };
    setSettings({ ...settings, liveActivity });
    await persist({ liveActivity });
  };

  const deleteReferralCode = async (code: string) => {
    const res = await fetch("/api/admin/referrals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      setReferrals((arr) => arr.filter((r) => r.code !== code));
      toast.success("Code removed");
    }
  };

  const refTotals = {
    totalCodes: referrals.length,
    totalUses: referrals.reduce((acc, r) => acc + r.used, 0),
    totalEarned: referrals.reduce((acc, r) => acc + r.earned, 0),
  };

  const refCols: Column<ReferralRow>[] = [
    { key: "code", header: "Code", cell: (r) => <span className="mono">{r.code}</span>, sortValue: (r) => r.code },
    { key: "owner", header: "Owner", cell: (r) => r.owner, sortValue: (r) => r.owner },
    { key: "phone", header: "Phone", cell: (r) => <span className="mono">{r.ownerPhone}</span> },
    { key: "used", header: "Uses", align: "right", cell: (r) => r.used.toLocaleString(), sortValue: (r) => r.used },
    { key: "earned", header: "Earned pts", align: "right", cell: (r) => r.earned.toLocaleString(), sortValue: (r) => r.earned },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <Button size="sm" variant="ghost" onClick={() => deleteReferralCode(r.code)}>
          Remove
        </Button>
      ),
    },
  ];

  if (loading || !settings) {
    return (
      <div className="v2-page">
        <header className="v2-page-header">
          <div className="v2-page-title-row">
            <h1 className="v2-page-title">Growth</h1>
          </div>
        </header>
        <div className="v2-page-loading">Loading growth settings…</div>
      </div>
    );
  }

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Growth engine</h1>
          <p className="v2-page-subtitle">
            Tier thresholds, redeemable rewards, referral mechanics, and the customer-site live-activity widgets.
          </p>
        </div>
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as TabKey)}
          tabs={[
            { value: "rewards", label: "Rewards", icon: <Gift className="h-3.5 w-3.5" /> },
            { value: "tiers", label: "Tiers", icon: <Crown className="h-3.5 w-3.5" /> },
            { value: "referrals", label: "Referrals", icon: <Users className="h-3.5 w-3.5" /> },
            { value: "live", label: "Live widgets", icon: <Rocket className="h-3.5 w-3.5" /> },
          ]}
          variant="pill"
          ariaLabel="Growth section"
        />
      </header>

      <section className="v2-kpi-grid">
        <KpiCard label="Active rewards" value={settings.rewards.filter((r) => r.active).length} icon={Gift} tone="success" hint={`${settings.rewards.length} total`} />
        <KpiCard label="Referral codes" value={refTotals.totalCodes} icon={Users} tone="info" hint={`${refTotals.totalUses} uses`} />
        <KpiCard label="Referral points awarded" value={refTotals.totalEarned} icon={Coins} tone="brand" />
        <KpiCard label="Top tier reward" value={Math.max(0, ...settings.rewards.map((r) => r.pointsCost))} icon={Star} tone="warning" hint="Highest redemption cost (pts)" />
      </section>

      {tab === "rewards" && (
        <>
          <div className="v2-filters">
            <h2 className="v2-section-h">Redeemable rewards</h2>
            <Button variant="primary" leadingIcon={<Trophy className="h-3.5 w-3.5" />} onClick={() => setEditingReward({ id: "", name: "", description: "", pointsCost: 100, active: true })}>
              New reward
            </Button>
          </div>
          {settings.rewards.length === 0 ? (
            <Card><CardBody><EmptyState icon={Gift} title="No rewards" /></CardBody></Card>
          ) : (
            <div className="v2-rewards-grid">
              {settings.rewards.map((r) => (
                <Card key={r.id}>
                  <CardHeader
                    title={r.name}
                    description={r.description}
                    actions={
                      <Badge tone={r.active ? "success" : "neutral"} variant="soft" dot>
                        {r.active ? "Active" : "Disabled"}
                      </Badge>
                    }
                  />
                  <CardBody>
                    <div className="v2-summary-row">
                      <span className="v2-muted">Cost</span>
                      <span className="tabular v2-summary-val">{r.pointsCost.toLocaleString()} pts</span>
                    </div>
                  </CardBody>
                  <div className="v2-reward-actions">
                    <Button size="sm" variant="ghost" onClick={() => toggleReward(r.id)}>
                      {r.active ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingReward(r)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteReward(r.id)}>
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "tiers" && (
        <div className="v2-tiers-grid">
          {TIER_KEYS.map((k) => {
            const Icon = TIER_ICON[k];
            const tier = settings.tiers[k];
            return (
              <Card key={k}>
                <CardHeader
                  title={
                    <span className="v2-inline">
                      <Icon className="h-4 w-4 v2-muted" />
                      <span style={{ textTransform: "capitalize" }}>{k}</span>
                    </span>
                  }
                  description={`Earn at ${tier.threshold.toLocaleString()} pts spent`}
                />
                <CardBody>
                  <div className="v2-stack-12">
                    <Input
                      label="Threshold (lifetime PLN)"
                      type="number"
                      min="0"
                      value={tier.threshold}
                      onChange={(e) => updateTier(k, { threshold: Number(e.target.value) || 0 })}
                    />
                    <Input
                      label="Points multiplier"
                      type="number"
                      step="0.1"
                      min="1"
                      value={tier.multiplier}
                      onChange={(e) => updateTier(k, { multiplier: Number(e.target.value) || 1 })}
                    />
                    <Textarea
                      label="Perks (one per line)"
                      rows={3}
                      value={tier.perks.join("\n")}
                      onChange={(e) => updateTier(k, { perks: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                    />
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "referrals" && (
        <>
          <Card>
            <CardHeader title="Referral mechanics" description="Reward both sides when a customer brings a friend." />
            <CardBody>
              <div className="v2-stack-12">
                <label className="v2-toggle">
                  <input
                    type="checkbox"
                    checked={settings.referral.active}
                    onChange={() => updateReferral({ active: !settings.referral.active })}
                  />
                  <span>{settings.referral.active ? "Active" : "Disabled"}</span>
                </label>
                <div className="v2-form-row-2">
                  <Input
                    label="Referrer bonus (points)"
                    type="number"
                    min="0"
                    value={settings.referral.referrerPoints}
                    onChange={(e) => updateReferral({ referrerPoints: Number(e.target.value) || 0 })}
                  />
                  <Input
                    label="Referee discount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={(settings.referral.refereeDiscountGrosze / 100).toFixed(2)}
                    onChange={(e) => updateReferral({ refereeDiscountGrosze: Math.round(parseFloat(e.target.value || "0") * 100) })}
                    trailingAdornment={<span className="v2-muted">zł</span>}
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card padding="none">
            <CardHeader
              title="Existing codes"
              description={`${referrals.length} code${referrals.length === 1 ? "" : "s"} in circulation · ${refTotals.totalUses} uses · ${formatPrice(refTotals.totalEarned * 100)} of points awarded`}
            />
            <CardBody>
              {referrals.length === 0 ? (
                <EmptyState icon={Heart} title="No referral codes yet" description="Codes are created automatically when customers tap Share on the rewards screen." compact />
              ) : (
                <Table rows={referrals} columns={refCols} rowKey={(r) => r.code} defaultSort={{ key: "used", dir: "desc" }} />
              )}
            </CardBody>
          </Card>
        </>
      )}

      {tab === "live" && (
        <Card>
          <CardHeader title="Live activity widgets" description="Customer-site signals that build social proof." />
          <CardBody>
            <ul className="v2-checkbox-list">
              {(
                [
                  ["ordersInLastHour", "Orders in last hour pill"],
                  ["currentlyPreparing", "Currently preparing badge"],
                  ["trendingItem", "Trending item indicator"],
                  ["avgPrepTime", "Average prep time pill"],
                ] as const
              ).map(([k, label]) => (
                <li key={k}>
                  <label className="v2-toggle">
                    <input
                      type="checkbox"
                      checked={settings.liveActivity[k]}
                      onChange={() => toggleLive(k)}
                    />
                    <span>{label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <RewardDialog
        reward={editingReward}
        onClose={() => setEditingReward(null)}
        onSubmit={upsertReward}
      />
    </div>
  );
}

interface RewardDialogProps {
  reward: Reward | null;
  onClose: () => void;
  onSubmit: (reward: Reward) => Promise<void> | void;
}

function RewardDialog({ reward, onClose, onSubmit }: RewardDialogProps) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [points, setPoints] = useState(100);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!reward) return;
    setName(reward.name);
    setDesc(reward.description);
    setPoints(reward.pointsCost);
    setBusy(false);
  }, [reward]);

  if (!reward) return <Dialog open={false} onClose={onClose} />;

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const id = reward.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
    await onSubmit({
      id,
      name: name.trim(),
      description: desc.trim(),
      pointsCost: Math.max(0, points),
      active: reward.active,
    });
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={reward.id ? `Edit ${reward.name}` : "New reward"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>{reward.id ? "Save" : "Create"}</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Free espresso" />
        <Textarea label="Description" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
        <Input
          label="Cost (points)"
          type="number"
          min="0"
          value={points}
          onChange={(e) => setPoints(Number(e.target.value) || 0)}
        />
      </div>
    </Dialog>
  );
}
