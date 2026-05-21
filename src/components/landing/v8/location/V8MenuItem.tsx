"use client";

import { useState } from "react";
import type { MenuItem } from "@/data/types";
import { useCartStore } from "@/store/cart";
import { formatPrice } from "@/lib/utils";
import { Bi } from "../Bi";

interface V8MenuItemProps {
  item: MenuItem;
  locationSlug: string;
  available: boolean;
}

const CATEGORY_LABEL: Record<string, { en: string; pl: string; it: string }> = {
  pizza: { en: "Pizza", pl: "Pizza", it: "pizza" },
  pasta: { en: "Pasta", pl: "Makaron", it: "pasta" },
  antipasti: { en: "Starter", pl: "Przystawka", it: "antipasto" },
  panini: { en: "Panino", pl: "Panino", it: "panino" },
  drinks: { en: "Drink", pl: "Napój", it: "bibita" },
  desserts: { en: "Dessert", pl: "Deser", it: "dolce" },
};

const TAG_LABEL: Record<string, { en: string; pl: string; it: string; tone: "basil" | "ochre" | "oxblood" }> = {
  vegetarian: { en: "Vegetarian", pl: "Wegetariańskie", it: "vegetariano", tone: "basil" },
  vegan: { en: "Vegan", pl: "Wegańskie", it: "vegano", tone: "basil" },
  spicy: { en: "Spicy", pl: "Pikantne", it: "piccante", tone: "oxblood" },
  "gluten-free": { en: "Gluten-free", pl: "Bez glutenu", it: "senza glutine", tone: "ochre" },
};

function ItemSvg({ category }: { category: string }) {
  if (category === "pasta") {
    return (
      <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden="true">
        <circle cx="31" cy="32" r="22" stroke="#C9A23E" strokeWidth="1.5" fill="#F2E2C2" />
        <path d="M16 28 C 19 24, 24 24, 27 28 C 30 32, 36 32, 39 28 C 42 24, 46 24, 46 28" stroke="#C9A23E" strokeWidth="1.3" fill="none" />
        <path d="M16 34 C 19 30, 24 30, 27 34 C 30 38, 36 38, 39 34 C 42 30, 46 30, 46 34" stroke="#B85C38" strokeWidth="1.3" fill="none" />
        <circle cx="25" cy="32" r="1.5" fill="#7A2B2B" />
        <circle cx="38" cy="32" r="1.5" fill="#7A2B2B" />
      </svg>
    );
  }
  if (category === "desserts") {
    return (
      <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden="true">
        <rect x="16" y="24" width="30" height="22" rx="2" stroke="#3D2817" strokeWidth="1.6" fill="#C9A23E" fillOpacity="0.25" />
        <path d="M16 32 L46 32" stroke="#3D2817" strokeWidth="1.4" />
        <path d="M16 38 L46 38" stroke="#3D2817" strokeWidth="1.4" />
        <path d="M20 24 L20 18 L42 18 L42 24" stroke="#3D2817" strokeWidth="1.6" />
        <circle cx="22" cy="35" r="1" fill="#3D2817" />
        <circle cx="31" cy="35" r="1" fill="#3D2817" />
        <circle cx="40" cy="35" r="1" fill="#3D2817" />
      </svg>
    );
  }
  if (category === "drinks") {
    return (
      <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden="true">
        <rect x="22" y="16" width="18" height="32" rx="2" stroke="#4A7C59" strokeWidth="1.6" fill="#E6C97A" fillOpacity="0.32" />
        <path d="M25 16 L25 10 L37 10 L37 16" stroke="#4A7C59" strokeWidth="1.6" />
        <circle cx="31" cy="32" r="5" stroke="#C9A23E" strokeWidth="1.4" fill="#C9A23E" fillOpacity="0.4" />
        <path d="M31 27 L31 37 M26 32 L36 32" stroke="#C9A23E" strokeWidth="1.2" />
      </svg>
    );
  }
  if (category === "antipasti") {
    return (
      <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden="true">
        <ellipse cx="31" cy="36" rx="22" ry="8" stroke="#B85C38" strokeWidth="1.6" fill="#F2E2C2" />
        <circle cx="22" cy="33" r="3" fill="#4A7C59" fillOpacity="0.5" />
        <circle cx="31" cy="31" r="3" fill="#CD212A" fillOpacity="0.6" />
        <circle cx="40" cy="33" r="3" fill="#C9A23E" fillOpacity="0.7" />
        <path d="M26 30 C 27 28, 29 28, 30 30" stroke="#4A7C59" strokeWidth="1.2" fill="none" />
      </svg>
    );
  }
  if (category === "panini") {
    return (
      <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden="true">
        <ellipse cx="31" cy="22" rx="22" ry="6" stroke="#B85C38" strokeWidth="1.5" fill="#E6C97A" fillOpacity="0.4" />
        <ellipse cx="31" cy="40" rx="22" ry="6" stroke="#B85C38" strokeWidth="1.5" fill="#E6C97A" fillOpacity="0.4" />
        <rect x="9" y="22" width="44" height="18" stroke="#B85C38" strokeWidth="1.4" fill="#F2E2C2" />
        <path d="M14 30 C 18 28, 24 28, 28 30 C 32 32, 38 32, 44 30" stroke="#4A7C59" strokeWidth="1.3" fill="none" />
        <path d="M14 34 C 20 32, 28 32, 34 34 C 40 36, 46 36, 50 34" stroke="#CD212A" strokeWidth="1.3" fill="none" opacity="0.6" />
      </svg>
    );
  }
  // Default — pizza
  return (
    <svg width="62" height="62" viewBox="0 0 62 62" fill="none" aria-hidden="true">
      <circle cx="31" cy="32" r="22" fill="#C9A23E" fillOpacity="0.18" stroke="#B85C38" strokeWidth="1.6" />
      <circle cx="31" cy="32" r="18" stroke="#7A2B2B" strokeWidth="1" fill="none" opacity="0.5" />
      <circle cx="24" cy="28" r="3" fill="#CD212A" fillOpacity="0.7" />
      <circle cx="38" cy="30" r="3" fill="#CD212A" fillOpacity="0.7" />
      <circle cx="30" cy="38" r="3" fill="#CD212A" fillOpacity="0.7" />
      <path d="M22 35 C 24 33, 26 35, 26 37" stroke="#4A7C59" strokeWidth="1.4" fill="#4A7C59" fillOpacity="0.4" />
      <path d="M36 24 C 38 22, 40 24, 40 26" stroke="#4A7C59" strokeWidth="1.4" fill="#4A7C59" fillOpacity="0.4" />
      <path d="M38 38 C 40 36, 42 38, 42 40" stroke="#4A7C59" strokeWidth="1.4" fill="#4A7C59" fillOpacity="0.4" />
    </svg>
  );
}

