"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Armchair,
  Banknote,
  Check,
  Clock,
  CreditCard,
  Gauge,
  MapPin,
  Maximize2,
  Minimize2,
  ParkingSquare,
  Plus,
  Receipt,
  RefreshCw,
  Send,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import {
  MENU_CATEGORY_LABELS,
  type FloorTable,
  type FulfillmentType,
  type MenuCategory,
  type MenuItem,
  type PosTab,
} from "@/data/types";
import { getActiveComboDeals, getCartSuggestions, type UpsellConfig } from "@/lib/upsell";
import type { CartItem } from "@/data/types";
import { useAdminLocation } from "./v2/LocationContext";
import { Badge, Button, Dialog, EmptyState, type BadgeTone } from "./v2/ui";

// Floor-table status → admin Badge tone (standard admin styling for the picker).
const TABLE_STATUS_TONE: Record<FloorTable["status"], BadgeTone> = {
  available: "success",
  seated: "info",
  reserved: "warning",
  "out-of-service": "danger",
};

// Prices are grosze (integers); the chain renders PLN with a comma decimal.
const fmtPLN = (g: number) => `${(g / 100).toFixed(2).replace(".", ",")} zł`;

const CHANNELS: { value: FulfillmentType; label: string; icon: React.ReactNode; cls: string }[] = [
  { value: "takeout", label: "Takeout", icon: <ShoppingBag />, cls: "chan-takeout" },
  { value: "delivery", label: "Delivery", icon: <Truck />, cls: "chan-delivery" },
  { value: "dine-in", label: "Dine-in", icon: <UtensilsCrossed />, cls: "chan-dinein" },
];
const CHAN_BY_VALUE = new Map(CHANNELS.map((c) => [c.value, c]));
const CHAN_CLASS = (c: FulfillmentType | null) =>
  (c && CHAN_BY_VALUE.get(c)?.cls) || "chan-none";
const CHAN_LABEL = (c: FulfillmentType | null) =>
  (c && CHAN_BY_VALUE.get(c)?.label) || "No channel";

const CAT_EMOJI: Record<MenuCategory, string> = {
  pizza: "🍕",
  pasta: "🍝",
  antipasti: "🥖",
  panini: "🥪",
  drinks: "☕",
  desserts: "🍰",
};
const CAT_ORDER = Object.keys(MENU_CATEGORY_LABELS) as MenuCategory[];

const ROLE_BADGE: Partial<Record<NonNullable<MenuItem["menuRole"]>, { label: string; cls: string }>> = {
  hero: { label: "Hero", cls: "pos-role-hero" },
  "profit-driver": { label: "Profit", cls: "pos-role-profit" },
  anchor: { label: "Anchor", cls: "pos-role-anchor" },
};
const TAG_LABEL: Record<MenuItem["tags"][number], string> = {
  vegetarian: "veg",
  vegan: "vegan",
  spicy: "spicy",
  "gluten-free": "gf",
};
const TAG_CLS: Record<MenuItem["tags"][number], string> = {
  vegetarian: "veg",
  vegan: "vegan",
  spicy: "spicy",
  "gluten-free": "gf",
};

const STATUS_LABEL: Record<PosTab["status"], string> = {
  open: "Open",
  parked: "Parked",
  pay: "Ready · Pay",
};

type PaceTier = "calm" | "warn" | "risk";
interface SteerPlan {
  active: boolean;
  promiseSecondsByCategory: Partial<Record<MenuCategory, number>>;
  makeNow: string[];
  throttle: string[];
  deliveryCapNextWindow: number | null;
  bottleneck: { id: MenuCategory; label: string; util: number; tier: PaceTier } | null;
  reason: string | null;
}
interface SteerResponse {
  paceWindowMin: number;
  plan: SteerPlan;
}

const promiseLabel = (sec: number) =>
  sec <= 0 ? "~0 min" : sec < 90 ? "~1 min" : `~${Math.round(sec / 60)} min`;

interface Offer {
  kind: "combo" | "add";
  title: string;
  sub: string;
  cta: string;
  apply: () => void;
}

