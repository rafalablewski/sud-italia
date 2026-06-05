"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { Badge, Button, Card, CardBody, CardHead, Kpi } from "./ui";
import { Gift, Rocket, Sparkles, Target } from "lucide-react";

interface Reward { id: string; name: string; pointsCost: number; description?: string; active: boolean }
interface Challenge { id: string; title: string; description?: string; target: number; rewardPoints: number; active: boolean }
interface Seasonal { id: string; name: string; category?: string; price?: number; active: boolean; locationSlug?: string }
interface Loyalty {
  referral?: { referrerPoints: number; refereeDiscountGrosze: number; active: boolean };
  rewards?: Reward[];
  challenges?: Challenge[];
  seasonalItems?: Seasonal[];
}

export function GrowthV3() {
  const [s, setS] = useState<Loyalty | null>(null);
  const [loading, setLoading] = useState(true);
  const [refDraft, setRefDraft] = useState({ points: "", discount: "" });
  const [savingRef, setSavingRef] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/growth").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setS(res);
    if (res?.referral) setRefDraft({ points: String(res.referral.referrerPoints ?? 0), discount: String((res.referral.refereeDiscountGrosze ?? 0) / 100) });
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const put = async (updates: Partial<Loyalty>) => {
    const res = await fetch("/api/admin/growth", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    if (res.ok) setS((cur) => ({ ...(cur ?? {}), ...updates }));
  };

  const toggleReward = (id: string) => { const next = (s?.rewards ?? []).map((r) => (r.id === id ? { ...r, active: !r.active } : r)); put({ rewards: next }); };
  const toggleChallenge = (id: string) => { const next = (s?.challenges ?? []).map((c) => (c.id === id ? { ...c, active: !c.active } : c)); put({ challenges: next }); };
  const toggleSeasonal = (id: string) => { const next = (s?.seasonalItems ?? []).map((i) => (i.id === id ? { ...i, active: !i.active } : i)); put({ seasonalItems: next }); };

  const saveReferral = async () => {
    setSavingRef(true);
    try {
      await put({ referral: { referrerPoints: Math.max(0, Math.round(Number(refDraft.points) || 0)), refereeDiscountGrosze: Math.max(0, Math.round((Number(refDraft.discount) || 0) * 100)), active: s?.referral?.active ?? true } });
    } finally { setSavingRef(false); }
  };

  if (loading && !s) return <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading growth settings…</div>;

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
        <CardHead title="Referral program" description="Reward both sides of a referral" actions={<button type="button" className="av3-toggle" data-on={s?.referral?.active ?? false} onClick={() => put({ referral: { referrerPoints: s?.referral?.referrerPoints ?? 0, refereeDiscountGrosze: s?.referral?.refereeDiscountGrosze ?? 0, active: !(s?.referral?.active ?? false) } })} style={{ padding: "0 12px" }}>{s?.referral?.active ? "On" : "Off"}</button>} />
        <CardBody>
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
            <label className="av3-field" style={{ width: 160 }}><span className="av3-field-label">Referrer points</span><input className="av3-input" type="number" value={refDraft.points} onChange={(e) => setRefDraft((d) => ({ ...d, points: e.target.value }))} /></label>
            <label className="av3-field" style={{ width: 160 }}><span className="av3-field-label">Referee discount (zł)</span><input className="av3-input" type="number" step="0.01" value={refDraft.discount} onChange={(e) => setRefDraft((d) => ({ ...d, discount: e.target.value }))} /></label>
            <Button variant="primary" size="sm" loading={savingRef} onClick={saveReferral}>Save referral</Button>
          </div>
        </CardBody>
      </Card>

      <div className="av3-grid-2">
        <Card>
          <CardHead title="Rewards" description="Points redemption catalogue" />
          <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
            {rewards.length === 0 ? <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No rewards configured.</div> : rewards.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--av3-line)" }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div><div className="av3-cell-muted" style={{ fontSize: 11 }}>{r.pointsCost} pts</div></div>
                <button type="button" className="av3-toggle" data-on={r.active} onClick={() => toggleReward(r.id)} style={{ padding: "0 12px" }}>{r.active ? "Live" : "Off"}</button>
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
                <button type="button" className="av3-toggle" data-on={c.active} onClick={() => toggleChallenge(c.id)} style={{ padding: "0 12px" }}>{c.active ? "Live" : "Off"}</button>
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
              <button type="button" className="av3-toggle" data-on={i.active} onClick={() => toggleSeasonal(i.id)} style={{ padding: "0 12px" }}>{i.active ? "Live" : "Off"}</button>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
