"use client";

import { useMemo, useRef, useState } from "react";
import { MENU_CATEGORY_LABELS, type MenuCategory } from "@/data/types";
import type { PaymentMethodId } from "@/lib/store";

interface QrItem {
  id: string;
  name: string;
  description: string;
  price: number; // grosze
  category: MenuCategory;
  tags: ("vegetarian" | "vegan" | "spicy" | "gluten-free")[];
}

interface Props {
  locationSlug: string;
  locationName: string;
  city: string;
  table: string;
  items: QrItem[];
  paymentMethods: PaymentMethodId[];
  bitcoinAddress: string;
}

const CATEGORY_ORDER: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];
const METHOD_LABEL: Record<PaymentMethodId, string> = {
  card: "Card", apple_pay: "Apple Pay", google_pay: "Google Pay", blik: "BLIK", p24: "Przelewy24", bitcoin: "Bitcoin",
};
const TAG_LABEL: Record<QrItem["tags"][number], string> = {
  vegetarian: "veg", vegan: "vegan", spicy: "spicy", "gluten-free": "GF",
};

const zl = (g: number) => `${(g / 100).toFixed(2)} zł`;

export function QrOrder({ locationSlug, locationName, city, table, items, paymentMethods, bitcoinAddress }: Props) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [covers, setCovers] = useState(2);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idemKey = useRef<string>(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `qr-${Date.now()}`);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const byCategory = useMemo(() => {
    const groups = new Map<MenuCategory, QrItem[]>();
    for (const it of items) {
      if (!groups.has(it.category)) groups.set(it.category, []);
      groups.get(it.category)!.push(it);
    }
    return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({ category: c, items: groups.get(c)! }));
  }, [items]);

  const lines = useMemo(
    () => Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ item: itemsById.get(id)!, q })).filter((l) => l.item),
    [qty, itemsById],
  );
  const count = lines.reduce((s, l) => s + l.q, 0);
  const total = lines.reduce((s, l) => s + l.item.price * l.q, 0);

  const inc = (id: string, d: number) => setQty((m) => ({ ...m, [id]: Math.max(0, (m[id] ?? 0) + d) }));

  const place = async () => {
    setError(null);
    if (count === 0) return;
    if (!name.trim()) { setError("Please add your name."); return; }
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) { setError("Please add a valid phone number."); return; }
    setPlacing(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idemKey.current },
        body: JSON.stringify({
          items: lines.map((l) => ({ id: l.item.id, quantity: l.q })),
          locationSlug,
          customerName: name.trim(),
          customerPhone: `+48${digits.slice(-9)}`,
          fulfillmentType: "dine-in",
          partySize: Math.max(1, covers),
          channel: "qr",
          tableNumber: table || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? "Could not place the order. Please try again."); setPlacing(false); return; }
      if (data.url) { window.location.href = data.url; return; }
      if (data.orderId) { window.location.href = `/order-confirmation?orderId=${encodeURIComponent(data.orderId)}&location=${locationSlug}`; return; }
      setError("Could not start payment. Please ask a member of staff.");
      setPlacing(false);
    } catch {
      setError("Network error. Please try again.");
      setPlacing(false);
    }
  };

  return (
    <main className="qr">
      <header className="qr-head">
        <div className="qr-brand">Ottaviano</div>
        <div className="qr-sub">
          {city}
          {table ? <> · <strong>Table {table}</strong></> : <> · dine-in</>}
        </div>
      </header>

      <nav className="qr-cats" aria-label="Menu categories">
        {byCategory.map(({ category }) => (
          <a key={category} href={`#cat-${category}`} className="qr-cat">{MENU_CATEGORY_LABELS[category]}</a>
        ))}
      </nav>

      <div className="qr-menu">
        {byCategory.map(({ category, items: catItems }) => (
          <section key={category} id={`cat-${category}`} className="qr-section">
            <h2 className="qr-h2">{MENU_CATEGORY_LABELS[category]}</h2>
            {catItems.map((it) => (
              <div key={it.id} className="qr-item">
                <div className="qr-item-main">
                  <div className="qr-item-name">
                    {it.name}
                    {it.tags.map((t) => <span key={t} className="qr-tag">{TAG_LABEL[t]}</span>)}
                  </div>
                  {it.description && <div className="qr-item-desc">{it.description}</div>}
                  <div className="qr-item-price">{zl(it.price)}</div>
                </div>
                <div className="qr-stepper">
                  {(qty[it.id] ?? 0) > 0 && (
                    <>
                      <button type="button" aria-label={`Remove one ${it.name}`} onClick={() => inc(it.id, -1)}>−</button>
                      <span className="qr-q">{qty[it.id]}</span>
                    </>
                  )}
                  <button type="button" aria-label={`Add ${it.name}`} className="qr-add" onClick={() => inc(it.id, 1)}>+</button>
                </div>
              </div>
            ))}
          </section>
        ))}
        <div style={{ height: 96 }} />
      </div>

      {count > 0 && !cartOpen && (
        <button type="button" className="qr-cartbar" onClick={() => setCartOpen(true)}>
          <span className="qr-cartbar-count">{count}</span>
          <span>View order</span>
          <span className="qr-cartbar-total">{zl(total)}</span>
        </button>
      )}

      {cartOpen && (
        <div className="qr-sheet-scrim" onClick={() => !placing && setCartOpen(false)}>
          <div className="qr-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Your order">
            <div className="qr-sheet-head">
              <strong>Your order</strong>
              <button type="button" aria-label="Close" className="qr-x" onClick={() => setCartOpen(false)}>✕</button>
            </div>
            <div className="qr-sheet-body">
              {lines.map((l) => (
                <div key={l.item.id} className="qr-cl">
                  <div className="qr-cl-name">{l.item.name}</div>
                  <div className="qr-stepper">
                    <button type="button" aria-label={`Remove one ${l.item.name}`} onClick={() => inc(l.item.id, -1)}>−</button>
                    <span className="qr-q">{l.q}</span>
                    <button type="button" aria-label={`Add ${l.item.name}`} className="qr-add" onClick={() => inc(l.item.id, 1)}>+</button>
                  </div>
                  <div className="qr-cl-price">{zl(l.item.price * l.q)}</div>
                </div>
              ))}

              <div className="qr-total-row"><span>Total</span><strong>{zl(total)}</strong></div>

              <div className="qr-fields">
                <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" /></label>
                <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="600 000 000" inputMode="tel" autoComplete="tel" /></label>
                <label className="qr-covers">Guests
                  <span className="qr-stepper">
                    <button type="button" aria-label="Fewer guests" onClick={() => setCovers((c) => Math.max(1, c - 1))}>−</button>
                    <span className="qr-q">{covers}</span>
                    <button type="button" aria-label="More guests" className="qr-add" onClick={() => setCovers((c) => Math.min(50, c + 1))}>+</button>
                  </span>
                </label>
              </div>

              {paymentMethods.length > 0 && (
                <div className="qr-pay">
                  <span className="qr-pay-label">Pay with</span>
                  <div className="qr-pay-methods">
                    {paymentMethods.map((m) => <span key={m} className="qr-pay-chip">{METHOD_LABEL[m]}</span>)}
                  </div>
                  {bitcoinAddress && <div className="qr-btc">BTC: <code>{bitcoinAddress}</code></div>}
                </div>
              )}

              {error && <div className="qr-error">{error}</div>}

              <button type="button" className="qr-paybtn" disabled={placing} onClick={place}>
                {placing ? "Placing…" : `Place order · ${zl(total)}`}
              </button>
              <p className="qr-fineprint">Your order goes straight to the kitchen. Phone is used for your loyalty points &amp; order updates.</p>
            </div>
          </div>
        </div>
      )}

      <QrStyles />
    </main>
  );
}

