"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Pencil, Plus, Sparkles, X } from "lucide-react";
import type { MenuItem } from "@/data/types";
import type { BundleConfig } from "@/components/admin/AdminSellingShared";
import { BundleEditor, computeMarginSamples, makeStarterBundle } from "./BundleEditor";

/**
 * Top-level orchestrator for the Bundle ladders admin surface.
 * Renders the card grid (the only view shipped) and opens the shared
 * BundleEditor in a sheet when an operator taps a card.
 *
 * All CRUD flows back through `onChange(next)` so the parent admin
 * page owns persistence — same save flow as every other admin surface.
 */
interface Props {
  bundles: BundleConfig[];
  menu: MenuItem[];
  onChange: (next: BundleConfig[]) => void;
}

const MEAL_PERIODS: { id: "family" | "lunch" | "lateNight"; label: string; hint: string }[] = [
  { id: "family",    label: "Family",     hint: "Group ordering · ≥2 mains gate" },
  { id: "lunch",     label: "Lunch",      hint: "Solo eating · 11:00–14:00" },
  { id: "lateNight", label: "Late-night", hint: "21:00–24:00 single-tap" },
];

export function BundleManager({ bundles, menu, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = bundles.find((b) => b.id === editingId);

  const onUpdate = useCallback(
    (id: string, patch: Partial<BundleConfig>) =>
      onChange(bundles.map((b) => (b.id === id ? { ...b, ...patch } : b))),
    [bundles, onChange],
  );
  const onRemove = useCallback(
    (id: string) => onChange(bundles.filter((b) => b.id !== id)),
    [bundles, onChange],
  );
  const onAdd = useCallback(
    (mealPeriod: "family" | "lunch" | "lateNight") => {
      const fresh = makeStarterBundle(mealPeriod);
      onChange([...bundles, fresh]);
      // Open the new tier in the editor immediately — operator's intent
      // when they tap "Add tier" is almost always "and configure it now".
      setEditingId(fresh.id);
    },
    [bundles, onChange],
  );

  const activeCount = bundles.filter((b) => b.active).length;

  return (
    <div className="bm-root">
      <header className="bm-root__head">
        <div className="bm-root__head-l">
          <h1 className="bm-root__title">Bundle ladders</h1>
          <p className="bm-root__hint">
            {bundles.length} {bundles.length === 1 ? "tier" : "tiers"} configured · {activeCount} active.
            Tap any tier to open the editor. Changes save when you press <strong>Save changes</strong> on the page header.
          </p>
        </div>
      </header>

      {MEAL_PERIODS.map((p) => {
        const list = bundles.filter((b) => b.mealPeriod === p.id);
        return (
          <section key={p.id} className="bm-section">
            <header className="bm-ph">
              <div className="bm-ph__txt">
                <h2 className="bm-ph__label">{p.label} ladder</h2>
                <span className="bm-ph__hint">{p.hint}</span>
                <span className="bm-ph__count">{list.length} {list.length === 1 ? "tier" : "tiers"}</span>
              </div>
              <button type="button" className="bm-btn bm-btn--ghost" onClick={() => onAdd(p.id)}>
                <Plus className="bm-icon" /> Add tier
              </button>
            </header>
            {list.length === 0 ? (
              <EmptyState onAdd={() => onAdd(p.id)} />
            ) : (
              <div className="bm-card-grid">
                {list.map((b) => (
                  <CardTile key={b.id} bundle={b} menu={menu} onEdit={() => setEditingId(b.id)} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {editing && (
        <EditorSheet
          bundle={editing}
          menu={menu}
          onChange={(patch) => onUpdate(editing.id, patch)}
          onClose={() => setEditingId(null)}
          onRemove={() => {
            onRemove(editing.id);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Card tile ────────────────────────────────────────────────────────────

function CardTile({
  bundle,
  menu,
  onEdit,
}: {
  bundle: BundleConfig;
  menu: MenuItem[];
  onEdit: () => void;
}) {
  const { isDynamic, margin, priceLabel, discountLabel } = summarize(bundle, menu);
  const tone = marginTone(margin);
  return (
    <button
      type="button"
      onClick={onEdit}
      className={[
        "bm-card",
        bundle.isDefault && "bm-card--default",
        bundle.isAnchor && "bm-card--anchor",
        bundle.isDecoy && "bm-card--decoy",
        !bundle.active && "bm-card--inactive",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="bm-card__head">
        <div>
          <span className="bm-card__tier">{bundle.tier}</span>
          <h3 className="bm-card__name">{bundle.name}</h3>
        </div>
        <TierBadges bundle={bundle} />
      </header>
      <p className="bm-card__desc">{bundle.description}</p>
      <div className="bm-card__price">
        <span className="bm-card__big">{priceLabel}</span>
        <span className="bm-card__disc">{discountLabel}</span>
      </div>
      <footer className="bm-card__foot">
        <span className={`bm-chip bm-chip--${isDynamic ? "indigo" : "gray"}`}>
          {isDynamic ? "Dynamic" : "Fixed"}
        </span>
        {margin !== null && (
          <span className={`bm-chip bm-chip--${tone}`}>
            {Math.round(margin * 100)}% margin
          </span>
        )}
        {bundle.requiredTier && (
          <span className="bm-chip bm-chip--gold">
            <Lock className="bm-icon-sm" /> {bundle.requiredTier}
          </span>
        )}
        <span className="bm-card__edit">
          <Pencil className="bm-icon-sm" /> Edit
        </span>
      </footer>
    </button>
  );
}

function TierBadges({ bundle }: { bundle: BundleConfig }) {
  return (
    <span className="bm-badges">
      {bundle.isDefault && <span className="bm-badge bm-badge--red">Most picked</span>}
      {bundle.isAnchor && <span className="bm-badge bm-badge--gold">Best value</span>}
      {bundle.isDecoy && <span className="bm-badge bm-badge--gray">Decoy</span>}
      {!bundle.active && <span className="bm-badge bm-badge--off">Inactive</span>}
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bm-empty">
      <Sparkles className="bm-empty__icon" />
      <p className="bm-empty__title">No tiers yet</p>
      <p className="bm-empty__hint">Add your first tier to start serving this ladder.</p>
      <button type="button" className="bm-btn bm-btn--primary" onClick={onAdd}>
        <Plus className="bm-icon" /> Add tier
      </button>
    </div>
  );
}

// ─── Sheet (full editor) ──────────────────────────────────────────────────

function EditorSheet({
  bundle,
  menu,
  onChange,
  onClose,
  onRemove,
}: {
  bundle: BundleConfig;
  menu: MenuItem[];
  onChange: (p: Partial<BundleConfig>) => void;
  onClose: () => void;
  onRemove: () => void;
}) {
  return createPortal(
    <div
      className="bm-sheet-root"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bm-sheet">
        <header className="bm-sheet__head">
          <div className="bm-sheet__head-l">
            <span className="bm-sheet__tier">{bundle.tier}</span>
            <span className="bm-sheet__name">{bundle.name}</span>
            <TierBadges bundle={bundle} />
          </div>
          <button
            type="button"
            className="bm-sheet__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="bm-icon" />
          </button>
        </header>
        <div className="bm-sheet__body">
          <BundleEditor bundle={bundle} menu={menu} onChange={onChange} onRemove={onRemove} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function summarize(bundle: BundleConfig, menu: MenuItem[]) {
  const isDynamic = (bundle.pricingMode ?? "fixed") === "dynamic";
  const samples = computeMarginSamples(bundle, menu);
  const primary = samples.find((s) => s.margin !== null) ?? samples[0];
  const margin = primary?.margin ?? null;
  const priceLabel = primary?.priceLabel ?? "—";
  const discountLabel = isDynamic
    ? bundle.mainsDiscountPercent !== undefined && bundle.addOnsDiscountPercent !== undefined
      ? `${bundle.mainsDiscountPercent}/${bundle.addOnsDiscountPercent} split`
      : `−${bundle.discountPercent ?? 0}%`
    : bundle.refPriceGrosze &&
        bundle.priceGrosze &&
        bundle.refPriceGrosze > bundle.priceGrosze
      ? `save zł ${((bundle.refPriceGrosze - bundle.priceGrosze) / 100).toFixed(2)}`
      : "fixed";
  return { isDynamic, margin, priceLabel, discountLabel };
}

function marginTone(m: number | null): "good" | "ok" | "warn" | "bad" | "muted" {
  if (m === null) return "muted";
  if (m >= 0.5) return "good";
  if (m >= 0.4) return "ok";
  if (m >= 0.25) return "warn";
  return "bad";
}
