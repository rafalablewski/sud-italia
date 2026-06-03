"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Pencil,
  Layers,
  Coins,
  Boxes,
  Calendar,
  Users,
  Gauge,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  AlertCircle,
} from "lucide-react";
import type { MenuItem, MenuCategory } from "@/data/types";
import type { BundleConfig } from "@/components/admin/AdminSellingShared";
import {
  CompositionEditor,
  WEEKDAYS,
  CATEGORIES,
} from "@/components/admin/AdminSellingShared";
import {
  computeMarginSamples,
  worstBundleMargin,
  type MarginSample,
} from "@/lib/bundle-margin";

/** Concern-tabs inside the wizard. Defined locally — there's only one
 *  view (card grid) and one editor, so no need for a separate types
 *  module. */
type EditorTab = "identity" | "pricing" | "composition" | "schedule" | "audience" | "margin";

const EDITOR_TABS: { id: EditorTab; label: string; hint: string }[] = [
  { id: "identity",    label: "Identity",    hint: "Tier · name · description" },
  { id: "pricing",     label: "Pricing",     hint: "Mode · discount · mains gate" },
  { id: "composition", label: "Composition", hint: "Static add-on slots" },
  { id: "schedule",    label: "Schedule",    hint: "Days · scarcity · ladder role" },
  { id: "audience",    label: "Audience",    hint: "Mains scale · loyalty gate" },
  { id: "margin",      label: "Margin",      hint: "Live price + cost preview" },
];

/**
 * Shared bundle editor — the wizard. Every view-mode either embeds this
 * inline (wizard, master-detail, live-preview, accordion) or opens it
 * inside a sheet (card-grid, spreadsheet, flat-minimal, margin-dashboard,
 * mobile). Six tabs, one concern each.
 *
 * The editor is pure: it never reaches into the store directly. All
 * mutations are emitted via `onChange(patch)` so the parent can route
 * the patch through whatever bundle list it's holding.
 */

interface Props {
  bundle: BundleConfig;
  menu: MenuItem[];
  onChange: (patch: Partial<BundleConfig>) => void;
  onRemove?: () => void;
  /** Hide the tier-tabs sidebar (useful in views that already select a
   *  tier — master-detail, accordion, live-preview). */
  layout?: "full" | "panel";
  /** Pre-select a tab. Defaults to identity for new bundles, pricing
   *  for everything else. */
  initialTab?: EditorTab;
}

const TAB_ICON: Record<EditorTab, typeof Layers> = {
  identity: Layers,
  pricing: Coins,
  composition: Boxes,
  schedule: Calendar,
  audience: Users,
  margin: Gauge,
};

