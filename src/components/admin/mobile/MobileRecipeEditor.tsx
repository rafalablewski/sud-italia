"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { BottomSheet, haptic } from "../v2/mobile";
import { useToast } from "../v2/ui/Toast";

interface IngredientData {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
}

interface EnrichedRecipeIngredient {
  ingredientId: string;
  quantity: number;
  wasteFactor: number;
  name?: string;
  unit?: string;
  unitCost?: number;
}

interface RecipeData {
  menuItemId: string;
  enrichedIngredients?: EnrichedRecipeIngredient[];
  ingredients?: EnrichedRecipeIngredient[];
  prepTimeMinutes?: number;
  yieldPortions: number;
  notes?: string;
  calculatedCost?: number;
}

interface MenuItemRow {
  id: string;
  name: string;
  price: number;
}

interface Props {
  /** Open when set; closed when null. */
  menuItem: MenuItemRow | null;
  recipe?: RecipeData;
  ingredients: IngredientData[];
  onClose: () => void;
  onSaved: () => void;
}

const fieldLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--fg-subtle)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 6,
  display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--fg)",
  fontSize: 16,
  fontFamily: "var(--font-ui)",
  outline: 0,
};

// Display in grams/ml for kg/L so cooks aren't typing 0.025 for 25 g.
function displayUnit(unit: string | undefined): string {
  if (unit === "kg") return "g";
  if (unit === "L") return "ml";
  return unit ?? "";
}
function toDisplayQty(qty: number, unit: string | undefined): number {
  if (unit === "kg" || unit === "L") return Math.round(qty * 1000 * 10) / 10;
  return qty;
}
function fromDisplayQty(displayQty: number, unit: string | undefined): number {
  if (unit === "kg" || unit === "L") return displayQty / 1000;
  return displayQty;
}
function displayStep(unit: string | undefined): string {
  if (unit === "kg" || unit === "L") return "1";
  if (unit === "bunch") return "0.1";
  return "1";
}
function factorToPercent(wf: number): number {
  if (!Number.isFinite(wf) || wf <= 1) return 0;
  return Math.round((wf - 1) * 100);
}
function percentToFactor(pct: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 1;
  return 1 + pct / 100;
}

/**
 * Mobile recipe editor — same model as the desktop dialog but laid out
 * as a stacked card list so the row-style table doesn't get crushed.
 * Each ingredient line takes the full width with three labeled inputs
 * (qty, waste, computed cost) so the operator can edit one-handed.
 */