function QrStyles() {
  return (
    <style>{`
      .qr { --bg:#1a1714; --panel:#241f1b; --line:rgba(244,245,240,.12); --ink:#f4f5f0; --muted:rgba(244,245,240,.62); --brand:#c8102e; --ok:#4a7c59;
        min-height:100dvh; background:var(--bg); color:var(--ink); font-family:system-ui,-apple-system,sans-serif; -webkit-font-smoothing:antialiased; }
      .qr-head { padding:20px 18px 12px; }
      .qr-brand { font-size:24px; font-weight:700; letter-spacing:.5px; }
      .qr-sub { color:var(--muted); font-size:14px; margin-top:2px; }
      .qr-cats { position:sticky; top:0; z-index:5; display:flex; gap:8px; overflow-x:auto; padding:10px 18px; background:color-mix(in oklab, var(--bg) 92%, transparent); backdrop-filter:blur(8px); border-bottom:1px solid var(--line); }
      .qr-cat { flex:0 0 auto; font-size:13px; color:var(--muted); text-decoration:none; padding:6px 12px; border:1px solid var(--line); border-radius:999px; }
      .qr-cat:active { color:var(--ink); }
      .qr-menu { padding:6px 14px 0; }
      .qr-h2 { font-size:13px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); margin:22px 4px 8px; }
      .qr-item { display:flex; gap:12px; align-items:flex-start; padding:13px 4px; border-bottom:1px solid var(--line); }
      .qr-item-main { flex:1; min-width:0; }
      .qr-item-name { font-size:15.5px; font-weight:600; display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
      .qr-tag { font-size:9.5px; text-transform:uppercase; letter-spacing:.4px; color:var(--ok); border:1px solid color-mix(in oklab, var(--ok) 60%, transparent); border-radius:4px; padding:1px 5px; }
      .qr-item-desc { font-size:13px; color:var(--muted); margin-top:3px; line-height:1.4; }
      .qr-item-price { font-size:14px; margin-top:6px; font-variant-numeric:tabular-nums; }
      .qr-stepper { display:flex; align-items:center; gap:8px; flex:0 0 auto; }
      .qr-stepper button { width:34px; height:34px; border-radius:50%; border:1px solid var(--line); background:var(--panel); color:var(--ink); font-size:20px; line-height:1; cursor:pointer; display:grid; place-items:center; }
      .qr-stepper .qr-add { background:var(--brand); border-color:var(--brand); color:#fff; }
      .qr-q { min-width:18px; text-align:center; font-variant-numeric:tabular-nums; font-size:15px; }
      .qr-cartbar { position:fixed; left:14px; right:14px; bottom:14px; z-index:20; display:flex; align-items:center; gap:12px; width:calc(100% - 28px); padding:14px 18px; border:none; border-radius:14px; background:var(--brand); color:#fff; font-size:16px; font-weight:600; cursor:pointer; box-shadow:0 8px 24px rgba(0,0,0,.4); }
      .qr-cartbar-count { background:rgba(255,255,255,.25); border-radius:8px; padding:2px 9px; font-variant-numeric:tabular-nums; }
      .qr-cartbar-total { margin-left:auto; font-variant-numeric:tabular-nums; }
      .qr-sheet-scrim { position:fixed; inset:0; z-index:30; background:rgba(0,0,0,.55); display:flex; align-items:flex-end; }
      .qr-sheet { width:100%; max-height:92dvh; overflow-y:auto; background:var(--bg); border-radius:18px 18px 0 0; border-top:1px solid var(--line); }
      .qr-sheet-head { position:sticky; top:0; display:flex; align-items:center; justify-content:space-between; padding:16px 18px; font-size:17px; background:var(--bg); border-bottom:1px solid var(--line); }
      .qr-x { background:none; border:none; color:var(--muted); font-size:18px; cursor:pointer; }
      .qr-sheet-body { padding:8px 18px 24px; }
      .qr-cl { display:flex; align-items:center; gap:12px; padding:11px 0; border-bottom:1px solid var(--line); }
      .qr-cl-name { flex:1; font-size:15px; }
      .qr-cl-price { font-variant-numeric:tabular-nums; min-width:74px; text-align:right; }
      .qr-total-row { display:flex; justify-content:space-between; align-items:center; padding:16px 0 6px; font-size:18px; }
      .qr-fields { display:grid; gap:12px; margin-top:10px; }
      .qr-fields label { display:flex; flex-direction:column; gap:5px; font-size:12.5px; color:var(--muted); }
      .qr-fields input { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; color:var(--ink); font-size:16px; }
      .qr-covers { flex-direction:row !important; align-items:center; justify-content:space-between; }
      .qr-pay { margin-top:16px; }
      .qr-pay-label { font-size:12.5px; color:var(--muted); }
      .qr-pay-methods { display:flex; flex-wrap:wrap; gap:8px; margin-top:7px; }
      .qr-pay-chip { font-size:12.5px; padding:5px 12px; border:1px solid var(--line); border-radius:999px; }
      .qr-btc { font-size:11px; color:var(--muted); margin-top:8px; word-break:break-all; }
      .qr-error { margin-top:14px; color:#ff9a8a; font-size:13.5px; }
      .qr-paybtn { width:100%; margin-top:18px; padding:16px; border:none; border-radius:14px; background:var(--brand); color:#fff; font-size:17px; font-weight:600; cursor:pointer; }
      .qr-paybtn:disabled { opacity:.6; }
      .qr-fineprint { font-size:11.5px; color:var(--muted); text-align:center; margin:12px 0 0; line-height:1.5; }
    `}</style>
  );
}
