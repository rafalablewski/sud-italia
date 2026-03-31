"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AdminNav } from "./AdminNav";
import { formatPrice } from "@/lib/utils";
import { TIER_CONFIG, LoyaltyTier } from "@/lib/loyalty";
import { locations as allLocations } from "@/data/locations";
import { LocationTabs } from "./LocationTabs";
import { ACHIEVEMENTS, getEarnedAchievements } from "@/lib/growth-engine";
import type { LoyaltySettings } from "@/lib/store";
import {
  Star, Gift, Trophy, Target, Users, Share2, Edit3, Trash2, Plus, Check, X,
  ToggleLeft, ToggleRight, Clock, Sparkles, Flame, Search, Heart,
} from "lucide-react";

type Tab = "loyalty" | "referral" | "gamification";

interface MemberRecord {
  phone: string;
  name: string;
  points: number;
  tier: LoyaltyTier;
  orders: number;
  totalSpent: number;
  lastOrder: string;
  locations?: string[];
}

interface ReferralRecord {
  code: string;
  owner: string;
  ownerPhone: string;
  used: number;
  earned: number;
  createdAt: string;
}

const activeLocations = allLocations.filter((l) => l.isActive);

export function AdminLoyalty() {
  const [tab, setTab] = useState<Tab>("loyalty");
  const [memberSearch, setMemberSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pointsModal, setPointsModal] = useState<{ phone: string; name: string } | null>(null);
  const [pointsAmount, setPointsAmount] = useState("");
  const [pointsReason, setPointsReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(true);

  const refreshReferrals = useCallback(() => {
    setReferralsLoading(true);
    fetch("/api/admin/referrals")
      .then((r) => r.json())
      .then((d) => setReferrals(d.referrals || []))
      .catch(() => {})
      .finally(() => setReferralsLoading(false));
  }, []);

  const handleDeleteReferral = async (code: string) => {
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) refreshReferrals();
    } catch (err) {
      console.error("Failed to delete referral:", err);
    }
  };

  const refreshMembers = useCallback(() => {
    fetch("/api/admin/members").then((r) => r.json()).then((d) => setMembers(d.members || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/admin/growth").then((r) => r.json()).then((d) => setSettings(d)).catch(() => {});
    refreshMembers();
    refreshReferrals();
  }, [refreshMembers, refreshReferrals]);

  const saveSettings = useCallback(async (updates: Partial<LoyaltySettings>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/growth", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
      const updated = await res.json();
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { alert("Failed to save."); }
    finally { setSaving(false); }
  }, []);

  const handleAdjustPoints = async () => {
    if (!pointsModal || !pointsAmount) return;
    const amount = parseInt(pointsAmount);
    if (isNaN(amount) || amount === 0) return;
    setAdjusting(true);
    try {
      const res = await fetch("/api/admin/members/points", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: pointsModal.phone, amount, reason: pointsReason.trim() || undefined }) });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Failed"); return; }
      refreshMembers();
      setPointsModal(null);
      setPointsAmount("");
      setPointsReason("");
    } catch { alert("Network error"); }
    finally { setAdjusting(false); }
  };

  const challenges = settings?.challenges || [];
  const filteredMembers = members.filter((m) => {
    if (memberSearch && !m.name.toLowerCase().includes(memberSearch.toLowerCase()) && !m.phone.includes(memberSearch)) return false;
    if (locationFilter !== "all" && m.locations && !m.locations.includes(locationFilter)) return false;
    return true;
  });

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "loyalty", label: "Loyalty", icon: Star },
    { id: "referral", label: "Referrals", icon: Share2 },
    { id: "gamification", label: "Gamification", icon: Trophy },
  ];

  return (
    <>
      <AdminNav />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-md bg-white/6 flex items-center justify-center">
            <Heart className="h-5 w-5 text-slate-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-heading font-bold admin-text">Loyalty & Rewards</h1>
            <p className="text-sm admin-text-dim">Members, tiers, referrals, achievements</p>
          </div>
          <LocationTabs value={locationFilter === "all" ? "" : locationFilter} onChange={(v) => setLocationFilter(v || "all")} includeAll />
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="glass-card p-4"><p className="text-2xl font-bold admin-text">{filteredMembers.length}</p><p className="text-xs admin-text-dim">Members</p></div>
          <div className="glass-card p-4"><p className="text-2xl font-bold text-green-400">{referrals.reduce((s, r) => s + r.used, 0)}</p><p className="text-xs admin-text-dim">Referral Conversions</p></div>
          <div className="glass-card p-4"><p className="text-2xl font-bold text-italia-gold">{ACHIEVEMENTS.length}</p><p className="text-xs admin-text-dim">Achievements</p></div>
          <div className="glass-card p-4"><p className="text-2xl font-bold text-purple-400">{challenges.length}</p><p className="text-xs admin-text-dim">Active Challenges</p></div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto scrollbar-hide pb-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${tab === t.id ? "bg-white/12 text-white shadow-sm border border-white/10" : "text-slate-400 hover:text-white hover:bg-white/6"}`}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {/* LOYALTY TAB */}
        {tab === "loyalty" && (
          <div className="space-y-4">
            {/* Tier config */}
            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-4 flex items-center gap-2"><Star className="h-4 w-4 text-italia-gold" />Tier Configuration</h3>
              {settings && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {(Object.entries(settings.tiers) as [LoyaltyTier, typeof settings.tiers.bronze][]).map(([tier, config]) => {
                      const display = TIER_CONFIG[tier];
                      return (
                        <div key={tier} className="glass-card p-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${display.color}`}>{display.label}</span>
                          <div className="space-y-2 mt-2">
                            <div><label className="text-[10px] admin-text-dim">Threshold (pts)</label><input type="number" value={config.threshold} onChange={(e) => setSettings((s) => s ? { ...s, tiers: { ...s.tiers, [tier]: { ...s.tiers[tier], threshold: parseInt(e.target.value) || 0 } } } : s)} className="glass-input w-full text-xs mt-0.5" /></div>
                            <div><label className="text-[10px] admin-text-dim">Multiplier</label><input type="number" step="0.5" value={config.multiplier} onChange={(e) => setSettings((s) => s ? { ...s, tiers: { ...s.tiers, [tier]: { ...s.tiers[tier], multiplier: parseFloat(e.target.value) || 1 } } } : s)} className="glass-input w-full text-xs mt-0.5" /></div>
                          </div>
                          <div className="mt-2 space-y-1">{config.perks.map((p, i) => <p key={i} className="text-[10px] admin-text-dim flex items-center gap-1"><Check className="h-3 w-3 text-green-400 flex-shrink-0" />{p}</p>)}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-4"><button onClick={() => saveSettings({ tiers: settings.tiers })} disabled={saving} className="glass-btn-green"><Check className="h-3.5 w-3.5" />{saving ? "Saving..." : saved ? "Saved!" : "Save Tiers"}</button></div>
                </>
              )}
            </div>

            {/* Rewards */}
            <div className="glass-card-static p-5">
              <div className="flex items-center justify-between mb-4"><h3 className="font-semibold admin-text flex items-center gap-2"><Gift className="h-4 w-4 text-italia-red" />Rewards Catalog</h3><button className="glass-btn"><Plus className="h-3.5 w-3.5" /> Add Reward</button></div>
              <div className="space-y-2">
                {(settings?.rewards || []).map((reward, idx) => (
                  <div key={reward.id} className="flex items-center justify-between p-3 glass-card">
                    <div className="flex-1 min-w-0 mr-3"><p className="text-sm font-semibold admin-text">{reward.name}</p><p className="text-xs admin-text-dim">{reward.description}</p></div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="flex items-center gap-1"><input type="number" value={reward.pointsCost} onChange={(e) => setSettings((s) => { if (!s) return s; const r = [...s.rewards]; r[idx] = { ...r[idx], pointsCost: parseInt(e.target.value) || 0 }; return { ...s, rewards: r }; })} className="glass-input w-16 text-xs text-center" /><span className="text-xs admin-text-dim">pts</span></div>
                      <button onClick={() => setSettings((s) => s ? { ...s, rewards: s.rewards.filter((_, i) => i !== idx) } : s)} className="text-slate-400 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
              {settings && <div className="flex gap-2 mt-3"><button onClick={() => saveSettings({ rewards: settings.rewards })} disabled={saving} className="glass-btn-green"><Check className="h-3.5 w-3.5" />{saving ? "Saving..." : "Save Rewards"}</button></div>}
            </div>

            {/* Members */}
            <div className="glass-card-static p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold admin-text flex items-center gap-2"><Users className="h-4 w-4 text-blue-400" />Members ({filteredMembers.length})</h3>
                <div className="relative"><Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Search..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} className="glass-input pl-8 text-xs w-48" /></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left admin-text-dim text-xs uppercase tracking-wide border-b border-white/5"><th className="pb-2 pr-4">Customer</th><th className="pb-2 pr-4">Phone</th><th className="pb-2 pr-4">Tier</th><th className="pb-2 pr-4">Points</th><th className="pb-2 pr-4">Orders</th><th className="pb-2 pr-4">Locations</th><th className="pb-2">Actions</th></tr></thead>
                  <tbody>
                    {filteredMembers.map((m) => (
                      <tr key={m.phone} className="border-t border-white/5 admin-text-muted">
                        <td className="py-2.5 pr-4 font-medium admin-text">{m.name}</td>
                        <td className="py-2.5 pr-4 font-mono text-xs">{m.phone}</td>
                        <td className="py-2.5 pr-4"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${TIER_CONFIG[m.tier].color}`}>{TIER_CONFIG[m.tier].label}</span></td>
                        <td className="py-2.5 pr-4 font-semibold text-italia-gold">{m.points}</td>
                        <td className="py-2.5 pr-4">{m.orders}</td>
                        <td className="py-2.5 pr-4">{m.locations && m.locations.length > 0 ? <div className="flex gap-1">{m.locations.map((l) => <span key={l} className="badge-info text-[9px] px-1.5 py-0.5 rounded-full font-bold capitalize">{l}</span>)}</div> : <span className="text-xs admin-text-dim">—</span>}</td>
                        <td className="py-2.5"><button onClick={() => setPointsModal({ phone: m.phone, name: m.name })} className="glass-btn-ghost text-[10px] px-2 py-1">+/- Points</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* REFERRAL TAB */}
        {tab === "referral" && (
          <div className="space-y-4">
            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-3 flex items-center gap-2"><Share2 className="h-4 w-4 text-italia-red" />Referral Program Settings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="glass-card p-3"><label className="text-xs admin-text-dim block mb-1">Referrer Reward (pts)</label><input type="number" value={settings?.referral.referrerPoints || 100} onChange={(e) => setSettings((s) => s ? { ...s, referral: { ...s.referral, referrerPoints: parseInt(e.target.value) || 0 } } : s)} className="glass-input w-full text-sm" /></div>
                <div className="glass-card p-3"><label className="text-xs admin-text-dim block mb-1">New Customer Discount (grosze)</label><input type="number" value={settings?.referral.refereeDiscountGrosze || 1000} onChange={(e) => setSettings((s) => s ? { ...s, referral: { ...s.referral, refereeDiscountGrosze: parseInt(e.target.value) || 0 } } : s)} className="glass-input w-full text-sm" /></div>
                <div className="glass-card p-3"><p className="text-xs admin-text-dim">Total Referrals</p><p className="text-lg font-bold text-green-400">{referrals.reduce((s, r) => s + r.used, 0)}</p></div>
                <div className="glass-card p-3"><p className="text-xs admin-text-dim">Points Awarded</p><p className="text-lg font-bold text-italia-gold">{referrals.reduce((s, r) => s + r.earned, 0)}</p></div>
              </div>
              <button onClick={() => settings && saveSettings({ referral: settings.referral })} disabled={saving} className="glass-btn-green"><Check className="h-3.5 w-3.5" />{saving ? "Saving..." : "Save Referral Settings"}</button>
            </div>
            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-3">Active Referral Codes</h3>
              {referralsLoading ? (
                <div className="flex items-center justify-center py-8"><Clock className="h-5 w-5 text-slate-400 animate-spin" /><span className="ml-2 text-sm admin-text-dim">Loading referrals...</span></div>
              ) : referrals.length === 0 ? (
                <p className="text-sm admin-text-dim text-center py-6">No referral codes yet.</p>
              ) : (
                <div className="space-y-2">
                  {referrals.map((r) => (
                    <div key={r.code} className="flex items-center justify-between p-3 glass-card">
                      <div><p className="font-mono text-sm font-bold admin-text">{r.code}</p><p className="text-xs admin-text-dim">{r.owner} &middot; {r.createdAt}</p></div>
                      <div className="flex items-center gap-4"><div className="text-right"><p className="text-sm font-bold text-green-400">{r.used} uses</p><p className="text-xs admin-text-dim">{r.earned} pts</p></div><button onClick={() => handleDeleteReferral(r.code)} className="text-slate-400 hover:text-red-400"><X className="h-4 w-4" /></button></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* GAMIFICATION TAB */}
        {tab === "gamification" && (
          <div className="space-y-4">
            <div className="glass-card-static p-5">
              <div className="flex items-center justify-between mb-4"><h3 className="font-semibold admin-text flex items-center gap-2"><Target className="h-4 w-4 text-italia-red" />Weekly Challenges</h3><button className="glass-btn"><Plus className="h-3.5 w-3.5" /> New Challenge</button></div>
              <div className="space-y-2">
                {challenges.map((ch) => (
                  <div key={ch.id} className="flex items-center justify-between p-3 glass-card">
                    <div><p className="text-sm font-semibold admin-text">{ch.title}</p><p className="text-xs admin-text-dim">{ch.description}</p></div>
                    <div className="flex items-center gap-3"><span className="text-xs font-bold text-italia-gold">+{ch.rewardPoints} pts</span><span className="text-xs admin-text-dim">Target: {ch.target}</span><button className="text-slate-400 hover:text-white"><Edit3 className="h-3.5 w-3.5" /></button><button className="text-slate-400 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-card-static p-5">
              <div className="flex items-center justify-between mb-4"><h3 className="font-semibold admin-text flex items-center gap-2"><Trophy className="h-4 w-4 text-italia-gold" />Achievements ({ACHIEVEMENTS.length})</h3><button className="glass-btn"><Plus className="h-3.5 w-3.5" /> New Achievement</button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ACHIEVEMENTS.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 glass-card">
                    <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-md bg-white/6 flex items-center justify-center text-sm flex-shrink-0">{a.emoji}</span><div><p className="text-sm font-semibold admin-text">{a.name}</p><p className="text-[10px] admin-text-dim">{a.description}</p></div></div>
                    <div className="flex items-center gap-2"><span className="text-xs font-bold text-italia-gold">+{a.pointsReward}</span><button className="text-slate-400 hover:text-white"><Edit3 className="h-3 w-3" /></button></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Points modal */}
      {pointsModal && createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPointsModal(null)} />
          <div className="relative bg-[#1e293b] border border-white/15 rounded-lg shadow-2xl p-4 sm:p-6 w-full max-w-sm mx-4 sm:mx-auto">
            <h3 className="font-heading font-bold text-lg admin-text mb-1">Adjust Points</h3>
            <p className="text-sm admin-text-dim mb-4">{pointsModal.name} &middot; <span className="font-mono text-xs">{pointsModal.phone}</span></p>
            <div className="space-y-3 mb-4">
              <div><label className="text-xs admin-text-dim block mb-1">Amount (positive to add, negative to remove)</label><input type="number" value={pointsAmount} onChange={(e) => setPointsAmount(e.target.value)} placeholder="e.g. 50 or -20" className="glass-input w-full" autoFocus /></div>
              <div><label className="text-xs admin-text-dim block mb-1">Reason (optional)</label><input type="text" value={pointsReason} onChange={(e) => setPointsReason(e.target.value)} placeholder="e.g. Compensation" className="glass-input w-full text-xs" /></div>
            </div>
            {pointsAmount && parseInt(pointsAmount) !== 0 && <p className={`text-sm font-semibold mb-4 ${parseInt(pointsAmount) > 0 ? "text-green-400" : "text-red-400"}`}>{parseInt(pointsAmount) > 0 ? "+" : ""}{pointsAmount} points</p>}
            <div className="flex gap-2">
              <button onClick={handleAdjustPoints} disabled={adjusting || !pointsAmount || parseInt(pointsAmount) === 0} className="glass-btn-green flex-1"><Check className="h-3.5 w-3.5" />{adjusting ? "Saving..." : "Apply"}</button>
              <button onClick={() => { setPointsModal(null); setPointsAmount(""); setPointsReason(""); }} className="glass-btn-ghost flex-1">Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
