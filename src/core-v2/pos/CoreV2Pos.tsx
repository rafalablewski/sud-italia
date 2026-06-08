"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "@/shared/LocationContext";
import { CoreV2Shell } from "@/core-v2/shell/CoreV2Shell";
import { useCoreToast } from "@/core-v2/ui/Toast";
import { CoreV2Dialog } from "@/core-v2/ui/Dialog";
import {
  MENU_CATEGORY_LABELS,
  type FloorTable,
  type FulfillmentType,
  type MenuCategory,
  type MenuItem,
  type PosCourse,
  type PosTab,
} from "@/data/types";
import { getActiveComboDeals, getCartSuggestions, type UpsellConfig } from "@/lib/upsell";
import { POS_COURSE_LABELS, defaultCourseForCategory, groupLinesByCourse } from "@/lib/pos-coursing";

const CATEGORY_ORDER: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "desserts", "drinks"];
const CHANNELS: { key: FulfillmentType; label: string }[] = [
  { key: "dine-in", label: "Dine-in" },
  { key: "takeout", label: "Takeaway" },
  { key: "delivery", label: "Delivery" },
];
const TAG_META: Record<MenuItem["tags"][number], { label: string; cls: string }> = {
  vegetarian: { label: "veg", cls: "veg" },
  vegan: { label: "vegan", cls: "veg" },
  spicy: { label: "spicy", cls: "hot" },
  "gluten-free": { label: "GF", cls: "fast" },
};

const zl = (g: number) => (g / 100).toFixed(2).replace(".", ",");
const fmtPLN = (g: number) => `${zl(g)} zł`;

/**
 * Core v2 · POS — the till, wired to the real engine 1:1. Multi-tab open checks
 * (`/api/admin/pos/tabs`), add-to-ticket with category coursing, combo discount
 * + cross-sell (`@/lib/upsell`), Send-to-KDS / Fire-course / Charge
 * (`/api/admin/pos/orders`). The server owns the total + the orderId; the till
 * only ever sends item ids + quantities. Fresh cv- UI; zero admin styling.
 */
