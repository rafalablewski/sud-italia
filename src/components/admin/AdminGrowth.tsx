"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AdminNav } from "./AdminNav";
import { formatPrice } from "@/lib/utils";
import {
  TIER_CONFIG,
  LoyaltyTier,
} from "@/lib/loyalty";
import {
  ACHIEVEMENTS,
} from "@/lib/growth-engine";
import type { LoyaltySettings } from "@/lib/store";
import {
  Rocket,
  Star,
  Gift,
  Trophy,
  Target,
  Zap,
  Users,
  Share2,
  Edit3,
  Trash2,
  Plus,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
  Clock,
  Sparkles,
  Flame,
  Search,
  TrendingUp,
  MessageCircle,
} from "lucide-react";

type Tab = "loyalty" | "referral" | "gamification" | "seasonal" | "speed" | "chatbot";

interface MemberRecord {
  phone: string;
  name: string;
  points: number;
  tier: LoyaltyTier;
  orders: number;
  totalSpent: number;
  lastOrder: string;
}

// --- Simulated referral data ---
const MOCK_REFERRALS = [
  { code: "SUD-ANNA-X4B2", owner: "Anna Nowak", used: 7, earned: 700, createdAt: "2026-01-15" },
  { code: "SUD-JAN-M9K1", owner: "Jan Kowalski", used: 3, earned: 300, createdAt: "2026-02-10" },
  { code: "SUD-MARI-P2L5", owner: "Maria Lewandowska", used: 12, earned: 1200, createdAt: "2025-11-20" },
];

// --- Simulated seasonal items ---
const MOCK_SEASONAL = [
  { id: "s1", name: "Tartufo Nero", category: "pizza", price: 4500, until: "2026-04-30", active: true },
  { id: "s2", name: "Panna Cotta al Limoncello", category: "desserts", price: 2200, until: "2026-04-30", active: true },
  { id: "s3", name: "Risotto Primavera", category: "pasta", price: 3200, until: "2026-05-31", active: true },
];

// --- Simulated chatbot FAQ ---
const MOCK_FAQ = [
  { keyword: "menu", response: "We serve authentic Neapolitan pizza, fresh pasta, antipasti...", hits: 342 },
  { keyword: "hours", response: "Our hours vary by location: Kraków: Mon-Thu 11-21...", hits: 218 },
  { keyword: "delivery", response: "Yes, we offer delivery! Minimum order 30 PLN...", hits: 189 },
  { keyword: "vegetarian", response: "We have great vegetarian options! Try our Margherita...", hits: 134 },
  { keyword: "allergen", response: "For specific allergen information, please ask our staff...", hits: 87 },
  { keyword: "loyalty", response: "Join our Sud Italia Rewards program! Earn 1 point per PLN...", hits: 156 },
];

