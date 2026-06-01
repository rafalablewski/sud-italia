"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, Minus, Plus, Send, ShoppingBag, Banknote } from "lucide-react";
import type { CartItem, FulfillmentType, MenuItem, PosTab } from "@/data/types";
import { getActiveComboDeals, type UpsellConfig } from "@/lib/upsell";
import { useToast } from "../v2/ui/Toast";
import { useAdminLocation } from "../v2/LocationContext";
import { BottomSheet, ChipStrip, Chip, MobilePage, PageHeader, SegmentControl } from "../v2/mobile";

const CHANNELS: { value: FulfillmentType; label: string }[] = [
  { value: "dine-in", label: "Dine-in" },
  { value: "takeout", label: "Takeaway" },
  { value: "delivery", label: "Delivery" },
];

const fmtPLN = (g: number) => `${(g / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

/**
 * Mobile POS — a focused phone till on the same server endpoints as the iPad
 * board (no mock state). Open/select a tab, pick a channel, tap menu items to
 * build the check, then Send to KDS (POST pos/orders) and take payment
 * (PATCH pos/orders). Tab edits persist via the debounced PUT pos/tabs, so a
 * check opened on a phone is the same check on the iPad.
 */
export function MobilePOS({
  menusByLocation,
  upsellByLocation,
}: {
  menusByLocation: Record<string, MenuItem[]>;
  upsellByLocation: Record<string, UpsellConfig | null>;
}) {
  const toast = useToast();
  const { location } = useAdminLocation();
  const locationKeys = useMemo(() => Object.keys(menusByLocation), [menusByLocation]);
  const pageLoc = location && menusByLocation[location] ? location : locationKeys[0] ?? "";

  const menu = useMemo(() => menusByLocation[pageLoc] ?? [], [menusByLocation, pageLoc]);
  const byId = useCallback((id: string) => menu.find((m) => m.id === id), [menu]);
  const config = upsellByLocation[pageLoc] ?? null;

  const [tabs, setTabs] = useState<PosTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState<string>("all");
  const [orderOpen, setOrderOpen] = useState(false);
  const [tenderOpen, setTenderOpen] = useState(false);
  const renameSeq = useRef(1);
  const persistTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const loadTabs = useCallback(async () => {
    if (!pageLoc) return;
    const res = await fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`);
    if (!res.ok) return;
    const data: { tabs?: PosTab[] } = await res.json();
    const list = Array.isArray(data.tabs) ? data.tabs : [];
    setTabs(list);
    setActiveTabId((cur) => (cur && list.some((t) => t.id === cur) ? cur : list[0]?.id ?? null));
    renameSeq.current = list.length + 1;
  }, [pageLoc]);

  useEffect(() => {
    setTabs([]);
    setActiveTabId(null);
    void loadTabs();
  }, [loadTabs]);

  // Background sync, paused while a local edit is mid-debounce.
  useEffect(() => {
    if (!pageLoc) return;
    const id = setInterval(() => {
      if (persistTimers.current.size > 0) return;
      void loadTabs();
    }, 6000);
    return () => clearInterval(id);
  }, [pageLoc, loadTabs]);

  const active = tabs.find((t) => t.id === activeTabId) ?? null;

  const persistTab = useCallback((tab: PosTab) => {
    const timers = persistTimers.current;
    const existing = timers.get(tab.id);
    if (existing) clearTimeout(existing);
    timers.set(
      tab.id,
      setTimeout(() => {
        timers.delete(tab.id);
        void fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(tab.locationSlug)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: tab.id,
            name: tab.name,
            channel: tab.channel,
            status: tab.status,
            items: tab.items,
            tableId: tab.tableId ?? null,
            covers: tab.covers,
            address: tab.address ?? null,
            sentKds: tab.sentKds,
            coursed: tab.coursed ?? null,
          }),
        }).catch(() => {});
      }, 400),
    );
  }, []);

  const mutateActive = useCallback(
    (mutator: (t: PosTab) => PosTab) => {
      setTabs((prev) => {
        let changed: PosTab | null = null;
        const next = prev.map((t) => {
          if (t.id !== activeTabId) return t;
          changed = { ...mutator(t), updatedAt: new Date().toISOString() };
          return changed;
        });
        if (changed) persistTab(changed);
        return next;
      });
    },
    [activeTabId, persistTab],
  );

  const newTab = useCallback(async () => {
    if (!pageLoc) return;
    const res = await fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Tab ${renameSeq.current++}` }),
    });
    if (!res.ok) return;
    const data: { tab?: PosTab } = await res.json();
    if (data.tab) {
      setTabs((prev) => [...prev, data.tab!]);
      setActiveTabId(data.tab.id);
    }
  }, [pageLoc]);

  const addItem = useCallback(
    (id: string) =>
      mutateActive((t) => {
        const items = [...t.items];
        const i = items.findIndex((l) => l.menuItemId === id);
        if (i >= 0) items[i] = { ...items[i], quantity: Math.min(99, items[i].quantity + 1) };
        else items.push({ menuItemId: id, quantity: 1 });
        return { ...t, items, sentKds: false, status: t.status === "parked" ? "open" : t.status };
      }),
    [mutateActive],
  );

  const changeQty = useCallback(
    (id: string, delta: number) =>
      mutateActive((t) => ({
        ...t,
        items: t.items.map((l) => (l.menuItemId === id ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0),
        sentKds: false,
      })),
    [mutateActive],
  );

  const setChannel = useCallback(
    (c: FulfillmentType) =>
      mutateActive((t) => ({ ...t, channel: c, covers: c === "dine-in" && t.covers == null ? 2 : t.covers })),
    [mutateActive],
  );

  const cartOf = useCallback(
    (t: PosTab): CartItem[] => {
      const out: CartItem[] = [];
      for (const l of t.items) {
        const m = byId(l.menuItemId);
        if (m) out.push({ menuItem: m, quantity: l.quantity, locationSlug: pageLoc });
      }
      return out;
    },
    [byId, pageLoc],
  );
  const subtotalG = (t: PosTab) => cartOf(t).reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0);
  const discountG = (t: PosTab) => {
    const c = getActiveComboDeals(cartOf(t), config, t.channel ?? undefined);
    return c.isComplete ? c.savings : 0;
  };
  const grandG = (t: PosTab) => Math.max(0, subtotalG(t) - discountG(t));
  const itemCount = (t: PosTab) => t.items.reduce((s, l) => s + l.quantity, 0);

  const sendKds = useCallback(async () => {
    if (!active || active.items.length === 0 || busy) return;
    if (!active.channel) {
      toast.error("Pick a channel first");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId: active.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((data as { error?: string }).error || "Could not send to KDS");
        return;
      }
      const d = data as { orderId?: string; firedCourses?: string[] };
      setTabs((prev) => prev.map((x) => (x.id === active.id ? { ...x, sentKds: true, status: "pay", orderId: d.orderId } : x)));
      toast.success("Sent to the kitchen");
    } finally {
      setBusy(false);
    }
  }, [active, busy, pageLoc, toast]);

  const pay = useCallback(
    async (method: "Cash" | "Card") => {
      if (!active || busy) return;
      setBusy(true);
      setTenderOpen(false);
      setOrderOpen(false);
      try {
        const res = await fetch(`/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabId: active.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error((data as { error?: string }).error || "Could not take payment");
          return;
        }
        const amt = (data as { totalAmount?: number }).totalAmount ?? grandG(active);
        const left = tabs.filter((x) => x.id !== active.id);
        setTabs(left);
        setActiveTabId(left[0]?.id ?? null);
        toast.success(`Paid · ${method} · ${fmtPLN(amt)}`);
      } finally {
        setBusy(false);
      }
    },
    // grandG is a display-only fallback; the server returns the authoritative total.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, busy, pageLoc, tabs, toast],
  );

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const m of menu) if (!seen.includes(m.category)) seen.push(m.category);
    return seen;
  }, [menu]);
  const shown = cat === "all" ? menu : menu.filter((m) => m.category === cat);

  return (
    <MobilePage>
      <PageHeader title="POS" subtitle={pageLoc ? pageLoc[0].toUpperCase() + pageLoc.slice(1) : undefined} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 2px 96px" }}>
        {/* Tab strip */}
        <ChipStrip ariaLabel="Open checks">
          {tabs.map((t) => (
            <Chip key={t.id} label={`${t.name}${itemCount(t) ? ` · ${itemCount(t)}` : ""}`} active={t.id === activeTabId} onClick={() => setActiveTabId(t.id)} />
          ))}
          <Chip label="+ New" onClick={() => void newTab()} />
        </ChipStrip>

        {!active ? (
          <div className="v2-m-empty">
            <div className="v2-m-empty-title">No open check</div>
            <button type="button" className="v2-m-btn v2-m-btn-primary" onClick={() => void newTab()} style={{ marginTop: 12 }}>
              Open a tab
            </button>
          </div>
        ) : (
          <>
            <SegmentControl
              ariaLabel="Channel"
              value={active.channel ?? ("" as FulfillmentType)}
              onChange={(c) => setChannel(c)}
              options={CHANNELS}
            />

            <ChipStrip ariaLabel="Category">
              <Chip label="All" active={cat === "all"} onClick={() => setCat("all")} />
              {categories.map((c) => (
                <Chip key={c} label={c[0].toUpperCase() + c.slice(1)} active={cat === c} onClick={() => setCat(c)} />
              ))}
            </ChipStrip>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {shown.map((m) => {
                const line = active.items.find((l) => l.menuItemId === m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => addItem(m.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: line ? "var(--brand-soft)" : "var(--surface-2)",
                      border: `1px solid ${line ? "var(--brand)" : "var(--border)"}`,
                      borderRadius: 12,
                      textAlign: "left",
                      color: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 2 }}>{fmtPLN(m.price)}</div>
                    </div>
                    {line ? (
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--brand-bright, var(--brand))", flex: "none" }}>{line.quantity}×</span>
                    ) : (
                      <Plus className="h-5 w-5" style={{ color: "var(--fg-muted)", flex: "none" }} />
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Sticky order bar */}
      {active && active.items.length > 0 && (
        <button
          type="button"
          onClick={() => setOrderOpen(true)}
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            background: "var(--brand)",
            color: "#fff",
            border: 0,
            borderRadius: 14,
            boxShadow: "0 8px 28px rgba(0,0,0,.35)",
            cursor: "pointer",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 600 }}>
            <ShoppingBag className="h-5 w-5" /> {itemCount(active)} item{itemCount(active) === 1 ? "" : "s"}
          </span>
          <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtPLN(grandG(active))}</span>
        </button>
      )}

      {/* Order sheet */}
      {active && orderOpen && (
        <BottomSheet
          open
          onClose={() => setOrderOpen(false)}
          title={active.name}
          size="full"
          footer={
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="v2-m-btn" onClick={() => void sendKds()} disabled={busy || !active.channel || active.items.length === 0} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <Send className="h-4 w-4" /> {active.sentKds ? "Re-send" : "Send to kitchen"}
              </button>
              <button type="button" className="v2-m-btn v2-m-btn-primary" onClick={() => setTenderOpen(true)} disabled={busy || !active.channel || active.items.length === 0} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <CreditCard className="h-4 w-4" /> Pay {fmtPLN(grandG(active))}
              </button>
            </div>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {!active.channel && (
              <div style={{ fontSize: 13, color: "var(--warning)" }}>Pick a channel above before sending or charging.</div>
            )}
            {active.items.map((l) => {
              const m = byId(l.menuItemId);
              if (!m) return null;
              return (
                <div key={l.menuItemId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, color: "var(--fg)" }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{fmtPLN(m.price * l.quantity)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button type="button" className="v2-m-icon-btn" aria-label="Remove one" onClick={() => changeQty(l.menuItemId, -1)}>
                      <Minus className="h-4 w-4" />
                    </button>
                    <span style={{ minWidth: 18, textAlign: "center", fontWeight: 600, color: "var(--fg)" }}>{l.quantity}</span>
                    <button type="button" className="v2-m-icon-btn" aria-label="Add one" onClick={() => changeQty(l.menuItemId, 1)}>
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <Row l="Subtotal" v={fmtPLN(subtotalG(active))} />
              {discountG(active) > 0 && <Row l="Combo discount" v={`− ${fmtPLN(discountG(active))}`} accent />}
              <Row l="Total" v={fmtPLN(grandG(active))} bold />
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Tender */}
      {active && tenderOpen && (
        <BottomSheet open onClose={() => setTenderOpen(false)} title={`Take payment · ${fmtPLN(grandG(active))}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button type="button" className="v2-m-btn" onClick={() => void pay("Cash")} disabled={busy} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px" }}>
              <Banknote className="h-5 w-5" /> Cash
            </button>
            <button type="button" className="v2-m-btn v2-m-btn-primary" onClick={() => void pay("Card")} disabled={busy} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px" }}>
              <CreditCard className="h-5 w-5" /> Card
            </button>
          </div>
        </BottomSheet>
      )}
    </MobilePage>
  );
}

function Row({ l, v, bold, accent }: { l: string; v: string; bold?: boolean; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: bold ? 17 : 14, fontWeight: bold ? 700 : 500, color: accent ? "var(--success)" : "var(--fg)" }}>
      <span style={{ color: bold || accent ? undefined : "var(--fg-subtle)" }}>{l}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}