export function V8MenuItem({ item, locationSlug, available }: V8MenuItemProps) {
  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const inCart = items.find((i) => i.menuItem.id === item.id);
  const [pulse, setPulse] = useState(false);
  const catLabel = CATEGORY_LABEL[item.category];

  const onAdd = () => {
    if (!available) return;
    addItem(item, locationSlug);
    setPulse(true);
    setTimeout(() => setPulse(false), 350);
  };

  return (
    <article className={`v8-mi${available ? "" : " v8-mi-out"}`}>
      {item.menuRole === "hero" && (
        <span className="v8-mi-flag">
          <Bi en="Our hero" pl="Nasza duma" />
          <span className="v8-it">· il nostro eroe</span>
        </span>
      )}
      <div className="v8-mi-top">
        <div className="v8-mi-illus">
          <ItemSvg category={item.category} />
        </div>
        <div className="v8-mi-info">
          <h3 className="v8-mi-name">
            {item.name}
            {catLabel && (
              <span className="v8-mi-cat">
                <Bi en={catLabel.en} pl={catLabel.pl} />
                <span className="v8-it"> · {catLabel.it}</span>
              </span>
            )}
          </h3>
          <p className="v8-mi-origin">
            {item.sourcing || item.description}
          </p>
          {item.tags.length > 0 && (
            <div className="v8-mi-chips">
              {item.tags.map((t) => {
                const tag = TAG_LABEL[t];
                if (!tag) return null;
                return (
                  <span key={t} className={`v8-mi-chip v8-mi-chip-${tag.tone}`}>
                    <Bi en={tag.en} pl={tag.pl} />
                    <span className="v8-it"> · {tag.it}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="v8-mi-foot">
        <div className="v8-mi-price v8-num">{formatPrice(item.price)}</div>
        {!available ? (
          <span className="v8-mi-out-tag v8-it">
            <Bi en="Sold out" pl="Wyprzedane" />
            <span> · esaurito</span>
          </span>
        ) : inCart ? (
          <div className="v8-mi-qty">
            <button
              type="button"
              onClick={() =>
                inCart.quantity > 1
                  ? updateQuantity(item.id, inCart.quantity - 1)
                  : removeItem(item.id)
              }
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="v8-num">{inCart.quantity}</span>
            <button
              type="button"
              onClick={() => updateQuantity(item.id, inCart.quantity + 1)}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`v8-mi-add${pulse ? " pulse" : ""}`}
            onClick={onAdd}
          >
            + <Bi en="Add" pl="Dodaj" />
            <span className="v8-it v8-cta-it"> · aggiungi</span>
          </button>
        )}
      </div>
    </article>
  );
}
