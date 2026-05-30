"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Coffee, Plus, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/store/cart";
import { formatPrice } from "@/lib/utils";
import type { MenuItem } from "@/data/types";

interface Suggestion {
  item: MenuItem;
  reason: string;
}

/**
 * "Still hungry?" post-order cross-sell on the confirmation page (Appendix A).
 *
 * Fetches /api/upsell/post-order, which runs the same getCartSuggestions()
 * engine the cart uses — seeded with the items just ordered, filtered to drop
 * what's already on the order. Tapping "Add" drops the item into the (now
 * empty) cart; once anything is added we surface a checkout CTA back to the
 * location page where the cart drawer completes a quick follow-on order.
 */
export function PostOrderUpsell({ orderId }: { orderId: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [locationSlug, setLocationSlug] = useState<string | null>(null);

  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/upsell/post-order?orderId=${encodeURIComponent(orderId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        setLocationSlug(data.locationSlug ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const qtyById = useMemo(() => {
    const map = new Map<string, number>();
    for (const ci of items) map.set(ci.menuItem.id, ci.quantity);
    return map;
  }, [items]);

  const addedCount = useMemo(
    () => items.reduce((n, ci) => n + ci.quantity, 0),
    [items],
  );

  const handleAdd = useCallback(
    (item: MenuItem) => {
      const slug = locationSlug || item.id.split("-")[0];
      if (slug) addItem(item, slug);
    },
    [addItem, locationSlug],
  );

  if (suggestions.length === 0) return null;

  return (
    <div className="v8-cart-pairs" style={{ marginBottom: 22 }}>
      <div className="v8-cart-pairs-kicker">
        <Coffee className="h-3.5 w-3.5" style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
        Still hungry? · ancora un poco
      </div>
      <h3 className="v8-cart-pairs-title">Complete your meal —</h3>
      <div className="v8-cart-pairs-sub">Add a little something to a quick follow-on order.</div>

      {suggestions.map((s) => {
        const qty = qtyById.get(s.item.id) ?? 0;
        const inCart = qty > 0;
        return (
          <div className="v8-cart-pair" key={s.item.id}>
            <div className="v8-cart-pair-body">
              <div className="v8-cart-pair-name">{s.item.name}</div>
              <div className="v8-cart-pair-origin">{s.reason}</div>
              <div className="v8-cart-pair-meta">
                <span className="v8-cart-pair-price">{formatPrice(s.item.price)}</span>
                <button
                  type="button"
                  onClick={() => handleAdd(s.item)}
                  className={`v8-cart-pair-add${inCart ? " is-added" : ""}`}
                  aria-label={inCart ? `Add another ${s.item.name}` : `Add ${s.item.name}`}
                >
                  {inCart ? (
                    <>added · aggiunto <span style={{ fontFamily: "var(--font-body)", fontStyle: "normal", marginLeft: 2 }}>×{qty}</span></>
                  ) : (
                    <><Plus className="h-3 w-3" style={{ display: "inline", verticalAlign: "middle" }} /> Add · aggiungi</>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {addedCount > 0 && locationSlug && (
        <Link
          href={`/locations/${locationSlug}#menu`}
          className="v8-order-action is-primary"
          style={{ marginTop: 12, display: "inline-flex" }}
        >
          <ShoppingBag className="h-4 w-4" />
          Checkout {addedCount} add-on{addedCount === 1 ? "" : "s"} · al pagamento
        </Link>
      )}
    </div>
  );
}
