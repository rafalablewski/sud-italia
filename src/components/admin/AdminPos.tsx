"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CoreShell } from "./core/CoreShell";
import {
  Armchair,
  Banknote,
  Check,
  CreditCard,
  Flame,
  MapPin,
  Maximize2,
  Minimize2,
  ParkingSquare,
  Plus,
  RefreshCw,
  Send,
  ShoppingBag,
  Sparkles,
  Truck,
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
import {
  POS_COURSE_ORDER,
  POS_COURSE_LABELS,
  courseOf,
  defaultCourseForCategory,
} from "@/lib/pos-coursing";
import type { CartItem, PosCourse } from "@/data/types";
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

  // Live tab sync — poll the store so checks opened/closed/edited on another
  // till (or the same operator's other device) appear without a manual refresh.
  // Skipped while a local edit is mid-debounce so an in-flight check is never
  // clobbered by a stale server snapshot.
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
        /* non-fatal — next tick retries */
      }
    }, 5000);
    return () => clearInterval(id);
  }, [pageLoc]);

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
  // Cancel any pending debounced writes on unmount so they can't fire after the
  // component is gone (and leak timers).
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
        // Write to the tab's OWN location, not the page's current one — a fast
        // location switch mid-debounce must not redirect the write elsewhere.
        void fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(tab.locationSlug)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: tab.id,
            name: tab.name,
            channel: tab.channel,
            status: tab.status,
            items: tab.items,
            // Send an explicit null when a table/address is cleared — undefined
            // is dropped by JSON.stringify, which made the server keep the old
            // value and the 5 s poll snap it back on screen.
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
          // Land the line in its default course (by category) so dine-in
          // coursing rarely needs a manual re-course.
          const cat = byId(id)?.category;
          items.push({ menuItemId: id, quantity: 1, course: cat ? defaultCourseForCategory(cat) : "main" });
        }
        return { ...t, items, sentKds: false, status: t.status === "parked" ? "open" : t.status };
      }),
    [mutateActive, byId],
  );

  // Move a line into another course (drag-to-recourse). Doesn't touch sentKds —
  // re-pacing a held item shouldn't un-send what's already fired.
  const recourse = useCallback(
    (menuItemId: string, course: PosCourse) =>
      mutateActive((t) => ({
        ...t,
        items: t.items.map((l) => (l.menuItemId === menuItemId ? { ...l, course } : l)),
      })),
    [mutateActive],
  );

  const toggleCoursed = useCallback(
    () => mutateActive((t) => ({ ...t, coursed: !(t.coursed ?? t.channel === "dine-in") })),
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

  // Drag-to-recourse — the line being dragged + the course currently hovered.
  const dragItem = useRef<string | null>(null);
  const [dropCourse, setDropCourse] = useState<PosCourse | null>(null);

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
      const d = data as { orderId?: string; firedCourses?: PosCourse[] };
      setTabs((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? { ...x, sentKds: true, status: "pay", orderId: d.orderId, firedCourses: d.firedCourses }
            : x,
        ),
      );
      toast(`Sent to KDS · #${t.id}`);
    } finally {
      setBusyTabId(null);
    }
  }, [getActive, busyTabId, pageLoc, toast]);

  // Fire one course to the kitchen. The server accumulates it onto whatever's
  // already fired and rebuilds the order from the union, so held courses stay
  // off the line until the operator fires them.
  const fireCourse = useCallback(
    async (course: PosCourse) => {
      const t = getActive();
      if (!t || busyTabId) return;
      if (!t.channel) {
        toast("Pick a channel first");
        return;
      }
      setBusyTabId(t.id);
      try {
        const res = await fetch(`/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabId: t.id, courses: [course] }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast((data as { error?: string }).error || "Could not fire course");
          return;
        }
        const d = data as { orderId?: string; firedCourses?: PosCourse[] };
        setTabs((prev) =>
          prev.map((x) =>
            x.id === t.id
              ? { ...x, sentKds: true, status: "pay", orderId: d.orderId, firedCourses: d.firedCourses }
              : x,
          ),
        );
        toast(`Fired ${POS_COURSE_LABELS[course]} · #${t.id}`);
      } finally {
        setBusyTabId(null);
      }
    },
    [getActive, busyTabId, pageLoc, toast],
  );

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
  // picker never opens against a stale/empty cache. Then poll so seat / status
  // changes made on the Floor page surface live without a manual refresh.
  useEffect(() => {
    void fetchTables();
  }, [fetchTables]);
  useEffect(() => {
    if (!pageLoc) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(pageLoc)}`);
        if (!res.ok) return;
        const data: FloorTable[] = await res.json();
        if (Array.isArray(data)) setTables(data);
      } catch {
        /* non-fatal — next tick retries */
      }
    }, 10000);
    return () => clearInterval(id);
  }, [pageLoc]);

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
  // Lock body scroll while the fullscreen till covers the viewport — otherwise
  // the page behind keeps its scrollbar, which shows as a pale strip down the
  // edge of the dark till.
  useEffect(() => {
    if (!kiosk) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [kiosk]);


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

  // Channel-scoped menu: deliveryOnly SKUs only appear on the Delivery channel
  // (business rule). Drives the grid, combo auto-add and AI offers so a
  // delivery-only item can never land on a takeout / dine-in check.
  const filteredMenu = useMemo(
    () => menu.filter((m) => active?.channel === "delivery" || !m.deliveryOnly),
    [menu, active?.channel],
  );
  const presentCats = useMemo(() => {
    const present = new Set(filteredMenu.filter((m) => m.available).map((m) => m.category));
    return CAT_ORDER.filter((c) => present.has(c));
  }, [filteredMenu]);
  useEffect(() => {
    if (activeCat !== "all" && !presentCats.includes(activeCat)) setActiveCat("all");
  }, [presentCats, activeCat]);

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
          const m = filteredMenu.find((x) => x.available && x.id.endsWith(r.suffix));
          if (m) addLine(m.id);
        }
      } else {
        for (const cat of deal.categories) {
          if (have((m) => m.category === cat)) continue;
          const m = filteredMenu
            .filter((x) => x.available && x.category === cat)
            .sort((a, b) => a.price - b.price)[0];
          if (m) addLine(m.id);
        }
      }
    },
    [getActive, byId, filteredMenu, addLine],
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
    const sugg = getCartSuggestions(cartOf(active), filteredMenu, 4, config).filter(
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
  }, [active, comboOf, cartOf, filteredMenu, config, addLine, completeCombo]);

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

  // Coursing only applies to a sit-down (dine-in) check; takeaway / delivery
  // always fire together. Unset `coursed` defaults to coursed for dine-in.
  const isCoursed = active?.channel === "dine-in" && (active.coursed ?? true);
  const firedCourses = new Set(active?.firedCourses ?? []);

  // One ticket line. `locked` dims a line whose course has already been fired
  // to the kitchen (it's away — editing it won't un-fire it here).
  const renderLine = (l: { menuItemId: string; quantity: number; course?: PosCourse }) => {
    const m = byId(l.menuItemId);
    if (!m) return null;
    const fired = isCoursed && firedCourses.has(courseOf(l));
    const drag = isCoursed && !fired;
    return (
      <div
        key={m.id}
        className={`line${drag ? " drag" : ""}${fired ? " fired" : ""}`}
        draggable={drag}
        onDragStart={
          drag
            ? (e) => {
                dragItem.current = m.id;
                e.dataTransfer.effectAllowed = "move";
              }
            : undefined
        }
        onDragEnd={() => {
          dragItem.current = null;
          setDropCourse(null);
        }}
      >
        <span className="grip" />
        <div>
          <div className="nm">{m.name}</div>
          <div className="each tnum">{fmtPLN(m.price)} each</div>
          {drag && (
            // Touch-friendly recourse: the HTML5 drag handle above doesn't
            // fire on iPad/tablet POS terminals, so every coursed line also
            // carries a native course picker (works on touch + mouse + keys).
            <select
              className="line-course"
              value={courseOf(l)}
              aria-label={`Move ${m.name} to another course`}
              title="Move to another course"
              onChange={(e) => recourse(m.id, e.target.value as PosCourse)}
            >
              {POS_COURSE_ORDER.map((c) => (
                <option key={c} value={c}>
                  {POS_COURSE_LABELS[c]}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="qstep">
          <button type="button" onClick={() => changeQty(m.id, -1)} aria-label="Decrease">
            −
          </button>
          <span className="q tnum">{l.quantity}</span>
          <button type="button" onClick={() => changeQty(m.id, 1)} aria-label="Increase">
            +
          </button>
        </div>
        <span className="lp tnum">{fmtPLN(m.price * l.quantity)}</span>
      </div>
    );
  };

  const page = (
    <CoreShell
      eyebrow={`Point of sale · ${locName}`}
      subRight={
        <>
          <div className="seg">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={active?.channel === c.value ? "on" : ""}
                disabled={!active}
                onClick={() => setChannel(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`badge ${steer ? "warning" : "neutral"}`}
            style={{ cursor: "pointer", border: 0 }}
            onClick={() => setSteer((s) => !s)}
            title="Toggle Pace → POS steering"
          >
            <span className="d" />
            Steer {steer ? "on" : "off"}
          </button>
        </>
      }
      right={
        <>
          <div className="seg">
            {locOptions.map((o) => (
              <button key={o.slug} type="button" className={pageLoc === o.slug ? "on" : ""} onClick={() => setPageLoc(o.slug)}>
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn icon" onClick={kiosk ? exitKiosk : enterKiosk} title={kiosk ? "Exit fullscreen" : "Fullscreen"}>
            {kiosk ? <Minimize2 /> : <Maximize2 />}
          </button>
        </>
      }
    >
      <div className="pos-shell">
        <div className="tabrail">
          <div className="tabrail-head">
            <span className="eyebrow">Open checks</span>
            <span className="sum">
              <b>{railSummary.count}</b> tabs · <b>{railSummary.pay}</b> ready to pay · <b>{railSummary.parked}</b> parked ·{" "}
              <b>{fmtPLN(railSummary.openValue)}</b> open
            </span>
          </div>
          <div className="tabs">
            {tabs.map((t) => {
              const railTable = t.channel === "dine-in" && t.tableId ? tableById(t.tableId) : undefined;
              const chan = t.channel === "dine-in" ? "dinein" : t.channel === "delivery" ? "delivery" : "";
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`tab ${t.status} ${chan}${t.id === activeTabId ? " on" : ""}`}
                  onClick={() => setActiveTabId(t.id)}
                >
                  <div className="r1">
                    <span className="nm">{t.name}</span>
                    <span className={`st ${t.status}`}>{STATUS_LABEL[t.status]}</span>
                  </div>
                  <div className="r2">
                    <span>
                      #{t.id}
                      {railTable ? ` · T${railTable.number}` : ""} · {itemCount(t)} item{itemCount(t) === 1 ? "" : "s"}
                    </span>
                    <span className="tot">{fmtPLN(grandG(t))}</span>
                  </div>
                </button>
              );
            })}
            <button type="button" className="tab newtab" onClick={() => void newTab()} title="New tab">
              +
            </button>
          </div>
        </div>

        {tabs.length === 0 ? (
          <div className="empty-ticket" style={{ flex: 1 }}>
            <span className="emoji">🍕</span>
            <span>{hydrated ? "No open checks — the window is clear." : "Loading open checks…"}</span>
            <button type="button" className="btn primary" onClick={() => void newTab()}>
              + Start a new tab
            </button>
          </div>
        ) : (
          <div className="pos-body">
            <div className="cat-rail">
              <CatChip label="All" emoji="🗂️" isActive={activeCat === "all"} onClick={() => setActiveCat("all")} />
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

            <div className="menu-wrap">
              {steer && <SteerStrip plan={steerPlan} windowMin={windowMin} />}
              <div className="menu-head">
                <h2>{activeCat === "all" ? "Full menu" : MENU_CATEGORY_LABELS[activeCat]}</h2>
              </div>
              <ProductGrid
                menu={filteredMenu}
                activeCat={activeCat}
                steerPlan={steer ? steerPlan : null}
                bottleneckCat={bottleneckCat}
                onAdd={addLine}
              />
            </div>

            <div className="ticket">
              <div className="ticket-head">
                <div className="t1">
                  <h2 style={{ flex: 1, minWidth: 0 }}>
                    <input
                      value={active?.name ?? ""}
                      onChange={(e) => setName(e.target.value)}
                      aria-label="Tab name"
                      spellCheck={false}
                      style={{ background: "transparent", border: 0, color: "var(--fg)", font: "inherit", width: "100%" }}
                    />
                  </h2>
                  <span className="mono subtle">{active ? `#${active.id}` : ""}</span>
                  {tabPromise && (
                    <span className="badge platinum promise-badge">
                      <span className="d" />
                      ready {promiseLabel(tabPromise.sec)}
                    </span>
                  )}
                </div>
                <div className="ticket-meta">
                  <span>
                    <b>{CHAN_LABEL(active?.channel ?? null)}</b> · {active ? STATUS_LABEL[active.status] : ""}
                  </span>
                  {active && !active.channel && <span style={{ color: "var(--warning)" }}>Pick a channel to send / charge</span>}
                </div>
              </div>

              {active?.channel === "dine-in" && (
                <div className="fulfil-block">
                  <span className="ic">
                    <Armchair className="icn" />
                  </span>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      void fetchTables();
                      setTablePickerOpen(true);
                    }}
                  >
                    {activeTable ? `Table ${activeTable.number}${activeTableConflict || activeOverCapacity ? " ⚠" : ""}` : "Assign table"}
                  </button>
                  <div className="covers">
                    <span className="subtle">Covers</span>
                    <button type="button" className="stp" onClick={() => changeCovers(-1)} aria-label="Fewer">
                      −
                    </button>
                    <span className="n">{active.covers ?? 2}</span>
                    <button type="button" className="stp" onClick={() => changeCovers(1)} aria-label="More">
                      +
                    </button>
                  </div>
                </div>
              )}
              {active?.channel === "delivery" && (
                <div className="fulfil-block">
                  <span className="ic">
                    <MapPin className="icn" />
                  </span>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setAddrDraft(active.address || "");
                      setAddrOpen(true);
                    }}
                  >
                    {active.address || "Add delivery address"}
                  </button>
                  {deliveryPaused && <span style={{ color: "var(--warning)", marginLeft: "auto", fontSize: 11 }}>Delivery paused</span>}
                </div>
              )}

              {active?.channel === "dine-in" && (
                <div className="course-mode">
                  <span className="cm-lbl">Kitchen timing</span>
                  <div className="seg">
                    <button type="button" className={isCoursed ? "on" : ""} onClick={toggleCoursed}>
                      Coursed
                    </button>
                    <button type="button" className={!isCoursed ? "on" : ""} onClick={toggleCoursed}>
                      All together
                    </button>
                  </div>
                </div>
              )}

              <div className="lines">
                {!active || active.items.length === 0 ? (
                  <div className="empty-ticket">
                    <span className="emoji">🧾</span>
                    <span>{active ? `${active.name} is empty` : "No tab selected"}</span>
                    <span className="subtle" style={{ fontSize: 12 }}>Tap a product to add it to this check.</span>
                  </div>
                ) : isCoursed ? (
                  POS_COURSE_ORDER.map((course) => {
                    const lines = active.items.filter((l) => courseOf(l) === course);
                    if (lines.length === 0) return null;
                    const fired = firedCourses.has(course);
                    return (
                      <div
                        key={course}
                        className={`course${dropCourse === course ? " drop" : ""}`}
                        onDragOver={(e) => {
                          if (!dragItem.current) return;
                          e.preventDefault();
                          if (dropCourse !== course) setDropCourse(course);
                        }}
                        onDragLeave={() => setDropCourse((c) => (c === course ? null : c))}
                        onDrop={(e) => {
                          e.preventDefault();
                          const id = dragItem.current;
                          dragItem.current = null;
                          setDropCourse(null);
                          if (id) recourse(id, course);
                        }}
                      >
                        <div className="course-h">
                          <span className="course-nm">{POS_COURSE_LABELS[course]}</span>
                          {fired ? (
                            <span className="course-st sent">
                              <Check /> Fired
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="course-fire"
                              disabled={!active.channel || busyTabId === active.id}
                              onClick={() => void fireCourse(course)}
                            >
                              <Flame /> Fire
                            </button>
                          )}
                        </div>
                        {lines.map(renderLine)}
                      </div>
                    );
                  })
                ) : (
                  active.items.map(renderLine)
                )}
                {active && discountG(active) > 0 && (
                  <div className="combo-row">
                    <span>✓ {comboOf(active).activeDeal?.name}</span>
                    <span className="tnum">−{fmtPLN(discountG(active))}</span>
                  </div>
                )}
              </div>

              {offers.length > 0 && (
                <div className="offers">
                  <div className="eyebrow">Best offers for this order</div>
                  {offers.map((o, i) => (
                    <button key={i} type="button" className={`offer ${o.kind}`} onClick={o.apply}>
                      <span className="ic">{o.kind === "combo" ? <Sparkles /> : <Plus />}</span>
                      <span className="tx">
                        <b>{o.title}</b> — {o.sub}
                      </span>
                      <span className="cta">{o.cta}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="totals">
                <div className="trow">
                  <span>Subtotal</span>
                  <span className="v">{fmtPLN(active ? subtotalG(active) : 0)}</span>
                </div>
                {active && discountG(active) > 0 && (
                  <div className="trow disc">
                    <span>Combo · {comboOf(active).activeDeal?.name}</span>
                    <span className="v">−{fmtPLN(discountG(active))}</span>
                  </div>
                )}
                <div className="trow grand">
                  <span>Total</span>
                  <span className="v">{fmtPLN(active ? grandG(active) : 0)}</span>
                </div>
              </div>

              <div className="actions">
                <button type="button" className="btn" onClick={togglePark}>
                  <ParkingSquare /> {active?.status === "parked" ? "Resume" : "Hold"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!active || active.items.length === 0 || busyTabId === active?.id}
                  onClick={() => void sendKds()}
                >
                  <Send /> {active?.sentKds ? "Sent ✓" : "Send to kitchen"}
                </button>
              </div>
              <div className="charge">
                <button
                  type="button"
                  className="btn primary xl"
                  disabled={!active || active.items.length === 0 || !active.channel || busyTabId === active?.id}
                  onClick={openTender}
                >
                  <CreditCard />
                  {active && active.items.length > 0 && !active.channel ? "Select a channel" : `Charge ${fmtPLN(active ? grandG(active) : 0)}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {tenderOpen && active && (
        <div className="core-suite-overlay" onClick={() => setTenderOpen(false)}>
          <div className="dialog" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: 28, textAlign: "center" }}>
              <div className="eyebrow">Take payment</div>
              <div style={{ fontFamily: "var(--font-admin-display)", fontSize: 42, margin: "12px 0" }}>{fmtPLN(grandG(active))}</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button type="button" className="btn primary lg" onClick={() => void pay("Card")}>
                  <CreditCard /> Card
                </button>
                <button type="button" className="btn lg" onClick={() => void pay("Cash")}>
                  <Banknote /> Cash
                </button>
              </div>
              <button type="button" className="btn ghost" style={{ marginTop: 14 }} onClick={() => setTenderOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="core-suite-toast">
          <Check /> {toastMsg}
        </div>
      )}

      <Dialog
        open={tablePickerOpen}
        onClose={() => setTablePickerOpen(false)}
        theme="core"
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
        theme="core"
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
    </CoreShell>
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
  isActive: boolean;
  promiseSec?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`cat${isActive ? " on" : ""}`} aria-pressed={isActive} onClick={onClick}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</span>
      <span>{label}</span>
      {promiseSec != null && promiseSec > 0 && <span className="promise">{promiseLabel(promiseSec)}</span>}
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
  const roleCls =
    m.menuRole === "hero" ? "hero" : m.menuRole === "profit-driver" ? "profit" : m.menuRole === "anchor" ? "anchor" : null;
  const roleLabel = m.menuRole ? ROLE_BADGE[m.menuRole]?.label : null;
  let eased = false;
  let makeNow = false;
  if (steerPlan?.active) {
    if (isBottleCat && steerPlan.throttle.includes(m.id)) eased = true;
    else if (!isBottleCat && steerPlan.makeNow.includes(m.id)) makeNow = true;
  }
  return (
    <button type="button" className="prod" onClick={() => onAdd(m.id)}>
      <div className="phead">
        <span className="catico" style={{ fontSize: 15, marginTop: 2 }}>
          {CAT_EMOJI[m.category]}
        </span>
        <h3>{m.name}</h3>
        {roleCls && roleLabel && <span className={`role ${roleCls}`}>{roleLabel}</span>}
      </div>
      {m.description && <div className="desc">{m.description}</div>}
      <div className="row">
        <div className="tags">
          {makeNow && <span className="pace-tag make">★ make now</span>}
          {eased && <span className="pace-tag ease">▼ ease</span>}
          {m.tags.map((t) => (
            <span key={t} className="badge neutral" style={{ height: 18, fontSize: 9, padding: "0 6px" }}>
              {TAG_LABEL[t]}
            </span>
          ))}
        </div>
        <span className="price">{fmtPLN(m.price)}</span>
      </div>
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
      <div className="menu-grid">
        {CAT_ORDER.map((cat) => {
          const items = sellable.filter((m) => m.category === cat);
          if (items.length === 0) return null;
          return (
            <Fragment key={cat}>
              <div className="menu-sec">
                {MENU_CATEGORY_LABELS[cat]}
                <span className="ln" />
              </div>
              {items.map((m) => (
                <ProductCard key={m.id} m={m} steerPlan={steerPlan} isBottleCat={bottleneckCat === cat} onAdd={onAdd} />
              ))}
            </Fragment>
          );
        })}
      </div>
    );
  }
  const items = sellable.filter((m) => m.category === activeCat);
  return (
    <div className="menu-grid">
      {items.map((m) => (
        <ProductCard key={m.id} m={m} steerPlan={steerPlan} isBottleCat={bottleneckCat === activeCat} onAdd={onAdd} />
      ))}
    </div>
  );
}

function SteerStrip({ plan, windowMin }: { plan: SteerPlan | null; windowMin: number }) {
  if (!plan || !plan.active || !plan.bottleneck) {
    return (
      <div className="steer" style={{ background: "var(--success-soft)" }}>
        <span className="dot" style={{ background: "var(--success)" }} />
        <span>
          <b>Line clear</b> — all stations within capacity, honest promise times live.
        </span>
      </div>
    );
  }
  const pct = Number.isFinite(plan.bottleneck.util) ? Math.round(plan.bottleneck.util * 100) : 999;
  const cap = plan.deliveryCapNextWindow ?? 0;
  return (
    <div className="steer">
      <span className="dot" />
      <span>
        <b>
          {CAT_EMOJI[plan.bottleneck.id]} {plan.bottleneck.label} {pct}%
        </b>{" "}
        — {plan.reason}
      </span>
      <span className="cap">
        cap {cap}/{windowMin}m
      </span>
    </div>
  );
}