export function CoreV2Pos({
  menusByLocation,
  upsellByLocation,
}: {
  menusByLocation: Record<string, MenuItem[]>;
  upsellByLocation: Record<string, UpsellConfig | null>;
}) {
  const { location } = useLocation();
  const toast = useCoreToast();
  const locationKeys = useMemo(() => Object.keys(menusByLocation), [menusByLocation]);
  const fallbackLoc = locationKeys[0] ?? "";
  const [pageLoc, setPageLoc] = useState<string>(location || fallbackLoc);
  useEffect(() => {
    if (location && menusByLocation[location]) setPageLoc(location);
  }, [location, menusByLocation]);

  const menu = useMemo(() => menusByLocation[pageLoc] ?? [], [menusByLocation, pageLoc]);
  const config = upsellByLocation[pageLoc] ?? null;
  const byId = useCallback((id: string) => menu.find((m) => m.id === id), [menu]);

  const categories = useMemo(() => {
    const present = new Set(menu.filter((m) => m.available).map((m) => m.category));
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [menu]);
  const [cat, setCat] = useState<MenuCategory | null>(null);
  const activeCat = cat && categories.includes(cat) ? cat : categories[0] ?? null;

  // --- Tabs (open checks), server-backed -----------------------------------
  const [tabs, setTabs] = useState<PosTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const renameSeq = useRef(1);
  const persistTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const loadTabs = useCallback(async () => {
    if (!pageLoc) return;
    try {
      const res = await fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`);
      if (!res.ok) return;
      const data: { tabs?: PosTab[] } = await res.json();
      const list = Array.isArray(data.tabs) ? data.tabs : [];
      setTabs(list);
      setActiveTabId((cur) => (cur && list.some((t) => t.id === cur) ? cur : list[0]?.id ?? null));
      renameSeq.current = list.length + 1;
    } catch {
      /* non-fatal */
    }
  }, [pageLoc]);

  useEffect(() => {
    setTabs([]);
    setActiveTabId(null);
    void loadTabs();
  }, [loadTabs]);

  // Live cross-till sync — skipped while a local edit is mid-debounce.
  useEffect(() => {
    if (!pageLoc) return;
    const id = setInterval(async () => {
      if (persistTimers.current.size > 0) return;
      try {
        const res = await fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`);
        if (!res.ok) return;
        const data: { tabs?: PosTab[] } = await res.json();
        const list = Array.isArray(data.tabs) ? data.tabs : [];
        setTabs(list);
        setActiveTabId((cur) => (cur && list.some((t) => t.id === cur) ? cur : list[0]?.id ?? null));
      } catch {
        /* non-fatal */
      }
    }, 5000);
    return () => clearInterval(id);
  }, [pageLoc]);

  useEffect(() => {
    const timers = persistTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

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
      }, 350),
    );
  }, []);

  const getActive = useCallback(() => tabs.find((t) => t.id === activeTabId) ?? null, [tabs, activeTabId]);

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

  const addLine = useCallback(
    (id: string) =>
      mutateActive((t) => {
        const items = [...t.items];
        const i = items.findIndex((l) => l.menuItemId === id);
        if (i >= 0) items[i] = { ...items[i], quantity: Math.min(99, items[i].quantity + 1) };
        else {
          const c = byId(id)?.category;
          items.push({ menuItemId: id, quantity: 1, course: c ? defaultCourseForCategory(c) : "main" });
        }
        return { ...t, items, sentKds: false, status: t.status === "parked" ? "open" : t.status };
      }),
    [mutateActive, byId],
  );

  const changeQty = useCallback(
    (id: string, delta: number) =>
      mutateActive((t) => ({
        ...t,
        items: t.items
          .map((l) => (l.menuItemId === id ? { ...l, quantity: l.quantity + delta } : l))
          .filter((l) => l.quantity > 0),
        sentKds: false,
      })),
    [mutateActive],
  );

  const setChannel = useCallback(
    (c: FulfillmentType) =>
      mutateActive((t) => ({ ...t, channel: c, covers: c === "dine-in" && t.covers == null ? 2 : t.covers })),
    [mutateActive],
  );
  const changeCovers = useCallback(
    (delta: number) => mutateActive((t) => ({ ...t, covers: Math.max(1, Math.min(50, (t.covers ?? 2) + delta)) })),
    [mutateActive],
  );
  const assignTable = useCallback(
    (tableId: string | null) => mutateActive((t) => ({ ...t, tableId: tableId ?? undefined })),
    [mutateActive],
  );
  const setAddress = useCallback(
    (addr: string) => mutateActive((t) => ({ ...t, address: addr.trim() || undefined })),
    [mutateActive],
  );

  const newTab = useCallback(async () => {
    if (!pageLoc) return;
    const name = `Tab ${renameSeq.current++}`;
    try {
      const res = await fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return;
      const data: { tab?: PosTab } = await res.json();
      if (data.tab) {
        setTabs((prev) => [...prev, data.tab!]);
        setActiveTabId(data.tab.id);
      }
    } catch {
      /* offline — no-op */
    }
  }, [pageLoc]);

  // --- Tables (dine-in picker) --------------------------------------------
  const [tables, setTables] = useState<FloorTable[]>([]);
  useEffect(() => {
    if (!pageLoc) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(pageLoc)}`);
        if (!res.ok) return;
        const data: FloorTable[] = await res.json();
        if (!cancelled) setTables(Array.isArray(data) ? data : []);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageLoc]);
  const tableById = useCallback((id?: string) => (id ? tables.find((t) => t.id === id) : undefined), [tables]);

  // --- Send / Fire / Charge ------------------------------------------------
  const [busyTabId, setBusyTabId] = useState<string | null>(null);

  const sendKds = useCallback(async () => {
    const t = getActive();
    if (!t || t.items.length === 0 || busyTabId) return;
    if (!t.channel) return toast("Pick a channel first", "danger");
    setBusyTabId(t.id);
    try {
      const res = await fetch(`/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId: t.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; orderId?: string; firedCourses?: PosCourse[] };
      if (!res.ok) return toast(data.error || "Could not send to KDS", "danger");
      setTabs((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, sentKds: true, status: "pay", orderId: data.orderId, firedCourses: data.firedCourses } : x)),
      );
      toast(`Sent to KDS · #${t.id}`, "success");
    } finally {
      setBusyTabId(null);
    }
  }, [getActive, busyTabId, pageLoc, toast]);

  const fireCourse = useCallback(
    async (course: PosCourse) => {
      const t = getActive();
      if (!t || busyTabId) return;
      if (!t.channel) return toast("Pick a channel first", "danger");
      setBusyTabId(t.id);
      try {
        const res = await fetch(`/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabId: t.id, courses: [course] }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; orderId?: string; firedCourses?: PosCourse[] };
        if (!res.ok) return toast(data.error || "Could not fire course", "danger");
        setTabs((prev) =>
          prev.map((x) => (x.id === t.id ? { ...x, sentKds: true, status: "pay", orderId: data.orderId, firedCourses: data.firedCourses } : x)),
        );
        toast(`Fired ${POS_COURSE_LABELS[course]} · #${t.id}`, "success");
      } finally {
        setBusyTabId(null);
      }
    },
    [getActive, busyTabId, pageLoc, toast],
  );

  const [tenderOpen, setTenderOpen] = useState(false);
  const pay = useCallback(
    async (method: "Cash" | "Card") => {
      const t = getActive();
      if (!t || busyTabId) return;
      setBusyTabId(t.id);
      setTenderOpen(false);
      try {
        const res = await fetch(`/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabId: t.id }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; totalAmount?: number };
        if (!res.ok) return toast(data.error || "Could not take payment", "danger");
        const amt = data.totalAmount ?? grandG(t);
        const left = tabs.filter((x) => x.id !== t.id);
        setTabs(left);
        setActiveTabId(left[0]?.id ?? null);
        toast(`Paid ✓ #${t.id} · ${method} · ${fmtPLN(amt)}`, "success");
      } finally {
        setBusyTabId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getActive, busyTabId, pageLoc, tabs, toast],
  );

  // --- Pricing (real menu + real combo discount) ---------------------------
  const cartOf = useCallback(
    (t: PosTab) =>
      t.items.flatMap((l) => {
        const m = byId(l.menuItemId);
        return m ? [{ menuItem: m, quantity: l.quantity, locationSlug: pageLoc }] : [];
      }),
    [byId, pageLoc],
  );
  const comboOf = useCallback((t: PosTab) => getActiveComboDeals(cartOf(t), config, t.channel ?? undefined), [cartOf, config]);
  const subtotalG = useCallback((t: PosTab) => cartOf(t).reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0), [cartOf]);
  const discountG = useCallback((t: PosTab) => (comboOf(t).isComplete ? comboOf(t).savings : 0), [comboOf]);
  const grandG = useCallback((t: PosTab) => Math.max(0, subtotalG(t) - discountG(t)), [subtotalG, discountG]);

  const active = getActive();
  const items = menu.filter(
    (m) => m.available && m.category === activeCat && (active?.channel === "delivery" || !m.deliveryOnly),
  );
  const offers = active && active.items.length > 0 ? getCartSuggestions(cartOf(active), menu, 4, config) : [];
  const isCoursed = !!active && active.channel === "dine-in" && (active.coursed ?? true);

  // --- Dialogs -------------------------------------------------------------
  const [tableOpen, setTableOpen] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrDraft, setAddrDraft] = useState("");

  const lineRow = (menuItemId: string, quantity: number) => {
    const m = byId(menuItemId);
    if (!m) return null;
    return (
      <div className="cv-line" key={menuItemId}>
        <div className="cv-qstep">
          <button type="button" onClick={() => changeQty(menuItemId, -1)} aria-label="Remove one">
            −
          </button>
          <span className="q mono">{quantity}</span>
          <button type="button" onClick={() => changeQty(menuItemId, 1)} aria-label="Add one">
            +
          </button>
        </div>
        <div className="ln">{m.name}</div>
        <span className="lp mono">{zl(m.price * quantity)}</span>
      </div>
    );
  };

  return (
    <CoreV2Shell
      eyebrow="Point of Sale · Till 1"
      tabs={[
        { label: "Order", active: true },
        {
          label: "Tender",
          onClick: () => (active && active.items.length > 0 ? setTenderOpen(true) : toast("Add items first")),
        },
      ]}
      subRight={
        active?.channel ? <span className="cv-chip" style={{ height: 32 }}>{CHANNELS.find((c) => c.key === active.channel)?.label}</span> : null
      }
    >
      <div className="cv-pos">
        {/* category rail */}
        <aside className="cv-rail">
          <div className="lbl">Menu</div>
          {categories.map((c) => (
            <button key={c} type="button" className={c === activeCat ? "cv-cat on" : "cv-cat"} onClick={() => setCat(c)}>
              {MENU_CATEGORY_LABELS[c]}
              <span className="n">{menu.filter((m) => m.available && m.category === c).length}</span>
            </button>
          ))}
        </aside>

        {/* menu grid */}
        <main className="cv-menu">
          <div className="cv-menu-grid">
            {items.map((m) => (
              <button key={m.id} type="button" className="cv-prod" onClick={() => (active ? addLine(m.id) : toast("Open a check first"))}>
                <div className="pn">{m.name}</div>
                <div className="pd">{m.description}</div>
                <div className="cv-tagrow">
                  {m.tags.map((t) => (
                    <span key={t} className={`cv-tag ${TAG_META[t].cls}`}>
                      {TAG_META[t].label}
                    </span>
                  ))}
                </div>
                <div className="pf">
                  <span className="pp">{zl(m.price)}</span>
                  <span className="add" aria-hidden>
                    +
                  </span>
                </div>
              </button>
            ))}
          </div>
        </main>

        {/* ticket */}
        <aside className="cv-ticket">
          <div className="cv-tabrail">
            {tabs.map((t) => (
              <button key={t.id} type="button" className={t.id === activeTabId ? "cv-ttab on" : "cv-ttab"} onClick={() => setActiveTabId(t.id)}>
                <span className="tt">{t.name}</span>
                <span className="ts">{t.items.reduce((s, l) => s + l.quantity, 0)} items</span>
              </button>
            ))}
            <button type="button" className="cv-ttab cv-ttab-new" onClick={() => void newTab()}>
              <span className="tt">+ New</span>
              <span className="ts">open check</span>
            </button>
          </div>

          {!active ? (
            <div className="cv-ticket-empty">
              <div>
                <div className="ti">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                    <path d="M5 3h14l-1.5 16.5a1 1 0 0 1-1 .9H7.5a1 1 0 0 1-1-.9L5 3Z" />
                    <path d="M9 8h6" />
                  </svg>
                </div>
                <h3>No open check</h3>
                <p>Start a check with + New, then tap menu items to build the ticket.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="cv-thead">
                <div>
                  <div className="th-t">{active.name}</div>
                  <div className="th-s">
                    {active.channel ? CHANNELS.find((c) => c.key === active.channel)?.label : "No channel"}
                    {active.orderId ? ` · #${active.orderId.slice(-5)}` : ""}
                  </div>
                </div>
                {active.channel === "dine-in" && (
                  <div className="cv-covers">
                    <button type="button" onClick={() => changeCovers(-1)} aria-label="Fewer covers">
                      −
                    </button>
                    <span className="mono">{active.covers ?? 2}</span>
                    <button type="button" onClick={() => changeCovers(1)} aria-label="More covers">
                      +
                    </button>
                  </div>
                )}
              </div>

              {/* channel + per-channel controls */}
              <div className="cv-chanrow">
                {CHANNELS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={active.channel === c.key ? "cv-chan on" : "cv-chan"}
                    onClick={() => setChannel(c.key)}
                  >
                    {c.label}
                  </button>
                ))}
                {active.channel === "dine-in" && (
                  <button type="button" className="cv-chan-aux" onClick={() => setTableOpen(true)}>
                    {active.tableId ? `Table ${tableById(active.tableId)?.number ?? "?"}` : "Assign table"}
                  </button>
                )}
                {active.channel === "delivery" && (
                  <button
                    type="button"
                    className="cv-chan-aux"
                    onClick={() => {
                      setAddrDraft(active.address ?? "");
                      setAddrOpen(true);
                    }}
                  >
                    {active.address ? "Edit address" : "Add address"}
                  </button>
                )}
              </div>

              {/* lines */}
              <div className="cv-lines">
                {active.items.length === 0 ? (
                  <div className="cv-lines-empty">Tap menu items to add them to the ticket.</div>
                ) : isCoursed ? (
                  groupLinesByCourse(active.items).map((g) => {
                    const fired = (active.firedCourses ?? []).includes(g.course);
                    return (
                      <div key={g.course} className={fired ? "cv-course fired" : "cv-course"}>
                        <div className="cv-course-h">
                          <span className="c-n">{POS_COURSE_LABELS[g.course]}</span>
                          {fired ? (
                            <span className="fire done">✓ Fired</span>
                          ) : (
                            <button type="button" className="fire" disabled={!!busyTabId} onClick={() => void fireCourse(g.course)}>
                              ⚡ Fire
                            </button>
                          )}
                        </div>
                        {g.lines.map((l) => lineRow(l.menuItemId, l.quantity))}
                      </div>
                    );
                  })
                ) : (
                  active.items.map((l) => lineRow(l.menuItemId, l.quantity))
                )}

                {/* cross-sell */}
                {offers.map((o) => (
                  <button key={o.item.id} type="button" className="cv-offer" onClick={() => addLine(o.item.id)}>
                    <span className="oi">＋</span>
                    <span className="ot">
                      <b>{o.item.name}</b> — {o.reason}
                    </span>
                    <span className="op mono">{zl(o.item.price)}</span>
                  </button>
                ))}
              </div>

              {/* totals + actions */}
              <div className="cv-foot">
                <div className="cv-frow">
                  <span>Subtotal</span>
                  <span className="mono">{zl(subtotalG(active))}</span>
                </div>
                {discountG(active) > 0 && (
                  <div className="cv-frow disc">
                    <span>✓ {comboOf(active).activeDeal?.name}</span>
                    <span className="mono">−{zl(discountG(active))}</span>
                  </div>
                )}
                <div className="cv-ftot">
                  <span className="tl">Total</span>
                  <span className="tv mono">{zl(grandG(active))}</span>
                </div>
                <div className="cv-foot-actions">
                  {!active.sentKds && (
                    <button type="button" className="cv-send" disabled={!active.items.length || !!busyTabId} onClick={() => void sendKds()}>
                      Send to KDS
                    </button>
                  )}
                  <button
                    type="button"
                    className="cv-charge"
                    disabled={!active.items.length || !!busyTabId}
                    onClick={() => setTenderOpen(true)}
                  >
                    Charge {fmtPLN(grandG(active))} →
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Tender */}
      <CoreV2Dialog
        open={tenderOpen && !!active}
        onClose={() => setTenderOpen(false)}
        title="Take payment"
        footer={
          <button type="button" className="cv-btn ghost" onClick={() => setTenderOpen(false)}>
            Cancel
          </button>
        }
      >
        {active && (
          <div className="cv-tender">
            <div className="cv-tender-tot">
              <span>Total due</span>
              <b className="mono">{fmtPLN(grandG(active))}</b>
            </div>
            <p className="cv-tender-note">
              {active.name} · {CHANNELS.find((c) => c.key === active.channel)?.label ?? "no channel"}
              {active.channel === "dine-in" && active.tableId ? ` · Table ${tableById(active.tableId)?.number}` : ""}
            </p>
            <div className="cv-tender-pads">
              <button type="button" className="cv-pay" disabled={!!busyTabId} onClick={() => void pay("Card")}>
                💳 Card
              </button>
              <button type="button" className="cv-pay" disabled={!!busyTabId} onClick={() => void pay("Cash")}>
                💵 Cash
              </button>
            </div>
          </div>
        )}
      </CoreV2Dialog>

      {/* Table picker */}
      <CoreV2Dialog open={tableOpen} onClose={() => setTableOpen(false)} title="Assign table">
        <div className="cv-tablegrid">
          {tables.length === 0 && <p className="cv-tender-note">No tables configured for this truck.</p>}
          {tables.map((t) => (
            <button
              key={t.id}
              type="button"
              className={active?.tableId === t.id ? "cv-tablebtn on" : "cv-tablebtn"}
              onClick={() => {
                assignTable(active?.tableId === t.id ? null : t.id);
                setTableOpen(false);
              }}
            >
              <span className="tn">{t.number}</span>
              <span className="tc">{t.seats} seats</span>
            </button>
          ))}
        </div>
      </CoreV2Dialog>

      {/* Delivery address */}
      <CoreV2Dialog
        open={addrOpen}
        onClose={() => setAddrOpen(false)}
        title="Delivery address"
        footer={
          <>
            <button type="button" className="cv-btn ghost" onClick={() => setAddrOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="cv-btn primary"
              onClick={() => {
                setAddress(addrDraft);
                setAddrOpen(false);
              }}
            >
              Save
            </button>
          </>
        }
      >
        <textarea
          className="cv-textarea"
          rows={3}
          value={addrDraft}
          onChange={(e) => setAddrDraft(e.target.value)}
          placeholder="Street & number, flat / buzzer, city — plus any note for the driver"
        />
      </CoreV2Dialog>
    </CoreV2Shell>
  );
}
