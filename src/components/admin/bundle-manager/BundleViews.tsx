"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  Pencil,
  Plus,
  Sparkles,
  X,
  Lock,
} from "lucide-react";
import type { MenuItem } from "@/data/types";
import type { BundleConfig } from "@/components/admin/AdminSellingShared";
import {
  BundleEditor,
  computeMarginSamples,
  makeStarterBundle,
} from "./BundleEditor";

/**
 * The 8 list-view layouts. Each receives the same `bundles` array, the
 * location menu, and CRUD callbacks; the only difference between them
 * is how the list is rendered and how the editor is summoned (inline
 * or sheet). The shared editor is `BundleEditor` from the same folder.
 */

export interface ViewProps {
  bundles: BundleConfig[];
  menu: MenuItem[];
  onUpdate: (id: string, patch: Partial<BundleConfig>) => void;
  onAdd: (mealPeriod: "lunch" | "family" | "lateNight") => void;
  onRemove: (id: string) => void;
}

// ─── Helpers shared across views ─────────────────────────────────────────

const MEAL_PERIODS: { id: "family" | "lunch" | "lateNight"; label: string; hint: string }[] = [
  { id: "family",    label: "Family",     hint: "Group ordering · ≥2 mains gate" },
  { id: "lunch",     label: "Lunch",      hint: "Solo eating · 11:00–14:00" },
  { id: "lateNight", label: "Late-night", hint: "21:00–24:00 single-tap" },
];

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
    : bundle.refPriceGrosze && bundle.priceGrosze && bundle.refPriceGrosze > bundle.priceGrosze
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

