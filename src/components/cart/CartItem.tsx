"use client";

import { useState } from "react";
import { CartItem as CartItemType } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { effectiveUnitPrice } from "@/lib/upsell";
import { useCartStore, cartLineKey } from "@/store/cart";

/** Resolve a line's modifier selections into "{label} (+{delta})" display chips. */
function modifierSummary(item: CartItemType): { label: string; delta: number }[] {
  if (!item.selectedModifiers?.length) return [];
  const groups = item.menuItem.modifierGroups ?? [];
  const out: { label: string; delta: number }[] = [];
  for (const sel of item.selectedModifiers) {
    const opt = groups
      .find((g) => g.id === sel.groupId)
      ?.options.find((o) => o.id === sel.optionId);
    if (opt) out.push({ label: opt.label, delta: opt.priceDelta });
  }
  return out;
}

interface CartItemProps {
  item: CartItemType;
  /** Server-side availability check has flipped the item to sold-out
   *  since it was added. CartDrawer hands this down so the row can
   *  render at 60% opacity and surface the "Remove to continue" note. */
  soldOut?: boolean;
}

const NOTE_MAX_LEN = 140;

/**
 * V8 cart row — paper-card line item.
 *
 *   .v8-cart-item-illus  parchment-deep tile holding the dish glyph
 *   .v8-cart-item-name   italic Cormorant 20px, espresso
 *   .v8-cart-item-price  Cormorant 600, tabular, ink
 *   .v8-cart-item-origin Lora italic, muted — origin / sourcing copy
 *   .v8-cart-qty         terracotta-tinted stepper
 *   .v8-cart-item-action text buttons (note · nota, remove · rimuovi)
 *
 * Behaviour preserved from the pre-V8 version: − at 1 removes the line;
 * note panel toggles in below the row; sold-out flag dims the row and
 * surfaces a remove prompt.
 */