export function BundleEditor({ bundle, menu, onChange, onRemove, layout = "full", initialTab = "identity" }: Props) {
  const [tab, setTab] = useState<EditorTab>(initialTab);

  const mode: "fixed" | "dynamic" = bundle.pricingMode ?? "fixed";
  const isDynamic = mode === "dynamic";

  return (
    <div className={`bm-editor bm-editor--${layout}`}>
      <aside className="bm-editor__tabs" aria-label="Editor sections">
        {EDITOR_TABS.map((t) => {
          const Icon = TAB_ICON[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`bm-tab ${tab === t.id ? "bm-tab--on" : ""}`}
              aria-current={tab === t.id ? "true" : undefined}
            >
              <Icon className="bm-tab__icon" aria-hidden />
              <span className="bm-tab__txt">
                <span className="bm-tab__label">{t.label}</span>
                <span className="bm-tab__hint">{t.hint}</span>
              </span>
            </button>
          );
        })}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="bm-tab bm-tab--danger"
          >
            <Trash2 className="bm-tab__icon" aria-hidden />
            <span className="bm-tab__txt">
              <span className="bm-tab__label">Delete tier</span>
              <span className="bm-tab__hint">Permanent</span>
            </span>
          </button>
        )}
      </aside>

      <section className="bm-editor__panel">
        {tab === "identity" && <IdentityPanel bundle={bundle} onChange={onChange} />}
        {tab === "pricing" && <PricingPanel bundle={bundle} onChange={onChange} isDynamic={isDynamic} />}
        {tab === "composition" && <CompositionPanel bundle={bundle} onChange={onChange} isDynamic={isDynamic} />}
        {tab === "schedule" && <SchedulePanel bundle={bundle} onChange={onChange} />}
        {tab === "audience" && <AudiencePanel bundle={bundle} onChange={onChange} isDynamic={isDynamic} />}
        {tab === "margin" && <MarginPanel bundle={bundle} menu={menu} isDynamic={isDynamic} />}

        <footer className="bm-editor__nav">
          <button
            type="button"
            className="bm-btn bm-btn--ghost"
            onClick={() => {
              const i = EDITOR_TABS.findIndex((t) => t.id === tab);
              if (i > 0) setTab(EDITOR_TABS[i - 1].id);
            }}
            disabled={tab === EDITOR_TABS[0].id}
          >
            <ChevronLeft className="bm-icon" /> Previous
          </button>
          <span className="bm-editor__step">
            Step {EDITOR_TABS.findIndex((t) => t.id === tab) + 1} of {EDITOR_TABS.length}
          </span>
          <button
            type="button"
            className="bm-btn bm-btn--primary"
            onClick={() => {
              const i = EDITOR_TABS.findIndex((t) => t.id === tab);
              if (i < EDITOR_TABS.length - 1) setTab(EDITOR_TABS[i + 1].id);
            }}
            disabled={tab === EDITOR_TABS[EDITOR_TABS.length - 1].id}
          >
            Next <ChevronRight className="bm-icon" />
          </button>
        </footer>
      </section>
    </div>
  );
}

// ─── Panels ──────────────────────────────────────────────────────────────

