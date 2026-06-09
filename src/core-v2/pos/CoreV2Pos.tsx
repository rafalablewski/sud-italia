"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "@/shared/LocationContext";
import { usePolling } from "@/lib/usePolling";
import { idempotentFetch } from "@/lib/idempotentFetch";
import { durableMutate, usePendingWriteCount } from "@/store/writeQueue";
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
  type PosTabLine,
} from "@/data/types";
import { getActiveComboDeals, getCartSuggestions, type UpsellConfig } from "@/lib/upsell";
import { POS_COURSE_LABELS, POS_COURSE_ORDER, courseOf, defaultCourseForCategory, groupLinesByCourse } from "@/lib/pos-coursing";

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

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  hero: { label: "Hero", cls: "hero" },
  "profit-driver": { label: "Profit", cls: "profit" },
  anchor: { label: "Anchor", cls: "anchor" },
  lto: { label: "LTO", cls: "lto" },
};
const promiseMin = (sec?: number): string | null => (sec && sec > 0 ? `~${Math.round(sec / 60)}m` : null);

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
  const [cat, setCat] = useState<MenuCategory | "all" | null>(null);
  const activeCat = cat && (cat === "all" || categories.includes(cat)) ? cat : categories[0] ?? null;

  // --- Tabs (open checks), server-backed -----------------------------------
  const [tabs, setTabs] = useState<PosTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const persistTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Count of PUTs currently on the wire. The cross-till poll must skip while a
  // save is in flight — the debounce timer clears itself *before* the fetch
  // resolves, so guarding on `persistTimers` alone leaves a window where a poll
  // reads the pre-write server state and reverts the local edit (the line
  // "disappears, then reappears" a few seconds later on the next poll).
  const pendingSaves = useRef(0);

  // Reconcile a polled tab list against local state: incoming defines
  // membership (tabs added/closed on other tills), but a locally-edited tab
  // with a newer updatedAt wins, so a poll that was already in flight when we
  // wrote can't clobber the fresher edit.
  const mergeTabs = useCallback((incoming: PosTab[]) => {
    setTabs((local) => {
      const byId = new Map(local.map((t) => [t.id, t] as const));
      return incoming.map((inc) => {
        const mine = byId.get(inc.id);
        if (mine && mine.updatedAt && inc.updatedAt && mine.updatedAt > inc.updatedAt) return mine;
        return inc;
      });
    });
  }, []);

  const loadTabs = useCallback(async () => {
    if (!pageLoc) return;
    try {
      const res = await fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`);
      if (!res.ok) return;
      const data: { tabs?: PosTab[] } = await res.json();
      const list = Array.isArray(data.tabs) ? data.tabs : [];
      setTabs(list);
      setActiveTabId((cur) => (cur && list.some((t) => t.id === cur) ? cur : list[0]?.id ?? null));
    } catch {
      /* non-fatal */
    } finally {
      setHydrated(true);
    }
  }, [pageLoc]);

  useEffect(() => {
    setTabs([]);
    setActiveTabId(null);
    void loadTabs();
  }, [loadTabs]);

  // Live cross-till sync — visibility-aware poll, skipped while a local edit is
  // mid-debounce or its save is still on the wire (else the poll reverts it).
  usePolling(
    async () => {
      if (!pageLoc || persistTimers.current.size > 0 || pendingSaves.current > 0) return;
      try {
        const res = await fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`);
        if (!res.ok) return;
        const data: { tabs?: PosTab[] } = await res.json();
        const list = Array.isArray(data.tabs) ? data.tabs : [];
        mergeTabs(list);
        setActiveTabId((cur) => (cur && list.some((t) => t.id === cur) ? cur : list[0]?.id ?? null));
      } catch {
        /* non-fatal */
      }
    },
    5000,
    { enabled: !!pageLoc },
  );

  useEffect(() => {
    const timers = persistTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const persistTab = useCallback((tab: PosTab) => {
    // Optimistic checks carry a client `tmp-` id until the POST that creates
    // them server-side returns the real one. Never PUT under a temp id — it
    // would mint a phantom server tab that the cross-till poll then resurrects.
    // Edits made in that sub-second window stay local and are flushed once,
    // under the real id, at reconcile time (see `newTab`).
    if (tab.id.startsWith("tmp-")) return;
    const timers = persistTimers.current;
    const existing = timers.get(tab.id);
    if (existing) clearTimeout(existing);
    timers.set(
      tab.id,
      setTimeout(() => {
        timers.delete(tab.id);
        // Mark the save in flight until the PUT settles so the cross-till poll
        // can't read a stale list in the gap between debounce-clear and commit.
        pendingSaves.current += 1;
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
        })
          .catch(() => {})
          .finally(() => {
            pendingSaves.current = Math.max(0, pendingSaves.current - 1);
          });
      }, 350),
    );
  }, []);

  const getActive = useCallback(() => tabs.find((t) => t.id === activeTabId) ?? null, [tabs, activeTabId]);

  const mutateActive = useCallback(
    (mutator: (t: PosTab) => PosTab) => {
      // Compute the next tab outside setTabs so the state updater stays pure —
      // persisting (a fetch) inside it would double-fire under StrictMode /
      // concurrent rendering. The functional update applies the precomputed value.
      const current = tabs.find((t) => t.id === activeTabId);
      if (!current) return;
      const changed = { ...mutator(current), updatedAt: new Date().toISOString() };
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? changed : t)));
      persistTab(changed);
    },
    [tabs, activeTabId, persistTab],
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
  const togglePark = useCallback(
    () => mutateActive((t) => ({ ...t, status: t.status === "parked" ? "open" : "parked" })),
    [mutateActive],
  );
  const setName = useCallback((name: string) => mutateActive((t) => ({ ...t, name: name.slice(0, 40) })), [mutateActive]);
  // Dine-in kitchen timing — course-by-course firing vs everything at once.
  const toggleCoursed = useCallback(() => mutateActive((t) => ({ ...t, coursed: !(t.coursed ?? true) })), [mutateActive]);
  // Drag-to-recourse — re-pacing a held line shouldn't un-send what's fired.
  const recourse = useCallback(
    (menuItemId: string, course: PosCourse) =>
      mutateActive((t) => ({ ...t, items: t.items.map((l) => (l.menuItemId === menuItemId ? { ...l, course } : l)) })),
    [mutateActive],
  );

  const newTab = useCallback(async () => {
    if (!pageLoc) return;
    // Derive the next default name from the highest existing "Tab N" so it never
    // collides — even after middle checks are closed (a plain counter repeats).
    const maxNum = tabs.reduce((max, t) => {
      const m = /^Tab (\d+)$/.exec(t.name);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const name = `Tab ${maxNum + 1}`;
    // Optimistic open: show the check instantly with a temp id and switch to it
    // so staff can start ringing items the moment they tap "+ New" — the till
    // must not block on a server round-trip (which on a slow link made opening a
    // check feel like it took "ages"). The POST runs in the background and we
    // reconcile the temp id to the real one when it returns, carrying over any
    // lines/channel rung in the meantime. `pendingSaves` is held up for the
    // whole round-trip so the cross-till poll can't drop the not-yet-saved tab.
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const optimistic: PosTab = {
      id: tempId,
      locationSlug: pageLoc,
      name,
      channel: null,
      status: "open",
      items: [],
      sentKds: false,
      createdAt: now,
      updatedAt: now,
    };
    setTabs((prev) => [...prev, optimistic]);
    setActiveTabId(tempId);
    pendingSaves.current += 1;
    try {
      const res = await fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setTabs((prev) => prev.filter((t) => t.id !== tempId));
        setActiveTabId((cur) => (cur === tempId ? null : cur));
        return;
      }
      const data: { tab?: PosTab } = await res.json();
      const real = data.tab;
      if (!real) {
        setTabs((prev) => prev.filter((t) => t.id !== tempId));
        setActiveTabId((cur) => (cur === tempId ? null : cur));
        return;
      }
      // Swap temp → real id, keeping anything rung onto the optimistic check.
      let merged: PosTab | null = null;
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tempId) return t;
          merged = { ...t, id: real.id, createdAt: real.createdAt ?? t.createdAt, updatedAt: new Date().toISOString() };
          return merged;
        }),
      );
      setActiveTabId((cur) => (cur === tempId ? real.id : cur));
      // If items/channel were added during the round-trip, flush them once under
      // the real id (the POST created the check empty).
      if (merged && ((merged as PosTab).items.length > 0 || (merged as PosTab).channel)) persistTab(merged);
    } catch {
      // Offline / network error — drop the optimistic check.
      setTabs((prev) => prev.filter((t) => t.id !== tempId));
      setActiveTabId((cur) => (cur === tempId ? null : cur));
    } finally {
      pendingSaves.current = Math.max(0, pendingSaves.current - 1);
    }
  }, [pageLoc, tabs, persistTab]);

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
  const tablesByZone = useMemo(() => {
    const m = new Map<string, FloorTable[]>();
    for (const t of tables) {
      const z = t.zone || "Floor";
      (m.get(z) ?? m.set(z, []).get(z)!).push(t);
    }
    return [...m.entries()];
  }, [tables]);

  // --- Send / Fire / Charge ------------------------------------------------
  const [busyTabId, setBusyTabId] = useState<string | null>(null);

  const sendKds = useCallback(async () => {
    const t = getActive();
    if (!t || t.items.length === 0 || busyTabId) return;
    if (!t.channel) return toast("Pick a channel first", "danger");
    setBusyTabId(t.id);
    try {
      const url = `/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`;
      const { res, queued } = await durableMutate({
        url,
        method: "POST",
        body: { tabId: t.id },
        entity: `tab:${t.id}`,
        desc: `Send · #${t.id}`,
        onReject: (s) => toast(`Send for #${t.id} was rejected (${s})`, "danger"),
      });
      if (queued) {
        // Offline: optimistically mark the tab sent; the outbox fires it on reconnect.
        setTabs((prev) => prev.map((x) => (x.id === t.id ? { ...x, sentKds: true, status: "pay" } : x)));
        return toast(`Saved offline — sends to KDS on reconnect · #${t.id}`, "default");
      }
      const data = (await res!.json().catch(() => ({}))) as { error?: string; orderId?: string; firedCourses?: PosCourse[] };
      if (!res!.ok) return toast(data.error || "Could not send to KDS", "danger");
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
        const { res } = await idempotentFetch(`/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`, {
          method: "POST",
          body: { tabId: t.id, courses: [course] },
        });
        if (!res) return toast("No connection — couldn't fire the course", "danger");
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
        const url = `/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`;
        const { res, queued } = await durableMutate({
          url,
          method: "PATCH",
          body: { tabId: t.id },
          entity: `tab:${t.id}`,
          desc: `Charge · #${t.id}`,
          onReject: (s) => toast(`Charge for #${t.id} was rejected (${s})`, "danger"),
        });
        const closeTab = () => {
          const left = tabs.filter((x) => x.id !== t.id);
          setTabs(left);
          setActiveTabId(left[0]?.id ?? null);
        };
        if (queued) {
          // Offline: close the check optimistically; the outbox charges it (once,
          // under its idempotency key) when the network returns.
          closeTab();
          return toast(`Saved offline — charges ${method} on reconnect · #${t.id}`, "default");
        }
        const data = (await res!.json().catch(() => ({}))) as { error?: string; totalAmount?: number };
        if (!res!.ok) return toast(data.error || "Could not take payment", "danger");
        const amt = data.totalAmount ?? grandG(t);
        closeTab();
        toast(`Paid ✓ #${t.id} · ${method} · ${fmtPLN(amt)}`, "success");
      } finally {
        setBusyTabId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getActive, busyTabId, pageLoc, tabs, toast],
  );

  // --- Void (delete an open check) -----------------------------------------
  const [voidOpen, setVoidOpen] = useState(false);
  // Drop an open check entirely: removes it from the rail and deletes it
  // server-side (`DELETE /api/admin/pos/tabs?id=`). Optimistic — the row
  // disappears at once; `pendingSaves` is held for the round-trip so the
  // cross-till poll can't resurrect it before the delete commits. An empty,
  // never-saved optimistic check (`tmp-` id) is removed locally only.
  const deleteTab = useCallback(
    async (id: string) => {
      const t = tabs.find((x) => x.id === id);
      if (!t) return;
      const left = tabs.filter((x) => x.id !== id);
      setTabs(left);
      setActiveTabId((cur) => (cur === id ? left[0]?.id ?? null : cur));
      // Cancel any debounced PUT still queued for this check.
      const timer = persistTimers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        persistTimers.current.delete(id);
      }
      if (id.startsWith("tmp-")) return; // never hit the server
      pendingSaves.current += 1;
      try {
        await fetch(
          `/api/admin/pos/tabs?location=${encodeURIComponent(t.locationSlug)}&id=${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        toast(`Voided ${t.name}`, "default");
      } catch {
        /* offline — best effort; the poll reconciles when the link returns */
      } finally {
        pendingSaves.current = Math.max(0, pendingSaves.current - 1);
      }
    },
    [tabs, toast],
  );
  // Empty checks vanish on tap; a check with rung items asks first.
  const requestVoid = useCallback(() => {
    const t = tabs.find((x) => x.id === activeTabId);
    if (!t || busyTabId) return;
    if (t.items.length === 0) void deleteTab(t.id);
    else setVoidOpen(true);
  }, [tabs, activeTabId, busyTabId, deleteTab]);

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
  // Writes parked in the durable outbox (offline). Drives the "syncing" pill so
  // staff know a send/charge is saved and will land on reconnect.
  const pendingWrites = usePendingWriteCount();

  // Tab-rail rollup: how many checks are in flight, ready to pay, parked, and
  // the open value across all of them — the at-a-glance "state of the till".
  const railSummary = useMemo(() => {
    const ready = tabs.filter((t) => t.status === "pay").length;
    const parked = tabs.filter((t) => t.status === "parked").length;
    const openValue = tabs.reduce((s, t) => s + grandG(t), 0);
    return { count: tabs.length, ready, parked, openValue };
  }, [tabs, grandG]);

  // Other open, non-parked dine-in checks already seated at a table — the
  // double-seat guard for the table picker.
  const tabsOnTable = useCallback(
    (tableId: string, exceptId?: string) =>
      tabs.filter((t) => t.id !== exceptId && t.status !== "parked" && t.channel === "dine-in" && t.tableId === tableId),
    [tabs],
  );
  const handlePickTable = (tbl: FloorTable) => {
    if (!active) return;
    setTableOpen(false);
    if (active.tableId === tbl.id) {
      assignTable(null);
      return;
    }
    assignTable(tbl.id);
    const conflict = tabsOnTable(tbl.id, active.id).length > 0;
    const over = tbl.seats < (active.covers ?? 2);
    if (conflict || over) {
      const bits: string[] = [];
      if (conflict) bits.push("also on another open check");
      if (over) bits.push(`seats ${tbl.seats} for a party of ${active.covers ?? 2}`);
      toast(`Table ${tbl.number} — ${bits.join(" · ")}`, "danger");
    } else {
      toast(`Seated at table ${tbl.number}`, "success");
    }
  };

  // Channel-true available menu; "all" shows every category stacked.
  const channelMenu = menu.filter((m) => m.available && (active?.channel === "delivery" || !m.deliveryOnly));
  const items = activeCat === "all" ? channelMenu : channelMenu.filter((m) => m.category === activeCat);
  const offers = active && active.items.length > 0 ? getCartSuggestions(cartOf(active), menu, 4, config) : [];
  const isCoursed = !!active && active.channel === "dine-in" && (active.coursed ?? true);

  // Combo-completion offer — a partially-matched deal one or two items short.
  const combo = active ? comboOf(active) : null;
  const comboNeed = combo?.activeDeal && !combo.isComplete
    ? combo.missingItems.length
      ? combo.missingItems.join(", ")
      : combo.missingCategories.length
        ? combo.missingCategories.map((c) => MENU_CATEGORY_LABELS[c]).join(", ")
        : combo.missingQuantity
          ? `${combo.missingQuantity} more item${combo.missingQuantity > 1 ? "s" : ""}`
          : null
    : null;
  const completeCombo = () => {
    if (!combo?.activeDeal) return;
    const ids: string[] = [];
    if (combo.activeDeal.requiredItems) {
      for (const label of combo.missingItems) {
        const req = combo.activeDeal.requiredItems.find((r) => r.label === label);
        const m = req && channelMenu.find((x) => x.id.endsWith(req.suffix));
        if (m) ids.push(m.id);
      }
    }
    for (const c of combo.missingCategories) {
      const m = channelMenu.filter((x) => x.category === c).sort((a, b) => a.price - b.price)[0];
      if (m) ids.push(m.id);
    }
    if (ids.length === 0 && combo.missingQuantity > 0 && active) {
      // categories already matched — just need volume; repeat the first line.
      const first = active.items[0];
      if (first) ids.push(first.menuItemId);
    }
    ids.forEach((id) => addLine(id));
  };

  // --- Pace steering (real: server analyzeTruck over live orders) ----------
  interface SteerPlan {
    active: boolean;
    bottleneck: { label: string; util: number; tier: string } | null;
    reason: string | null;
    makeNow: string[];
    throttle: string[];
    promiseSecondsByCategory: Record<string, number>;
    deliveryCapNextWindow: number;
  }
  const [steer, setSteer] = useState<SteerPlan | null>(null);
  const [windowMin, setWindowMin] = useState(15);
  // Pace-steering item cues + per-check promise, all from the live plan.
  const makeNowSet = useMemo(() => new Set(steer?.makeNow ?? []), [steer]);
  const throttleSet = useMemo(() => new Set(steer?.throttle ?? []), [steer]);
  const tabPromiseSec = useMemo(() => {
    if (!active || !steer) return 0;
    return Math.max(0, ...active.items.map((l) => steer.promiseSecondsByCategory[byId(l.menuItemId)?.category ?? ""] ?? 0));
  }, [active, steer, byId]);
  const deliveryPaused = !!(steer?.active && active?.channel === "delivery" && steer.deliveryCapNextWindow === 0);
  const loadSteer = useCallback(async () => {
    if (!pageLoc) return;
    try {
      const res = await fetch(`/api/admin/pace/steering?location=${encodeURIComponent(pageLoc)}`);
      if (!res.ok) return;
      const d = await res.json();
      setSteer(d.plan ?? null);
      if (d.paceWindowMin) setWindowMin(d.paceWindowMin);
    } catch {
      /* non-fatal — the till just shows no steering hint */
    }
  }, [pageLoc]);
  useEffect(() => {
    void loadSteer();
  }, [loadSteer]);
  usePolling(loadSteer, 15000, { enabled: !!pageLoc });

  // --- Drag-to-recourse + fullscreen kiosk --------------------------------
  const dragItem = useRef<string | null>(null);
  const [dropCourse, setDropCourse] = useState<PosCourse | null>(null);
  // Tap-to-move course picker. A POS till is a touchscreen and HTML5 drag never
  // fires from a finger, so the grip doubles as a tap target that reveals an
  // inline course chooser; native drag stays as a mouse-only enhancement.
  const [recourseFor, setRecourseFor] = useState<string | null>(null);
  const [kiosk, setKiosk] = useState(false);
  const toggleKiosk = useCallback(() => {
    setKiosk((k) => {
      const next = !k;
      if (next) void document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      return next;
    });
  }, []);
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setKiosk(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // --- Dialogs -------------------------------------------------------------
  const [tableOpen, setTableOpen] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  // Leaving a check (or its dine-in channel) drops back to the menu.
  useEffect(() => {
    setTableOpen(false);
  }, [activeTabId]);
  const [addrDraft, setAddrDraft] = useState("");

  const tableButton = (t: FloorTable) => {
    const inUse = tabsOnTable(t.id, active?.id).length > 0;
    const under = active ? t.seats < (active.covers ?? 2) : false;
    return (
      <button
        key={t.id}
        type="button"
        className={`cv-tablebtn${active?.tableId === t.id ? " on" : ""}${t.status === "out-of-service" ? " oos" : ""}`}
        onClick={() => handlePickTable(t)}
      >
        <span className="tn">{t.number}</span>
        <span className="tc">{t.seats} seats{t.zone ? ` · ${t.zone}` : ""}</span>
        <span className="cv-tablebadges">
          {inUse && <span className="cv-tbadge warn">In use</span>}
          {under && <span className="cv-tbadge warn">Seats {t.seats} &lt; {active?.covers ?? 2}</span>}
          {t.status === "reserved" && <span className="cv-tbadge info">Reserved</span>}
          {t.status === "out-of-service" && <span className="cv-tbadge">Out of service</span>}
        </span>
      </button>
    );
  };

  const productCard = (m: MenuItem) => (
    <button key={m.id} type="button" className="cv-prod" onClick={() => (active ? addLine(m.id) : toast("Open a check first"))}>
      <div className="pn">
        {m.name}
        {m.menuRole && <span className={`cv-role ${ROLE_BADGE[m.menuRole].cls}`}>{ROLE_BADGE[m.menuRole].label}</span>}
      </div>
      <div className="pd">{m.description}</div>
      <div className="cv-tagrow">
        {m.tags.map((t) => (
          <span key={t} className={`cv-tag ${TAG_META[t].cls}`}>{TAG_META[t].label}</span>
        ))}
        {steer?.active && makeNowSet.has(m.id) && <span className="cv-steer-tag now">★ make now</span>}
        {steer?.active && throttleSet.has(m.id) && <span className="cv-steer-tag ease">▼ ease</span>}
      </div>
      <div className="pf">
        <span className="pp">{zl(m.price)}</span>
        <span className="add" aria-hidden>+</span>
      </div>
    </button>
  );

  const lineRow = (l: PosTabLine, coursed: boolean) => {
    const menuItemId = l.menuItemId;
    const m = byId(menuItemId);
    if (!m) return null;
    const picking = recourseFor === menuItemId;
    return (
      <div
        className={`cv-line${picking ? " picking" : ""}`}
        key={menuItemId}
        draggable={coursed}
        onDragStart={() => {
          if (coursed) dragItem.current = menuItemId;
        }}
        onDragEnd={() => {
          dragItem.current = null;
        }}
      >
        <div className="cv-line-main">
          {coursed ? (
            <button
              type="button"
              className="cv-grip"
              title="Move to another course"
              aria-label={`Move ${m.name} to another course`}
              aria-expanded={picking}
              onClick={() => setRecourseFor((cur) => (cur === menuItemId ? null : menuItemId))}
            >
              ⠿
            </button>
          ) : (
            <span className="cv-grip" aria-hidden>⠿</span>
          )}
          <div className="cv-qstep">
            <button type="button" onClick={() => changeQty(menuItemId, -1)} aria-label="Remove one">
              −
            </button>
            <span className="q mono">{l.quantity}</span>
            <button type="button" onClick={() => changeQty(menuItemId, 1)} aria-label="Add one">
              +
            </button>
          </div>
          <div className="ln">{m.name}</div>
          <span className="lp mono">{zl(m.price * l.quantity)}</span>
        </div>
        {picking && coursed && (
          <div className="cv-recourse" role="group" aria-label="Move to course">
            {POS_COURSE_ORDER.map((c) => {
              const on = courseOf(l) === c;
              return (
                <button
                  key={c}
                  type="button"
                  className={`cv-recourse-opt${on ? " on" : ""}`}
                  onClick={() => {
                    if (!on) recourse(menuItemId, c);
                    setRecourseFor(null);
                  }}
                >
                  {POS_COURSE_LABELS[c]}
                </button>
              );
            })}
          </div>
        )}
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
        <>
          {active?.channel && <span className="cv-chip" style={{ height: 32 }}>{CHANNELS.find((c) => c.key === active.channel)?.label}</span>}
          {active && (
            <button type="button" className={active.status === "parked" ? "cv-chip on" : "cv-chip"} style={{ height: 32 }} onClick={togglePark} title="Park / resume this check">
              {active.status === "parked" ? "▣ Parked" : "▢ Park"}
            </button>
          )}
          {active && (
            <button type="button" className="cv-chip danger" style={{ height: 32 }} disabled={!!busyTabId} onClick={requestVoid} title="Void / delete this check">
              🗑 Void
            </button>
          )}
          <button type="button" className="cv-iconbtn" title={kiosk ? "Exit fullscreen" : "Fullscreen"} onClick={toggleKiosk}>
            {kiosk ? "✕" : "⛶"}
          </button>
        </>
      }
    >
      {/* open-check bar — spans the full width, above the panes */}
      <div className="cv-checkbar">
        {pendingWrites > 0 && (
          <div className="cv-sync-pill" role="status" title="Saved locally — will sync when the connection returns">
            ↻ {pendingWrites} {pendingWrites === 1 ? "write" : "writes"} syncing
          </div>
        )}
        {tabs.length > 0 && (
          <div className="cv-tabrail-sum">
            {railSummary.count} {railSummary.count === 1 ? "tab" : "tabs"} · {railSummary.ready} ready to pay · {railSummary.parked} parked ·{" "}
            <b className="mono">{fmtPLN(railSummary.openValue)}</b> open
          </div>
        )}
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
      </div>
      <div className="cv-pos">
        {/* category rail */}
        <aside className="cv-rail">
          <div className="lbl">Menu</div>
          <button type="button" className={activeCat === "all" ? "cv-cat on" : "cv-cat"} onClick={() => setCat("all")}>
            All
            <span className="n">{channelMenu.length}</span>
          </button>
          {categories.map((c) => (
            <button key={c} type="button" className={c === activeCat ? "cv-cat on" : "cv-cat"} onClick={() => setCat(c)}>
              {MENU_CATEGORY_LABELS[c]}
              {steer?.active && promiseMin(steer.promiseSecondsByCategory[c]) && (
                <span className="cv-cat-promise">{promiseMin(steer.promiseSecondsByCategory[c])}</span>
              )}
              <span className="n">{menu.filter((m) => m.available && m.category === c).length}</span>
            </button>
          ))}
        </aside>

        {/* menu grid — or the table picker, in place */}
        <main className="cv-menu">
          {tableOpen && active?.channel === "dine-in" ? (
            <div className="cv-tablepick">
              <div className="cv-tablepick-h">
                <div>
                  <div className="tt">Assign table</div>
                  <div className="ts">
                    {active.name} · party of {active.covers ?? 2}
                    {active.tableId ? ` · currently Table ${tableById(active.tableId)?.number ?? "?"}` : ""}
                  </div>
                </div>
                <button type="button" className="cv-btn ghost sm" onClick={() => setTableOpen(false)}>← Back to menu</button>
              </div>
              {tables.length === 0 ? (
                <div className="cv-tender-note" style={{ padding: 16 }}>No tables configured for this truck.</div>
              ) : (
                tablesByZone.map(([zone, ts]) => (
                  <div key={zone} className="cv-tablezone">
                    <div className="cv-tablezone-h">{zone}<span className="n">{ts.length}</span></div>
                    <div className="cv-tablegrid big">{ts.map(tableButton)}</div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              {steer && (
                steer.active && steer.bottleneck ? (
                  <div className={`cv-steer ${steer.bottleneck.tier}`}>
                    <span className="dot" />
                    <span><b>{steer.bottleneck.label} {Math.round(steer.bottleneck.util)}%</b> — {steer.reason ?? "nearing capacity; pace the firing."}</span>
                    <span className="cap">cap · {windowMin}m</span>
                  </div>
                ) : (
                  <div className="cv-steer calm">
                    <span className="dot" />
                    <span><b>Line clear</b> — all stations within capacity, honest promise times live.</span>
                  </div>
                )
              )}
              {activeCat === "all" ? (
                categories.map((c) => {
                  const group = items.filter((m) => m.category === c);
                  if (group.length === 0) return null;
                  return (
                    <div key={c} className="cv-menu-sec">
                      <div className="cv-menu-sec-h">{MENU_CATEGORY_LABELS[c]}</div>
                      <div className="cv-menu-grid">{group.map(productCard)}</div>
                    </div>
                  );
                })
              ) : (
                <div className="cv-menu-grid">{items.map(productCard)}</div>
              )}
            </>
          )}
        </main>

        {/* ticket */}
        <aside className="cv-ticket">
          {!active ? (
            <div className="cv-ticket-empty">
              {!hydrated ? (
                <div>
                  <h3>Loading open checks…</h3>
                </div>
              ) : (
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
              )}
            </div>
          ) : (
            <>
              <div className="cv-thead">
                <div className="th-id">
                  <input
                    className="cv-th-name"
                    value={active.name ?? ""}
                    maxLength={40}
                    onChange={(e) => setName(e.target.value)}
                    aria-label="Check name"
                    title="Rename this check"
                  />
                  <div className="th-s">
                    {active.channel ? CHANNELS.find((c) => c.key === active.channel)?.label : "No channel"}
                    {active.orderId ? ` · #${active.orderId.slice(-5)}` : ""}
                  </div>
                </div>
                {tabPromiseSec > 0 && (
                  <span className={`cv-tabpromise ${steer?.bottleneck?.tier ?? "calm"}`} title="Estimated kitchen ready time for this check">
                    ready {promiseMin(tabPromiseSec)}
                  </span>
                )}
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

              {deliveryPaused && (
                <div className="cv-delivery-paused">
                  ⏸ Delivery paused — the kitchen is at capacity for the next {windowMin}m window. New delivery checks won&apos;t promise a slot yet.
                </div>
              )}

              {/* dine-in kitchen timing — coursed vs all-together */}
              {active.channel === "dine-in" && (
                <div className="cv-timing">
                  <span className="cv-timing-l">Kitchen timing</span>
                  <div className="cv-seg">
                    <button type="button" className={isCoursed ? "on" : ""} onClick={() => !isCoursed && toggleCoursed()}>Coursed</button>
                    <button type="button" className={!isCoursed ? "on" : ""} onClick={() => isCoursed && toggleCoursed()}>All together</button>
                  </div>
                </div>
              )}

              {/* lines */}
              <div className="cv-lines">
                {active.items.length === 0 ? (
                  <div className="cv-lines-empty">Tap menu items to add them to the ticket.</div>
                ) : isCoursed ? (
                  groupLinesByCourse(active.items).map((g) => {
                    const fired = (active.firedCourses ?? []).includes(g.course);
                    return (
                      <div
                        key={g.course}
                        className={`${fired ? "cv-course fired" : "cv-course"}${dropCourse === g.course ? " drop" : ""}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dropCourse !== g.course) setDropCourse(g.course);
                        }}
                        onDragLeave={() => setDropCourse((c) => (c === g.course ? null : c))}
                        onDrop={() => {
                          if (dragItem.current) recourse(dragItem.current, g.course);
                          setDropCourse(null);
                        }}
                      >
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
                        {g.lines.map((l) => lineRow(l, true))}
                      </div>
                    );
                  })
                ) : (
                  active.items.map((l) => lineRow(l, false))
                )}

                {/* combo completion */}
                {comboNeed && combo?.activeDeal && (
                  <button type="button" className="cv-offer combo" onClick={completeCombo}>
                    <span className="oi">🎁</span>
                    <span className="ot">
                      <b>Make it the {combo.activeDeal.name}</b> — add {comboNeed}
                    </span>
                    <span className="op mono">deal</span>
                  </button>
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

      {/* Void confirmation — only when the check has rung items */}
      <CoreV2Dialog
        open={voidOpen && !!active}
        onClose={() => setVoidOpen(false)}
        title="Void this check?"
        footer={
          <>
            <button type="button" className="cv-btn ghost" onClick={() => setVoidOpen(false)}>
              Keep check
            </button>
            <button
              type="button"
              className="cv-btn danger"
              disabled={!!busyTabId}
              onClick={() => {
                const id = active?.id;
                setVoidOpen(false);
                if (id) void deleteTab(id);
              }}
            >
              Void check
            </button>
          </>
        }
      >
        {active && (
          <p className="cv-tender-note">
            <b>{active.name}</b> has {active.items.reduce((s, l) => s + l.quantity, 0)} item
            {active.items.reduce((s, l) => s + l.quantity, 0) === 1 ? "" : "s"} ({fmtPLN(grandG(active))}). This deletes the
            open check for good — it can&apos;t be undone.
          </p>
        )}
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