export function MobileRecipeEditor({
  menuItem,
  recipe,
  ingredients,
  onClose,
  onSaved,
}: Props) {
  const toast = useToast();
  const [rows, setRows] = useState<EnrichedRecipeIngredient[]>([]);
  const [yieldPortions, setYieldPortions] = useState(1);
  const [prepTime, setPrepTime] = useState("");
  const [notes, setNotes] = useState("");
  const [pickerId, setPickerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!menuItem) return;
    const ings = recipe?.enrichedIngredients ?? recipe?.ingredients ?? [];
    setRows(
      ings.map((r) => ({
        ingredientId: r.ingredientId,
        quantity: r.quantity,
        wasteFactor: r.wasteFactor ?? 1,
        name: r.name,
        unit: r.unit,
        unitCost: r.unitCost,
      })),
    );
    setYieldPortions(recipe?.yieldPortions ?? 1);
    setPrepTime(recipe?.prepTimeMinutes ? String(recipe.prepTimeMinutes) : "");
    setNotes(recipe?.notes ?? "");
    setPickerId("");
    setConfirmingDelete(false);
  }, [menuItem, recipe]);

  const ingredientMap = useMemo(() => {
    const m = new Map<string, IngredientData>();
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients]);

  if (!menuItem) {
    return <BottomSheet open={false} onClose={onClose}>{null}</BottomSheet>;
  }

  const addIngredient = () => {
    if (!pickerId) return;
    if (rows.some((r) => r.ingredientId === pickerId)) {
      toast.warning("Already added", "Adjust the quantity instead.");
      return;
    }
    const ing = ingredientMap.get(pickerId);
    if (!ing) return;
    setRows((arr) => [
      ...arr,
      {
        ingredientId: ing.id,
        quantity: 0,
        wasteFactor: 1,
        name: ing.name,
        unit: ing.unit,
        unitCost: ing.costPerUnit,
      },
    ]);
    setPickerId("");
  };

  const updateRow = (id: string, patch: Partial<EnrichedRecipeIngredient>) => {
    setRows((arr) => arr.map((r) => (r.ingredientId === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((arr) => arr.filter((r) => r.ingredientId !== id));
  };

  const lineCost = (r: EnrichedRecipeIngredient) =>
    Math.round((r.unitCost ?? 0) * r.quantity * (r.wasteFactor || 1));
  const totalCost = rows.reduce((acc, r) => acc + lineCost(r), 0);
  const perPortion = yieldPortions > 0 ? Math.round(totalCost / yieldPortions) : totalCost;
  const margin =
    menuItem.price > 0
      ? Math.round(((menuItem.price - perPortion) / menuItem.price) * 100)
      : 0;
  const marginTone =
    margin < 50 ? "danger" : margin < 65 ? "warning" : "success";

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemId: menuItem.id,
          ingredients: rows.map((r) => ({
            ingredientId: r.ingredientId,
            quantity: r.quantity,
            wasteFactor: r.wasteFactor,
          })),
          prepTimeMinutes: prepTime ? Number(prepTime) : undefined,
          yieldPortions,
          notes,
        }),
      });
      if (res.ok) {
        haptic("medium");
        toast.success("Recipe saved");
        onSaved();
      } else {
        toast.error("Save failed", "Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/recipes?menuItemId=${encodeURIComponent(menuItem.id)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        toast.success("Recipe deleted");
        onSaved();
      } else {
        toast.error("Delete failed");
      }
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  };

  const availableIngredients = ingredients.filter(
    (i) => !rows.some((r) => r.ingredientId === i.id),
  );
  const hasExisting = !!recipe;

  return (
    <BottomSheet
      open={!!menuItem}
      onClose={onClose}
      title={`Recipe · ${menuItem.name}`}
      size="full"
      footer={
        <>
          {hasExisting && (
            <button
              type="button"
              className="v2-m-btn v2-m-btn-ghost"
              onClick={() => setConfirmingDelete((v) => !v)}
              disabled={busy}
              style={{ color: "var(--danger)", marginRight: "auto" }}
            >
              {confirmingDelete ? "Tap once more" : "Delete"}
            </button>
          )}
          {confirmingDelete ? (
            <button
              type="button"
              className="v2-m-btn v2-m-btn-danger"
              onClick={remove}
              disabled={busy}
            >
              Confirm delete
            </button>
          ) : (
            <>
              <button
                type="button"
                className="v2-m-btn v2-m-btn-ghost"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="v2-m-btn v2-m-btn-primary"
                onClick={save}
                disabled={busy}
              >
                {busy ? "Saving…" : "Save recipe"}
              </button>
            </>
          )}
        </>
      }
    >
      <div className="v2-m-form">
        <div className="v2-m-rcp-kpis">
          <div className="v2-m-rcp-kpi">
            <span className="v2-m-rcp-kpi-label">Per portion</span>
            <span className="v2-m-rcp-kpi-value tabular">{formatPrice(perPortion)}</span>
            <span className="v2-m-rcp-kpi-hint">Listed {formatPrice(menuItem.price)}</span>
          </div>
          <div className="v2-m-rcp-kpi">
            <span className="v2-m-rcp-kpi-label">Margin</span>
            <span className={`v2-m-rcp-kpi-value tabular tone-${marginTone}`}>{margin}%</span>
            <span className="v2-m-rcp-kpi-hint">
              {margin < 50
                ? "Review pricing"
                : margin < 65
                  ? "Healthy"
                  : "Strong"}
            </span>
          </div>
          <div className="v2-m-rcp-kpi">
            <span className="v2-m-rcp-kpi-label">Batch cost</span>
            <span className="v2-m-rcp-kpi-value tabular">{formatPrice(totalCost)}</span>
            <span className="v2-m-rcp-kpi-hint">
              {yieldPortions} portion{yieldPortions === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div>
          <label style={fieldLabel}>Ingredients ({rows.length})</label>
          {rows.length === 0 ? (
            <div
              style={{
                padding: "16px",
                textAlign: "center",
                color: "var(--fg-subtle)",
                background: "var(--surface-2)",
                border: "1px dashed var(--border)",
                borderRadius: 12,
                fontSize: 13,
              }}
            >
              No ingredients yet. Pick one below to start the recipe.
            </div>
          ) : (
            <ul
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                listStyle: "none",
                padding: 0,
                margin: 0,
              }}
            >
              {rows.map((r) => (
                <li
                  key={r.ingredientId}
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 14, color: "var(--fg)" }}>
                      {r.name ?? r.ingredientId}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRow(r.ingredientId)}
                      aria-label={`Remove ${r.name ?? r.ingredientId}`}
                      style={{
                        width: 32,
                        height: 32,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "transparent",
                        border: 0,
                        color: "var(--danger)",
                        borderRadius: 8,
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr auto",
                      gap: 8,
                      alignItems: "end",
                    }}
                  >
                    <div>
                      <label style={fieldLabel}>Qty ({displayUnit(r.unit)})</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step={displayStep(r.unit)}
                        min="0"
                        value={toDisplayQty(r.quantity, r.unit)}
                        onChange={(e) =>
                          updateRow(r.ingredientId, {
                            quantity: fromDisplayQty(Number(e.target.value), r.unit),
                          })
                        }
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={fieldLabel}>Waste %</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min="0"
                        max="100"
                        value={factorToPercent(r.wasteFactor)}
                        onChange={(e) =>
                          updateRow(r.ingredientId, {
                            wasteFactor: percentToFactor(Number(e.target.value)),
                          })
                        }
                        style={inputStyle}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 4,
                      }}
                    >
                      <span style={{ ...fieldLabel, marginBottom: 0 }}>Cost</span>
                      <span
                        className="tabular"
                        style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}
                      >
                        {formatPrice(lineCost(r))}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label style={fieldLabel}>Add ingredient</label>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={pickerId}
              onChange={(e) => setPickerId(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="">Pick an ingredient…</option>
              {availableIngredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {formatPrice(i.costPerUnit)}/{i.unit}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="v2-m-btn v2-m-btn-primary"
              onClick={addIngredient}
              disabled={!pickerId}
              aria-label="Add ingredient"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={fieldLabel} htmlFor="rcp-yield">Yield (portions)</label>
            <input
              id="rcp-yield"
              type="number"
              inputMode="numeric"
              min="1"
              value={yieldPortions}
              onChange={(e) =>
                setYieldPortions(Math.max(1, Number(e.target.value) || 1))
              }
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabel} htmlFor="rcp-prep">Prep time (min)</label>
            <input
              id="rcp-prep"
              type="number"
              inputMode="numeric"
              min="0"
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <label style={fieldLabel} htmlFor="rcp-notes">Notes</label>
          <textarea
            id="rcp-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
            placeholder="Prep steps, allergen notes, special instructions…"
          />
        </div>
      </div>
    </BottomSheet>
  );
}
