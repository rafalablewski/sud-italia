"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Save,
  Star,
  Coffee,
  IceCream,
  GlassWater,
  Sparkles,
  Clock,
  Tag,
  Sandwich,
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
    loadError,
    saving,
    saved,
    isDirty,
    dirtyLocations,
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

  if (loadError) {
    return (
      <div className="v2-page">
        <div className="glass-card p-8 text-center max-w-lg mx-auto">
          <AlertTriangle className="h-8 w-8 text-[var(--danger)] mx-auto mb-3" />
          <h2 className="font-heading font-bold text-lg admin-text mb-2">
            Could not load cross-sell settings
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
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Cross-sell</h1>
          <p className="v2-page-subtitle">
            Suggest complementary items alongside what&rsquo;s in the cart — pairings, combos, and contextual nudges.
            {dirtyHint && <span className="ml-2 text-[var(--warning)]">· {dirtyHint}</span>}
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
              <Star className="h-5 w-5 text-[var(--warning)]" />
              Complete your meal — {loc.name}
            </h2>
            <p className="text-xs text-[var(--fg-subtle)] mt-1">
              Four fixed slots that customers see as a horizontal slider above
              the cart subtotal. Slot 1 (Coffee) → Slot 2 (Dessert) → Slot 3
              (Side / Garlic Bread) → Slot 4 (Drink). Each slot is one
              tap-to-add; the chip stays visible after adding so customers
              can add more of the same item or compare slots side-by-side.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ItemSingleSelect
              items={loc.menu.filter((m) => m.category === "drinks")}
              value={config.preferredCoffee}
              onChange={(id) => updateConfig({ preferredCoffee: id })}
              label="Slot 1 · Coffee"
              icon={Coffee}
            />
            <ItemSingleSelect
              items={loc.menu.filter((m) => m.category === "desserts")}
              value={config.preferredDessert}
              onChange={(id) => updateConfig({ preferredDessert: id })}
              label="Slot 2 · Dessert"
              icon={IceCream}
            />
            <ItemSingleSelect
              items={loc.menu.filter((m) => m.category === "antipasti")}
              value={config.preferredGarlicBread ?? ""}
              onChange={(id) => updateConfig({ preferredGarlicBread: id })}
              label="Slot 3 · Side"
              icon={Sandwich}
            />
            <ItemSingleSelect
              items={loc.menu.filter((m) => m.category === "drinks")}
              value={config.preferredDrink}
              onChange={(id) => updateConfig({ preferredDrink: id })}
              label="Slot 4 · Drink"
              icon={GlassWater}
            />
          </div>
        </div>
      )}

      {tab === "combos" && (
        <div className="glass-card p-6">
          <ComboEditor
            combos={config.combos}
            menu={loc.menu}
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
        <div className="space-y-6">
          <div className="glass-card p-6">
            <h2 className="font-heading font-bold text-lg admin-text flex items-center gap-2">
              <Tag className="h-5 w-5 text-[var(--warning)]" />
              Menu badges — {loc.name}
            </h2>
            <p className="text-xs text-[var(--fg-subtle)] mt-1 leading-relaxed">
              Every chip that appears next to a menu item — both in the admin
              menu list and on the customer-facing menu — is controlled here.
              Hero / Pizzaiolo&rsquo;s Choice / Chef&rsquo;s Signature drive
              the §4.3 menu-engineering hierarchy; Popular / Staff Pick / New
              are editorial highlights that sit alongside.
            </p>
            <p className="text-xs text-[var(--fg-subtle)] mt-2 leading-relaxed">
              Gold chips with a lock icon are set by the item&rsquo;s{" "}
              <span className="font-mono text-[11px]">menuRole</span> in the
              menu data file — they badge on the homepage automatically. Edit
              the menu item in <span className="font-mono text-[11px]">/admin/menu</span>{" "}
              to change them. Add extra items via &ldquo;+ Add&rdquo; below.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-6">
              <ItemMultiSelect
                items={loc.menu}
                selected={config.heroItems ?? []}
                onChange={(ids) => updateConfig({ heroItems: ids })}
                label="Our Hero — full-width gateway card"
                intrinsicIds={loc.menu.filter((m) => m.menuRole === "hero").map((m) => m.id)}
                intrinsicHint="Set by menuRole: 'hero' in the menu data file"
              />
            </div>
            <div className="glass-card p-6">
              <ItemMultiSelect
                items={loc.menu}
                selected={config.pizzaioloChoiceItems ?? []}
                onChange={(ids) => updateConfig({ pizzaioloChoiceItems: ids })}
                label="Pizzaiolo's Choice — gold profit-driver"
                intrinsicIds={loc.menu.filter((m) => m.menuRole === "profit-driver").map((m) => m.id)}
                intrinsicHint="Set by menuRole: 'profit-driver' in the menu data file"
              />
            </div>
            <div className="glass-card p-6">
              <ItemMultiSelect
                items={loc.menu}
                selected={config.chefSignatureItems ?? []}
                onChange={(ids) => updateConfig({ chefSignatureItems: ids })}
                label="Chef's Signature — range anchor"
                intrinsicIds={loc.menu.filter((m) => m.menuRole === "anchor").map((m) => m.id)}
                intrinsicHint="Set by menuRole: 'anchor' in the menu data file"
              />
            </div>
            <div className="glass-card p-6">
              <ItemMultiSelect
                items={loc.menu}
                selected={config.newItems ?? []}
                onChange={(ids) => updateConfig({ newItems: ids })}
                label="New — launch highlight"
              />
            </div>
            <div className="glass-card p-6">
              <ItemMultiSelect
                items={loc.menu}
                selected={config.popularItems ?? []}
                onChange={(ids) => updateConfig({ popularItems: ids })}
                label="Most Popular — red trending chip"
              />
            </div>
            <div className="glass-card p-6">
              <ItemMultiSelect
                items={loc.menu}
                selected={config.staffPicks ?? []}
                onChange={(ids) => updateConfig({ staffPicks: ids })}
                label="Staff Pick — editorial nudge"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
