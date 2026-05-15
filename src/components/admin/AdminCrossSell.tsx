"use client";

import { useState } from "react";
import {
  Check,
  Save,
  Star,
  Coffee,
  IceCream,
  GlassWater,
  Sparkles,
  Clock,
  Tag,
} from "lucide-react";
import { LocationTabs } from "./LocationTabs";
import { Tabs } from "./v2/ui";
import {
  ComboEditor,
  ItemMultiSelect,
  ItemSingleSelect,
  TimeWindowsEditor,
  useSellingSettings,
} from "./AdminSellingShared";

type TabKey = "pairings" | "combos" | "timeOfDay" | "badges";

export function AdminCrossSell() {
  const {
    activeLocation,
    setActiveLocation,
    loc,
    config,
    loading,
    saving,
    saved,
    updateConfig,
    handleSave,
  } = useSellingSettings();
  const [tab, setTab] = useState<TabKey>("pairings");

  if (loading) {
    return (
      <div className="v2-page">
        <div className="v2-page-loading">Loading cross-sell settings…</div>
      </div>
    );
  }

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Cross-sell</h1>
          <p className="v2-page-subtitle">
            Suggest complementary items alongside what&rsquo;s in the cart — pairings, combos, and contextual nudges.
          </p>
        </div>
        <div className="v2-page-actions">
          <button
            onClick={handleSave}
            disabled={saving}
            className="v2-btn v2-btn-primary v2-btn-sm"
          >
            {saved ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Saved
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save changes"}
              </>
            )}
          </button>
        </div>
      </header>

      <LocationTabs value={activeLocation} onChange={setActiveLocation} />

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as TabKey)}
        tabs={[
          { value: "pairings", label: "Cart pairings", icon: <Star className="h-3.5 w-3.5" /> },
          { value: "combos", label: "Combo deals", icon: <Sparkles className="h-3.5 w-3.5" /> },
          { value: "timeOfDay", label: "Time-of-day", icon: <Clock className="h-3.5 w-3.5" /> },
          { value: "badges", label: "Menu badges", icon: <Tag className="h-3.5 w-3.5" /> },
        ]}
        variant="underline"
        ariaLabel="Cross-sell view"
      />

      {tab === "pairings" && (
        <div className="glass-card p-6 space-y-5">
          <div>
            <h2 className="font-heading font-bold text-lg admin-text flex items-center gap-2">
              <Star className="h-5 w-5 text-italia-gold" />
              Cart pairings — {loc.name}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              One-tap-add suggestions that fire when the cart has a pizza or pasta.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ItemSingleSelect
              items={loc.menu.filter((m) => m.category === "drinks")}
              value={config.preferredCoffee}
              onChange={(id) => updateConfig({ preferredCoffee: id })}
              label="Preferred Coffee"
              icon={Coffee}
            />
            <ItemSingleSelect
              items={loc.menu.filter((m) => m.category === "desserts")}
              value={config.preferredDessert}
              onChange={(id) => updateConfig({ preferredDessert: id })}
              label="Preferred Dessert"
              icon={IceCream}
            />
            <ItemSingleSelect
              items={loc.menu.filter((m) => m.category === "drinks")}
              value={config.preferredDrink}
              onChange={(id) => updateConfig({ preferredDrink: id })}
              label="Preferred Drink"
              icon={GlassWater}
            />
          </div>
        </div>
      )}

      {tab === "combos" && (
        <div className="glass-card p-6">
          <ComboEditor
            combos={config.combos}
            onChange={(combos) => updateConfig({ combos })}
          />
        </div>
      )}

      {tab === "timeOfDay" && (
        <div className="glass-card p-6">
          <TimeWindowsEditor
            windows={config.timeWindows}
            onChange={(timeWindows) => updateConfig({ timeWindows })}
          />
        </div>
      )}

      {tab === "badges" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card p-6">
            <ItemMultiSelect
              items={loc.menu}
              selected={config.popularItems}
              onChange={(ids) => updateConfig({ popularItems: ids })}
              label="Popular Items (badges shown on menu)"
            />
          </div>
          <div className="glass-card p-6">
            <ItemMultiSelect
              items={loc.menu}
              selected={config.staffPicks}
              onChange={(ids) => updateConfig({ staffPicks: ids })}
              label="Staff Picks (badges shown on menu)"
            />
          </div>
        </div>
      )}
    </div>
  );
}