export function CartItemRow({ item, soldOut = false }: CartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const setItemNotes = useCartStore((s) => s.setItemNotes);
  const [noteOpen, setNoteOpen] = useState(false);

  const hasNote = !!item.notes && item.notes.length > 0;
  // Line total includes any modifier surcharges — same helper the cart total,
  // checkout and KDS use, so the row price matches what's charged.
  const lineTotal = effectiveUnitPrice(item) * item.quantity;
  const lineKey = cartLineKey(item);
  // DOM-safe id (lineKey carries #/:/| separators) so two modifier variants of
  // the same dish don't collide on the note panel's id / aria-controls.
  const domId = `note-${lineKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const mods = modifierSummary(item);

  return (
    <>
      <div className="v8-cart-item" data-soldout={soldOut ? "true" : undefined}>
        <div className="v8-cart-item-illus" aria-hidden="true">
          <DishGlyph category={item.menuItem.category} name={item.menuItem.name} />
        </div>
        <div className="v8-cart-item-body">
          <div className="v8-cart-item-head">
            <div className="v8-cart-item-name">{item.menuItem.name}</div>
            <div className="v8-cart-item-price">{formatPrice(lineTotal)}</div>
          </div>
          {item.menuItem.description && (
            <div className="v8-cart-item-origin">
              {item.menuItem.description}
            </div>
          )}
          {mods.length > 0 && (
            <div className="v8-cart-item-mods">
              {mods.map((m, i) => (
                <span key={i} className="v8-cart-item-mod">
                  {m.label}
                  {m.delta > 0 && <span className="num"> +{formatPrice(m.delta)}</span>}
                </span>
              ))}
            </div>
          )}
          {soldOut && (
            <div
              className="v8-cart-item-origin"
              style={{ color: "var(--color-oxblood)", fontStyle: "italic", marginTop: 4 }}
            >
              Sold out · esaurita — remove to continue.
            </div>
          )}
          <div className="v8-cart-item-foot">
            <div className="v8-cart-qty" aria-label={`Quantity for ${item.menuItem.name}`}>
              <button
                type="button"
                className="v8-cart-qty-btn"
                onClick={() => updateQuantity(lineKey, item.quantity - 1)}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="v8-cart-qty-n" aria-live="polite">{item.quantity}</span>
              <button
                type="button"
                className="v8-cart-qty-btn"
                onClick={() => updateQuantity(lineKey, item.quantity + 1)}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <div className="v8-cart-item-actions">
              <button
                type="button"
                onClick={() => setNoteOpen((o) => !o)}
                className={`v8-cart-item-action${hasNote || noteOpen ? " is-on" : ""}`}
                aria-expanded={noteOpen}
                aria-controls={domId}
              >
                {hasNote ? "edit note" : "note"} <span style={{ opacity: 0.6 }}>· nota</span>
              </button>
              <button
                type="button"
                onClick={() => removeItem(lineKey)}
                className="v8-cart-item-action is-danger"
                aria-label={`Remove ${item.menuItem.name}`}
              >
                remove <span style={{ opacity: 0.6 }}>· rimuovi</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      {(noteOpen || hasNote) && (
        <div id={domId} className="v8-cart-note">
          <label htmlFor={`${domId}-input`} className="sr-only">
            Special request for {item.menuItem.name}
          </label>
          <textarea
            id={`${domId}-input`}
            value={item.notes || ""}
            onChange={(e) =>
              setItemNotes(lineKey, e.target.value.slice(0, NOTE_MAX_LEN))
            }
            placeholder='e.g. "no onion", "extra crispy", "gluten-free if possible"'
            rows={2}
            maxLength={NOTE_MAX_LEN}
          />
          <div className="v8-cart-note-foot">
            <span>The kitchen sees this on the ticket.</span>
            <span className="num">
              {(item.notes || "").length}/{NOTE_MAX_LEN}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Single inline glyph per item category — pencil-sketch style to match
 * the V8 mockup's hand-drawn dish illustrations. Falls back to a generic
 * pasta swirl for anything outside the known categories so a new menu
 * category doesn't render an empty tile.
 */
function DishGlyph({ category, name }: { category: string; name: string }) {
  const c = (category || "").toLowerCase();
  const n = (name || "").toLowerCase();
  // Pizza takes precedence over "pasta" matching when the name says pizza.
  if (c.includes("pizza") || n.includes("pizza") || n.includes("margherita") || n.includes("diavola")) {
    return (
      <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
        {/* Round pizza — matches the menu's CategoryIllus + the mockup. */}
        <circle cx="21" cy="21" r="15" fill="#C9A23E" fillOpacity="0.18" stroke="#B85C38" strokeWidth="1.5" />
        <circle cx="21" cy="21" r="12" stroke="#7A2B2B" strokeWidth="1" fill="none" opacity="0.5" />
        <circle cx="16" cy="18" r="2.4" fill="#CD212A" fillOpacity="0.7" />
        <circle cx="26" cy="19" r="2.4" fill="#CD212A" fillOpacity="0.7" />
        <circle cx="20" cy="26" r="2.4" fill="#CD212A" fillOpacity="0.7" />
        <path d="M14 23 C 15.5 21.5, 17 23, 17 24.5" stroke="#4A7C59" strokeWidth="1.2" fill="#4A7C59" fillOpacity="0.4" />
        <path d="M25 15 C 26.5 13.5, 28 15, 28 16.5" stroke="#4A7C59" strokeWidth="1.2" fill="#4A7C59" fillOpacity="0.4" />
      </svg>
    );
  }
  if (c.includes("pasta") || n.includes("carbonara") || n.includes("amatriciana")) {
    return (
      <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
        <circle cx="21" cy="24" r="13" stroke="#C9A23E" strokeWidth="1.5" fill="#F2E2C2" />
        <path d="M14 22 C 16 19, 20 19, 22 22 C 24 25, 28 25, 30 22" stroke="#C9A23E" strokeWidth="1.2" fill="none" />
        <path d="M14 26 C 16 23, 20 23, 22 26 C 24 29, 28 29, 30 26" stroke="#C9A23E" strokeWidth="1.2" fill="none" />
        <path d="M14 24 C 16 21, 20 21, 22 24 C 24 27, 28 27, 30 24" stroke="#B85C38" strokeWidth="1.2" fill="none" />
        <circle cx="19" cy="22" r="1.2" fill="#7A2B2B" />
        <circle cx="26" cy="26" r="1.2" fill="#7A2B2B" />
      </svg>
    );
  }
  if (c.includes("dessert") || n.includes("tiramis") || n.includes("cannol")) {
    return (
      <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
        <rect x="8" y="16" width="26" height="16" rx="1.5" stroke="#3D2817" strokeWidth="1.5" fill="#C9A23E" fillOpacity="0.25" />
        <path d="M8 20 L34 20" stroke="#3D2817" strokeWidth="1.2" />
        <path d="M8 24 L34 24" stroke="#3D2817" strokeWidth="1.2" />
        <path d="M13 16 L13 12 L29 12 L29 16" stroke="#3D2817" strokeWidth="1.5" />
        <circle cx="15" cy="22" r="0.6" fill="#3D2817" />
        <circle cx="21" cy="22" r="0.6" fill="#3D2817" />
        <circle cx="27" cy="22" r="0.6" fill="#3D2817" />
      </svg>
    );
  }
  if (c.includes("drink") || c.includes("bever") || n.includes("limonata") || n.includes("acqua") || n.includes("vino")) {
    return (
      <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
        <rect x="14" y="10" width="14" height="22" rx="2" stroke="#4A7C59" strokeWidth="1.5" fill="#E6C97A" fillOpacity="0.3" />
        <path d="M17 10 L17 6 L25 6 L25 10" stroke="#4A7C59" strokeWidth="1.5" />
        <circle cx="21" cy="22" r="3" stroke="#C9A23E" strokeWidth="1.2" fill="#C9A23E" fillOpacity="0.4" />
        <path d="M21 19 L21 25 M18 22 L24 22" stroke="#C9A23E" strokeWidth="1" />
      </svg>
    );
  }
  if (c.includes("coffee") || c.includes("espresso") || n.includes("espresso") || n.includes("caffè") || n.includes("caffe")) {
    return (
      <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
        <path d="M10 18 L32 18 L30 30 C 30 33, 27 34, 24 34 L18 34 C 15 34, 12 33, 12 30 Z" stroke="#3D2817" strokeWidth="1.5" fill="#3D2817" fillOpacity="0.85" />
        <path d="M32 20 C 36 20, 36 27, 32 27" stroke="#3D2817" strokeWidth="1.5" fill="none" />
        <path d="M16 12 C 16 14, 18 14, 18 12 C 18 10, 20 10, 20 12" stroke="#B85C38" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M22 11 C 22 13, 24 13, 24 11" stroke="#B85C38" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  // Default — fior di pomodoro
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
      <path d="M11 21 C 11 31, 16 36, 21 36 C 26 36, 31 31, 31 21 C 31 16, 28 13, 21 13 C 14 13, 11 16, 11 21 Z"
            fill="#B85C38" fillOpacity="0.2" stroke="#B85C38" strokeWidth="1.5" />
      <path d="M21 13 L21 9" stroke="#4A7C59" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M21 11 C 18 9, 16 8, 14 8 C 15 11, 17 12, 21 13" stroke="#4A7C59" strokeWidth="1.5" fill="#4A7C59" fillOpacity="0.2" strokeLinejoin="round" />
      <path d="M21 11 C 24 9, 26 8, 28 8 C 27 11, 25 12, 21 13" stroke="#4A7C59" strokeWidth="1.5" fill="#4A7C59" fillOpacity="0.2" strokeLinejoin="round" />
    </svg>
  );
}
