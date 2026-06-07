"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Crown, Gift, Pencil, Plus, Rocket, Sparkles, Target, Trash2 } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { Badge, Button, Card, CardBody, CardHead, type ColumnV3, Dialog, Kpi, SkeletonPage, Switch, Table } from "./ui";

interface Reward { id: string; name: string; pointsCost: number; description?: string; active: boolean }
interface ReferralRow { code: string; owner: string; ownerPhone: string; used: number; earned: number; createdAt: string }
interface Challenge { id: string; title: string; description?: string; target: number; rewardPoints: number; active: boolean }
interface Seasonal { id: string; name: string; category?: string; price?: number; active: boolean; locationSlug?: string }
interface Tier { label: string; threshold: number; multiplier: number; perks: string[] }
type TierKey = "bronze" | "silver" | "gold" | "platinum";
type LiveWidgetType =
  | "ordersInLastHour" | "currentlyPreparing" | "trendingItem" | "avgPrepTime" | "happyHour" | "truckLocation" | "freeText";
interface LiveWidget {
  id: string;
  type: LiveWidgetType;
  label?: string;
  active: boolean;
  locationSlugs?: string[];
  order: number;
  config?: { text?: string; endHour?: number; discountPct?: number; category?: string };
}
interface Loyalty {
  referral?: { referrerPoints: number; refereeDiscountGrosze: number; active: boolean };
  rewards?: Reward[];
  challenges?: Challenge[];
  seasonalItems?: Seasonal[];
  tiers?: Record<TierKey, Tier>;
  liveWidgets?: LiveWidget[];
}

