"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminNav } from "./AdminNav";
import { formatPrice } from "@/lib/utils";
import type { LoyaltySettings } from "@/lib/store";
import { locations as allLocations } from "@/data/locations";
import { LocationTabs } from "./LocationTabs";
import {
  Rocket, Check, ToggleLeft, ToggleRight, Clock, Sparkles, Zap,
  TrendingUp, MessageCircle, Edit3, Trash2, Plus, MapPin,
} from "lucide-react";

const activeLocations = allLocations.filter((l) => l.isActive);

type Tab = "seasonal" | "speed" | "chatbot";

const LIVE_ACTIVITY_KEYS: { key: keyof NonNullable<LoyaltySettings["liveActivity"]>; label: string }[] = [
  { key: "ordersInLastHour", label: "Orders in last hour" },
  { key: "currentlyPreparing", label: "Currently preparing" },
  { key: "trendingItem", label: "Trending item" },
  { key: "avgPrepTime", label: "Avg prep time" },
];

interface ChatbotFaq {
  id: string;
  keyword: string;
  response: string;
  hits: number;
}

export function AdminGrowth() {
  const [tab, setTab] = useState<Tab>("seasonal");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [faqs, setFaqs] = useState<ChatbotFaq[]>([]);
  const [faqsLoading, setFaqsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/growth").then((r) => r.json()).then((d) => setSettings(d)).catch(() => {});
    fetch("/api/admin/chatbot-faq")
      .then((r) => r.json())
      .then((d) => setFaqs(d))
      .catch(() => {})
      .finally(() => setFaqsLoading(false));
  }, []);

  const saveSettings = useCallback(async (updates: Partial<LoyaltySettings>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/growth", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
      setSettings(await res.json());
    } catch { alert("Failed to save."); }
    finally { setSaving(false); }
  }, []);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "seasonal", label: "Seasonal Menu", icon: Sparkles },
    { id: "speed", label: "Speed & Activity", icon: Zap },
    { id: "chatbot", label: "Chatbot", icon: MessageCircle },
  ];

  return (
    <>
      <AdminNav />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-md bg-white/6 flex items-center justify-center">
            <Rocket className="h-5 w-5 text-slate-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-heading font-bold admin-text">Growth & Operations</h1>
            <p className="text-sm admin-text-dim">Seasonal menu, speed settings, chatbot</p>
          </div>
          <LocationTabs value={locationFilter === "all" ? "" : locationFilter} onChange={(v) => setLocationFilter(v || "all")} includeAll />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto scrollbar-hide pb-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${tab === t.id ? "bg-white/12 text-white shadow-sm border border-white/10" : "text-slate-400 hover:text-white hover:bg-white/6"}`}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {/* SEASONAL TAB */}
        {tab === "seasonal" && (
          <div className="space-y-4">
            <div className="glass-card-static p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold admin-text flex items-center gap-2"><Sparkles className="h-4 w-4 text-italia-gold" />Seasonal / Limited-Time Items</h3>
                <button className="glass-btn text-xs"><Plus className="h-3.5 w-3.5" /> Add Item</button>
              </div>
              <div className="space-y-2">
                {(settings?.seasonalItems || [])
                  .filter((item) => locationFilter === "all" || item.locationSlug === locationFilter || !item.locationSlug)
                  .map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-4 glass-card">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold admin-text">{item.name}</p>
                          <span className="badge-info text-[10px] px-2 py-0.5 rounded-full font-bold">{item.category}</span>
                          {item.locationSlug && (
                            <span className="badge-confirmed text-[10px] px-2 py-0.5 rounded-full font-bold capitalize flex items-center gap-0.5">
                              <MapPin className="h-2.5 w-2.5" />{item.locationSlug}
                            </span>
                          )}
                          {!item.active && <span className="badge-danger text-[10px] px-2 py-0.5 rounded-full font-bold">Hidden</span>}
                        </div>
                        <p className="text-xs admin-text-dim mt-0.5">Until {item.availableUntil}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-bold admin-text">{formatPrice(item.price)}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!settings) return;
                            const updated = settings.seasonalItems.map((si) =>
                              si.id === item.id ? { ...si, active: !si.active } : si
                            );
                            saveSettings({ seasonalItems: updated });
                          }}
                          className={`p-1 rounded-lg transition-colors ${item.active ? "text-green-400 bg-green-400/10 hover:bg-green-400/20" : "text-red-400 bg-red-400/10 hover:bg-red-400/20"}`}
                        >
                          {item.active ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* SPEED TAB */}
        {tab === "speed" && (
          <div className="space-y-4">
            {/* Speed guarantee */}
            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-4 flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-400" />Speed Guarantee</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-card p-4"><label className="text-xs admin-text-dim block mb-1">Guarantee Time (min)</label><input type="number" value={settings?.speedGuarantee.maxMinutes || 15} onChange={(e) => setSettings((s) => s ? { ...s, speedGuarantee: { ...s.speedGuarantee, maxMinutes: parseInt(e.target.value) || 15 } } : s)} className="glass-input w-full" /></div>
                <div className="glass-card p-4"><label className="text-xs admin-text-dim block mb-1">Guarantee Text</label><input type="text" value={settings?.speedGuarantee.guaranteeText || ""} onChange={(e) => setSettings((s) => s ? { ...s, speedGuarantee: { ...s.speedGuarantee, guaranteeText: e.target.value } } : s)} className="glass-input w-full text-xs" /></div>
                <div className="glass-card p-4"><label className="text-xs admin-text-dim block mb-1">Status</label><button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!settings) return; saveSettings({ speedGuarantee: { ...settings.speedGuarantee, active: !settings.speedGuarantee.active } }); }} className={`flex items-center gap-2 mt-1 p-1 rounded-lg ${settings?.speedGuarantee.active ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10"}`}>{settings?.speedGuarantee.active ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}<span className="text-sm font-medium">{settings?.speedGuarantee.active ? "Active" : "Inactive"}</span></button></div>
              </div>
            </div>

            {/* Live activity bar */}
            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-400" />Live Activity Bar</h3>
              <div className="space-y-3">
                {LIVE_ACTIVITY_KEYS.map(({ key, label }) => {
                  const isVisible = settings?.liveActivity?.[key] ?? true;
                  return (
                    <div key={key} className="flex items-center justify-between p-3 glass-card">
                      <span className="text-sm admin-text">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isVisible ? "badge-active" : "badge-danger"}`}>{isVisible ? "Visible" : "Hidden"}</span>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!settings) return; saveSettings({ liveActivity: { ...settings.liveActivity, [key]: !isVisible } }); }} className={`p-1 rounded-lg ${isVisible ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10"}`}>{isVisible ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Abandoned cart */}
            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-orange-400" />Abandoned Cart Recovery</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="glass-card p-4"><label className="text-xs admin-text-dim block mb-1">Trigger Delay (seconds)</label><input type="number" value={settings?.abandonedCart.delaySeconds ?? 30} onChange={(e) => setSettings((s) => s ? { ...s, abandonedCart: { ...s.abandonedCart, delaySeconds: parseInt(e.target.value) || 30 } } : s)} className="glass-input w-full" /></div>
                <div className="glass-card p-4"><label className="text-xs admin-text-dim block mb-1">Banner Message</label><input type="text" value={settings?.abandonedCart.message ?? ""} onChange={(e) => setSettings((s) => s ? { ...s, abandonedCart: { ...s.abandonedCart, message: e.target.value } } : s)} className="glass-input w-full text-xs" /></div>
                <div className="glass-card p-4"><label className="text-xs admin-text-dim block mb-1">Status</label><button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!settings) return; saveSettings({ abandonedCart: { ...settings.abandonedCart, active: !settings.abandonedCart.active } }); }} className={`flex items-center gap-2 mt-1 p-1 rounded-lg ${settings?.abandonedCart.active ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10"}`}>{settings?.abandonedCart.active ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}<span className="text-sm font-medium">{settings?.abandonedCart.active ? "Active" : "Inactive"}</span></button></div>
              </div>
            </div>
          </div>
        )}

        {/* CHATBOT TAB */}
        {tab === "chatbot" && (
          <div className="space-y-4">
            <div className="glass-card-static p-5">
              <div className="flex items-center justify-between mb-4"><h3 className="font-semibold admin-text flex items-center gap-2"><MessageCircle className="h-4 w-4 text-italia-green" />Chatbot Responses</h3><button className="glass-btn text-xs"><Plus className="h-3.5 w-3.5" /> Add Response</button></div>
              <div className="space-y-2">
                {faqsLoading ? (
                  <div className="text-center py-8">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                    <p className="text-sm admin-text-dim mt-2">Loading chatbot responses...</p>
                  </div>
                ) : faqs.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm admin-text-dim">No chatbot responses yet. Click "Add Response" to create one.</p>
                  </div>
                ) : (
                  faqs.map((faq) => (
                    <div key={faq.id} className="glass-card p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2"><span className="px-2 py-0.5 rounded-lg bg-italia-green/10 text-green-400 text-xs font-bold">{faq.keyword}</span><span className="text-xs admin-text-dim">{faq.hits} hits</span></div>
                        <div className="flex items-center gap-2"><button className="text-slate-400 hover:text-white"><Edit3 className="h-3.5 w-3.5" /></button><button className="text-slate-400 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button></div>
                      </div>
                      <p className="text-xs admin-text-muted line-clamp-2">{faq.response}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-3">Chatbot Settings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="glass-card p-4"><label className="text-xs admin-text-dim block mb-1">Welcome Message</label><textarea defaultValue="Ciao! I'm the Sud Italia assistant." className="glass-input w-full text-xs h-20 resize-none" /></div>
                <div className="glass-card p-4"><label className="text-xs admin-text-dim block mb-1">Default Response</label><textarea defaultValue="I'd be happy to help! I can answer questions about our menu, locations, hours..." className="glass-input w-full text-xs h-20 resize-none" /></div>
              </div>
              <div className="flex gap-2 mt-4"><button className="glass-btn-green text-xs"><Check className="h-3.5 w-3.5" /> Save Chatbot Settings</button></div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