function IdentityPanel({ bundle, onChange }: { bundle: BundleConfig; onChange: (p: Partial<BundleConfig>) => void }) {
  return (
    <>
      <PanelHeader title="Identity" hint="What the customer sees on the cart chip." />
      <div className="bm-grid bm-grid--2">
        <Field label="Tier label" hint="Short header — Solo · Lunch · Family Feast">
          <input
            className="bm-input"
            value={bundle.tier}
            onChange={(e) => onChange({ tier: e.target.value })}
            placeholder="Family Feast"
          />
        </Field>
        <Field label="Bundle name" hint="Headline · ≤24 chars renders cleanly on mobile">
          <input
            className="bm-input"
            value={bundle.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Whole-table dinner"
          />
        </Field>
      </div>
      <Field label="Description" hint="Composition copy under the name. Use 'Your mains' to scale with cart on dynamic bundles.">
        <input
          className="bm-input"
          value={bundle.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Your mains + 2 antipasti + 4 drinks + tiramisù"
        />
      </Field>
    </>
  );
}

function PricingPanel({ bundle, onChange, isDynamic }: { bundle: BundleConfig; onChange: (p: Partial<BundleConfig>) => void; isDynamic: boolean }) {
  const switchToFixed = () =>
    onChange({
      pricingMode: "fixed",
      priceGrosze: bundle.priceGrosze ?? 9900,
      refPriceGrosze: bundle.refPriceGrosze ?? 11000,
      mainCategories: undefined,
      minMains: undefined,
      maxMains: undefined,
      discountPercent: undefined,
      mainsDiscountPercent: undefined,
      addOnsDiscountPercent: undefined,
    });
  const switchToDynamic = () =>
    onChange({
      pricingMode: "dynamic",
      mainCategories: bundle.mainCategories ?? ["pizza", "pasta"],
      minMains: bundle.minMains ?? 2,
      maxMains: bundle.maxMains,
      discountPercent: bundle.discountPercent ?? 20,
      priceGrosze: undefined,
      refPriceGrosze: undefined,
    });
  const splitEnabled =
    bundle.mainsDiscountPercent !== undefined || bundle.addOnsDiscountPercent !== undefined;

  return (
    <>
      <PanelHeader
        title="Pricing"
        hint={
          isDynamic
            ? "Dynamic price = (mains × menu + cheapest add-ons) × (1 − discount/100). Customer sees a live number."
            : "Fixed price locks both composition and total. Used for solo lunch tiers."
        }
      />

      <div className="bm-mode">
        <button
          type="button"
          onClick={switchToFixed}
          className={`bm-mode__btn ${!isDynamic ? "bm-mode__btn--on" : ""}`}
        >
          <span className="bm-mode__label">Fixed</span>
          <span className="bm-mode__hint">Locked price · locked composition</span>
        </button>
        <button
          type="button"
          onClick={switchToDynamic}
          className={`bm-mode__btn ${isDynamic ? "bm-mode__btn--on" : ""}`}
        >
          <span className="bm-mode__label">Dynamic</span>
          <span className="bm-mode__hint">Mains scale with cart · static add-ons</span>
        </button>
      </div>

      {!isDynamic ? (
        <div className="bm-grid bm-grid--2">
          <Field label="Price (zł)" hint="Charged amount when the bundle is applied">
            <input
              type="number"
              min={0}
              className="bm-input bm-input--num"
              value={((bundle.priceGrosze ?? 0) / 100).toFixed(2)}
              onChange={(e) => onChange({ priceGrosze: Math.round(parseFloat(e.target.value || "0") * 100) })}
            />
          </Field>
          <Field label="Reference price (zł)" hint="Strikethrough &lsquo;you&rsquo;d pay&rsquo; — drives the savings badge">
            <input
              type="number"
              min={0}
              className="bm-input bm-input--num"
              value={((bundle.refPriceGrosze ?? 0) / 100).toFixed(2)}
              onChange={(e) => onChange({ refPriceGrosze: Math.round(parseFloat(e.target.value || "0") * 100) })}
            />
          </Field>
        </div>
      ) : (
        <>
          <div className="bm-grid bm-grid--3">
            <Field label="Discount %" hint="Blended discount when split mode is off">
              <input
                type="number"
                min={0}
                max={50}
                className="bm-input bm-input--num"
                value={bundle.discountPercent ?? 20}
                disabled={splitEnabled}
                onChange={(e) =>
                  onChange({ discountPercent: clamp(parseInt(e.target.value, 10) || 0, 0, 50) })
                }
              />
            </Field>
            <Field label="Min mains" hint="Hard gate — ladder hides below this">
              <input
                type="number"
                min={1}
                className="bm-input bm-input--num"
                value={bundle.minMains ?? 2}
                onChange={(e) => onChange({ minMains: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              />
            </Field>
            <Field label="Max mains (optional)" hint="Anti-abuse cap — leave empty for ∞">
              <input
                type="number"
                min={1}
                className="bm-input bm-input--num"
                value={bundle.maxMains ?? ""}
                placeholder="∞"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  onChange({ maxMains: v === "" ? undefined : Math.max(1, parseInt(v, 10)) });
                }}
              />
            </Field>
          </div>

          <div className="bm-split">
            <header className="bm-split__head">
              <div>
                <p className="bm-split__title">Split discount · advanced</p>
                <p className="bm-split__hint">
                  Protect pizza margin with a lower mains % while giving away high-GM add-ons.
                </p>
              </div>
              <label className="bm-toggle">
                <input
                  type="checkbox"
                  checked={splitEnabled}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? {
                            mainsDiscountPercent:
                              bundle.mainsDiscountPercent ?? Math.max(0, (bundle.discountPercent ?? 20) - 10),
                            addOnsDiscountPercent:
                              bundle.addOnsDiscountPercent ?? Math.min(50, (bundle.discountPercent ?? 20) + 10),
                          }
                        : { mainsDiscountPercent: undefined, addOnsDiscountPercent: undefined },
                    )
                  }
                />
                <span>{splitEnabled ? "On" : "Off"}</span>
              </label>
            </header>
            {splitEnabled && (
              <div className="bm-grid bm-grid--2">
                <Field label="Mains %" hint="Applied to pizzas/pastas — keep low">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    className="bm-input bm-input--num"
                    value={bundle.mainsDiscountPercent ?? 0}
                    onChange={(e) =>
                      onChange({ mainsDiscountPercent: clamp(parseInt(e.target.value, 10) || 0, 0, 50) })
                    }
                  />
                </Field>
                <Field label="Add-ons %" hint="Applied to drinks/sides/desserts — go higher">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    className="bm-input bm-input--num"
                    value={bundle.addOnsDiscountPercent ?? 0}
                    onChange={(e) =>
                      onChange({ addOnsDiscountPercent: clamp(parseInt(e.target.value, 10) || 0, 0, 50) })
                    }
                  />
                </Field>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function CompositionPanel({ bundle, onChange, isDynamic }: { bundle: BundleConfig; onChange: (p: Partial<BundleConfig>) => void; isDynamic: boolean }) {
  const exclude = isDynamic ? (bundle.mainCategories ?? []) : [];
  return (
    <>
      <PanelHeader
        title="Composition"
        hint={
          isDynamic
            ? "Static add-on allowance. Main categories are filtered out so they can't double-count."
            : "Every slot is fixed — the customer's cart will mirror it exactly when applied."
        }
      />
      <div className="bm-composition">
        <CompositionEditor
          composition={bundle.composition}
          excludeCategories={exclude}
          onChange={(composition) => onChange({ composition })}
        />
      </div>
    </>
  );
}

function SchedulePanel({ bundle, onChange }: { bundle: BundleConfig; onChange: (p: Partial<BundleConfig>) => void }) {
  return (
    <>
      <PanelHeader title="Schedule &amp; ladder role" hint="Scarcity framing, weekday gating, and ladder badges all live here." />

      <div className="bm-grid bm-grid--2">
        <Field label="Limited until" hint="Past dates auto-deactivate the bundle. Empty = no expiry.">
          <input
            type="date"
            className="bm-input"
            value={bundle.limitedUntil ?? ""}
            onChange={(e) => onChange({ limitedUntil: e.target.value.trim() === "" ? undefined : e.target.value })}
          />
        </Field>
        <Field label="Active days" hint="Empty = every day. Use for Friday Family Feast pushes / Wednesday Lunch+.">
          <div className="bm-day-row">
            {WEEKDAYS.map((day) => {
              const on = (bundle.activeDays ?? []).includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    const current = new Set(bundle.activeDays ?? []);
                    if (on) current.delete(day);
                    else current.add(day);
                    onChange({ activeDays: current.size === 0 ? undefined : Array.from(current) });
                  }}
                  className={`bm-day ${on ? "bm-day--on" : ""}`}
                >
                  {day.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </Field>
      </div>

      <div className="bm-grid bm-grid--2">
        <Field
          label="Channel"
          hint="Dine-in surfaces only on truck/takeout carts. Delivery surfaces only on delivery carts. Both = no restriction."
        >
          <select
            className="bm-input"
            value={bundle.channel ?? ""}
            onChange={(e) =>
              onChange({
                channel:
                  e.target.value === ""
                    ? undefined
                    : (e.target.value as "dine-in" | "delivery"),
              })
            }
          >
            <option value="">Both channels</option>
            <option value="dine-in">Dine-in only</option>
            <option value="delivery">Delivery only</option>
          </select>
        </Field>
        <Field
          label="Members only"
          hint="Hide from anonymous carts. Drives phone collection as a conversion lever — customer must have a phone on file."
        >
          <label className="bm-toggle">
            <input
              type="checkbox"
              checked={!!bundle.membersOnly}
              onChange={(e) =>
                onChange({ membersOnly: e.target.checked || undefined })
              }
            />
            <span>{bundle.membersOnly ? "Members only" : "Anyone"}</span>
          </label>
        </Field>
      </div>

      <div className="bm-flags">
        <p className="bm-flags__title">Ladder role</p>
        <p className="bm-flags__hint">
          One bundle per ladder should be the default-pushed tier (red &ldquo;Most picked&rdquo;) and one should
          be the anchor (gold &ldquo;Best value&rdquo;). Both can be the same tier — the default badge dominates.
        </p>
        <div className="bm-flags__row">
          <FlagToggle
            on={!!bundle.isDefault}
            label="Default-pushed"
            hint="Red Most-picked badge · primary CTA"
            color="red"
            onChange={(v) =>
              onChange({
                isDefault: v,
                isAnchor: v ? false : bundle.isAnchor,
                isDecoy: v ? false : bundle.isDecoy,
              })
            }
          />
          <FlagToggle
            on={!!bundle.isAnchor}
            label="Anchor"
            hint="Gold Best-value badge · visual centerpiece"
            color="gold"
            onChange={(v) =>
              onChange({
                isAnchor: v,
                isDefault: v ? false : bundle.isDefault,
                isDecoy: v ? false : bundle.isDecoy,
              })
            }
          />
          <FlagToggle
            on={!!bundle.isDecoy}
            label="Decoy"
            hint="Muted styling · pushes the anchor forward"
            color="gray"
            onChange={(v) =>
              onChange({
                isDecoy: v,
                isDefault: v ? false : bundle.isDefault,
                isAnchor: v ? false : bundle.isAnchor,
              })
            }
          />
          <FlagToggle
            on={bundle.active}
            label="Active"
            hint="Bundle surfaces in the cart drawer"
            color="green"
            onChange={(v) => onChange({ active: v })}
          />
        </div>
      </div>
    </>
  );
}

function AudiencePanel({ bundle, onChange, isDynamic }: { bundle: BundleConfig; onChange: (p: Partial<BundleConfig>) => void; isDynamic: boolean }) {
  const mainsSet = new Set(bundle.mainCategories ?? []);
  return (
    <>
      <PanelHeader title="Audience" hint="Who sees this tier, and which categories scale the price." />

      {isDynamic ? (
        <Field label="Mains scale on" hint="Cart items in these categories carry into the bundle 1:1 and drive the price.">
          <div className="bm-chip-row">
            {(["pizza", "pasta"] as const).map((cat) => {
              const on = mainsSet.has(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    const next = new Set(mainsSet);
                    if (on) next.delete(cat);
                    else next.add(cat);
                    onChange({ mainCategories: Array.from(next) });
                  }}
                  className={`bm-chip ${on ? "bm-chip--on" : ""}`}
                >
                  {on && <Check className="bm-icon-sm" />}
                  {cat}
                </button>
              );
            })}
          </div>
        </Field>
      ) : (
        <div className="bm-info">
          <AlertCircle className="bm-icon-sm" />
          <p>Fixed-price bundles don&rsquo;t scale on cart contents. Switch to <strong>Dynamic</strong> on the Pricing tab to expose this.</p>
        </div>
      )}

      <Field label="Loyalty gate" hint="Tier-locked bundles surface only for the chosen loyalty tier and above.">
        <select
          className="bm-input"
          value={bundle.requiredTier ?? ""}
          onChange={(e) => onChange({ requiredTier: e.target.value === "" ? undefined : (e.target.value as "gold" | "platinum") })}
        >
          <option value="">All customers</option>
          <option value="gold">Gold &amp; Platinum only</option>
          <option value="platinum">Platinum only</option>
        </select>
      </Field>
    </>
  );
}

function MarginPanel({ bundle, menu, isDynamic }: { bundle: BundleConfig; menu: MenuItem[]; isDynamic: boolean }) {
  const samples = useMemo(() => computeMarginSamples(bundle, menu), [bundle, menu]);
  return (
    <>
      <PanelHeader title="Margin preview" hint="Live from MenuItem.cost. Re-tune Pricing if any sample drops below 40%." />
      <div className="bm-margin-grid">
        {samples.map((s) => {
          const tone =
            s.margin === null ? "muted" :
            s.margin >= 0.5 ? "good" :
            s.margin >= 0.4 ? "ok" :
            s.margin >= 0.25 ? "warn" : "bad";
          return (
            <article key={s.label} className={`bm-margin bm-margin--${tone}`}>
              <header>{s.label}</header>
              <div className="bm-margin__price">{s.priceLabel}</div>
              <div className="bm-margin__pct">
                {s.margin !== null ? `${Math.round(s.margin * 100)}% margin` : "—"}
              </div>
              <p className="bm-margin__hint">{s.hint}</p>
            </article>
          );
        })}
      </div>
      {!isDynamic && (
        <p className="bm-margin__caveat">
          Fixed bundles compute margin from <strong>priceGrosze</strong> minus the sum of each slot&rsquo;s cheapest
          candidate cost — the same cost the customer would see in the line items.
        </p>
      )}
    </>
  );
}

// ─── Small building blocks ───────────────────────────────────────────────

function PanelHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <header className="bm-panel-head">
      <h3 className="bm-panel-head__title">{title}</h3>
      <p className="bm-panel-head__hint">{hint}</p>
    </header>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="bm-field">
      <span className="bm-field__label">{label}</span>
      {children}
      {hint && <span className="bm-field__hint">{hint}</span>}
    </label>
  );
}

function FlagToggle({
  on,
  label,
  hint,
  color,
  onChange,
}: {
  on: boolean;
  label: string;
  hint: string;
  color: "red" | "gold" | "gray" | "green";
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`bm-flag bm-flag--${color} ${on ? "bm-flag--on" : ""}`}
    >
      <span className="bm-flag__icon">{on ? <Check className="bm-icon-sm" /> : <Plus className="bm-icon-sm" style={{ transform: "rotate(45deg)" }} />}</span>
      <span className="bm-flag__txt">
        <span className="bm-flag__label">{label}</span>
        <span className="bm-flag__hint">{hint}</span>
      </span>
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

// Re-export the pure margin helpers (moved to @/lib/bundle-margin so the
// admin save-time guardian can share them without a circular import) for
// callers that still reach them through the editor module.
export { computeMarginSamples, worstBundleMargin };
export type { MarginSample };

/** Default starter bundle for the "Add tier" action — used by views
 *  that don't want to manage the seed themselves. */
export function makeStarterBundle(mealPeriod: "lunch" | "family" | "lateNight"): BundleConfig {
  const id = `${mealPeriod}-${Math.random().toString(36).slice(2, 8)}`;
  if (mealPeriod === "lunch") {
    return {
      id,
      tier: "New Lunch tier",
      name: "Bundle name",
      description: "What's in it",
      pricingMode: "fixed",
      priceGrosze: 3500,
      refPriceGrosze: 4000,
      composition: [{ kind: "category", category: "pasta", quantity: 1 }],
      mealPeriod,
      active: true,
    };
  }
  if (mealPeriod === "lateNight") {
    return {
      id,
      tier: "Late tier",
      name: "Bundle name",
      description: "Your main + 1 drink + dessert",
      pricingMode: "dynamic",
      mainCategories: ["pizza"],
      minMains: 1,
      maxMains: 3,
      discountPercent: 22,
      composition: [
        { kind: "category", category: "drinks", quantity: 1 },
        { kind: "category", category: "desserts", quantity: 1 },
      ],
      mealPeriod,
      active: true,
    };
  }
  return {
    id,
    tier: "New Family tier",
    name: "Bundle name",
    description: "Your mains + …",
    pricingMode: "dynamic",
    mainCategories: ["pizza", "pasta"],
    minMains: 2,
    discountPercent: 20,
    composition: [
      { kind: "category", category: "antipasti", quantity: 1 },
      { kind: "category", category: "drinks", quantity: 2 },
    ],
    mealPeriod,
    active: true,
  };
}

export { CATEGORIES };
export type { MenuCategory };
export const PencilIcon = Pencil;
