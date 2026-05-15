"use client";

import { useState } from "react";
import { Check, Save, Layers, SlidersHorizontal, Construction } from "lucide-react";
import { LocationTabs } from "./LocationTabs";
import { Tabs } from "./v2/ui";
import {
  BundlesEditor,
  BundleRulesEditor,
  DEFAULT_BUNDLES_FALLBACK,
  DEFAULT_BUNDLE_RULES,
  useSellingSettings,
} from "./AdminSellingShared";

type TabKey = "bundles" | "rules" | "modifiers";

export function AdminUpsell() {
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
  const [tab, setTab] = useState<TabKey>("bundles");

  if (loading) {
    return (
      <div className="v2-page">
        <div className="v2-page-loading">Loading upsell settings…</div>
      </div>
    );
  }

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Upsell</h1>
          <p className="v2-page-subtitle">
            Lift the value of what they&rsquo;re already buying — tiered bundle ladders and gating rules.
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
          { value: "bundles", label: "Bundle ladders", icon: <Layers className="h-3.5 w-3.5" /> },
          { value: "rules", label: "Bundle rules", icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
          { value: "modifiers", label: "Item modifiers", icon: <Construction className="h-3.5 w-3.5" /> },
        ]}
        variant="underline"
        ariaLabel="Upsell view"
      />

      {tab === "bundles" && (
        <div className="glass-card p-6">
          <p className="text-xs admin-text-secondary mb-4">
            {loc.name} — good-better-best tier upgrades the customer picks between in the cart drawer.
          </p>
          <BundlesEditor
            bundles={config.bundles ?? DEFAULT_BUNDLES_FALLBACK}
            onChange={(bundles) => updateConfig({ bundles })}
          />
        </div>
      )}

      {tab === "rules" && (
        <div className="glass-card p-6">
          <BundleRulesEditor
            rules={config.bundleRules ?? DEFAULT_BUNDLE_RULES}
            onChange={(bundleRules) => updateConfig({ bundleRules })}
          />
        </div>
      )}

      {tab === "modifiers" && (
        <div className="glass-card p-8 text-center">
          <Construction className="h-8 w-8 text-italia-gold mx-auto mb-3" />
          <h2 className="font-heading font-bold text-lg admin-text mb-2">
            Per-item modifiers — coming soon
          </h2>
          <p className="text-sm admin-text-secondary max-w-md mx-auto">
            Size upgrades (medium → large), premium toppings (+truffle oil, +buffalo mozzarella),
            and add-a-side modifiers will live here. Today the menu has fixed-price items
            only; this tab is reserved for the next iteration.
          </p>
        </div>
      )}
    </div>
  );
}