function PeriodHeader({
  period,
  count,
  onAdd,
}: {
  period: typeof MEAL_PERIODS[number];
  count: number;
  onAdd: () => void;
}) {
  return (
    <header className="bm-ph">
      <div className="bm-ph__txt">
        <h2 className="bm-ph__label">{period.label} ladder</h2>
        <span className="bm-ph__hint">{period.hint}</span>
        <span className="bm-ph__count">{count} {count === 1 ? "tier" : "tiers"}</span>
      </div>
      <button type="button" className="bm-btn bm-btn--ghost" onClick={onAdd}>
        <Plus className="bm-icon" /> Add tier
      </button>
    </header>
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

function TierBadges({ bundle, compact = false }: { bundle: BundleConfig; compact?: boolean }) {
  return (
    <span className="bm-badges">
      {bundle.isDefault && <span className="bm-badge bm-badge--red">{compact ? "DEF" : "Most picked"}</span>}
      {bundle.isAnchor && <span className="bm-badge bm-badge--gold">{compact ? "ANC" : "Best value"}</span>}
      {bundle.isDecoy && <span className="bm-badge bm-badge--gray">{compact ? "DEC" : "Decoy"}</span>}
      {!bundle.active && <span className="bm-badge bm-badge--off">Inactive</span>}
    </span>
  );
}

/** Sheet — used by views that summon the editor as an overlay. */
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
    <div className="bm-sheet-root" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bm-sheet">
        <header className="bm-sheet__head">
          <div className="bm-sheet__head-l">
            <span className="bm-sheet__tier">{bundle.tier}</span>
            <span className="bm-sheet__name">{bundle.name}</span>
            <TierBadges bundle={bundle} />
          </div>
          <button type="button" className="bm-sheet__close" onClick={onClose} aria-label="Close">
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

// ─── View 1: Wizard (DEFAULT) ────────────────────────────────────────────

export function ViewWizard({ bundles, menu, onUpdate, onAdd, onRemove }: ViewProps) {
  const [activeId, setActiveId] = useState<string | null>(bundles[0]?.id ?? null);
  const active = bundles.find((b) => b.id === activeId) ?? bundles[0] ?? null;

  return (
    <div className="bm-view bm-view--wizard">
      <nav className="bm-tier-strip" aria-label="Tiers">
        {MEAL_PERIODS.map((p) => {
          const list = bundles.filter((b) => b.mealPeriod === p.id);
          if (list.length === 0) return null;
          return (
            <div key={p.id} className="bm-tier-strip__group">
              <span className="bm-tier-strip__group-label">{p.label}</span>
              {list.map((b) => {
                const s = summarize(b, menu);
                const on = active?.id === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setActiveId(b.id)}
                    className={`bm-tier-tab ${on ? "bm-tier-tab--on" : ""}`}
                  >
                    <span className="bm-tier-tab__head">
                      <span className="bm-tier-tab__tier">{b.tier}</span>
                      <TierBadges bundle={b} compact />
                    </span>
                    <span className="bm-tier-tab__name">{b.name}</span>
                    <span className="bm-tier-tab__meta">
                      <span>{s.priceLabel}</span>
                      <span className={`bm-margin-dot bm-margin-dot--${marginTone(s.margin)}`} />
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
        <div className="bm-tier-strip__add">
          {MEAL_PERIODS.map((p) => (
            <button key={p.id} type="button" onClick={() => onAdd(p.id)} className="bm-add-tier">
              <Plus className="bm-icon-sm" /> {p.label}
            </button>
          ))}
        </div>
      </nav>

      {active ? (
        <div className="bm-wizard-panel">
          <BundleEditor
            bundle={active}
            menu={menu}
            onChange={(patch) => onUpdate(active.id, patch)}
            onRemove={() => {
              const next = bundles.find((b) => b.id !== active.id);
              onRemove(active.id);
              setActiveId(next?.id ?? null);
            }}
            layout="full"
          />
        </div>
      ) : (
        <EmptyState onAdd={() => onAdd("family")} />
      )}
    </div>
  );
}

// ─── View 2: Card grid ───────────────────────────────────────────────────

export function ViewCardGrid({ bundles, menu, onUpdate, onAdd, onRemove }: ViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = bundles.find((b) => b.id === editingId);

  return (
    <div className="bm-view bm-view--card-grid">
      {MEAL_PERIODS.map((p) => {
        const list = bundles.filter((b) => b.mealPeriod === p.id);
        return (
          <section key={p.id} className="bm-section">
            <PeriodHeader period={p} count={list.length} onAdd={() => onAdd(p.id)} />
            {list.length === 0 ? (
              <EmptyState onAdd={() => onAdd(p.id)} />
            ) : (
              <div className="bm-card-grid">
                {list.map((b) => <CardTile key={b.id} bundle={b} menu={menu} onEdit={() => setEditingId(b.id)} />)}
              </div>
            )}
          </section>
        );
      })}
      {editing && (
        <EditorSheet
          bundle={editing}
          menu={menu}
          onChange={(p) => onUpdate(editing.id, p)}
          onClose={() => setEditingId(null)}
          onRemove={() => { onRemove(editing.id); setEditingId(null); }}
        />
      )}
    </div>
  );
}

function CardTile({ bundle, menu, onEdit }: { bundle: BundleConfig; menu: MenuItem[]; onEdit: () => void }) {
  const s = summarize(bundle, menu);
  return (
    <button type="button" onClick={onEdit} className={`bm-card ${bundle.isDefault ? "bm-card--default" : ""} ${bundle.isAnchor ? "bm-card--anchor" : ""} ${bundle.isDecoy ? "bm-card--decoy" : ""} ${!bundle.active ? "bm-card--inactive" : ""}`}>
      <header className="bm-card__head">
        <div>
          <span className="bm-card__tier">{bundle.tier}</span>
          <h3 className="bm-card__name">{bundle.name}</h3>
        </div>
        <TierBadges bundle={bundle} compact />
      </header>
      <p className="bm-card__desc">{bundle.description}</p>
      <div className="bm-card__price">
        <span className="bm-card__big">{s.priceLabel}</span>
        <span className="bm-card__disc">{s.discountLabel}</span>
      </div>
      <footer className="bm-card__foot">
        <span className={`bm-chip bm-chip--${s.isDynamic ? "indigo" : "gray"}`}>{s.isDynamic ? "Dynamic" : "Fixed"}</span>
        {s.margin !== null && (
          <span className={`bm-chip bm-chip--${marginTone(s.margin)}`}>{Math.round(s.margin * 100)}% margin</span>
        )}
        {bundle.requiredTier && <span className="bm-chip bm-chip--gold"><Lock className="bm-icon-sm" /> {bundle.requiredTier}</span>}
        <span className="bm-card__edit"><Pencil className="bm-icon-sm" /> Edit</span>
      </footer>
    </button>
  );
}

// ─── View 3: Master / detail ─────────────────────────────────────────────

export function ViewMasterDetail({ bundles, menu, onUpdate, onAdd, onRemove }: ViewProps) {
  const [activeId, setActiveId] = useState<string | null>(bundles[0]?.id ?? null);
  const active = bundles.find((b) => b.id === activeId);
  return (
    <div className="bm-view bm-view--master-detail">
      <aside className="bm-master">
        {MEAL_PERIODS.map((p) => {
          const list = bundles.filter((b) => b.mealPeriod === p.id);
          return (
            <div key={p.id} className="bm-master__group">
              <header className="bm-master__group-head">
                <span>{p.label}</span>
                <button type="button" className="bm-master__add" onClick={() => onAdd(p.id)} aria-label={`Add ${p.label} tier`}>
                  <Plus className="bm-icon-sm" />
                </button>
              </header>
              {list.map((b) => {
                const s = summarize(b, menu);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setActiveId(b.id)}
                    className={`bm-master__item ${activeId === b.id ? "bm-master__item--on" : ""}`}
                  >
                    <span className="bm-master__item-l">
                      <span className="bm-master__item-tier">{b.tier}</span>
                      <span className="bm-master__item-name">{b.name}</span>
                    </span>
                    <span className="bm-master__item-meta">
                      <span>{s.priceLabel}</span>
                      <span className={`bm-margin-dot bm-margin-dot--${marginTone(s.margin)}`} />
                    </span>
                  </button>
                );
              })}
              {list.length === 0 && <p className="bm-master__empty">No tiers</p>}
            </div>
          );
        })}
      </aside>
      <div className="bm-detail">
        {active ? (
          <>
            <header className="bm-detail__head">
              <span className="bm-detail__tier">{active.tier}</span>
              <h2 className="bm-detail__name">{active.name}</h2>
              <TierBadges bundle={active} />
            </header>
            <BundleEditor
              bundle={active}
              menu={menu}
              onChange={(p) => onUpdate(active.id, p)}
              onRemove={() => {
                const next = bundles.find((b) => b.id !== active.id);
                onRemove(active.id);
                setActiveId(next?.id ?? null);
              }}
              layout="panel"
            />
          </>
        ) : (
          <EmptyState onAdd={() => onAdd("family")} />
        )}
      </div>
    </div>
  );
}

// ─── View 4: Spreadsheet ─────────────────────────────────────────────────

export function ViewSpreadsheet({ bundles, menu, onUpdate, onAdd, onRemove }: ViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = bundles.find((b) => b.id === editingId);

  return (
    <div className="bm-view bm-view--spreadsheet">
      <div className="bm-table-wrap">
        <table className="bm-table">
          <thead>
            <tr>
              <th>Tier · name</th>
              <th>Mode</th>
              <th className="bm-r">Price / disc</th>
              <th className="bm-r">Mains</th>
              <th className="bm-r">Margin</th>
              <th>Days</th>
              <th>Flags</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {MEAL_PERIODS.map((p) => {
              const list = bundles.filter((b) => b.mealPeriod === p.id);
              if (list.length === 0) return null;
              return (
                <>
                  <tr key={`s-${p.id}`} className="bm-table__section">
                    <td colSpan={8}>{p.label} ladder · {list.length} {list.length === 1 ? "tier" : "tiers"} <button type="button" className="bm-table__add" onClick={() => onAdd(p.id)}>+ Add tier</button></td>
                  </tr>
                  {list.map((b) => <SpreadsheetRow key={b.id} bundle={b} menu={menu} onUpdate={onUpdate} onEdit={() => setEditingId(b.id)} />)}
                </>
              );
            })}
            {bundles.length === 0 && (
              <tr><td colSpan={8}><EmptyState onAdd={() => onAdd("family")} /></td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <EditorSheet
          bundle={editing}
          menu={menu}
          onChange={(p) => onUpdate(editing.id, p)}
          onClose={() => setEditingId(null)}
          onRemove={() => { onRemove(editing.id); setEditingId(null); }}
        />
      )}
    </div>
  );
}

function SpreadsheetRow({ bundle, menu, onUpdate, onEdit }: { bundle: BundleConfig; menu: MenuItem[]; onUpdate: ViewProps["onUpdate"]; onEdit: () => void }) {
  const s = summarize(bundle, menu);
  const isDynamic = (bundle.pricingMode ?? "fixed") === "dynamic";
  return (
    <tr className={!bundle.active ? "bm-table__row--off" : ""}>
      <td>
        <input
          className="bm-cell"
          value={bundle.tier}
          onChange={(e) => onUpdate(bundle.id, { tier: e.target.value })}
        />
        <input
          className="bm-cell bm-cell--sub"
          value={bundle.name}
          onChange={(e) => onUpdate(bundle.id, { name: e.target.value })}
        />
      </td>
      <td>
        <span className={`bm-chip bm-chip--${isDynamic ? "indigo" : "gray"} bm-chip--sm`}>
          {isDynamic ? "Dynamic" : "Fixed"}
        </span>
      </td>
      <td className="bm-r">
        {isDynamic ? (
          <input
            className="bm-cell bm-cell--num"
            type="number" min={0} max={50}
            value={bundle.discountPercent ?? 0}
            onChange={(e) => onUpdate(bundle.id, { discountPercent: Math.max(0, Math.min(50, parseInt(e.target.value, 10) || 0)) })}
          />
        ) : (
          <input
            className="bm-cell bm-cell--num"
            type="number" min={0}
            value={((bundle.priceGrosze ?? 0) / 100).toFixed(2)}
            onChange={(e) => onUpdate(bundle.id, { priceGrosze: Math.round(parseFloat(e.target.value || "0") * 100) })}
          />
        )}
        <div className="bm-cell-sub">{s.priceLabel}</div>
      </td>
      <td className="bm-r">
        {isDynamic ? (
          <span className="bm-cell-num-tight">
            <input
              className="bm-cell bm-cell--num bm-cell--xs"
              type="number" min={1}
              value={bundle.minMains ?? 2}
              onChange={(e) => onUpdate(bundle.id, { minMains: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            />
            <span>/</span>
            <input
              className="bm-cell bm-cell--num bm-cell--xs"
              type="number" min={1}
              value={bundle.maxMains ?? ""}
              placeholder="∞"
              onChange={(e) => {
                const v = e.target.value.trim();
                onUpdate(bundle.id, { maxMains: v === "" ? undefined : Math.max(1, parseInt(v, 10)) });
              }}
            />
          </span>
        ) : <span className="bm-muted">—</span>}
      </td>
      <td className={`bm-r bm-margin-cell bm-margin-cell--${marginTone(s.margin)}`}>
        {s.margin !== null ? `${Math.round(s.margin * 100)}%` : "—"}
      </td>
      <td>
        <span className="bm-cell-days">
          {(["mon","tue","wed","thu","fri","sat","sun"] as const).map((d) => (
            <span
              key={d}
              className={`bm-day-cell ${(bundle.activeDays ?? ["mon","tue","wed","thu","fri","sat","sun"]).includes(d) ? "bm-day-cell--on" : ""}`}
              title={d}
            >
              {d[0]}
            </span>
          ))}
        </span>
      </td>
      <td><TierBadges bundle={bundle} compact /></td>
      <td className="bm-r">
        <button type="button" className="bm-row-edit" onClick={onEdit} aria-label="Open editor">
          <Pencil className="bm-icon-sm" />
        </button>
      </td>
    </tr>
  );
}

// ─── View 5: Live preview ────────────────────────────────────────────────

export function ViewLivePreview({ bundles, menu, onUpdate, onAdd, onRemove }: ViewProps) {
  const [activeId, setActiveId] = useState<string | null>(bundles[0]?.id ?? null);
  const active = bundles.find((b) => b.id === activeId);
  return (
    <div className="bm-view bm-view--live">
      <div className="bm-live-left">
        <nav className="bm-tier-strip bm-tier-strip--inline" aria-label="Tiers">
          {bundles.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveId(b.id)}
              className={`bm-tier-tab ${activeId === b.id ? "bm-tier-tab--on" : ""}`}
            >
              <span className="bm-tier-tab__tier">{b.tier}</span>
              <span className="bm-tier-tab__name">{b.name}</span>
            </button>
          ))}
          <button type="button" className="bm-add-tier" onClick={() => onAdd("family")}>
            <Plus className="bm-icon-sm" /> Add
          </button>
        </nav>
        {active ? (
          <BundleEditor
            bundle={active}
            menu={menu}
            onChange={(p) => onUpdate(active.id, p)}
            onRemove={() => { onRemove(active.id); setActiveId(bundles.find((b) => b.id !== active.id)?.id ?? null); }}
            layout="full"
          />
        ) : (
          <EmptyState onAdd={() => onAdd("family")} />
        )}
      </div>
      <aside className="bm-live-preview">
        <header className="bm-live-preview__head">
          <span className="bm-live-preview__label">Customer cart · live</span>
          <span className="bm-live-preview__hint">Updates as you type</span>
        </header>
        {active ? <CartChipPreview bundle={active} menu={menu} /> : <p className="bm-muted">Pick a tier to preview.</p>}
      </aside>
    </div>
  );
}

function CartChipPreview({ bundle, menu }: { bundle: BundleConfig; menu: MenuItem[] }) {
  const s = summarize(bundle, menu);
  return (
    <div className={`bm-chip-preview ${bundle.isDefault ? "bm-chip-preview--default" : ""}`}>
      {bundle.isDefault && <span className="bm-chip-preview__most">MOST PICKED</span>}
      {bundle.isAnchor && !bundle.isDefault && <span className="bm-chip-preview__best">BEST VALUE</span>}
      <div className="bm-chip-preview__row">
        <div>
          <p className="bm-chip-preview__cta">Make it a {bundle.tier}</p>
          <p className="bm-chip-preview__desc">{bundle.description}</p>
        </div>
        <div className="bm-chip-preview__price">
          <span className="bm-chip-preview__big">{s.priceLabel}</span>
          {s.discountLabel && <span className="bm-chip-preview__save">{s.discountLabel}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── View 6: Accordion ───────────────────────────────────────────────────

export function ViewAccordion({ bundles, menu, onUpdate, onAdd, onRemove }: ViewProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="bm-view bm-view--accordion">
      {MEAL_PERIODS.map((p) => {
        const list = bundles.filter((b) => b.mealPeriod === p.id);
        return (
          <section key={p.id} className="bm-section">
            <PeriodHeader period={p} count={list.length} onAdd={() => onAdd(p.id)} />
            {list.length === 0 ? <EmptyState onAdd={() => onAdd(p.id)} /> :
              <ul className="bm-accordion">
                {list.map((b) => {
                  const open = openId === b.id;
                  const s = summarize(b, menu);
                  return (
                    <li key={b.id} className={`bm-acc ${open ? "bm-acc--open" : ""} ${!b.active ? "bm-acc--off" : ""}`}>
                      <button
                        type="button"
                        className="bm-acc__head"
                        onClick={() => setOpenId(open ? null : b.id)}
                      >
                        <ChevronRight className={`bm-acc__chev ${open ? "bm-acc__chev--open" : ""}`} />
                        <span className="bm-acc__tier">{b.tier}</span>
                        <span className="bm-acc__name">{b.name}</span>
                        <TierBadges bundle={b} compact />
                        <span className="bm-acc__price">{s.priceLabel}</span>
                        <span className={`bm-chip bm-chip--${marginTone(s.margin)} bm-chip--sm`}>
                          {s.margin !== null ? `${Math.round(s.margin * 100)}%` : "—"}
                        </span>
                      </button>
                      {open && (
                        <div className="bm-acc__body">
                          <BundleEditor
                            bundle={b}
                            menu={menu}
                            onChange={(p) => onUpdate(b.id, p)}
                            onRemove={() => { onRemove(b.id); setOpenId(null); }}
                            layout="panel"
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>}
          </section>
        );
      })}
    </div>
  );
}

// ─── View 7: Flat minimal ────────────────────────────────────────────────

export function ViewFlatMinimal({ bundles, menu, onUpdate, onAdd, onRemove }: ViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = bundles.find((b) => b.id === editingId);
  return (
    <div className="bm-view bm-view--flat">
      {MEAL_PERIODS.map((p) => {
        const list = bundles.filter((b) => b.mealPeriod === p.id);
        if (list.length === 0) return null;
        return (
          <section key={p.id} className="bm-flat-section">
            <header className="bm-flat-section__head">
              <h2>{p.label} ladder · {p.hint}</h2>
              <button type="button" className="bm-btn bm-btn--ghost" onClick={() => onAdd(p.id)}><Plus className="bm-icon-sm" /> Add</button>
            </header>
            {list.map((b) => {
              const s = summarize(b, menu);
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`bm-flat-row ${!b.active ? "bm-flat-row--off" : ""}`}
                  onClick={() => setEditingId(b.id)}
                >
                  <div className="bm-flat-row__l">
                    <span className="bm-flat-row__tier">
                      {b.tier} <TierBadges bundle={b} compact />
                    </span>
                    <h3 className="bm-flat-row__name">{b.name}</h3>
                    <p className="bm-flat-row__desc">{b.description}</p>
                    <p className="bm-flat-row__meta">
                      <span>{s.isDynamic ? "Dynamic" : "Fixed"}</span>
                      <span>·</span>
                      <span>{s.discountLabel}</span>
                      {s.margin !== null && <>
                        <span>·</span>
                        <span className={`bm-margin-text bm-margin-text--${marginTone(s.margin)}`}>{Math.round(s.margin * 100)}% margin</span>
                      </>}
                    </p>
                  </div>
                  <span className="bm-flat-row__price">{s.priceLabel}</span>
                  <Pencil className="bm-flat-row__edit" />
                </button>
              );
            })}
          </section>
        );
      })}
      {bundles.length === 0 && <EmptyState onAdd={() => onAdd("family")} />}
      {editing && (
        <EditorSheet
          bundle={editing}
          menu={menu}
          onChange={(p) => onUpdate(editing.id, p)}
          onClose={() => setEditingId(null)}
          onRemove={() => { onRemove(editing.id); setEditingId(null); }}
        />
      )}
    </div>
  );
}

// ─── View 8: Margin dashboard ────────────────────────────────────────────

export function ViewMarginDashboard({ bundles, menu, onUpdate, onAdd, onRemove }: ViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = bundles.find((b) => b.id === editingId);

  const summary = useMemo(() => {
    const samples = bundles.map((b) => ({ b, s: summarize(b, menu) }));
    const avgMargin = samples
      .map((x) => x.s.margin)
      .filter((m): m is number => m !== null);
    const avg = avgMargin.length ? avgMargin.reduce((a, b) => a + b, 0) / avgMargin.length : 0;
    const flagged = samples.filter((x) => x.s.margin !== null && x.s.margin < 0.4).length;
    return { count: bundles.length, avg, flagged };
  }, [bundles, menu]);

  return (
    <div className="bm-view bm-view--margin">
      <div className="bm-margin-summary">
        <Kpi label="Active tiers" value={`${summary.count}`} />
        <Kpi label="Average margin" value={`${Math.round(summary.avg * 100)}%`} tone={summary.avg >= 0.4 ? "good" : "warn"} />
        <Kpi label="Below 40% target" value={`${summary.flagged}`} tone={summary.flagged === 0 ? "good" : "warn"} />
      </div>
      <div className="bm-card-grid bm-card-grid--analytics">
        {bundles.map((b) => {
          const s = summarize(b, menu);
          const tone = marginTone(s.margin);
          return (
            <button key={b.id} type="button" onClick={() => setEditingId(b.id)} className={`bm-margin-card bm-margin-card--${tone}`}>
              <header>
                <span className="bm-margin-card__tier">{b.tier}</span>
                <h3>{b.name}</h3>
                <TierBadges bundle={b} compact />
              </header>
              <div className="bm-gauge" aria-hidden>
                <div className="bm-gauge__bar">
                  <span className="bm-gauge__band bm-gauge__band--bad" />
                  <span className="bm-gauge__band bm-gauge__band--warn" />
                  <span className="bm-gauge__band bm-gauge__band--good" />
                  {s.margin !== null && <span className="bm-gauge__needle" style={{ left: `${Math.min(100, Math.max(0, s.margin * 100))}%` }} />}
                </div>
                <div className="bm-gauge__labels"><span>0</span><span>25</span><span>40</span><span>100</span></div>
              </div>
              <div className="bm-margin-card__grid">
                <div><span className="bm-l">Price</span><span className="bm-v">{s.priceLabel}</span></div>
                <div><span className="bm-l">Margin</span><span className={`bm-v bm-margin-text bm-margin-text--${tone}`}>{s.margin !== null ? `${Math.round(s.margin * 100)}%` : "—"}</span></div>
                <div><span className="bm-l">Discount</span><span className="bm-v">{s.discountLabel}</span></div>
              </div>
              <footer><Pencil className="bm-icon-sm" /> Edit</footer>
            </button>
          );
        })}
        {bundles.length === 0 && <EmptyState onAdd={() => onAdd("family")} />}
      </div>
      {editing && (
        <EditorSheet
          bundle={editing}
          menu={menu}
          onChange={(p) => onUpdate(editing.id, p)}
          onClose={() => setEditingId(null)}
          onRemove={() => { onRemove(editing.id); setEditingId(null); }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "warn" | "neutral" }) {
  return (
    <div className={`bm-kpi bm-kpi--${tone}`}>
      <span className="bm-kpi__l">{label}</span>
      <span className="bm-kpi__v">{value}</span>
    </div>
  );
}

// ─── View 9: Mobile (auto) ───────────────────────────────────────────────

export function ViewMobile({ bundles, menu, onUpdate, onAdd, onRemove }: ViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = bundles.find((b) => b.id === editingId);
  return (
    <div className="bm-view bm-view--mobile">
      {MEAL_PERIODS.map((p) => {
        const list = bundles.filter((b) => b.mealPeriod === p.id);
        return (
          <section key={p.id} className="bm-mobile-section">
            <header className="bm-mobile-section__head">
              <div>
                <h2>{p.label} ladder</h2>
                <small>{p.hint}</small>
              </div>
              <button type="button" className="bm-btn bm-btn--ghost" onClick={() => onAdd(p.id)}><Plus className="bm-icon-sm" /></button>
            </header>
            {list.length === 0 ? <EmptyState onAdd={() => onAdd(p.id)} /> :
              list.map((b) => {
                const s = summarize(b, menu);
                return (
                  <button key={b.id} type="button" onClick={() => setEditingId(b.id)} className={`bm-mobile-card ${b.isDefault ? "bm-card--default" : ""} ${b.isAnchor ? "bm-card--anchor" : ""} ${!b.active ? "bm-card--inactive" : ""}`}>
                    <header>
                      <span className="bm-card__tier">{b.tier}</span>
                      <h3>{b.name}</h3>
                      <TierBadges bundle={b} compact />
                    </header>
                    <p className="bm-card__desc">{b.description}</p>
                    <div className="bm-mobile-grid">
                      <div><span className="bm-l">Mode</span><span className="bm-v">{s.isDynamic ? "Dynamic" : "Fixed"}</span></div>
                      <div><span className="bm-l">Margin</span><span className={`bm-v bm-margin-text bm-margin-text--${marginTone(s.margin)}`}>{s.margin !== null ? `${Math.round(s.margin * 100)}%` : "—"}</span></div>
                      <div><span className="bm-l">Price</span><span className="bm-v">{s.priceLabel}</span></div>
                    </div>
                  </button>
                );
              })}
          </section>
        );
      })}
      {editing && (
        <EditorSheet
          bundle={editing}
          menu={menu}
          onChange={(p) => onUpdate(editing.id, p)}
          onClose={() => setEditingId(null)}
          onRemove={() => { onRemove(editing.id); setEditingId(null); }}
        />
      )}
    </div>
  );
}

// Used by the BundleManager to seed the starter bundle.
export { makeStarterBundle };