export function AdminGrowth() {
  const [tab, setTab] = useState<Tab>("loyalty");
  const [memberSearch, setMemberSearch] = useState("");
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Points adjustment modal
  const [pointsModal, setPointsModal] = useState<{ phone: string; name: string } | null>(null);
  const [pointsAmount, setPointsAmount] = useState("");
  const [pointsReason, setPointsReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const refreshMembers = useCallback(() => {
    fetch("/api/admin/members")
      .then((r) => r.json())
      .then((data) => setMembers(data.members || []))
      .catch(() => {});
  }, []);

  // Load settings + members from DB
  useEffect(() => {
    fetch("/api/admin/growth")
      .then((r) => r.json())
      .then((data) => setSettings(data))
      .catch(() => {});
    refreshMembers();
  }, [refreshMembers]);

  const handleAdjustPoints = async () => {
    if (!pointsModal || !pointsAmount) return;
    const amount = parseInt(pointsAmount);
    if (isNaN(amount) || amount === 0) return;

    setAdjusting(true);
    try {
      const res = await fetch("/api/admin/members/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: pointsModal.phone,
          amount,
          reason: pointsReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to adjust points");
        return;
      }
      refreshMembers();
      setPointsModal(null);
      setPointsAmount("");
      setPointsReason("");
    } catch (err) {
      alert("Network error — failed to adjust points");
    } finally {
      setAdjusting(false);
    }
  };

  // Save settings to DB
  const saveSettings = useCallback(async (updates: Partial<LoyaltySettings>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/growth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const updated = await res.json();
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }, []);

  const challenges = settings?.challenges || [];

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.phone.includes(memberSearch)
  );

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "loyalty", label: "Loyalty", icon: Star },
    { id: "referral", label: "Referrals", icon: Share2 },
    { id: "gamification", label: "Gamification", icon: Trophy },
    { id: "seasonal", label: "Seasonal Menu", icon: Sparkles },
    { id: "speed", label: "Speed", icon: Zap },
    { id: "chatbot", label: "Chatbot", icon: MessageCircle },
  ];

  return (
    <>
      <AdminNav />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-blue-500/20 flex items-center justify-center">
            <Rocket className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <h1 className="text-xl font-heading font-bold admin-text">Growth Management</h1>
            <p className="text-sm admin-text-dim">Manage loyalty, referrals, gamification, and more</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="glass-card p-4">
            <p className="text-2xl font-bold admin-text">{members.length}</p>
            <p className="text-xs admin-text-dim">Loyalty Members</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-2xl font-bold text-green-400">{MOCK_REFERRALS.reduce((s, r) => s + r.used, 0)}</p>
            <p className="text-xs admin-text-dim">Referral Conversions</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-2xl font-bold text-italia-gold">{ACHIEVEMENTS.length}</p>
            <p className="text-xs admin-text-dim">Achievements</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-2xl font-bold text-purple-400">{MOCK_SEASONAL.length}</p>
            <p className="text-xs admin-text-dim">Seasonal Items</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto scrollbar-hide pb-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                tab === t.id
                  ? "bg-white/12 text-white shadow-sm border border-white/10"
                  : "text-slate-400 hover:text-white hover:bg-white/6"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ===== LOYALTY TAB ===== */}
        {tab === "loyalty" && (
          <div className="space-y-4">
            {/* Tier configuration */}
            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-4 flex items-center gap-2">
                <Star className="h-4 w-4 text-italia-gold" />
                Tier Configuration
              </h3>
              {settings && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(Object.entries(settings.tiers) as [LoyaltyTier, typeof settings.tiers.bronze][]).map(([tier, config]) => {
                    const display = TIER_CONFIG[tier];
                    return (
                      <div key={tier} className="glass-card p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${display.color}`}>
                            {display.label}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="text-[10px] admin-text-dim">Threshold (pts)</label>
                            <input
                              type="number"
                              value={config.threshold}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setSettings((s) => s ? { ...s, tiers: { ...s.tiers, [tier]: { ...s.tiers[tier], threshold: val } } } : s);
                              }}
                              className="glass-input w-full text-xs mt-0.5"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] admin-text-dim">Multiplier</label>
                            <input
                              type="number"
                              step="0.5"
                              value={config.multiplier}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 1;
                                setSettings((s) => s ? { ...s, tiers: { ...s.tiers, [tier]: { ...s.tiers[tier], multiplier: val } } } : s);
                              }}
                              className="glass-input w-full text-xs mt-0.5"
                            />
                          </div>
                        </div>
                        <div className="mt-2 space-y-1">
                          {config.perks.map((perk, i) => (
                            <p key={i} className="text-[10px] admin-text-dim flex items-center gap-1">
                              <Check className="h-3 w-3 text-green-400 flex-shrink-0" />
                              {perk}
                            </p>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {settings && (
                <div className="flex gap-2 mt-4">
                  <button onClick={() => saveSettings({ tiers: settings.tiers })} disabled={saving} className="glass-btn-green text-xs">
                    <Check className="h-3.5 w-3.5" /> {saving ? "Saving..." : saved ? "Saved!" : "Save Tier Settings"}
                  </button>
                </div>
              )}
            </div>

            {/* Rewards catalog */}
            <div className="glass-card-static p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold admin-text flex items-center gap-2">
                  <Gift className="h-4 w-4 text-italia-red" />
                  Rewards Catalog
                </h3>
                <button className="glass-btn text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add Reward
                </button>
              </div>
              <div className="space-y-2">
                {(settings?.rewards || []).map((reward, idx) => (
                  <div key={reward.id} className="flex items-center justify-between p-3 glass-card">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm font-semibold admin-text">{reward.name}</p>
                      <p className="text-xs admin-text-dim">{reward.description}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={reward.pointsCost}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setSettings((s) => {
                              if (!s) return s;
                              const rewards = [...s.rewards];
                              rewards[idx] = { ...rewards[idx], pointsCost: val };
                              return { ...s, rewards };
                            });
                          }}
                          className="glass-input w-16 text-xs text-center"
                        />
                        <span className="text-xs admin-text-dim">pts</span>
                      </div>
                      <button
                        onClick={() => {
                          setSettings((s) => {
                            if (!s) return s;
                            const rewards = s.rewards.filter((_, i) => i !== idx);
                            return { ...s, rewards };
                          });
                        }}
                        className="text-slate-400 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {settings && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => saveSettings({ rewards: settings.rewards })} disabled={saving} className="glass-btn-green text-xs">
                    <Check className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Rewards"}
                  </button>
                </div>
              )}
            </div>

            {/* Members table */}
            <div className="glass-card-static p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold admin-text flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-400" />
                  Members ({members.length})
                </h3>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search members..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="glass-input pl-8 text-xs w-48"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left admin-text-dim text-xs uppercase tracking-wide border-b border-white/5">
                      <th className="pb-2 pr-4">Customer</th>
                      <th className="pb-2 pr-4">Phone</th>
                      <th className="pb-2 pr-4">Tier</th>
                      <th className="pb-2 pr-4">Points</th>
                      <th className="pb-2 pr-4">Orders</th>
                      <th className="pb-2 pr-4">Last Order</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map((m) => (
                      <tr key={m.phone} className="border-t border-white/5 admin-text-muted">
                        <td className="py-2.5 pr-4 font-medium admin-text">{m.name}</td>
                        <td className="py-2.5 pr-4 font-mono text-xs">{m.phone}</td>
                        <td className="py-2.5 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${TIER_CONFIG[m.tier].color}`}>
                            {TIER_CONFIG[m.tier].label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-semibold text-italia-gold">{m.points}</td>
                        <td className="py-2.5 pr-4">{m.orders}</td>
                        <td className="py-2.5 pr-4 text-xs">{m.lastOrder}</td>
                        <td className="py-2.5">
                          <button
                            onClick={() => setPointsModal({ phone: m.phone, name: m.name })}
                            className="glass-btn-ghost text-[10px] px-2 py-1"
                          >
                            +/- Points
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===== REFERRAL TAB ===== */}
        {tab === "referral" && (
          <div className="space-y-4">
            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-3 flex items-center gap-2">
                <Share2 className="h-4 w-4 text-italia-red" />
                Referral Program Settings
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="glass-card p-3">
                  <label className="text-xs admin-text-dim block mb-1">Referrer Reward (pts)</label>
                  <input
                    type="number"
                    value={settings?.referral.referrerPoints || 100}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setSettings((s) => s ? { ...s, referral: { ...s.referral, referrerPoints: val } } : s);
                    }}
                    className="glass-input w-full text-sm"
                  />
                </div>
                <div className="glass-card p-3">
                  <label className="text-xs admin-text-dim block mb-1">New Customer Discount (grosze)</label>
                  <input
                    type="number"
                    value={settings?.referral.refereeDiscountGrosze || 1000}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setSettings((s) => s ? { ...s, referral: { ...s.referral, refereeDiscountGrosze: val } } : s);
                    }}
                    className="glass-input w-full text-sm"
                  />
                </div>
                <div className="glass-card p-3">
                  <p className="text-xs admin-text-dim">Total Referrals</p>
                  <p className="text-lg font-bold text-green-400">{MOCK_REFERRALS.reduce((s, r) => s + r.used, 0)}</p>
                </div>
                <div className="glass-card p-3">
                  <p className="text-xs admin-text-dim">Points Awarded</p>
                  <p className="text-lg font-bold text-italia-gold">{MOCK_REFERRALS.reduce((s, r) => s + r.earned, 0)}</p>
                </div>
              </div>
              <button onClick={() => settings && saveSettings({ referral: settings.referral })} disabled={saving} className="glass-btn-green text-xs">
                <Check className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Referral Settings"}
              </button>
            </div>

            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-3">Active Referral Codes</h3>
              <div className="space-y-2">
                {MOCK_REFERRALS.map((r) => (
                  <div key={r.code} className="flex items-center justify-between p-3 glass-card">
                    <div>
                      <p className="font-mono text-sm font-bold admin-text">{r.code}</p>
                      <p className="text-xs admin-text-dim">{r.owner} &middot; Created {r.createdAt}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-400">{r.used} uses</p>
                        <p className="text-xs admin-text-dim">{r.earned} pts earned</p>
                      </div>
                      <button className="text-slate-400 hover:text-red-400"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== GAMIFICATION TAB ===== */}
        {tab === "gamification" && (
          <div className="space-y-4">
            {/* Weekly challenges management */}
            <div className="glass-card-static p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold admin-text flex items-center gap-2">
                  <Target className="h-4 w-4 text-italia-red" />
                  Weekly Challenges
                </h3>
                <button className="glass-btn text-xs">
                  <Plus className="h-3.5 w-3.5" /> New Challenge
                </button>
              </div>
              <div className="space-y-2">
                {challenges.map((ch) => (
                  <div key={ch.id} className="flex items-center justify-between p-3 glass-card">
                    <div>
                      <p className="text-sm font-semibold admin-text">{ch.title}</p>
                      <p className="text-xs admin-text-dim">{ch.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-italia-gold">+{ch.rewardPoints} pts</span>
                      <span className="text-xs admin-text-dim">Target: {ch.target}</span>
                      <button className="text-slate-400 hover:text-white"><Edit3 className="h-3.5 w-3.5" /></button>
                      <button className="text-slate-400 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Achievements catalog */}
            <div className="glass-card-static p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold admin-text flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-italia-gold" />
                  Achievements ({ACHIEVEMENTS.length})
                </h3>
                <button className="glass-btn text-xs">
                  <Plus className="h-3.5 w-3.5" /> New Achievement
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ACHIEVEMENTS.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 glass-card">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{a.emoji}</span>
                      <div>
                        <p className="text-sm font-semibold admin-text">{a.name}</p>
                        <p className="text-[10px] admin-text-dim">{a.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-italia-gold">+{a.pointsReward}</span>
                      <button className="text-slate-400 hover:text-white"><Edit3 className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== SEASONAL TAB ===== */}
        {tab === "seasonal" && (
          <div className="space-y-4">
            <div className="glass-card-static p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold admin-text flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-italia-gold" />
                  Seasonal / Limited-Time Items
                </h3>
                <button className="glass-btn text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add Seasonal Item
                </button>
              </div>
              <div className="space-y-2">
                {MOCK_SEASONAL.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 glass-card">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold admin-text">{item.name}</p>
                        <span className="badge-info text-[10px] px-2 py-0.5 rounded-full font-bold">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-xs admin-text-dim mt-0.5">
                        Available until {item.until}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold admin-text">{formatPrice(item.price)}</span>
                      <div className="flex items-center gap-2">
                        <button className="text-green-400 hover:text-green-300">
                          {item.active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                        </button>
                        <button className="text-slate-400 hover:text-white"><Edit3 className="h-3.5 w-3.5" /></button>
                        <button className="text-slate-400 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== SPEED TAB ===== */}
        {tab === "speed" && (
          <div className="space-y-4">
            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-400" />
                Speed Guarantee Settings
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-card p-4">
                  <label className="text-xs admin-text-dim block mb-1">Guarantee Time (min)</label>
                  <input
                    type="number"
                    value={settings?.speedGuarantee.maxMinutes || 15}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 15;
                      setSettings((s) => s ? { ...s, speedGuarantee: { ...s.speedGuarantee, maxMinutes: val } } : s);
                    }}
                    className="glass-input w-full"
                  />
                </div>
                <div className="glass-card p-4">
                  <label className="text-xs admin-text-dim block mb-1">Guarantee Text</label>
                  <input
                    type="text"
                    value={settings?.speedGuarantee.guaranteeText || ""}
                    onChange={(e) => {
                      setSettings((s) => s ? { ...s, speedGuarantee: { ...s.speedGuarantee, guaranteeText: e.target.value } } : s);
                    }}
                    className="glass-input w-full text-xs"
                  />
                </div>
                <div className="glass-card p-4">
                  <label className="text-xs admin-text-dim block mb-1">Status</label>
                  <button
                    onClick={() => {
                      setSettings((s) => s ? { ...s, speedGuarantee: { ...s.speedGuarantee, active: !s.speedGuarantee.active } } : s);
                    }}
                    className="flex items-center gap-2 mt-1"
                  >
                    {settings?.speedGuarantee.active ? (
                      <ToggleRight className="h-6 w-6 text-green-400" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-slate-400" />
                    )}
                    <span className="text-sm admin-text font-medium">
                      {settings?.speedGuarantee.active ? "Active" : "Inactive"}
                    </span>
                  </button>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => settings && saveSettings({ speedGuarantee: settings.speedGuarantee })} disabled={saving} className="glass-btn-green text-xs">
                  <Check className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Speed Settings"}
                </button>
              </div>
            </div>

            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-400" />
                Live Activity Bar Settings
              </h3>
              <div className="space-y-3">
                {["Orders in last hour", "Currently preparing", "Trending item", "Avg prep time"].map((label) => (
                  <div key={label} className="flex items-center justify-between p-3 glass-card">
                    <span className="text-sm admin-text">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs badge-active px-2 py-0.5 rounded-full font-bold">Visible</span>
                      <ToggleRight className="h-5 w-5 text-green-400 cursor-pointer" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-400" />
                Abandoned Cart Recovery
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-card p-4">
                  <label className="text-xs admin-text-dim block mb-1">Trigger Delay (seconds)</label>
                  <input type="number" defaultValue={30} className="glass-input w-full" />
                </div>
                <div className="glass-card p-4">
                  <label className="text-xs admin-text-dim block mb-1">Banner Message</label>
                  <input type="text" defaultValue="Still hungry? 🍕" className="glass-input w-full text-xs" />
                </div>
                <div className="glass-card p-4">
                  <label className="text-xs admin-text-dim block mb-1">Status</label>
                  <div className="flex items-center gap-2 mt-1">
                    <ToggleRight className="h-6 w-6 text-green-400" />
                    <span className="text-sm admin-text font-medium">Active</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== CHATBOT TAB ===== */}
        {tab === "chatbot" && (
          <div className="space-y-4">
            <div className="glass-card-static p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold admin-text flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-italia-green" />
                  Chatbot Responses
                </h3>
                <button className="glass-btn text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add Response
                </button>
              </div>
              <div className="space-y-2">
                {MOCK_FAQ.map((faq) => (
                  <div key={faq.keyword} className="glass-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg bg-italia-green/10 text-green-400 text-xs font-bold">
                          {faq.keyword}
                        </span>
                        <span className="text-xs admin-text-dim">{faq.hits} hits</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="text-slate-400 hover:text-white"><Edit3 className="h-3.5 w-3.5" /></button>
                        <button className="text-slate-400 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <p className="text-xs admin-text-muted line-clamp-2">{faq.response}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-3">Chatbot Settings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="glass-card p-4">
                  <label className="text-xs admin-text-dim block mb-1">Welcome Message</label>
                  <textarea
                    defaultValue="Ciao! 👋 I'm the Sud Italia assistant. Ask me about our menu, locations, hours, delivery, or loyalty program!"
                    className="glass-input w-full text-xs h-20 resize-none"
                  />
                </div>
                <div className="glass-card p-4">
                  <label className="text-xs admin-text-dim block mb-1">Default Response</label>
                  <textarea
                    defaultValue="I'd be happy to help! I can answer questions about our menu, locations, hours, delivery, vegetarian options, allergies, and our loyalty program."
                    className="glass-input w-full text-xs h-20 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="glass-btn-green text-xs"><Check className="h-3.5 w-3.5" /> Save Changes</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Points adjustment modal — rendered via portal to escape admin-bg stacking context */}
      {pointsModal && createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPointsModal(null)} />
          <div className="relative bg-[#1e293b] border border-white/15 rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="font-heading font-bold text-lg admin-text mb-1">
              Adjust Points
            </h3>
            <p className="text-sm admin-text-dim mb-4">
              {pointsModal.name} &middot; <span className="font-mono text-xs">{pointsModal.phone}</span>
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs admin-text-dim block mb-1">Amount (positive to add, negative to remove)</label>
                <input
                  type="number"
                  value={pointsAmount}
                  onChange={(e) => setPointsAmount(e.target.value)}
                  placeholder="e.g. 50 or -20"
                  className="glass-input w-full"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs admin-text-dim block mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={pointsReason}
                  onChange={(e) => setPointsReason(e.target.value)}
                  placeholder="e.g. Compensation for late order"
                  className="glass-input w-full text-xs"
                />
              </div>
            </div>

            {pointsAmount && parseInt(pointsAmount) !== 0 && (
              <p className={`text-sm font-semibold mb-4 ${parseInt(pointsAmount) > 0 ? "text-green-400" : "text-red-400"}`}>
                {parseInt(pointsAmount) > 0 ? "+" : ""}{pointsAmount} points will be {parseInt(pointsAmount) > 0 ? "added" : "removed"}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleAdjustPoints}
                disabled={adjusting || !pointsAmount || parseInt(pointsAmount) === 0}
                className="glass-btn-green flex-1"
              >
                <Check className="h-3.5 w-3.5" />
                {adjusting ? "Saving..." : "Apply"}
              </button>
              <button
                onClick={() => { setPointsModal(null); setPointsAmount(""); setPointsReason(""); }}
                className="glass-btn-ghost flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