export function AdminPos({
  menusByLocation,
  upsellByLocation,
}: {
  menusByLocation: Record<string, MenuItem[]>;
  upsellByLocation: Record<string, UpsellConfig | null>;
}) {
  const { location, activeLocations } = useAdminLocation();

  const locationKeys = useMemo(() => Object.keys(menusByLocation), [menusByLocation]);
  const fallbackLoc = locationKeys[0] ?? "";
  const [pageLoc, setPageLoc] = useState<string>(location || fallbackLoc);
  useEffect(() => {
    if (location && menusByLocation[location]) setPageLoc(location);
  }, [location, menusByLocation]);

  const menu = useMemo(() => menusByLocation[pageLoc] ?? [], [menusByLocation, pageLoc]);
  const config = upsellByLocation[pageLoc] ?? null;
  const byId = useCallback((id: string) => menu.find((m) => m.id === id), [menu]);

  // Category filter — "all" stacks every category under a heading; a single
  // category shows just its grid. Falls back to All if the active category
  // disappears (e.g. after a location switch).
  const [activeCat, setActiveCat] = useState<MenuCategory | "all">("all");
  const presentCats = useMemo(() => {
    const present = new Set(menu.filter((m) => m.available).map((m) => m.category));
    return CAT_ORDER.filter((c) => present.has(c));
  }, [menu]);
  useEffect(() => {
    if (activeCat !== "all" && !presentCats.includes(activeCat)) setActiveCat("all");
  }, [presentCats, activeCat]);

  // --- Tabs (open checks), server-backed -----------------------------------
  const [tabs, setTabs] = useState<PosTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const renameSeq = useRef(1);

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
    } finally {
      setHydrated(true);
    }
  }, [pageLoc]);

  useEffect(() => {
    setHydrated(false);
    setTabs([]);
    setActiveTabId(null);
    void loadTabs();
  }, [loadTabs]);

  const getActive = useCallback(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  // --- Toast ---------------------------------------------------------------
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2400);
  }, []);

  // --- Tables (dine-in) — read-only at staff level ------------------------
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const fetchTables = useCallback(async () => {
    if (!pageLoc) return;
    setTablesLoading(true);
    try {
      const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(pageLoc)}`);
      if (!res.ok) {
        setTables([]);
        return;
      }
      const data: FloorTable[] = await res.json();
      setTables(Array.isArray(data) ? data : []);
    } catch {
      /* non-fatal — picker shows the empty state */
    } finally {
      setTablesLoading(false);
    }
  }, [pageLoc]);
  const tableById = useCallback(
    (id?: string) => (id ? tables.find((t) => t.id === id) : undefined),
    [tables],
  );
  // Tables occupied by another active (non-parked) dine-in check.
  const tabsOnTable = useCallback(
    (tableId: string, exceptId: string) =>
      tabs.filter(
        (t) =>
          t.id !== exceptId &&
          t.channel === "dine-in" &&
          t.status !== "parked" &&
          t.tableId === tableId,
      ),
    [tabs],
  );

  // Debounced per-tab persistence — every edit lands in the store so a refresh
  // (or a second till) sees the same open checks. orderId stays server-owned.
  const persistTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const persistTab = useCallback(
    (tab: PosTab) => {
      const timers = persistTimers.current;
      const existing = timers.get(tab.id);
      if (existing) clearTimeout(existing);
      timers.set(
        tab.id,
        setTimeout(() => {
          timers.delete(tab.id);
          void fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: tab.id,
              name: tab.name,
              channel: tab.channel,
              status: tab.status,
              items: tab.items,
              tableId: tab.tableId,
              covers: tab.covers,
              address: tab.address,
              sentKds: tab.sentKds,
            }),
          }).catch(() => {});
        }, 350),
      );
    },
    [pageLoc],
  );

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
        else items.push({ menuItemId: id, quantity: 1 });
        return { ...t, items, sentKds: false, status: t.status === "parked" ? "open" : t.status };
      }),
    [mutateActive],
  );

  const changeQty = useCallback(
    (id: string, delta: number) =>
      mutateActive((t) => {
        const items = t.items
          .map((l) => (l.menuItemId === id ? { ...l, quantity: l.quantity + delta } : l))
          .filter((l) => l.quantity > 0);
        return { ...t, items, sentKds: false };
      }),
    [mutateActive],
  );

  const setChannel = useCallback(
    (c: FulfillmentType) =>
      mutateActive((t) => ({
        ...t,
        channel: c,
        covers: c === "dine-in" && t.covers == null ? 2 : t.covers,
      })),
    [mutateActive],
  );

  const togglePark = useCallback(
    () => mutateActive((t) => ({ ...t, status: t.status === "parked" ? "open" : "parked" })),
    [mutateActive],
  );

  const assignTable = useCallback(
    (tableId: string | null) => mutateActive((t) => ({ ...t, tableId: tableId ?? undefined })),
    [mutateActive],
  );

  const changeCovers = useCallback(
    (delta: number) => {
      const t = getActive();
      if (!t) return;
      const next = Math.max(1, Math.min(50, (t.covers ?? 2) + delta));
      mutateActive((x) => ({ ...x, covers: next }));
      // Flag the moment the party outgrows the seats the assigned table has.
      const table = tableById(t.tableId);
      if (delta > 0 && table && table.seats < next) {
        toast(`Table ${table.number} seats ${table.seats} — party of ${next} may not fit`);
      }
    },
    [getActive, mutateActive, tableById, toast],
  );

  const setAddress = useCallback(
    (addr: string) => mutateActive((t) => ({ ...t, address: addr.trim() || undefined })),
    [mutateActive],
  );

  const setName = useCallback(
    (name: string) => mutateActive((t) => ({ ...t, name: name.slice(0, 40) || "Tab" })),
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
      /* offline — the New tab button is a no-op until the network returns */
    }
  }, [pageLoc]);

  // --- Send to KDS / charge ------------------------------------------------
  const [busyTabId, setBusyTabId] = useState<string | null>(null);

  const sendKds = useCallback(async () => {
    const t = getActive();
    if (!t || t.items.length === 0 || busyTabId) return;
    if (!t.channel) {
      toast("Pick a channel first");
      return;
    }
    setBusyTabId(t.id);
    try {
      const res = await fetch(`/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId: t.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast((data as { error?: string }).error || "Could not send to KDS");
        return;
      }
      setTabs((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? { ...x, sentKds: true, status: "pay", orderId: (data as { orderId?: string }).orderId }
            : x,
        ),
      );
      toast(`Sent to KDS · #${t.id}`);
    } finally {
      setBusyTabId(null);
    }
  }, [getActive, busyTabId, pageLoc, toast]);

  const [tenderOpen, setTenderOpen] = useState(false);
  const openTender = useCallback(() => {
    const t = getActive();
    if (!t || t.items.length === 0) return;
    if (!t.channel) {
      toast("Pick a channel first");
      return;
    }
    setTenderOpen(true);
  }, [getActive, toast]);

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
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast((data as { error?: string }).error || "Could not take payment");
          return;
        }
        const amt = (data as { totalAmount?: number }).totalAmount ?? grandG(t);
        const left = tabs.filter((x) => x.id !== t.id);
        setTabs(left);
        setActiveTabId(left[0]?.id ?? null);
        toast(`Paid ✓ #${t.id} · ${method} · ${fmtPLN(amt)}`);
      } finally {
        setBusyTabId(null);
      }
    },
    // grandG is intentionally omitted — it's only a display fallback for the
    // toast (the server returns the authoritative paid total).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getActive, busyTabId, pageLoc, toast, tabs],
  );

  // --- Pricing (real menu + real combo discount) ---------------------------
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
  const comboOf = useCallback(
    (t: PosTab) => getActiveComboDeals(cartOf(t), config, t.channel ?? undefined),
    [cartOf, config],
  );
  const subtotalG = useCallback(
    (t: PosTab) => cartOf(t).reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0),
    [cartOf],
  );
  const discountG = useCallback(
    (t: PosTab) => {
      const c = comboOf(t);
      return c.isComplete ? c.savings : 0;
    },
    [comboOf],
  );
  const grandG = useCallback((t: PosTab) => Math.max(0, subtotalG(t) - discountG(t)), [subtotalG, discountG]);
  const itemCount = (t: PosTab) => t.items.reduce((s, l) => s + l.quantity, 0);

  // --- Steering feed (real: server analyzeTruck over live orders) ----------
  const [steer, setSteer] = useState(true);
  const [steerPlan, setSteerPlan] = useState<SteerPlan | null>(null);
  const [windowMin, setWindowMin] = useState(15);

  useEffect(() => {
    if (!steer || !pageLoc) {
      setSteerPlan(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/pace/steering?location=${encodeURIComponent(pageLoc)}`);
        if (!res.ok) return;
        const data: SteerResponse = await res.json();
        if (cancelled) return;
        setSteerPlan(data.plan ?? null);
        if (data.paceWindowMin) setWindowMin(data.paceWindowMin);
      } catch {
        /* non-fatal — the board just shows no steering hints */
      }
    };
    void load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [steer, pageLoc]);

  // Load tables for the active truck up front (small list) and refresh on every
  // location change — so a table added on the Floor page shows up here, and the
  // picker never opens against a stale/empty cache.
  useEffect(() => {
    void fetchTables();
  }, [fetchTables]);

  // --- Overlays ------------------------------------------------------------
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrDraft, setAddrDraft] = useState("");

  // --- Fullscreen kiosk ----------------------------------------------------
  const [kiosk, setKiosk] = useState(false);
  const enterKiosk = useCallback(() => {
    setKiosk(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  const exitKiosk = useCallback(() => {
    setKiosk(false);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setKiosk(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // --- Clock ---------------------------------------------------------------
  const [clock, setClock] = useState("--:--:--");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setClock(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // --- Keyboard ------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTenderOpen(false);
        setTablePickerOpen(false);
        setAddrOpen(false);
        return;
      }
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        void newTab();
        return;
      }
      if (k === "f") {
        e.preventDefault();
        if (kiosk) exitKiosk();
        else enterKiosk();
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (tabs[idx]) setActiveTabId(tabs[idx].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabs, newTab, kiosk, enterKiosk, exitKiosk]);

  // --- Derived for render --------------------------------------------------
  const active = getActive();
  const locName =
    activeLocations.find((l) => l.slug === pageLoc)?.city ?? pageLoc;

  const railSummary = useMemo(() => {
    const pay = tabs.filter((t) => t.status === "pay").length;
    const parked = tabs.filter((t) => t.status === "parked").length;
    const openValue = tabs.reduce((s, t) => s + grandG(t), 0);
    return { count: tabs.length, pay, parked, openValue };
  }, [tabs, grandG]);

  // Complete a combo from an offer / strip pill: add only what the check is
  // missing so the (real) discount in getActiveComboDeals fires.
  const completeCombo = useCallback(
    (deal: { categories: MenuCategory[]; requiredItems?: { suffix: string }[] }) => {
      const t = getActive();
      if (!t) return;
      const have = (pred: (m: MenuItem) => boolean) =>
        t.items.some((l) => {
          const m = byId(l.menuItemId);
          return !!m && pred(m);
        });
      if (deal.requiredItems?.length) {
        for (const r of deal.requiredItems) {
          if (have((m) => m.id.endsWith(r.suffix))) continue;
          const m = menu.find((x) => x.available && x.id.endsWith(r.suffix));
          if (m) addLine(m.id);
        }
      } else {
        for (const cat of deal.categories) {
          if (have((m) => m.category === cat)) continue;
          const m = menu
            .filter((x) => x.available && x.category === cat)
            .sort((a, b) => a.price - b.price)[0];
          if (m) addLine(m.id);
        }
      }
    },
    [getActive, byId, menu, addLine],
  );

  const offers = useMemo<Offer[]>(() => {
    if (!active || active.items.length === 0) return [];
    const out: Offer[] = [];
    const combo = comboOf(active);
    if (
      combo.activeDeal &&
      !combo.isComplete &&
      combo.savings > 0 &&
      (combo.missingItems.length > 0 || combo.missingCategories.length > 0)
    ) {
      const addLabel = combo.missingItems.length
        ? combo.missingItems.join(" + ")
        : combo.missingCategories.map((c) => MENU_CATEGORY_LABELS[c]).join(" + ");
      const deal = combo.activeDeal;
      out.push({
        kind: "combo",
        title: `Make it the ${deal.name}`,
        sub: `Add ${addLabel} — save ${fmtPLN(combo.savings)}`,
        cta: `−${fmtPLN(combo.savings)}`,
        apply: () => completeCombo(deal),
      });
    }
    const sugg = getCartSuggestions(cartOf(active), menu, 4, config).filter(
      (s) => !active.items.some((l) => l.menuItemId === s.item.id),
    );
    for (const s of sugg) {
      out.push({
        kind: "add",
        title: `Add ${s.item.name}`,
        sub: s.reason,
        cta: `+ ${fmtPLN(s.item.price)}`,
        apply: () => addLine(s.item.id),
      });
    }
    return out.slice(0, 3);
  }, [active, comboOf, cartOf, menu, config, addLine, completeCombo]);

  // Steering helpers for the active tab.
  const bottleneckCat = steer && steerPlan?.active ? steerPlan.bottleneck?.id ?? null : null;
  const tabPromise = useMemo(() => {
    if (!steer || !steerPlan || !active || active.items.length === 0) return null;
    const cats = new Set<MenuCategory>();
    for (const l of active.items) {
      const m = byId(l.menuItemId);
      if (m) cats.add(m.category);
    }
    let maxSec = 0;
    let maxCat: MenuCategory | null = null;
    for (const c of cats) {
      const s = steerPlan.promiseSecondsByCategory[c] ?? 0;
      if (s > maxSec) {
        maxSec = s;
        maxCat = c;
      }
    }
    const tier: PaceTier =
      steerPlan.active && steerPlan.bottleneck?.id === maxCat ? steerPlan.bottleneck.tier : "calm";
    return { sec: maxSec, tier };
  }, [steer, steerPlan, active, byId]);

  const deliveryPaused =
    steer &&
    steerPlan?.active &&
    active?.channel === "delivery" &&
    steerPlan.deliveryCapNextWindow === 0;

  // Dine-in seating signals for the active check: the assigned table, whether
  // another open check is already on it (conflict), and whether the party
  // outgrows the table's seats (over capacity). Both are soft — staff can still
  // seat — but they're surfaced so nothing is silently wrong.
  const activeCovers = active?.covers ?? 2;
  const activeTable = active?.tableId ? tableById(active.tableId) : undefined;
  const activeTableConflict =
    !!active && active.channel === "dine-in" && !!active.tableId && tabsOnTable(active.tableId, active.id).length > 0;
  const activeOverCapacity =
    !!activeTable && active?.channel === "dine-in" && activeTable.seats < activeCovers;

  const handlePickTable = useCallback(
    (id: string | null) => {
      setTablePickerOpen(false);
      assignTable(id);
      const t = getActive();
      if (id == null || !t) return;
      const table = tableById(id);
      const notes: string[] = [];
      if (tabsOnTable(id, t.id).length > 0) notes.push(`also on another open check`);
      if (table && table.seats < (t.covers ?? 2)) {
        notes.push(`seats ${table.seats} for a party of ${t.covers ?? 2}`);
      }
      toast(
        notes.length
          ? `Table ${table?.number} — ${notes.join(" · ")}`
          : `Seated at table ${table?.number}`,
      );
    },
    [assignTable, getActive, tableById, tabsOnTable, toast],
  );

  const locOptions = locationKeys.map((slug) => ({
    slug,
    label: activeLocations.find((l) => l.slug === slug)?.city ?? slug,
  }));

  const page = (
    <div className={`pos-tabs${kiosk ? " is-fullscreen" : ""}`}>
      {/* Header */}
      <header className="pos-header">
        <div className="pos-brand">
          <span className="pos-wordmark">SUD ITALIA</span>
          <span className="pos-kd-label">Point of Sale · {locName}</span>
        </div>
        <div className="pos-ctl">
          <span className="pos-ctl-lbl">Loc</span>
          <div className="pos-seg-group" role="group" aria-label="Location">
            {locOptions.map((o) => (
              <button
                key={o.slug}
                type="button"
                className="pos-seg"
                aria-pressed={o.slug === pageLoc}
                onClick={() => setPageLoc(o.slug)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="pos-ctl">
          <span className="pos-ctl-lbl">Channel</span>
          <div className="pos-seg-group" role="group" aria-label="Channel">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                className="pos-seg"
                aria-pressed={!!active && active.channel === c.value}
                disabled={!active}
                onClick={() => setChannel(c.value)}
              >
                {c.icon}
                <span>{c.label}</span>
              </button>
            ))}
          </div>
          {deliveryPaused && (
            <span className="pos-chan-paused">
              <span className="pos-cp-dot" /> Delivery intake paused
            </span>
          )}
        </div>
        <div className="pos-spacer" />
        <button
          type="button"
          className="pos-steer-chip"
          aria-pressed={steer}
          onClick={() => setSteer((s) => !s)}
          title="Toggle Pace → POS steering"
        >
          <span className="pos-sc-dot" />
          <Gauge />
          <span>Steer</span>
        </button>
        <button
          type="button"
          className="pos-fsbtn"
          aria-pressed={kiosk}
          onClick={kiosk ? exitKiosk : enterKiosk}
          title={kiosk ? "Exit fullscreen (Esc)" : "Fullscreen"}
        >
          {kiosk ? <Minimize2 /> : <Maximize2 />}
          <span>{kiosk ? "Exit" : "Fullscreen"}</span>
        </button>
        <div className="pos-clock tnum">{clock}</div>
      </header>

      {/* Tab rail */}
      <section className="pos-tabrail" aria-label="Open checks">
        <div className="pos-tr-eyebrow">
          <span className="pos-tr-brandline">
            <MapPin /> Open checks
          </span>
          <span className="pos-tr-sep" />
          <span className="pos-tr-summary">
            <b>{railSummary.count}</b> tabs<span className="pos-pipe">·</span>
            <b>{railSummary.pay}</b> ready to pay<span className="pos-pipe">·</span>
            <b>{railSummary.parked}</b> parked<span className="pos-pipe">·</span>open value{" "}
            <b>{fmtPLN(railSummary.openValue)}</b>
          </span>
        </div>
        <div className="pos-tabrail-scroll">
          {tabs.map((t) => {
            const cnt = itemCount(t);
            const railTable = t.channel === "dine-in" && t.tableId ? tableById(t.tableId) : undefined;
            const clash =
              (t.channel === "dine-in" && !!t.tableId && tabsOnTable(t.tableId, t.id).length > 0) ||
              (!!railTable && railTable.seats < (t.covers ?? 2));
            const tableNo = railTable?.number;
            return (
              <button
                key={t.id}
                type="button"
                className={`pos-tab ${t.status} ${CHAN_CLASS(t.channel)}${
                  t.id === activeTabId ? " active" : ""
                }${t.status === "pay" ? " pay" : ""}`}
                onClick={() => setActiveTabId(t.id)}
              >
                <div className="pos-tab-top">
                  <span className="pos-tab-dot" />
                  <span className="pos-tab-name">{t.name}</span>
                  {t.channel && <span className="pos-tab-chan">{CHAN_BY_VALUE.get(t.channel)?.icon}</span>}
                </div>
                <div className="pos-tab-meta">
                  <span className="pos-tab-id tnum">#{t.id}</span>
                  {t.channel === "dine-in" && t.tableId && (
                    <span className={`pos-tab-table${clash ? " conflict" : ""}`}>
                      {tableNo ? `T${tableNo}` : "Table"}
                      {t.covers ? ` · ${t.covers}` : ""}
                      {clash ? " ⚠" : ""}
                    </span>
                  )}
                  {t.channel === "delivery" && t.address && (
                    <span className="pos-tab-addr" title={t.address}>
                      <MapPin />
                    </span>
                  )}
                  <span className="pos-tab-status">{STATUS_LABEL[t.status]}</span>
                </div>
                <div className="pos-tab-foot">
                  <span className="pos-tab-items">
                    <Receipt />
                    <span className="tnum">{cnt}</span> item{cnt !== 1 ? "s" : ""}
                  </span>
                  <span className="pos-tab-total tnum">{fmtPLN(grandG(t))}</span>
                </div>
              </button>
            );
          })}
          <button type="button" className="pos-tab-new" onClick={() => void newTab()}>
            <Plus />
            New tab
          </button>
        </div>
      </section>

      {/* Editor */}
      {tabs.length === 0 ? (
        <div className="pos-editor">
          <div className="pos-empty-editor">
            <span className="pos-ee-emoji">🍕</span>
            <span className="pos-ee-text">
              {hydrated ? "No open checks — the window is clear." : "Loading open checks…"}
            </span>
            <button type="button" className="pos-ee-btn" onClick={() => void newTab()}>
              + Start a new tab
            </button>
          </div>
        </div>
      ) : (
        <div className="pos-editor">
          {/* LEFT — products */}
          <div className="pos-products">
            <ComboStrip config={config} channel={active?.channel ?? null} onAdd={completeCombo} />
            <div className="pos-cats" role="group" aria-label="Category filter">
              <CatChip
                label="All"
                emoji="🗂️"
                isActive={activeCat === "all"}
                onClick={() => setActiveCat("all")}
              />
              {presentCats.map((c) => (
                <CatChip
                  key={c}
                  label={MENU_CATEGORY_LABELS[c]}
                  emoji={CAT_EMOJI[c]}
                  isActive={activeCat === c}
                  promiseSec={steer && steerPlan ? steerPlan.promiseSecondsByCategory[c] : undefined}
                  onClick={() => setActiveCat(c)}
                />
              ))}
            </div>
            {steer && (
              <SteerStrip plan={steerPlan} windowMin={windowMin} />
            )}
            <div className="pos-grid-scroll">
              <ProductGrid
                menu={menu}
                activeCat={activeCat}
                steerPlan={steer ? steerPlan : null}
                bottleneckCat={bottleneckCat}
                onAdd={addLine}
              />
            </div>
          </div>

          {/* RIGHT — ticket */}
          <div className="pos-ticket">
            <div className="pos-ticket-head">
              <div className="pos-th-row1">
                <span className={`pos-th-dot ${active?.status ?? ""}`} />
                <input
                  className="pos-th-name"
                  value={active?.name ?? ""}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Tab name"
                  spellCheck={false}
                />
                <span className="pos-th-id tnum">{active ? `#${active.id}` : ""}</span>
                <span className="pos-th-chan">
                  {active?.channel && CHAN_BY_VALUE.get(active.channel)?.icon}
                  {CHAN_LABEL(active?.channel ?? null)} · {active ? STATUS_LABEL[active.status] : ""}
                </span>
                {tabPromise && (
                  <span className={`pos-th-promise${tabPromise.tier !== "calm" ? ` tier-${tabPromise.tier}` : ""}`}>
                    <Clock /> ready {promiseLabel(tabPromise.sec)}
                  </span>
                )}
              </div>

              <div className={`pos-th-channel${active && !active.channel ? " req" : ""}`} role="group" aria-label="Channel">
                {CHANNELS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className="pos-th-chan-btn"
                    aria-pressed={!!active && active.channel === c.value}
                    onClick={() => setChannel(c.value)}
                  >
                    {c.icon}
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
              {active && !active.channel && (
                <span className="pos-th-chan-req">
                  <i /> Choose a channel to send or charge this order
                </span>
              )}

              {(active?.channel === "dine-in" || active?.channel === "delivery") && (
                <div className="pos-th-detail">
                  {active.channel === "dine-in" && (
                    <>
                      <button
                        type="button"
                        className={`pos-detail-btn${
                          active.tableId && !activeTableConflict && !activeOverCapacity ? " assigned" : ""
                        }${activeTableConflict || activeOverCapacity ? " conflict" : ""}`}
                        title={
                          activeTableConflict
                            ? "Another open check is already on this table"
                            : activeOverCapacity
                              ? `Table seats ${activeTable?.seats} — party of ${activeCovers}`
                              : ""
                        }
                        onClick={() => {
                          void fetchTables();
                          setTablePickerOpen(true);
                        }}
                      >
                        <Armchair />
                        <span>
                          {activeTable
                            ? `Table ${activeTable.number}${activeTableConflict || activeOverCapacity ? " ⚠" : ""}`
                            : "Assign table"}
                        </span>
                      </button>
                      <div className="pos-covers">
                        <span className="pos-cov-ic" title="Covers">
                          <Users />
                        </span>
                        <button type="button" className="pos-cov-btn" onClick={() => changeCovers(-1)} aria-label="Fewer covers">
                          −
                        </button>
                        <span className="pos-cov-n tnum">{active.covers ?? 2}</span>
                        <button type="button" className="pos-cov-btn" onClick={() => changeCovers(1)} aria-label="More covers">
                          +
                        </button>
                      </div>
                    </>
                  )}
                  {active.channel === "delivery" && (
                    <button
                      type="button"
                      className={`pos-detail-btn${active.address ? " assigned" : ""}`}
                      title={active.address || ""}
                      onClick={() => {
                        setAddrDraft(active.address || "");
                        setAddrOpen(true);
                      }}
                    >
                      <MapPin />
                      <span>{active.address || "Add delivery address"}</span>
                    </button>
                  )}
                </div>
              )}

              <div className="pos-th-actions">
                <button
                  type="button"
                  className={`pos-mini-btn park${active?.status === "parked" ? " is-parked" : ""}`}
                  onClick={togglePark}
                >
                  <ParkingSquare />
                  <span>{active?.status === "parked" ? "Resume" : "Park"}</span>
                </button>
                <button
                  type="button"
                  className={`pos-mini-btn kds${active?.sentKds ? " sent" : ""}`}
                  disabled={!active || active.items.length === 0 || busyTabId === active?.id}
                  onClick={() => void sendKds()}
                >
                  <Send />
                  <span>{active?.sentKds ? "Sent ✓" : "Send to KDS"}</span>
                </button>
              </div>
            </div>

            <div className="pos-ticket-inner">
              <div className="pos-lines">
                {!active || active.items.length === 0 ? (
                  <div className="pos-empty-ticket">
                    <span className="pos-e-emoji">🧾</span>
                    <span className="pos-e-text">
                      {active ? `${active.name} is empty` : "No tab selected"}
                    </span>
                    <span className="pos-e-sub">Tap a product or combo to add it to this check.</span>
                  </div>
                ) : (
                  <>
                    {active.items.map((l) => {
                      const m = byId(l.menuItemId);
                      if (!m) return null;
                      return (
                        <div key={m.id} className="pos-line">
                          <div className="pos-line-body">
                            <div className="pos-line-name">{m.name}</div>
                            <div className="pos-line-each tnum">{fmtPLN(m.price)} each</div>
                          </div>
                          <div className="pos-stepper">
                            <button type="button" className="pos-step-btn" onClick={() => changeQty(m.id, -1)} aria-label="Decrease">
                              −
                            </button>
                            <span className="pos-step-q tnum">{l.quantity}</span>
                            <button type="button" className="pos-step-btn" onClick={() => changeQty(m.id, 1)} aria-label="Increase">
                              +
                            </button>
                          </div>
                          <span className="pos-line-total tnum">{fmtPLN(m.price * l.quantity)}</span>
                        </div>
                      );
                    })}
                    {active && discountG(active) > 0 && (
                      <div className="pos-combo-applied">
                        <span className="pos-ca-name">✓ {comboOf(active).activeDeal?.name}</span>
                        <span className="pos-ca-off tnum">−{fmtPLN(discountG(active))}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {offers.length > 0 && (
                <div className="pos-ai-offers">
                  <div className="pos-ai-card">
                    <div className="pos-ai-head">
                      <span className="pos-ai-badge">
                        <Sparkles /> AI
                      </span>
                      <span className="pos-ai-title">Best offers for this order</span>
                      <span className="pos-ai-hint">live</span>
                    </div>
                    <div className="pos-ai-list">
                      {offers.map((o, i) => (
                        <button key={i} type="button" className="pos-ai-offer" onClick={o.apply}>
                          <span className="pos-ai-of-main">
                            <span className="pos-ai-of-title">{o.title}</span>
                            <span className="pos-ai-of-sub">{o.sub}</span>
                          </span>
                          <span className={`pos-ai-of-cta ${o.kind}`}>{o.cta}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="pos-totals">
                <div className="pos-trow">
                  <span>Subtotal</span>
                  <span className="pos-tv tnum">{fmtPLN(active ? subtotalG(active) : 0)}</span>
                </div>
                {active && discountG(active) > 0 && (
                  <div className="pos-trow discount">
                    <span>Combo discount · {comboOf(active).activeDeal?.name}</span>
                    <span className="pos-tv tnum">−{fmtPLN(discountG(active))}</span>
                  </div>
                )}
                <div className="pos-trow grand">
                  <span>Total</span>
                  <span className="pos-tv tnum">{fmtPLN(active ? grandG(active) : 0)}</span>
                </div>
              </div>

              <div className="pos-charge-area">
                <button
                  type="button"
                  className="pos-btn"
                  disabled={!active || active.items.length === 0 || !active.channel || busyTabId === active?.id}
                  onClick={openTender}
                >
                  <CreditCard />
                  <span>
                    {active && active.items.length > 0 && !active.channel
                      ? "Select a channel"
                      : `Charge ${fmtPLN(active ? grandG(active) : 0)}`}
                  </span>
                </button>
              </div>

              {/* Tender overlay */}
              <div className={`pos-overlay${tenderOpen ? " open" : ""}`}>
                <div className="pos-tender-sheet">
                  <div className="pos-tender-head">
                    <span className="pos-te-title">Take payment</span>
                    <span className="pos-te-amt tnum">{fmtPLN(active ? grandG(active) : 0)}</span>
                  </div>
                  <div className="pos-tender-opts">
                    <button type="button" className="pos-tender-opt" onClick={() => void pay("Cash")}>
                      <Banknote />
                      Cash
                    </button>
                    <button type="button" className="pos-tender-opt" onClick={() => void pay("Card")}>
                      <CreditCard />
                      Card
                    </button>
                  </div>
                  <button type="button" className="pos-tender-cancel" onClick={() => setTenderOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>

              {toastMsg && (
                <div className="pos-toast show">
                  <Check /> {toastMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="pos-footer">
        <div className="pos-legend">
          <span>
            <i style={{ background: "var(--pos-firing)" }} />
            Takeout
          </span>
          <span>
            <i style={{ background: "var(--pos-warn)" }} />
            Delivery
          </span>
          <span>
            <i style={{ background: "var(--pos-risk)" }} />
            Dine-in
          </span>
          <span>
            <i style={{ background: "var(--pos-faint)" }} />
            No channel
          </span>
        </div>
        <div className="pos-kbd-hint">
          <span className="pos-kbd">N</span> new · <span className="pos-kbd">1</span>–
          <span className="pos-kbd">9</span> switch · <span className="pos-kbd">F</span> fullscreen ·{" "}
          <span className="pos-kbd">Esc</span> cancel
        </div>
      </footer>

      {/* Assign-table + delivery-address use the standard admin Dialog (portaled
          to document.body) — not the dark POS chrome — so they read as normal
          admin modals. */}
      <Dialog
        open={tablePickerOpen}
        onClose={() => setTablePickerOpen(false)}
        size="md"
        title="Assign a table"
        description={`Party of ${activeCovers}. Tables already on another open check, or with fewer seats than the party, are flagged — you can still seat there.`}
        footer={
          <>
            {active?.tableId && (
              <Button variant="ghost" onClick={() => handlePickTable(null)}>
                Clear table
              </Button>
            )}
            <Button
              variant="ghost"
              leadingIcon={<RefreshCw className={tablesLoading ? "v2-spin" : undefined} />}
              onClick={() => void fetchTables()}
            >
              Refresh
            </Button>
            <Button variant="secondary" onClick={() => setTablePickerOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        {tables.length === 0 ? (
          <EmptyState
            compact
            icon={Armchair}
            title={tablesLoading ? "Loading tables…" : `No tables for ${locName}`}
            description={
              tablesLoading
                ? undefined
                : `This truck has no floor tables yet. Add them on the Floor page (make sure it's set to ${locName}), then Refresh.`
            }
          />
        ) : (
          <div className="v2-pos-tables">
            {tables.map((t) => {
              const taken = active ? tabsOnTable(t.id, active.id).length > 0 : false;
              const tooSmall = t.seats < activeCovers;
              const sel = active?.tableId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`v2-pos-table${sel ? " is-selected" : ""}`}
                  onClick={() => handlePickTable(t.id)}
                >
                  <div className="v2-pos-table-top">
                    <span className="v2-pos-table-num">T{t.number}</span>
                    {sel && (
                      <Badge tone="brand" variant="soft">
                        Selected
                      </Badge>
                    )}
                  </div>
                  <span className="v2-pos-table-meta v2-muted">
                    {t.seats} seat{t.seats === 1 ? "" : "s"}
                    {t.zone ? ` · ${t.zone}` : ""}
                  </span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Badge tone={TABLE_STATUS_TONE[t.status]} variant="soft" dot>
                      {t.status}
                    </Badge>
                    {taken && (
                      <Badge tone="warning" variant="soft">
                        In use
                      </Badge>
                    )}
                    {tooSmall && (
                      <Badge tone="warning" variant="soft">
                        Seats {t.seats} &lt; {activeCovers}
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Dialog>

      <Dialog
        open={addrOpen}
        onClose={() => setAddrOpen(false)}
        size="md"
        title="Delivery address"
        description={active ? `Open check #${active.id}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddrDraft("")}>
              Clear
            </Button>
            <Button variant="secondary" onClick={() => setAddrOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setAddress(addrDraft);
                setAddrOpen(false);
                if (addrDraft.trim()) toast("Address saved");
              }}
            >
              Save address
            </Button>
          </>
        }
      >
        <textarea
          className="v2-input"
          style={{ minHeight: 110, resize: "vertical", width: "100%" }}
          rows={4}
          value={addrDraft}
          onChange={(e) => setAddrDraft(e.target.value)}
          placeholder="Street & number, flat / buzzer, city — plus any note for the driver"
        />
      </Dialog>
    </div>
  );

  // Kiosk renders through a portal to document.body so the edge-to-edge POS
  // escapes the admin shell's stacking context (CLAUDE.md rule #4); the subtree
  // stays mounted, so tab state, timers and the steering feed keep running.
  return kiosk ? createPortal(page, document.body) : page;
}

// ---- product grid + chips ----------------------------------------------

function CatChip({
  label,
  emoji,
  isActive,
  promiseSec,
  onClick,
}: {
  label: string;
  emoji: string;
  active?: boolean;
  isActive: boolean;
  promiseSec?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className="pos-chip" aria-pressed={isActive} onClick={onClick}>
      <span className="pos-cemoji">{emoji}</span>
      <span>{label}</span>
      {promiseSec != null && promiseSec > 0 && (
        <span className="pos-cprom">· {promiseLabel(promiseSec)}</span>
      )}
    </button>
  );
}

function ProductCard({
  m,
  steerPlan,
  isBottleCat,
  onAdd,
}: {
  m: MenuItem;
  steerPlan: SteerPlan | null;
  isBottleCat: boolean;
  onAdd: (id: string) => void;
}) {
  const role = m.menuRole ? ROLE_BADGE[m.menuRole] : undefined;
  let eased = false;
  let makeNow = false;
  if (steerPlan?.active) {
    if (isBottleCat && steerPlan.throttle.includes(m.id)) eased = true;
    else if (!isBottleCat && steerPlan.makeNow.includes(m.id)) makeNow = true;
  }
  return (
    <button type="button" className={`pos-card${eased ? " eased" : ""}`} onClick={() => onAdd(m.id)}>
      {makeNow && <span className="pos-makenow">★ Make now</span>}
      {eased && <span className="pos-easetag">▼ ease</span>}
      <div className="pos-card-top">
        <span className="pos-card-emoji">{CAT_EMOJI[m.category]}</span>
        {role && (
          <span className={`pos-role-badge ${role.cls}`}>
            {role.label}
            {m.isLimited && <span className="pos-lto-dot" />}
          </span>
        )}
        {!role && m.isLimited && <span className="pos-lto-dot" />}
      </div>
      <span className="pos-card-name">{m.name}</span>
      {m.tags.length > 0 && (
        <div className="pos-card-tags">
          {m.tags.map((t) => (
            <span key={t} className={`pos-tag ${TAG_CLS[t]}`}>
              {TAG_LABEL[t]}
            </span>
          ))}
        </div>
      )}
      <span className="pos-card-price tnum">{fmtPLN(m.price)}</span>
    </button>
  );
}

function ProductGrid({
  menu,
  activeCat,
  steerPlan,
  bottleneckCat,
  onAdd,
}: {
  menu: MenuItem[];
  activeCat: MenuCategory | "all";
  steerPlan: SteerPlan | null;
  bottleneckCat: MenuCategory | null;
  onAdd: (id: string) => void;
}) {
  const sellable = menu.filter((m) => m.available);
  if (activeCat === "all") {
    return (
      <div className="pos-grid grouped">
        {CAT_ORDER.map((cat) => {
          const items = sellable.filter((m) => m.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat} className="pos-grid-group">
              <h3 className="pos-grid-group-head">
                <span className="pos-cemoji">{CAT_EMOJI[cat]}</span>
                {MENU_CATEGORY_LABELS[cat]}
                <span className="pos-ggh-n tnum">{items.length}</span>
              </h3>
              <div className="pos-grid-sub">
                {items.map((m) => (
                  <ProductCard
                    key={m.id}
                    m={m}
                    steerPlan={steerPlan}
                    isBottleCat={bottleneckCat === cat}
                    onAdd={onAdd}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }
  const items = sellable.filter((m) => m.category === activeCat);
  return (
    <div className="pos-grid">
      {items.map((m) => (
        <ProductCard
          key={m.id}
          m={m}
          steerPlan={steerPlan}
          isBottleCat={bottleneckCat === activeCat}
          onAdd={onAdd}
        />
      ))}
    </div>
  );
}

function ComboStrip({
  config,
  channel,
  onAdd,
}: {
  config: UpsellConfig | null;
  channel: FulfillmentType | null;
  onAdd: (deal: { categories: MenuCategory[]; requiredItems?: { suffix: string }[] }) => void;
}) {
  // Combos are config-driven (admin /admin/crosssell) and fall back to the
  // platform defaults. We show the deals available for the active channel; the
  // discount itself is computed on the live cart by getActiveComboDeals.
  const combos = useMemo(() => {
    // The strip lists the deals available for the active channel; the discount
    // itself is computed on the live cart by getActiveComboDeals in the ticket.
    const list = config?.combos?.filter((c) => c.active) ?? DEFAULT_STRIP_COMBOS;
    return list.filter((c) => {
      if (!c.channel) return true;
      if (!channel) return true;
      if (c.channel === "delivery") return channel === "delivery";
      return channel !== "delivery";
    });
  }, [config, channel]);

  if (combos.length === 0) return null;
  return (
    <div className="pos-combo-strip">
      <span className="pos-cs-lbl">Combos</span>
      {combos.map((c) => (
        <button
          key={c.id}
          type="button"
          className="pos-combo-pill"
          title={c.description}
          onClick={() =>
            onAdd({
              categories: c.categories as MenuCategory[],
              requiredItems: c.requiredItems,
            })
          }
        >
          <span>{c.name}</span>
          <span className="pos-cp-off tnum">−{c.discountPercent}%</span>
        </button>
      ))}
    </div>
  );
}

function SteerStrip({ plan, windowMin }: { plan: SteerPlan | null; windowMin: number }) {
  if (!plan) {
    return (
      <div className="pos-steer-strip">
        <span className="pos-ss-badge">
          <span className="pos-ss-dot" style={{ animation: "none" }} />✓ Line steady
        </span>
        <span className="pos-ss-reason">Live promise times update as the kitchen fills.</span>
      </div>
    );
  }
  if (!plan.active || !plan.bottleneck) {
    return (
      <div className="pos-steer-strip">
        <span className="pos-ss-badge">
          <span className="pos-ss-dot" style={{ animation: "none" }} />✓ Line clear
        </span>
        <span className="pos-ss-reason">
          All stations within capacity — normal menu, honest promise times live.
        </span>
      </div>
    );
  }
  const tier = plan.bottleneck.tier;
  const pct = Number.isFinite(plan.bottleneck.util) ? Math.round(plan.bottleneck.util * 100) : 999;
  const cap = plan.deliveryCapNextWindow ?? 0;
  return (
    <div className={`pos-steer-strip tier-${tier}`}>
      <span className="pos-ss-badge">
        <span className="pos-ss-dot" />
        {CAT_EMOJI[plan.bottleneck.id]} {plan.bottleneck.label} <span className="pos-ss-util">{pct}%</span>
      </span>
      <span className="pos-ss-reason">{plan.reason}</span>
      <span className={`pos-ss-cap${cap === 0 ? " zero" : ""}`}>
        cap {cap}/{windowMin}m
      </span>
    </div>
  );
}

// Fallback combo strip labels when no admin config exists (mirrors
// DEFAULT_COMBO_DEALS in upsell.ts so the strip is never empty on a fresh
// install). Channel filtering still applies.
const DEFAULT_STRIP_COMBOS = [
  {
    id: "italian-classic",
    name: "Italian Classic Deal",
    description: "Margherita + Limonata + Tiramisù",
    categories: ["pizza", "drinks", "desserts"],
    discountPercent: 10,
    minItems: 3,
    active: true,
    requiredItems: [
      { suffix: "pizza-margherita", label: "Margherita" },
      { suffix: "drink-limonata", label: "Limonata" },
      { suffix: "dessert-tiramisu", label: "Tiramisù" },
    ],
  },
  {
    id: "pasta-combo",
    name: "Pasta Combo",
    description: "Any pasta + drink",
    categories: ["pasta", "drinks"],
    discountPercent: 10,
    minItems: 2,
    active: true,
  },
  {
    id: "pizza-side",
    name: "Pizza & Side",
    description: "Any pizza + garlic bread",
    categories: ["pizza", "antipasti"],
    discountPercent: 12,
    minItems: 2,
    active: true,
    requiredItems: [{ suffix: "anti-garlic-bread", label: "Garlic Bread" }],
  },
] as NonNullable<UpsellConfig["combos"]>;
