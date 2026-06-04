"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Award,
  Coins,
  Crown,
  Gem,
  Gift,
  Heart,
  Pencil,
  Plus,
  Rocket,
  Shield,
  Star,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { getActiveLocations } from "@/data/locations";
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
  PageHero,
  Select,
  Switch,
  Table,
  Tabs,
  Textarea,
  type Column,
} from "./v2/ui";
import { KpiCard } from "./v2/charts";

interface Tier {
  label: string;
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

type LiveWidgetType =
  | "ordersInLastHour"
  | "currentlyPreparing"
  | "trendingItem"
  | "avgPrepTime"
  | "happyHour"
  | "truckLocation"
  | "freeText";

interface LiveWidget {
  id: string;
  type: LiveWidgetType;
  label?: string;
  active: boolean;
  locationSlugs?: string[];
  order: number;
  config?: {
    text?: string;
    endHour?: number;
    discountPct?: number;
    category?: string;
  };
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
  liveWidgets: LiveWidget[];
}

/** Mirror of `LIVE_WIDGET_LIMIT` in src/lib/store.ts. The public API caps
 *  the rendered list at this many; we surface the limit in the UI too. */
const LIVE_WIDGET_LIMIT = 7;

const WIDGET_TYPE_OPTIONS: { value: LiveWidgetType; label: string; description: string; defaultLabel: string }[] = [
  { value: "ordersInLastHour", label: "Orders in last hour", description: "Live order count pulse.", defaultLabel: "orders in the last hour" },
  { value: "currentlyPreparing", label: "Currently preparing", description: "How many orders are on the line right now.", defaultLabel: "orders being prepared" },
  { value: "trendingItem", label: "Trending item", description: "Highlights the most-ordered dish.", defaultLabel: "Trending" },
  { value: "avgPrepTime", label: "Average prep time", description: "Rolling average prep time across recent orders.", defaultLabel: "Avg prep" },
  { value: "happyHour", label: "Happy hour", description: "Time-bound discount banner. Auto-hides once end hour passes.", defaultLabel: "" },
  { value: "truckLocation", label: "Truck location", description: "Today's address for the food truck.", defaultLabel: "Truck is at" },
  { value: "freeText", label: "Free text / announcement", description: "Admin-supplied one-liner. Use for tonight's special, weather note, etc.", defaultLabel: "" },
];

function widgetTypeMeta(t: LiveWidgetType) {
  return WIDGET_TYPE_OPTIONS.find((o) => o.value === t) ?? WIDGET_TYPE_OPTIONS[0];
}

function makeWidgetId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `lw-${crypto.randomUUID().slice(0, 8)}`;
  return `lw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
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

  const [editingWidget, setEditingWidget] = useState<LiveWidget | null>(null);
  const [pendingDeleteWidget, setPendingDeleteWidget] = useState<LiveWidget | null>(null);

  const persistWidgets = async (next: LiveWidget[]) => {
    if (!settings) return;
    const normalised = next.map((w, idx) => ({ ...w, order: idx }));
    setSettings({ ...settings, liveWidgets: normalised });
    await persist({ liveWidgets: normalised });
  };

  const upsertWidget = async (widget: LiveWidget) => {
    if (!settings) return;
    const list = settings.liveWidgets;
    const exists = list.some((w) => w.id === widget.id);
    const next = exists ? list.map((w) => (w.id === widget.id ? widget : w)) : [...list, { ...widget, order: list.length }];
    await persistWidgets(next);
    setEditingWidget(null);
  };

  const deleteWidget = async (id: string) => {
    if (!settings) return;
    await persistWidgets(settings.liveWidgets.filter((w) => w.id !== id));
  };

  const toggleWidget = async (id: string) => {
    if (!settings) return;
    await persistWidgets(settings.liveWidgets.map((w) => (w.id === id ? { ...w, active: !w.active } : w)));
  };

  const reorderWidget = async (id: string, dir: -1 | 1) => {
    if (!settings) return;
    const list = settings.liveWidgets.slice().sort((a, b) => a.order - b.order);
    const idx = list.findIndex((w) => w.id === id);
    if (idx === -1) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= list.length) return;
    [list[idx], list[swap]] = [list[swap], list[idx]];
    await persistWidgets(list);
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
        <PageHero title="Growth" />
        <div className="v2-page-loading">Loading Campaigns…</div>
      </div>
    );
  }

  return (
    <div className="v2-page">
      <PageHero
        title="Growth engine"
        subtitle="Tier thresholds, redeemable rewards, referral mechanics, and the customer-site live-activity widgets."
        filters={
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
        }
      />

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
                      label="Customer-facing label"
                      value={tier.label}
                      placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
                      onChange={(e) => updateTier(k, { label: e.target.value })}
                    />
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
                  <Switch
                    checked={settings.referral.active}
                    onChange={(v) => updateReferral({ active: v })}
                    label="Referral program"
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
            {referrals.length === 0 ? (
              <CardBody>
                <EmptyState icon={Heart} title="No referral codes yet" description="Codes are created automatically when customers tap Share on the rewards screen." compact />
              </CardBody>
            ) : (
              <Table flush rows={referrals} columns={refCols} rowKey={(r) => r.code} defaultSort={{ key: "used", dir: "desc" }} />
            )}
          </Card>
        </>
      )}

      {tab === "live" && (
        <LiveWidgetsPanel
          widgets={settings.liveWidgets}
          onEdit={setEditingWidget}
          onDelete={setPendingDeleteWidget}
          onToggle={toggleWidget}
          onReorder={reorderWidget}
          onAdd={() => setEditingWidget({ id: "", type: "freeText", active: true, order: settings.liveWidgets.length })}
        />
      )}

      <RewardDialog
        reward={editingReward}
        onClose={() => setEditingReward(null)}
        onSubmit={upsertReward}
      />

      <WidgetDialog
        widget={editingWidget}
        onClose={() => setEditingWidget(null)}
        onSubmit={upsertWidget}
      />

      <ConfirmDialog
        open={pendingDeleteWidget !== null}
        onClose={() => setPendingDeleteWidget(null)}
        onConfirm={async () => {
          if (!pendingDeleteWidget) return;
          await deleteWidget(pendingDeleteWidget.id);
        }}
        title="Delete this widget?"
        description={pendingDeleteWidget ? `"${pendingDeleteWidget.label ?? widgetTypeMeta(pendingDeleteWidget.type).label}" will be removed from the live bar.` : ""}
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

interface LiveWidgetsPanelProps {
  widgets: LiveWidget[];
  onEdit: (widget: LiveWidget) => void;
  onDelete: (widget: LiveWidget) => void;
  onToggle: (id: string) => void;
  onReorder: (id: string, dir: -1 | 1) => void;
  onAdd: () => void;
}

function LiveWidgetsPanel({ widgets, onEdit, onDelete, onToggle, onReorder, onAdd }: LiveWidgetsPanelProps) {
  const activeLocations = useMemo(() => getActiveLocations(), []);
  const sorted = useMemo(() => widgets.slice().sort((a, b) => a.order - b.order), [widgets]);
  const activeCount = sorted.filter((w) => w.active).length;
  const atLimit = activeCount >= LIVE_WIDGET_LIMIT;

  const locationLabel = (slugs?: string[]) => {
    if (!slugs || slugs.length === 0) return "All locations";
    return slugs
      .map((s) => activeLocations.find((l) => l.slug === s)?.city ?? s)
      .join(" · ");
  };

  return (
    <Card>
      <CardHeader
        title="Live activity widgets"
        description={`Customer-site signals that build social proof. ${activeCount}/${LIVE_WIDGET_LIMIT} active · ${sorted.length} total.`}
        actions={
          <Button
            size="sm"
            variant="primary"
            leadingIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={onAdd}
          >
            Add widget
          </Button>
        }
      />
      <CardBody>
        {sorted.length === 0 ? (
          <EmptyState
            icon={Rocket}
            title="No widgets configured"
            description="Add a widget — it will appear on the customer site as soon as you save."
            compact
          />
        ) : (
          <>
            {atLimit && (
              <p className="v2-muted" style={{ fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
                {LIVE_WIDGET_LIMIT} active widgets is the bar limit. New ones above the cap are dropped from the rendered list — disable one to enable another.
              </p>
            )}
            <ul className="v2-widget-list">
              {sorted.map((w, idx) => {
                const meta = widgetTypeMeta(w.type);
                return (
                  <li key={w.id} className={`v2-widget-row${w.active ? "" : " is-off"}`}>
                    <span className="v2-widget-order">
                      <Button
                        size="sm"
                        variant="ghost"
                        leadingIcon={<ArrowUp className="h-3 w-3" />}
                        onClick={() => onReorder(w.id, -1)}
                        disabled={idx === 0}
                        aria-label="Move up"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        leadingIcon={<ArrowDown className="h-3 w-3" />}
                        onClick={() => onReorder(w.id, 1)}
                        disabled={idx === sorted.length - 1}
                        aria-label="Move down"
                      />
                    </span>
                    <span className="v2-widget-main">
                      <span className="v2-widget-title">
                        {w.label || meta.label}
                      </span>
                      <span className="v2-widget-sub v2-muted">{meta.description}</span>
                    </span>
                    <Badge tone="neutral" variant="soft">{meta.label}</Badge>
                    <Badge tone={w.locationSlugs && w.locationSlugs.length > 0 ? "info" : "neutral"} variant="soft">
                      {locationLabel(w.locationSlugs)}
                    </Badge>
                    <label className="v2-toggle">
                      <Switch checked={w.active} onChange={() => onToggle(w.id)} label="Widget active" />
                      <span>{w.active ? "On" : "Off"}</span>
                    </label>
                    <span className="v2-widget-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        leadingIcon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => onEdit(w)}
                        aria-label="Edit widget"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => onDelete(w)}
                        aria-label="Delete widget"
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}

interface WidgetDialogProps {
  widget: LiveWidget | null;
  onClose: () => void;
  onSubmit: (widget: LiveWidget) => Promise<void> | void;
}

function WidgetDialog({ widget, onClose, onSubmit }: WidgetDialogProps) {
  const activeLocations = useMemo(() => getActiveLocations(), []);
  const [type, setType] = useState<LiveWidgetType>("freeText");
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [endHour, setEndHour] = useState<number | "">("");
  const [discountPct, setDiscountPct] = useState<number | "">("");
  const [category, setCategory] = useState("");
  const [slugs, setSlugs] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!widget) return;
    setType(widget.type);
    setLabel(widget.label ?? "");
    setText(widget.config?.text ?? "");
    setEndHour(widget.config?.endHour ?? "");
    setDiscountPct(widget.config?.discountPct ?? "");
    setCategory(widget.config?.category ?? "");
    setSlugs(widget.locationSlugs ?? []);
    setActive(widget.active);
    setBusy(false);
  }, [widget]);

  if (!widget) return <Dialog open={false} onClose={onClose} />;

  const toggleSlug = (slug: string) => {
    setSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

  const submit = async () => {
    setBusy(true);
    const config: LiveWidget["config"] = {};
    if (type === "freeText") config.text = text.trim() || undefined;
    if (type === "happyHour") {
      if (endHour !== "") config.endHour = Number(endHour);
      if (discountPct !== "") config.discountPct = Number(discountPct);
      if (category.trim()) config.category = category.trim();
    }
    const payload: LiveWidget = {
      id: widget.id || makeWidgetId(),
      type,
      label: label.trim() || undefined,
      active,
      locationSlugs: slugs.length > 0 ? slugs : undefined,
      order: widget.order,
      config: Object.keys(config).length > 0 ? config : undefined,
    };
    await onSubmit(payload);
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={widget.id ? "Edit widget" : "New widget"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>{widget.id ? "Save" : "Create"}</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Select
          label="Widget type"
          value={type}
          onChange={(e) => setType(e.target.value as LiveWidgetType)}
          options={WIDGET_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          description={widgetTypeMeta(type).description}
        />
        <Input
          label="Label override"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={widgetTypeMeta(type).defaultLabel || "Custom message"}
          description={type === "freeText" ? "Required for free-text widgets — this is what appears on the bar." : "Optional. Leave blank to use the preset wording."}
        />
        {type === "freeText" && !label && (
          <Input
            label="Body text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tonight: live DJ from 19:00 🎶"
          />
        )}
        {type === "happyHour" && (
          <div className="v2-form-row-2">
            <Input
              label="Discount %"
              type="number"
              min="0"
              max="100"
              value={discountPct === "" ? "" : String(discountPct)}
              onChange={(e) => setDiscountPct(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="20"
            />
            <Input
              label="Ends at hour (0–23)"
              type="number"
              min="0"
              max="23"
              value={endHour === "" ? "" : String(endHour)}
              onChange={(e) => setEndHour(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="19"
            />
          </div>
        )}
        {type === "happyHour" && (
          <Input
            label="Category (optional)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="pasta"
            description="Renders as e.g. '20% off pasta'. Leave blank for a generic banner."
          />
        )}
        <div className="v2-field">
          <span className="v2-field-label">Locations</span>
          <div className="v2-chip-row">
            <button
              type="button"
              className={`v2-chip${slugs.length === 0 ? " is-selected" : ""}`}
              onClick={() => setSlugs([])}
            >
              All
            </button>
            {activeLocations.map((loc) => (
              <button
                key={loc.slug}
                type="button"
                className={`v2-chip${slugs.includes(loc.slug) ? " is-selected" : ""}`}
                onClick={() => toggleSlug(loc.slug)}
              >
                {loc.city}
              </button>
            ))}
          </div>
          <span className="v2-field-desc">Select one or more cities; clear all to broadcast everywhere.</span>
        </div>
        <label className="v2-toggle">
          <Switch checked={active} onChange={(v) => setActive(v)} label="Active" />
          <span>Active</span>
        </label>
      </div>
    </Dialog>
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
