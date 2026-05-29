"use client";

import { useState, useEffect } from "react";
import { useCartStore } from "@/store/cart";
import { useCartUIStore } from "@/store/cart-ui";
import { ArrowRight } from "lucide-react";

/**
 * V8 abandoned-cart nudge. Surfaces 30s after a customer goes idle
 * with items in the cart. `body.v8-cart-open` hides it via CSS so it
 * doesn't nag a customer who's already inside the checkout drawer.
 *
 * The Continue CTA opens the layout-level <CartDrawer /> via
 * `useCartUIStore.setDrawerOpen` (Step 11+ single-mount). The ×
 * dismisses for the rest of the session.
 */
export function AbandonedCartBanner() {
  const items = useCartStore((s) => s.items);
  const setDrawerOpen = useCartUIStore((s) => s.setDrawerOpen);
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (items.length === 0 || dismissed) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), 30_000);
    return () => clearTimeout(timer);
  }, [items.length, dismissed]);

  if (!show || items.length === 0) return null;

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="v8-abandoned" role="status">
      <span className="v8-abandoned-illus" aria-hidden="true">
        <ToothpickSprig />
      </span>
      <div className="v8-abandoned-body">
        <div className="v8-abandoned-title">
          Still hungry? <em>· hai ancora fame?</em>
        </div>
        <div className="v8-abandoned-sub">
          <span className="num">{itemCount}</span>
          {itemCount === 1 ? "item" : "items"} waiting in your cart · <em>in attesa</em>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setDrawerOpen(true);
          setShow(false);
        }}
        className="v8-abandoned-cta"
      >
        Continue <span style={{ opacity: 0.85 }}>· continua</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          setShow(false);
        }}
        className="v8-abandoned-dismiss"
        aria-label="Dismiss"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/** Small dish glyph for the banner — a basil sprig over a circle.
 *  Matches the rest of the V8 cart family's hand-sketched vocabulary. */
function ToothpickSprig() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="14" r="7" stroke="currentColor" strokeWidth="1.4" fill="#F2E2C2" />
      <path d="M12 14 C 12 10, 12 6, 12 4" stroke="#4A7C59" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 8 C 9.5 7, 8 5, 8 3 C 10.5 4, 12 6, 12 8" fill="#4A7C59" fillOpacity="0.22" stroke="#4A7C59" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 6 C 14.5 5, 16 3, 16 1.5 C 14 2, 12 4, 12 6" fill="#4A7C59" fillOpacity="0.22" stroke="#4A7C59" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
