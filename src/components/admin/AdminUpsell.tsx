"use client";

import { useState } from "react";
import { AlertTriangle, Check, Save, Layers, SlidersHorizontal, Construction, FlaskConical } from "lucide-react";
import { LocationTabs } from "./LocationTabs";
import { Tabs } from "./v2/ui";
import {
  BundlesEditor,
  BundleRulesEditor,
  ExperimentEditor,
  DEFAULT_BUNDLES_FALLBACK,
  DEFAULT_BUNDLE_RULES,
  useSellingSettings,
} from "./AdminSellingShared";

type TabKey = "bundles" | "rules" | "experiments" | "modifiers";

export function AdminUpsell() {
  const {
    activeLocation,
    setActiveLocation,
    loc,
    config,
    loading,
    loadError,
    saving,
    saved,
    isDirty,
    dirtyLocations,
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

  if (loadError) {
    return (
      <div className="v2-page">
        <div className="glass-card p-8 text-center max-w-lg mx-auto">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
          <h2 className="font-heading font-bold text-lg admin-text mb-2">
            Could not load upsell settings
          </h2>
          <p className="text-sm admin-text-secondary mb-4">{loadError}</p>
          <p className="text-xs text-slate-400">
            Editing is disabled — saving now would overwrite production settings with defaults. Refresh to retry.
          </p>
        </div>
      </div>
    );
  }

  const dirtyHint =
    dirtyLocations.size > 1
      ? `${dirtyLocations.size} locations with unsaved changes`
      : null;

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Upsell</h1>
          <p className="v2-page-subtitle">
            Lift the value of what they&rsquo;re already buying — tiered bundle ladders and gating rules.
            {dirtyHint && <span className="ml-2 text-italia-gold">· {dirtyHint}</span>}
          </p>
        </div>
        <div className="v2-page-actions">
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
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
          { value: "experiments", label: "Experiments (A/B)", icon: <FlaskConical className="h-3.5 w-3.5" /> },
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
            menu={loc.menu}
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

      {tab === "experiments" && (
        <div className="glass-card p-6 space-y-4">
          <div>
            <p className="text-xs admin-text-secondary">
              Run a discount A/B on any dynamic bundle in this location. Customers are hashed to
              a variant by phone so they always see the same offer; the bundle audit log records
              the variant id so the AOV / contribution uplift is visible on the Reports page.
            </p>
          </div>
          <ExperimentEditor
            experiment={config.experiment ?? null}
            bundles={config.bundles ?? DEFAULT_BUNDLES_FALLBACK}
            onChange={(experiment) => updateConfig({ experiment })}
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
