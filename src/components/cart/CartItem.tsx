"use client";

import { useState } from "react";
import { CartItem as CartItemType } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { Minus, Plus, StickyNote, Trash2 } from "lucide-react";

interface CartItemProps {
  item: CartItemType;
}

const NOTE_MAX_LEN = 140;

export function CartItemRow({ item }: CartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const setItemNotes = useCartStore((s) => s.setItemNotes);
  const [noteOpen, setNoteOpen] = useState(false);

  const hasNote = !!item.notes && item.notes.length > 0;

  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-italia-dark text-base leading-tight">
            {item.menuItem.name}
          </h4>
          <p className="text-sm text-italia-gray mt-0.5">
            {formatPrice(item.menuItem.price)} each
          </p>
        </div>
        <span className="text-base font-semibold text-italia-dark flex-shrink-0">
          {formatPrice(item.menuItem.price * item.quantity)}
        </span>
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center border border-gray-200 rounded-xl">
          <button
            onClick={() =>
              updateQuantity(item.menuItem.id, item.quantity - 1)
            }
            className="p-2.5 hover:bg-gray-50 rounded-l-xl transition-colors active:bg-gray-100"
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-base font-medium">
            {item.quantity}
          </span>
          <button
            onClick={() =>
              updateQuantity(item.menuItem.id, item.quantity + 1)
            }
            className="p-2.5 hover:bg-gray-50 rounded-r-xl transition-colors active:bg-gray-100"
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setNoteOpen((o) => !o)}
            className={`flex items-center gap-1.5 px-2.5 py-2 text-xs rounded-lg transition-colors ${
              hasNote || noteOpen
                ? "text-italia-red bg-italia-red/5"
                : "text-italia-gray hover:bg-gray-50"
            }`}
            aria-expanded={noteOpen}
            aria-controls={`note-${item.menuItem.id}`}
          >
            <StickyNote className="h-3.5 w-3.5" />
            {hasNote ? "Edit note" : "Add note"}
          </button>
          <button
            onClick={() => removeItem(item.menuItem.id)}
            className="p-2.5 text-gray-400 hover:text-italia-red transition-colors active:text-italia-red"
            aria-label="Remove item"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {(noteOpen || hasNote) && (
        <div id={`note-${item.menuItem.id}`} className="mt-2.5">
          <label htmlFor={`note-input-${item.menuItem.id}`} className="sr-only">
            Special request for {item.menuItem.name}
          </label>
          <textarea
            id={`note-input-${item.menuItem.id}`}
            value={item.notes || ""}
            onChange={(e) =>
              setItemNotes(item.menuItem.id, e.target.value.slice(0, NOTE_MAX_LEN))
            }
            placeholder='e.g. "no onion", "extra crispy", "gluten-free if possible"'
            rows={2}
            maxLength={NOTE_MAX_LEN}
            className="w-full text-sm leading-snug rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-italia-red/30 focus:border-italia-red resize-none"
          />
          <div className="flex justify-between items-center mt-1 text-[11px] text-italia-gray">
            <span>The kitchen sees this on the ticket.</span>
            <span className="tabular-nums">
              {(item.notes || "").length}/{NOTE_MAX_LEN}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
