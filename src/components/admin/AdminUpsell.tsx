"use client";

import { useState } from "react";
import { AlertTriangle, Check, Save, Layers, Sliders } from "lucide-react";
import { Button, LocationFilter, PageHero, Tabs } from "./v2/ui";
import {
  BundleRulesEditor,
  ExperimentEditor,
  DEFAULT_BUNDLES_FALLBACK,
  DEFAULT_BUNDLE_RULES,
  useSellingSettings,
  type ExperimentConfig,
} from "./AdminSellingShared";
import { BundleManager } from "./bundle-manager/BundleManager";
import { ModifierInventory } from "./ModifierInventory";
import { MLUpsellPanel } from "./MLUpsellPanel";

type TabKey = "bundles" | "modifiers";

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

  // Promote a winning variant: copy its per-bundle discount overrides into
  // the live bundle config and conclude the experiment (stopped + result).
  // Lives here because the parent owns both the bundle list and the
  // experiment — the editor only knows the experiment. Saved on the next
  // "Save changes" like any other config edit (and the margin-floor
  // guardian still vets the promoted discounts).
  const handlePromoteVariant = (variantId: string) => {
    const exp = config.experiment;
    if (!exp) return;
    const variant = exp.variants.find((v) => v.id === variantId);
    if (!variant) return;
    const overrides = variant.bundleOverrides ?? {};
    const bundles = (config.bundles ?? DEFAULT_BUNDLES_FALLBACK).map((b) => {
      const o = overrides[b.id];
      if (o === undefined) return b;
      if (typeof o === "number") return { ...b, discountPercent: o };
      return {
        ...b,
        discountPercent: o.discountPercent ?? b.discountPercent,
        mainsDiscountPercent: o.mainsDiscountPercent ?? b.mainsDiscountPercent,
        addOnsDiscountPercent: o.addOnsDiscountPercent ?? b.addOnsDiscountPercent,
      };
    });
    const now = new Date().toISOString();
    const concluded: ExperimentConfig = {
      ...exp,
      status: "stopped",
      active: false,
      stoppedAt: now,
      result: {
        decidedAt: now,
        winnerVariantId: variantId,
        relativeLift: 0,
        primaryMetric: exp.primaryMetric ?? "contribution",
        promoted: true,
      },
    };
    updateConfig({ bundles, experiment: concluded });
  };

  if (loading) {
    return (
      <div className="v2-page">
        <div className="v2-page-loading">Loading Upsell…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="v2-page">
        <div className="glass-card p-8 text-center max-w-lg mx-auto">
          <AlertTriangle className="h-8 w-8 text-[var(--danger)] mx-auto mb-3" />
          <h2 className="font-heading font-bold text-lg admin-text mb-2">
            Could not load upsell settings
          </h2>
          <p className="text-sm admin-text-secondary mb-4">{loadError}</p>
          <p className="text-xs text-[var(--fg-subtle)]">
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
      <PageHero
        title="Upsell"
        subtitle={
          <>
            Lift the value of what they&rsquo;re already buying — tiered bundle ladders and gating rules.
            {dirtyHint && <span className="ml-2 text-[var(--warning)]">· {dirtyHint}</span>}
          </>
        }
        locations={<LocationFilter value={activeLocation} onChange={setActiveLocation} />}
        actions={
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || !isDirty}
            aria-label="Save changes"
            title={saved ? "Saved" : saving ? "Saving…" : "Save changes"}
            leadingIcon={saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          />
        }
        tabs={
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as TabKey)}
            tabs={[
              { value: "bundles", label: "Bundles", icon: <Layers className="h-3.5 w-3.5" /> },
              { value: "modifiers", label: "Item modifiers", icon: <Sliders className="h-3.5 w-3.5" /> },
            ]}
            variant="underline"
            ariaLabel="Upsell view"
          />
        }
      />

      {tab === "bundles" && (
        <div className="v2-stack-24">
          <section className="glass-card p-6">
            <header className="mb-4">
              <h2 className="admin-text font-semibold mb-1">Bundle ladders</h2>
              <p className="admin-text-secondary">
                {loc.name} — good-better-best tier upgrades the customer picks between in the cart drawer.
              </p>
            </header>
            <BundleManager
              bundles={config.bundles ?? DEFAULT_BUNDLES_FALLBACK}
              menu={loc.menu}
              onChange={(bundles) => updateConfig({ bundles })}
            />
          </section>

          <section className="glass-card p-6">
            <header className="mb-4">
              <h2 className="admin-text font-semibold mb-1">Bundle rules</h2>
              <p className="admin-text-secondary">
                Gating thresholds, exclusions, and how ladders compose with other promotions.
              </p>
            </header>
            <BundleRulesEditor
              rules={config.bundleRules ?? DEFAULT_BUNDLE_RULES}
              onChange={(bundleRules) => updateConfig({ bundleRules })}
            />
          </section>

          <section className="glass-card p-6">
            <header className="mb-4">
              <h2 className="admin-text font-semibold mb-1">Experiments (A/B)</h2>
              <p className="admin-text-secondary">
                Run a discount A/B on any dynamic bundle in this location. Customers are hashed to
                a variant by phone so they always see the same offer; the bundle audit log records
                the variant id so the AOV / contribution uplift is visible on the Reports page.
              </p>
            </header>
            <ExperimentEditor
              experiment={config.experiment ?? null}
              bundles={config.bundles ?? DEFAULT_BUNDLES_FALLBACK}
              onChange={(experiment) => updateConfig({ experiment })}
              onPromote={handlePromoteVariant}
            />
          </section>

          <MLUpsellPanel
            locationSlug={activeLocation}
            rolloutPct={config.mlUpsellRolloutPct ?? 0}
            onRolloutChange={(mlUpsellRolloutPct) => updateConfig({ mlUpsellRolloutPct })}
          />
        </div>
      )}

      {tab === "modifiers" && (
        <div className="glass-card p-6">
          <ModifierInventory />
        </div>
      )}
    </div>
  );
}