const TIER_KEYS: TierKey[] = ["bronze", "silver", "gold", "platinum"];
const TIER_ACCENT: Record<TierKey, string> = { bronze: "#cd7f4d", silver: "#b8bcc4", gold: "var(--av3-platinum)", platinum: "#7fd4e0" };
// Mirror of LIVE_WIDGET_LIMIT in src/lib/store.ts — the public bar caps here.
const LIVE_WIDGET_LIMIT = 7;
const WIDGET_TYPE_OPTIONS: { value: LiveWidgetType; label: string; description: string; defaultLabel: string }[] = [
  { value: "ordersInLastHour", label: "Orders in last hour", description: "Live order count pulse.", defaultLabel: "orders in the last hour" },
  { value: "currentlyPreparing", label: "Currently preparing", description: "How many orders are on the line right now.", defaultLabel: "orders being prepared" },
  { value: "trendingItem", label: "Trending item", description: "Highlights the most-ordered dish.", defaultLabel: "Trending" },
  { value: "avgPrepTime", label: "Average prep time", description: "Rolling average prep time across recent orders.", defaultLabel: "Avg prep" },
  { value: "happyHour", label: "Happy hour", description: "Time-bound discount banner. Auto-hides once end hour passes.", defaultLabel: "" },
  { value: "truckLocation", label: "Truck location", description: "Today's address for the food truck.", defaultLabel: "Truck is at" },
  { value: "freeText", label: "Free text / announcement", description: "Admin-supplied one-liner (tonight's special, weather…).", defaultLabel: "" },
];
function widgetTypeMeta(t: LiveWidgetType) { return WIDGET_TYPE_OPTIONS.find((o) => o.value === t) ?? WIDGET_TYPE_OPTIONS[0]; }
function makeWidgetId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `lw-${crypto.randomUUID().slice(0, 8)}`;
  return `lw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function GrowthV3() {
  const [s, setS] = useState<Loyalty | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refDraft, setRefDraft] = useState({ points: "", discount: "" });
  const [savingRef, setSavingRef] = useState(false);
  const [widgetEdit, setWidgetEdit] = useState<LiveWidget | null>(null);
  const [rewardEdit, setRewardEdit] = useState<Reward | null>(null);
  const locations = useMemo(() => getActiveLocations(), []);

  const load = useCallback(async () => {
    const [res, refs] = await Promise.all([
      fetch("/api/admin/growth").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/admin/referrals").then((r) => (r.ok ? r.json() : { referrals: [] })).catch(() => ({ referrals: [] })),
    ]);
    setS(res);
    setReferrals(Array.isArray(refs?.referrals) ? refs.referrals : []);
    if (res?.referral) setRefDraft({ points: String(res.referral.referrerPoints ?? 0), discount: String((res.referral.refereeDiscountGrosze ?? 0) / 100) });
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const put = async (updates: Partial<Loyalty>) => {
    const res = await fetch("/api/admin/growth", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    if (res.ok) setS((cur) => ({ ...(cur ?? {}), ...updates }));
  };

  // Tiers — edit locally on change, persist on blur (no separate Save button).
  const updateTier = (key: TierKey, patch: Partial<Tier>) =>
    setS((cur) => (cur?.tiers ? { ...cur, tiers: { ...cur.tiers, [key]: { ...cur.tiers[key], ...patch } } } : cur));
  const persistTiers = () => {
    if (!s?.tiers) return;
    const cleaned = Object.fromEntries(
      TIER_KEYS.map((k) => [k, { ...s.tiers![k], perks: s.tiers![k].perks.map((p) => p.trim()).filter(Boolean) }]),
    ) as Record<TierKey, Tier>;
    put({ tiers: cleaned });
  };

  // Live widgets — every mutation persists immediately (rule #7).
  const widgets = s?.liveWidgets ?? [];
  const saveWidget = (w: LiveWidget) => {
    const exists = widgets.some((x) => x.id === w.id);
    const next = exists ? widgets.map((x) => (x.id === w.id ? w : x)) : [...widgets, { ...w, order: widgets.length }];
    put({ liveWidgets: next });
  };
  const toggleWidget = (id: string) => put({ liveWidgets: widgets.map((w) => (w.id === id ? { ...w, active: !w.active } : w)) });
  const deleteWidget = (id: string) => put({ liveWidgets: widgets.filter((w) => w.id !== id).map((w, i) => ({ ...w, order: i })) });
  const reorderWidget = (id: string, delta: number) => {
    const sorted = [...widgets].sort((a, b) => a.order - b.order);
    const i = sorted.findIndex((w) => w.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    put({ liveWidgets: sorted.map((w, k) => ({ ...w, order: k })) });
  };

  const toggleReward = (id: string) => { const next = (s?.rewards ?? []).map((r) => (r.id === id ? { ...r, active: !r.active } : r)); put({ rewards: next }); };
  // Reward CRUD (v2 parity — v3 previously only toggled). Persists immediately.
  const upsertReward = (r: Reward) => {
    const list = s?.rewards ?? [];
    const next = list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [...list, r];
    put({ rewards: next });
  };
  const deleteReward = (id: string) => put({ rewards: (s?.rewards ?? []).filter((r) => r.id !== id) });
  // Referral codes table (v2 parity — was missing entirely from v3).
  const deleteReferralCode = async (code: string) => {
    const res = await fetch("/api/admin/referrals", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    if (res.ok) setReferrals((arr) => arr.filter((r) => r.code !== code));
  };
  const toggleChallenge = (id: string) => { const next = (s?.challenges ?? []).map((c) => (c.id === id ? { ...c, active: !c.active } : c)); put({ challenges: next }); };
  const toggleSeasonal = (id: string) => { const next = (s?.seasonalItems ?? []).map((i) => (i.id === id ? { ...i, active: !i.active } : i)); put({ seasonalItems: next }); };

  const saveReferral = async () => {
    setSavingRef(true);
    try {
      await put({ referral: { referrerPoints: Math.max(0, Math.round(Number(refDraft.points) || 0)), refereeDiscountGrosze: Math.max(0, Math.round((Number(refDraft.discount) || 0) * 100)), active: s?.referral?.active ?? true } });
    } finally { setSavingRef(false); }
  };

  if (loading && !s) return <SkeletonPage />;

  const rewards = s?.rewards ?? [];
  const challenges = s?.challenges ?? [];
  const seasonal = s?.seasonalItems ?? [];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Campaigns</h1>
          <div className="av3-pagehead-sub">Loyalty levers · referrals · rewards · challenges · seasonal — toggle = saved</div>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Active rewards" icon={Gift} value={`${rewards.filter((r) => r.active).length}/${rewards.length}`} accentVar="--av3-c2" />
        <Kpi label="Active challenges" icon={Target} value={`${challenges.filter((c) => c.active).length}/${challenges.length}`} accentVar="--av3-c4" />
        <Kpi label="Seasonal live" icon={Sparkles} value={`${seasonal.filter((i) => i.active).length}/${seasonal.length}`} accentVar="--av3-c5" />
        <Kpi label="Referrals" icon={Rocket} value={s?.referral?.active ? "On" : "Off"} accentVar="--av3-c3" />
      </div>

      <Card>
        <CardHead title="Referral program" description="Reward both sides of a referral" actions={<Switch aria-label="Referral program" checked={s?.referral?.active ?? false} onChange={() => put({ referral: { referrerPoints: s?.referral?.referrerPoints ?? 0, refereeDiscountGrosze: s?.referral?.refereeDiscountGrosze ?? 0, active: !(s?.referral?.active ?? false) } })} />} />
        <CardBody>
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
            <label className="av3-field" style={{ width: 160 }}><span className="av3-field-label">Referrer points</span><input className="av3-input" type="number" value={refDraft.points} onChange={(e) => setRefDraft((d) => ({ ...d, points: e.target.value }))} /></label>
            <label className="av3-field" style={{ width: 160 }}><span className="av3-field-label">Referee discount (zł)</span><input className="av3-input" type="number" step="0.01" value={refDraft.discount} onChange={(e) => setRefDraft((d) => ({ ...d, discount: e.target.value }))} /></label>
            <Button variant="primary" size="sm" loading={savingRef} onClick={saveReferral}>Save referral</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead
          title="Referral codes"
          description={`${referrals.length} code${referrals.length === 1 ? "" : "s"} in circulation · ${referrals.reduce((a, r) => a + r.used, 0)} uses · ${referrals.reduce((a, r) => a + r.earned, 0).toLocaleString()} pts awarded`}
        />
        {referrals.length === 0 ? (
          <CardBody><div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No referral codes yet — codes are created when customers tap Share on the rewards screen.</div></CardBody>
        ) : (
          <Table
            columns={[
              { key: "code", header: "Code", render: (r: ReferralRow) => <span className="mono" style={{ fontFamily: "var(--av3-mono)" }}>{r.code}</span> },
              { key: "owner", header: "Owner", render: (r: ReferralRow) => <span>{r.owner}</span> },
              { key: "phone", header: "Phone", render: (r: ReferralRow) => <span className="av3-cell-muted mono" style={{ fontFamily: "var(--av3-mono)" }}>{r.ownerPhone}</span> },
              { key: "used", header: "Uses", num: true, render: (r: ReferralRow) => <span className="mono" style={{ fontFamily: "var(--av3-mono)" }}>{r.used.toLocaleString()}</span> },
              { key: "earned", header: "Earned pts", num: true, render: (r: ReferralRow) => <span className="mono" style={{ fontFamily: "var(--av3-mono)" }}>{r.earned.toLocaleString()}</span> },
              { key: "act", header: "", render: (r: ReferralRow) => <Button variant="ghost" size="sm" onClick={() => deleteReferralCode(r.code)}>Remove</Button> },
            ] as ColumnV3<ReferralRow>[]}
            rows={referrals}
            rowKey={(r) => r.code}
          />
        )}
      </Card>

      {s?.tiers && (
        <Card>
          <CardHead title="Loyalty tiers" description="Thresholds, point multipliers and perks — edits save on blur" />
          <CardBody>
            <div className="av3-grid-2" style={{ gap: 12 }}>
              {TIER_KEYS.map((k) => {
                const t = s.tiers![k];
                return (
                  <div key={k} style={{ border: "1px solid var(--av3-line)", borderRadius: "var(--av3-r-md)", padding: 12, borderLeft: `3px solid ${TIER_ACCENT[k]}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                      <Crown style={{ width: 14, height: 14, color: TIER_ACCENT[k] }} />
                      <span style={{ fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>{k}</span>
                    </div>
                    <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 84px 84px", marginBottom: 8 }}>
                      <label className="av3-field"><span className="av3-field-label">Label</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={t.label} onChange={(e) => updateTier(k, { label: e.target.value })} onBlur={persistTiers} /></label>
                      <label className="av3-field"><span className="av3-field-label">From pts</span><input className="av3-input" type="number" value={t.threshold} onChange={(e) => updateTier(k, { threshold: Number(e.target.value) || 0 })} onBlur={persistTiers} /></label>
                      <label className="av3-field"><span className="av3-field-label">×Mult</span><input className="av3-input" type="number" step="0.1" value={t.multiplier} onChange={(e) => updateTier(k, { multiplier: Number(e.target.value) || 1 })} onBlur={persistTiers} /></label>
                    </div>
                    <label className="av3-field"><span className="av3-field-label">Perks (one per line)</span><textarea className="av3-input" rows={3} style={{ height: "auto", fontFamily: "var(--av3-ui)", padding: "8px 10px", resize: "vertical" }} value={t.perks.join("\n")} onChange={(e) => updateTier(k, { perks: e.target.value.split("\n") })} onBlur={persistTiers} /></label>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="av3-grid-2">
        <Card>
          <CardHead title="Rewards" description="Points redemption catalogue" actions={<Button variant="primary" size="sm" onClick={() => setRewardEdit({ id: "", name: "", description: "", pointsCost: 100, active: true })}><Plus className="av3-btn-ico" /> New reward</Button>} />
          <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
            {rewards.length === 0 ? <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No rewards configured.</div> : rewards.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--av3-line)" }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div><div className="av3-cell-muted" style={{ fontSize: 11 }}>{r.pointsCost} pts{r.description ? ` · ${r.description}` : ""}</div></div>
                <Switch checked={r.active} label={r.active ? "Live" : "Off"} onChange={() => toggleReward(r.id)} />
                <button type="button" className="av3-iconbtn-sm" aria-label="Edit reward" onClick={() => setRewardEdit(r)}><Pencil /></button>
                <button type="button" className="av3-iconbtn-sm" aria-label="Delete reward" onClick={() => deleteReward(r.id)}><Trash2 /></button>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHead title="Challenges" description="Gamified repeat-visit goals" />
          <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
            {challenges.length === 0 ? <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No challenges configured.</div> : challenges.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--av3-line)" }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{c.title}</div><div className="av3-cell-muted" style={{ fontSize: 11 }}>{c.target} → {c.rewardPoints} pts</div></div>
                <Switch checked={c.active} label={c.active ? "Live" : "Off"} onChange={() => toggleChallenge(c.id)} />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHead title="Seasonal items" actions={<Badge tone="neutral">{seasonal.filter((i) => i.active).length} live</Badge>} />
        <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
          {seasonal.length === 0 ? <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No seasonal items.</div> : seasonal.map((i) => (
            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--av3-line)" }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{i.name}</div><div className="av3-cell-muted" style={{ fontSize: 11 }}>{i.category ?? "—"}{i.price ? ` · ${formatPrice(i.price)}` : ""}{i.locationSlug ? ` · ${i.locationSlug}` : ""}</div></div>
              <Switch checked={i.active} label={i.active ? "Live" : "Off"} onChange={() => toggleSeasonal(i.id)} />
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHead
          title="Live activity widgets"
          description={`Customer-site social proof · ${widgets.filter((w) => w.active).length}/${LIVE_WIDGET_LIMIT} active · ${widgets.length} total`}
          actions={<Button variant="primary" size="sm" onClick={() => setWidgetEdit({ id: "", type: "freeText", active: true, order: widgets.length })}><Plus className="av3-btn-ico" /> Add widget</Button>}
        />
        <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
          {widgets.length >= LIVE_WIDGET_LIMIT && (
            <div className="av3-cell-muted" style={{ fontSize: 11.5, padding: "6px 0" }}>{LIVE_WIDGET_LIMIT} is the bar limit — disable or remove one before the rest render.</div>
          )}
          {widgets.length === 0 ? (
            <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No widgets — add one to show live signals on the customer site.</div>
          ) : (
            [...widgets].sort((a, b) => a.order - b.order).map((w, idx, arr) => {
              const meta = widgetTypeMeta(w.type);
              const locLabel = !w.locationSlugs?.length ? "All locations" : w.locationSlugs.map((sl) => locations.find((l) => l.slug === sl)?.city ?? sl).join(" · ");
              return (
                <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--av3-line)", opacity: w.active ? 1 : 0.55 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <button type="button" className="av3-iconbtn-sm" aria-label="Move up" disabled={idx === 0} onClick={() => reorderWidget(w.id, -1)} style={{ width: 22, height: 15 }}><ArrowUp /></button>
                    <button type="button" className="av3-iconbtn-sm" aria-label="Move down" disabled={idx === arr.length - 1} onClick={() => reorderWidget(w.id, 1)} style={{ width: 22, height: 15 }}><ArrowDown /></button>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{w.label || meta.label}</div>
                    <div className="av3-cell-muted" style={{ fontSize: 11 }}>{meta.label} · {locLabel}</div>
                  </div>
                  <Switch aria-label={w.label || meta.label} checked={w.active} onChange={() => toggleWidget(w.id)} />
                  <button type="button" className="av3-iconbtn-sm" aria-label="Edit widget" onClick={() => setWidgetEdit(w)}><Pencil /></button>
                  <button type="button" className="av3-iconbtn-sm" aria-label="Delete widget" onClick={() => deleteWidget(w.id)}><Trash2 /></button>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      {widgetEdit && (
        <WidgetDialogV3
          widget={widgetEdit}
          locations={locations}
          onClose={() => setWidgetEdit(null)}
          onSubmit={(w) => { saveWidget(w); setWidgetEdit(null); }}
        />
      )}

      {rewardEdit && (
        <RewardDialogV3
          reward={rewardEdit}
          onClose={() => setRewardEdit(null)}
          onSubmit={(r) => { upsertReward(r); setRewardEdit(null); }}
        />
      )}
    </>
  );
}

function RewardDialogV3({ reward, onClose, onSubmit }: { reward: Reward; onClose: () => void; onSubmit: (r: Reward) => void }) {
  const [name, setName] = useState(reward.name);
  const [description, setDescription] = useState(reward.description ?? "");
  const [points, setPoints] = useState(String(reward.pointsCost));

  const submit = () => {
    if (!name.trim()) return;
    // Derive a stable slug id for new rewards (matches v2's RewardDialog).
    // A name of only non-alphanumerics (e.g. "!!!") slugifies to "" — fall
    // back to a generated id so we never produce an empty/colliding key.
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
    const id = reward.id || slug || `reward-${Date.now()}`;
    onSubmit({ id, name: name.trim(), description: description.trim() || undefined, pointsCost: Math.max(0, Math.round(Number(points) || 0)), active: reward.active });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={reward.id ? `Edit ${reward.name}` : "New reward"}
      width={460}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" disabled={!name.trim()} onClick={submit}>{reward.id ? "Save" : "Create"}</Button></>}
    >
      <label className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Free espresso" /></label>
      <label className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Description</span><textarea className="av3-input" rows={2} style={{ height: "auto", fontFamily: "var(--av3-ui)", padding: "8px 10px", resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label className="av3-field"><span className="av3-field-label">Cost (points)</span><input className="av3-input" type="number" min="0" value={points} onChange={(e) => setPoints(e.target.value)} /></label>
    </Dialog>
  );
}

function WidgetDialogV3({
  widget,
  locations,
  onClose,
  onSubmit,
}: {
  widget: LiveWidget;
  locations: ReturnType<typeof getActiveLocations>;
  onClose: () => void;
  onSubmit: (w: LiveWidget) => void;
}) {
  const [type, setType] = useState<LiveWidgetType>(widget.type);
  const [label, setLabel] = useState(widget.label ?? "");
  const [text, setText] = useState(widget.config?.text ?? "");
  const [endHour, setEndHour] = useState<string>(widget.config?.endHour != null ? String(widget.config.endHour) : "");
  const [discountPct, setDiscountPct] = useState<string>(widget.config?.discountPct != null ? String(widget.config.discountPct) : "");
  const [category, setCategory] = useState(widget.config?.category ?? "");
  const [slugs, setSlugs] = useState<string[]>(widget.locationSlugs ?? []);
  const [active, setActive] = useState(widget.active);
  const meta = widgetTypeMeta(type);

  const toggleSlug = (slug: string) => setSlugs((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]));

  const submit = () => {
    const config: LiveWidget["config"] = {};
    if (type === "freeText") config.text = text.trim() || undefined;
    if (type === "happyHour") {
      if (endHour !== "") config.endHour = Number(endHour);
      if (discountPct !== "") config.discountPct = Number(discountPct);
      if (category.trim()) config.category = category.trim();
    }
    onSubmit({
      id: widget.id || makeWidgetId(),
      type,
      label: label.trim() || undefined,
      active,
      locationSlugs: slugs.length > 0 ? slugs : undefined,
      order: widget.order,
      config: Object.keys(config).length > 0 ? config : undefined,
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={widget.id ? "Edit widget" : "New widget"}
      width={500}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" onClick={submit}>{widget.id ? "Save" : "Create"}</Button></>}
    >
      <label className="av3-field" style={{ marginBottom: 10 }}>
        <span className="av3-field-label">Widget type</span>
        <select className="av3-select" value={type} onChange={(e) => setType(e.target.value as LiveWidgetType)}>
          {WIDGET_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ fontSize: 11, color: "var(--av3-subtle)" }}>{meta.description}</span>
      </label>
      <label className="av3-field" style={{ marginBottom: 10 }}>
        <span className="av3-field-label">Label override</span>
        <input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={meta.defaultLabel || "Custom message"} />
        <span style={{ fontSize: 11, color: "var(--av3-subtle)" }}>{type === "freeText" ? "Required for free-text widgets — this is what shows on the bar." : "Optional — leave blank for the preset wording."}</span>
      </label>
      {type === "freeText" && !label && (
        <label className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Body text</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tonight: live DJ from 19:00 🎶" /></label>
      )}
      {type === "happyHour" && (
        <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
          <label className="av3-field"><span className="av3-field-label">Discount %</span><input className="av3-input" type="number" min="0" max="100" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} placeholder="20" /></label>
          <label className="av3-field"><span className="av3-field-label">Ends at hour</span><input className="av3-input" type="number" min="0" max="23" value={endHour} onChange={(e) => setEndHour(e.target.value)} placeholder="19" /></label>
          <label className="av3-field"><span className="av3-field-label">Category</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="pasta" /></label>
        </div>
      )}
      <div className="av3-field" style={{ marginBottom: 10 }}>
        <span className="av3-field-label">Locations</span>
        <div className="av3-chiprow" style={{ flexWrap: "wrap" }}>
          <button type="button" className={`av3-chip ${slugs.length === 0 ? "is-active" : ""}`} onClick={() => setSlugs([])}>All</button>
          {locations.map((loc) => (
            <button key={loc.slug} type="button" className={`av3-chip ${slugs.includes(loc.slug) ? "is-active" : ""}`} onClick={() => toggleSlug(loc.slug)}>{loc.city}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: "var(--av3-subtle)" }}>Pick one or more cities; clear all to broadcast everywhere.</span>
      </div>
      <div className="av3-field" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Switch aria-label="Show this widget" checked={active} onChange={setActive} />
        <span className="av3-field-label" style={{ textTransform: "none" }}>Show this widget</span>
      </div>
    </Dialog>
  );
}
