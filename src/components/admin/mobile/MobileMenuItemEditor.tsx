"use client";

import { useEffect, useState } from "react";
import type { MenuCategory, MenuItem } from "@/data/types";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import { BottomSheet, Chip, haptic } from "../v2/mobile";
import { useToast } from "../v2/ui/Toast";

const CATEGORIES: MenuCategory[] = [
  "pizza",
  "pasta",
  "antipasti",
  "panini",
  "drinks",
  "desserts",
];

const TAGS: ("vegetarian" | "vegan" | "spicy" | "gluten-free")[] = [
  "vegetarian",
  "vegan",
  "spicy",
  "gluten-free",
];

/** Optimistic patch applied to the parent's list after a successful save.
 *  Mirrors the desktop bulk-edit patch shape so the parent can reconcile
 *  cleanly without re-fetching the whole menu. */
export interface MobileMenuItemPatch {
  name?: string;
  description?: string;
  price?: number;
  cost?: number;
  category?: MenuCategory;
  tags?: string[];
  available?: boolean;
  deliveryOnly?: boolean | null;
  packagingCost?: number | null;
  sku?: string | null;
}

interface Props {
  item: MenuItem | null;
  onClose: () => void;
  onSaved: (patch: MobileMenuItemPatch) => void;
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

/**
 * Full-field menu item editor for mobile. Mirrors the desktop bulk-edit
 * dialog's field set so operators on a phone aren't stuck toggling
 * availability — they can adjust price, cost, category, tags, packaging,
 * SKU, etc. without bouncing to a laptop.
 *
 * The save call uses the same single-item override PUT the desktop uses,
 * with numeric fields rounded to grosze (1/100 PLN) on the way out.
 */
export function MobileMenuItemEditor({ item, onClose, onSaved }: Props) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [costStr, setCostStr] = useState("");
  const [category, setCategory] = useState<MenuCategory>("pizza");
  const [tags, setTags] = useState<string[]>([]);
  const [available, setAvailable] = useState(true);
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [packagingStr, setPackagingStr] = useState("");
  const [sku, setSku] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setDesc(item.description ?? "");
    setPriceStr((item.price / 100).toFixed(2));
    setCostStr((item.cost / 100).toFixed(2));
    setCategory(item.category);
    setTags(item.tags ?? []);
    setAvailable(!!item.available);
    setDeliveryOnly(!!item.deliveryOnly);
    setPackagingStr(
      typeof item.packagingCost === "number" && item.packagingCost > 0
        ? (item.packagingCost / 100).toFixed(2)
        : "",
    );
    setSku(item.sku ?? "");
  }, [item]);

  if (!item) {
    return <BottomSheet open={false} onClose={onClose}>{null}</BottomSheet>;
  }

  const toggleTag = (tag: string) =>
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Name required");
      return;
    }
    const price = Math.round(parseFloat(priceStr || "0") * 100);
    const cost = Math.round(parseFloat(costStr || "0") * 100);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Invalid price");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error("Invalid cost");
      return;
    }
    const packagingRaw = packagingStr.trim();
    const packagingCost =
      packagingRaw === ""
        ? null
        : Math.max(0, Math.round(parseFloat(packagingRaw) * 100));
    const trimmedSku = sku.trim();
    const skuPatch: string | null = trimmedSku === "" ? null : trimmedSku;

    setBusy(true);
    try {
      const body = {
        id: item.id,
        name: trimmedName,
        description: desc.trim(),
        price,
        cost,
        category,
        tags,
        available,
        deliveryOnly: deliveryOnly ? true : null,
        packagingCost,
        sku: skuPatch,
      };
      const r = await fetch("/api/admin/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data: { error?: string } = await r.json().catch(() => ({}));
        toast.error("Could not save", data.error);
        return;
      }
      haptic("medium");
      toast.success("Saved", trimmedName);
      onSaved({
        name: trimmedName,
        description: desc.trim(),
        price,
        cost,
        category,
        tags,
        available,
        deliveryOnly: deliveryOnly ? true : null,
        packagingCost,
        sku: skuPatch,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={!!item}
      onClose={onClose}
      title={`Edit · ${item.name}`}
      size="full"
      footer={
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
            {busy ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <div className="v2-m-form">
        <div>
          <label style={fieldLabel} htmlFor="mi-name">Name</label>
          <input
            id="mi-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            autoComplete="off"
          />
        </div>

        <div>
          <label style={fieldLabel} htmlFor="mi-desc">Description</label>
          <textarea
            id="mi-desc"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={fieldLabel} htmlFor="mi-price">Price (zł)</label>
            <input
              id="mi-price"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabel} htmlFor="mi-cost">Food cost (zł)</label>
            <input
              id="mi-cost"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={costStr}
              onChange={(e) => setCostStr(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <label style={fieldLabel}>Category</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={MENU_CATEGORY_LABELS[c]}
                active={category === c}
                onClick={() => setCategory(c)}
              />
            ))}
          </div>
        </div>

        <div>
          <label style={fieldLabel}>Tags</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TAGS.map((t) => (
              <Chip
                key={t}
                label={t}
                active={tags.includes(t)}
                onClick={() => toggleTag(t)}
              />
            ))}
          </div>
        </div>

        <label className="v2-m-toggle-row">
          <span className="v2-m-toggle-row-label">Available to customers</span>
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />
        </label>

        <label className="v2-m-toggle-row">
          <span className="v2-m-toggle-row-label">Delivery only</span>
          <input
            type="checkbox"
            checked={deliveryOnly}
            onChange={(e) => setDeliveryOnly(e.target.checked)}
          />
        </label>

        <div>
          <label style={fieldLabel} htmlFor="mi-pkg">Packaging cost (zł)</label>
          <input
            id="mi-pkg"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={packagingStr}
            onChange={(e) => setPackagingStr(e.target.value)}
            style={inputStyle}
            placeholder="Blank = category default"
          />
        </div>

        <div>
          <label style={fieldLabel} htmlFor="mi-sku">SKU</label>
          <input
            id="mi-sku"
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            style={inputStyle}
            placeholder="Operator / accounting code"
            autoCapitalize="characters"
          />
        </div>
      </div>
    </BottomSheet>
  );
}
