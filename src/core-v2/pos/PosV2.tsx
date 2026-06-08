"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CoreShellV2 } from "@/core-v2/shell/CoreShellV2";
import {
  MENU_CATEGORY_LABELS,
  type FloorTable,
  type FulfillmentType,
  type MenuCategory,
  type MenuItem,
  type PosTab,
  type CartItem,
  type PosCourse,
} from "@/data/types";
import { getActiveComboDeals, getCartSuggestions, type UpsellConfig } from "@/lib/upsell";
import {
  POS_COURSE_ORDER,
  POS_COURSE_LABELS,
  courseOf,
  defaultCourseForCategory,
} from "@/lib/pos-coursing";
import { useAdminLocation } from "@/shared/LocationContext";
import { useToast } from "@/ui/Toast";

/* ─────────────────────────── inline SVG icons (copied from pos.html) ──────────────────────────
   Stroke icons mirror the mockup's markup 1:1 — same viewBox + paths. */

const IcoGrid = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const IcoPizza = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18M3 12h18" />
  </svg>
);
const IcoPasta = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <path d="M5 4v16M9 4v16M5 12h4" />
  </svg>
);
const IcoAntipasti = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <path d="M4 10a8 8 0 0 1 16 0z" />
    <path d="M3 10h18" />
  </svg>
);
const IcoPanini = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <path d="M3 8h18M3 12h18M3 16h18" />
  </svg>
);
const IcoDrinks = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <path d="M7 4h10l-1 5a4 4 0 0 1-8 0z" />
    <path d="M12 13v5M8 21h8" />
  </svg>
);
const IcoDessert = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <path d="M5 20h14M7 20c0-4 2-6 5-6s5 2 5 6" />
  </svg>
);

/** Per-category card accent glyph (the quiet `.catico` mark). */
const CatIco = ({ category }: { category: MenuCategory }) => {
  switch (category) {
    case "pizza":
      return (
        <svg className="catico" viewBox="0 0 24 24">
          <path d="M2.6 7.4 12 22l9.4-14.6a14 14 0 0 0-18.8 0z" />
          <circle cx="10" cy="11" r="1" />
          <circle cx="13.6" cy="11" r="1" />
        </svg>
      );
    case "pasta":
      return (
        <svg className="catico" viewBox="0 0 24 24">
          <path d="M5 4v16M9 4v16M5 12h4" />
        </svg>
      );
    case "drinks":
      return (
        <svg className="catico" viewBox="0 0 24 24">
          <path d="M6 3h12l-1.4 12.2a3 3 0 0 1-3 2.8h-3.2a3 3 0 0 1-3-2.8z" />
        </svg>
      );
    case "desserts":
      return (
        <svg className="catico" viewBox="0 0 24 24">
          <path d="M5 20h14M7 20c0-4 2-6 5-6s5 2 5 6" />
        </svg>
      );
    case "panini":
      return (
        <svg className="catico" viewBox="0 0 24 24">
          <path d="M3 8h18M3 12h18M3 16h18" />
        </svg>
      );
    case "antipasti":
    default:
      return (
        <svg className="catico" viewBox="0 0 24 24">
          <path d="M4 12a8 8 0 0 1 16 0z" />
          <path d="M2.5 12h19" />
        </svg>
      );
  }
};

const CAT_ICON: Record<MenuCategory, () => React.JSX.Element> = {
  pizza: IcoPizza,
  pasta: IcoPasta,
  antipasti: IcoAntipasti,
  panini: IcoPanini,
  drinks: IcoDrinks,
  desserts: IcoDessert,
};

const IcoMaximize = () => (
  <svg className="i" viewBox="0 0 24 24">
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);
const IcoMinimize = () => (
  <svg className="i" viewBox="0 0 24 24">
    <path d="M3 8h3a2 2 0 0 0 2-2V3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M21 16h-3a2 2 0 0 0-2 2v3" />
  </svg>
);
const IcoCheck = ({ w = 10, h = 10 }: { w?: number; h?: number }) => (
  <svg viewBox="0 0 24 24" width={w} height={h} fill="none" stroke="currentColor" strokeWidth={2.5}>
    <path d="M5 13l4 4L19 7" />
  </svg>
);
const IcoFlame = () => (
  <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
    <path d="M12 3c1 3-2 4-2 7a2 2 0 0 0 4 0c0-1 0-1 .5-2 1 1.5 1.5 3 1.5 5a6 6 0 0 1-12 0c0-4 4-6 8-10z" />
  </svg>
);
const IcoSparkle = () => (
  <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M12 3l2.2 5.6L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.8-.4z" />
  </svg>
);
const IcoPlus = () => (
  <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IcoArmchair = () => (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8}>
    <rect x="4" y="9" width="16" height="3" rx="1" />
    <path d="M6 12v7M18 12v7M9 5h6v4H9z" />
  </svg>
);
const IcoPin = () => (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);
const IcoWarn = ({ w = 11, h = 11 }: { w?: number; h?: number }) => (
  <svg className="i" viewBox="0 0 24 24" style={{ width: w, height: h }}>
    <path d="M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </svg>
);
const IcoSend = () => (
  <svg className="i" viewBox="0 0 24 24">
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
  </svg>
);
const IcoPark = () => (
  <svg className="i" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
  </svg>
);
const IcoCard = ({ w = 18, h = 18 }: { w?: number; h?: number }) => (
  <svg className="icn" style={{ width: w, height: h }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
  </svg>
);
const IcoCash = ({ w = 17, h = 17 }: { w?: number; h?: number }) => (
  <svg className="icn" style={{ width: w, height: h }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);
const IcoRefresh = ({ spin }: { spin?: boolean }) => (
  <svg className={`i${spin ? " v2-spin" : ""}`} viewBox="0 0 24 24">
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
  </svg>
);

/* ─────────────────────────── helpers (copied from AdminPos) ─────────────────────────── */

// Prices are grosze (integers); the chain renders PLN with a comma decimal.
const fmtPLN = (g: number) => `${(g / 100).toFixed(2).replace(".", ",")} zł`;

// Topbar channel seg — mockup order: Dine-in / Takeaway / Delivery.
const CHANNELS: { value: FulfillmentType; label: string }[] = [
  { value: "dine-in", label: "Dine-in" },
  { value: "takeout", label: "Takeaway" },
  { value: "delivery", label: "Delivery" },
];
const CHAN_LABEL = (c: FulfillmentType | null) =>
  c === "dine-in" ? "Dine-in" : c === "delivery" ? "Delivery" : c === "takeout" ? "Takeaway" : "No channel";

const CAT_ORDER = Object.keys(MENU_CATEGORY_LABELS) as MenuCategory[];

const ROLE_BADGE: Partial<Record<NonNullable<MenuItem["menuRole"]>, { label: string; cls: string }>> = {
  hero: { label: "Hero", cls: "hero" },
  "profit-driver": { label: "Profit", cls: "profit" },
  anchor: { label: "Signature", cls: "anchor" },
};
const TAG_LABEL: Record<MenuItem["tags"][number], string> = {
  vegetarian: "Veg",
  vegan: "Vegan",
  spicy: "Piccante",
  "gluten-free": "GF",
};

const STATUS_LABEL: Record<PosTab["status"], string> = {
  open: "Open",
  parked: "Parked",
  pay: "Ready·Pay",
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
  kind: "combo" | "cross";
  title: string;
  sub: string;
  cta: string;
  apply: () => void;
}

/* ─────────────────────────────────────── component ─────────────────────────────────────── */

export function PosV2({
  menusByLocation,
  upsellByLocation,
}: {
  menusByLocation: Record<string, MenuItem[]>;
  upsellByLocation: Record<string, UpsellConfig | null>;
}) {
  const { location, activeLocations } = useAdminLocation();
  const { show } = useToast();

  // Mirror AdminPos's lightweight toast helper onto the v2 Toast API.
  const toast = useCallback((msg: string) => show({ title: msg, tone: "info" }), [show]);

  const locationKeys = useMemo(() => Object.keys(menusByLocation), [menusByLocation]);
  const fallbackLoc = locationKeys[0] ?? "";
  const [pageLoc, setPageLoc] = useState<string>(location || fallbackLoc);
  useEffect(() => {
    if (location && menusByLocation[location]) setPageLoc(location);
  }, [location, menusByLocation]);

  const menu = useMemo(() => menusByLocation[pageLoc] ?? [], [menusByLocation, pageLoc]);
  const config = upsellByLocation[pageLoc] ?? null;
  const byId = useCallback((id: string) => menu.find((m) => m.id === id), [menu]);

  const [activeCat, setActiveCat] = useState<MenuCategory | "all">("all");

  // --- Tabs (open checks), server-backed -----------------------------------
  const [tabs, setTabs] = useState<PosTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
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

  // Live tab sync — poll the store; skipped while a local edit is mid-debounce.
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

  // Cancel any pending debounced writes on unmount.
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
          const cat = byId(id)?.category;
          items.push({ menuItemId: id, quantity: 1, course: cat ? defaultCourseForCategory(cat) : "main" });
        }
        return { ...t, items, sentKds: false, status: t.status === "parked" ? "open" : t.status };
      }),
    [mutateActive, byId],
  );

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
      /* offline — no-op until the network returns */
    }
  }, [pageLoc]);

  // --- Send to KDS / charge ------------------------------------------------
  const [busyTabId, setBusyTabId] = useState<string | null>(null);

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
    // grandG omitted — display-only fallback for the toast (server returns the paid total).
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

  // Load tables up front + refresh on location change, then poll every 10s.
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
  useEffect(() => {
    if (!kiosk) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [kiosk]);

  // --- Live clock (topbar) -------------------------------------------------
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
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
  const locName = activeLocations.find((l) => l.slug === pageLoc)?.city ?? pageLoc;

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
        kind: "cross",
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

  const isCoursed = active?.channel === "dine-in" && (active.coursed ?? true);
  const firedCourses = new Set(active?.firedCourses ?? []);

  // One ticket line. `fired` dims a line whose course has already been fired.
  const renderLine = (l: { menuItemId: string; quantity: number; course?: PosCourse }) => {
    const m = byId(l.menuItemId);
    if (!m) return null;
    const fired = isCoursed && firedCourses.has(courseOf(l));
    const drag = isCoursed && !fired;
    return (
      <div
        key={m.id}
        className={`line${fired ? " fired" : ""}`}
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
        <div className="qstep">
          <button type="button" onClick={() => changeQty(m.id, -1)} aria-label="Decrease">
            −
          </button>
          <span className="q">{l.quantity}</span>
          <button type="button" onClick={() => changeQty(m.id, 1)} aria-label="Increase">
            +
          </button>
        </div>
        <div>
          <div className="nm">{m.name}</div>
          {l.quantity > 1 && <div className="each">{fmtPLN(m.price)} each</div>}
          {drag && (
            // Touch-friendly recourse: HTML5 drag doesn't fire on tablet POS;
            // every coursed line also carries a native course picker.
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
        <div className="lp">{fmtPLN(m.price * l.quantity)}</div>
      </div>
    );
  };

  /* ─────────────────────────── topbar (channel + location + clock + fullscreen) ─────────────────────────── */
  const topbar = (
    <>
      <div className="seg" style={{ marginLeft: 8 }}>
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
      <div className="topbar-right">
        <button
          type="button"
          className={`badge ${steer ? "warning" : "neutral"}`}
          style={{ cursor: "pointer", border: 0 }}
          title="Toggle Pace → POS steering"
          onClick={() => setSteer((s) => !s)}
        >
          <span className="d" />
          {steer ? "Steering" : "Steer off"}
        </button>
        <div className="seg">
          {locOptions.map((o) => (
            <button key={o.slug} type="button" className={pageLoc === o.slug ? "on" : ""} onClick={() => setPageLoc(o.slug)}>
              {o.label}
            </button>
          ))}
        </div>
        <span className="mono subtle" style={{ fontSize: 13 }}>
          {clock}
        </span>
        <button
          type="button"
          className="btn ghost icon"
          title={kiosk ? "Exit fullscreen" : "Fullscreen"}
          onClick={kiosk ? exitKiosk : enterKiosk}
        >
          {kiosk ? <IcoMinimize /> : <IcoMaximize />}
        </button>
      </div>
    </>
  );

  /* ─────────────────────────── pos-shell body ─────────────────────────── */
  const body = (
    <div className="pos-shell">
      {/* concurrent checks */}
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
            const paused =
              steer && steerPlan?.active && t.channel === "delivery" && steerPlan.deliveryCapNextWindow === 0;
            return (
              <button
                key={t.id}
                type="button"
                className={`tab ${chan}${t.id === activeTabId ? " on" : ""}`}
                onClick={() => setActiveTabId(t.id)}
              >
                <div className="r1">
                  {t.status === "open" && <span className="badge success" style={{ height: 7, width: 7, padding: 0 }} />}
                  <span className="nm">{t.name}</span>
                  <span className={`st ${t.status}`}>{STATUS_LABEL[t.status]}</span>
                </div>
                <div className="r2">
                  {paused ? (
                    <span className="warn">
                      <IcoWarn /> delivery paused
                    </span>
                  ) : (
                    <span>
                      {railTable ? `T${railTable.number} · ` : ""}
                      {itemCount(t)} item{itemCount(t) === 1 ? "" : "s"}
                    </span>
                  )}
                  <span className="tot">{fmtPLN(grandG(t))}</span>
                </div>
              </button>
            );
          })}
          <button type="button" className="tab newtab" title="New tab (N)" onClick={() => void newTab()}>
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
          {/* category rail with capacity-true promise times */}
          <nav className="cat-rail">
            <CatChip label="All" Ico={IcoGrid} isActive={activeCat === "all"} onClick={() => setActiveCat("all")} />
            {presentCats.map((c) => (
              <CatChip
                key={c}
                label={MENU_CATEGORY_LABELS[c]}
                Ico={CAT_ICON[c]}
                isActive={activeCat === c}
                promiseSec={steer && steerPlan ? steerPlan.promiseSecondsByCategory[c] : undefined}
                onClick={() => setActiveCat(c)}
              />
            ))}
          </nav>

          {/* menu + steering */}
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

          {/* live ticket */}
          <section className="ticket">
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
                  <IcoArmchair />
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ height: 26, padding: "0 9px", fontSize: 11 }}
                  onClick={() => {
                    void fetchTables();
                    setTablePickerOpen(true);
                  }}
                >
                  {activeTable ? `Table ${activeTable.number}${activeTableConflict || activeOverCapacity ? " ⚠" : ""}` : "Assign table"}
                </button>
                <div className="covers">
                  <span className="subtle" style={{ fontSize: 11 }}>
                    Covers
                  </span>
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
                  <IcoPin />
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ height: 26, padding: "0 9px", fontSize: 11 }}
                  onClick={() => {
                    setAddrDraft(active.address || "");
                    setAddrOpen(true);
                  }}
                >
                  {active.address || "Add delivery address"}
                </button>
                {deliveryPaused && (
                  <span style={{ color: "var(--warning)", marginLeft: "auto", fontSize: 11 }}>Delivery paused</span>
                )}
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
                  <span className="subtle" style={{ fontSize: 12 }}>
                    Tap a product to add it to this check.
                  </span>
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
                            <IcoCheck /> Fired
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="course-fire"
                            disabled={!active.channel || busyTabId === active.id}
                            onClick={() => void fireCourse(course)}
                          >
                            <IcoFlame /> Fire course
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
            </div>

            {active && discountG(active) > 0 && (
              <div className="combo-row">
                <span>✓ {comboOf(active).activeDeal?.name}</span>
                <span>−{fmtPLN(discountG(active))}</span>
              </div>
            )}

            {offers.length > 0 && (
              <div className="offers">
                <div className="eyebrow">Best offers for this order</div>
                {offers.map((o, i) => (
                  <div key={i} className={`offer ${o.kind}`}>
                    <div className="ic">{o.kind === "combo" ? <IcoSparkle /> : <IcoPlus />}</div>
                    <div className="tx">
                      <b>{o.title}</b> — {o.sub}
                    </div>
                    <button type="button" className="btn ghost" onClick={o.apply}>
                      {o.cta}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="totals">
              <div className="trow">
                <span>Subtotal</span>
                <span className="v">{fmtPLN(active ? subtotalG(active) : 0)}</span>
              </div>
              {active && discountG(active) > 0 && (
                <div className="trow">
                  <span>Combo · {comboOf(active).activeDeal?.name}</span>
                  <span className="v" style={{ color: "var(--success)" }}>
                    −{fmtPLN(discountG(active))}
                  </span>
                </div>
              )}
              <div className="trow grand">
                <span>Total</span>
                <span className="v">{fmtPLN(active ? grandG(active) : 0)}</span>
              </div>
            </div>

            <div className="actions">
              <button type="button" className="btn" onClick={togglePark}>
                <IcoPark /> {active?.status === "parked" ? "Resume" : "Park"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!active || active.items.length === 0 || busyTabId === active?.id}
                onClick={() => void sendKds()}
              >
                <IcoSend /> {active?.sentKds ? "Sent ✓" : "Send to KDS"}
              </button>
            </div>
            <div className="charge">
              <button
                type="button"
                className="btn primary xl"
                style={{ width: "100%", justifyContent: "center" }}
                disabled={!active || active.items.length === 0 || !active.channel || busyTabId === active?.id}
                onClick={openTender}
              >
                <IcoCard />
                {active && active.items.length > 0 && !active.channel ? "Select a channel" : `Charge ${fmtPLN(active ? grandG(active) : 0)}`}
              </button>
            </div>
            <div className="kbd-hint" aria-hidden="true">
              <span>
                <kbd>N</kbd> new
              </span>
              <span>
                <kbd>1–9</kbd> switch tab
              </span>
              <span>
                <kbd>F</kbd> fullscreen
              </span>
              <span>
                <kbd>Esc</kbd> close
              </span>
            </div>
          </section>
        </div>
      )}

      {/* ─── tender dialog (mirrors pos-tender.html) ─── */}
      {tenderOpen && active && (
        <div className="corev2">
          <div className="overlay" onClick={() => setTenderOpen(false)}>
            <div className="dialog" style={{ width: "min(380px,100%)" }} onClick={(e) => e.stopPropagation()}>
              <div className="dialog-h">
                <h2>Charge</h2>
                <button type="button" className="x" aria-label="Cancel" onClick={() => setTenderOpen(false)}>
                  ✕
                </button>
              </div>
              <div className="dialog-b" style={{ textAlign: "center" }}>
                <div className="subtle" style={{ fontSize: 12 }}>
                  {CHAN_LABEL(active.channel)}
                  {activeTable ? ` · Table ${activeTable.number}` : ""} · {active.name} · #{active.orderId ?? active.id}
                </div>
                <div
                  style={{
                    fontFamily: "var(--display)",
                    fontSize: 44,
                    fontWeight: 500,
                    fontVariantNumeric: "tabular-nums",
                    margin: "8px 0 22px",
                  }}
                >
                  {fmtPLN(grandG(active))}
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <button type="button" className="btn primary xl" style={{ justifyContent: "center", gap: 9 }} onClick={() => void pay("Card")}>
                    <IcoCard /> Card
                  </button>
                  <button type="button" className="btn lg" style={{ justifyContent: "center", gap: 9 }} onClick={() => void pay("Cash")}>
                    <IcoCash /> Cash
                  </button>
                  <button type="button" className="btn ghost" style={{ justifyContent: "center" }} onClick={() => setTenderOpen(false)}>
                    Cancel
                  </button>
                </div>
                <div className="subtle" style={{ fontSize: 11, marginTop: 16, lineHeight: 1.5 }}>
                  Server-authoritative total · marks <b>paidAt</b> and closes the tab. Card opens the terminal flow.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── table picker dialog ─── */}
      {tablePickerOpen && (
        <div className="corev2">
          <div className="overlay" onClick={() => setTablePickerOpen(false)}>
            <div className="dialog" style={{ width: "min(560px,100%)" }} onClick={(e) => e.stopPropagation()}>
              <div className="dialog-h">
                <h2>Assign a table</h2>
                <button type="button" className="x" aria-label="Close" onClick={() => setTablePickerOpen(false)}>
                  ✕
                </button>
              </div>
              <div className="dialog-b">
                <p className="subtle" style={{ fontSize: 12, marginBottom: 12 }}>
                  Party of {activeCovers}. Tables already on another open check, or with fewer seats than the party, are flagged — you can still seat there.
                </p>
                {tables.length === 0 ? (
                  <div className="empty-ticket">
                    <span className="emoji">🪑</span>
                    <span>{tablesLoading ? "Loading tables…" : `No tables for ${locName}`}</span>
                    {!tablesLoading && (
                      <span className="subtle" style={{ fontSize: 12 }}>
                        This truck has no floor tables yet. Add them on the Floor page (set to {locName}), then Refresh.
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="pos-tables-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
                    {tables.map((t) => {
                      const taken = active ? tabsOnTable(t.id, active.id).length > 0 : false;
                      const tooSmall = t.seats < activeCovers;
                      const sel = active?.tableId === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`prod${sel ? " on" : ""}`}
                          style={{ padding: "12px 13px" }}
                          onClick={() => handlePickTable(t.id)}
                        >
                          <div className="phead">
                            <h3 style={{ minHeight: 0 }}>T{t.number}</h3>
                            {sel && <span className="role hero">Selected</span>}
                          </div>
                          <div className="desc" style={{ minHeight: 0, marginTop: 4 }}>
                            {t.seats} seat{t.seats === 1 ? "" : "s"}
                            {t.zone ? ` · ${t.zone}` : ""}
                          </div>
                          <div className="row" style={{ paddingTop: 9, flexWrap: "wrap" }}>
                            <div className="tags">
                              <span className={`badge ${TABLE_STATUS_BADGE[t.status]}`}>{t.status}</span>
                              {taken && <span className="badge warning">In use</span>}
                              {tooSmall && (
                                <span className="badge warning">
                                  Seats {t.seats} &lt; {activeCovers}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="dialog-f" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                {active?.tableId && (
                  <button type="button" className="btn ghost" onClick={() => handlePickTable(null)}>
                    Clear table
                  </button>
                )}
                <button type="button" className="btn ghost" onClick={() => void fetchTables()}>
                  <IcoRefresh spin={tablesLoading} /> Refresh
                </button>
                <button type="button" className="btn" onClick={() => setTablePickerOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── delivery address dialog ─── */}
      {addrOpen && (
        <div className="corev2">
          <div className="overlay" onClick={() => setAddrOpen(false)}>
            <div className="dialog" style={{ width: "min(460px,100%)" }} onClick={(e) => e.stopPropagation()}>
              <div className="dialog-h">
                <h2>Delivery address</h2>
                <button type="button" className="x" aria-label="Close" onClick={() => setAddrOpen(false)}>
                  ✕
                </button>
              </div>
              <div className="dialog-b">
                {active && (
                  <p className="subtle" style={{ fontSize: 12, marginBottom: 10 }}>
                    Open check #{active.id}
                  </p>
                )}
                <textarea
                  className="input"
                  style={{ minHeight: 110, resize: "vertical", width: "100%" }}
                  rows={4}
                  value={addrDraft}
                  onChange={(e) => setAddrDraft(e.target.value)}
                  placeholder="Street & number, flat / buzzer, city — plus any note for the driver"
                />
              </div>
              <div className="dialog-f" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn ghost" onClick={() => setAddrDraft("")}>
                  Clear
                </button>
                <button type="button" className="btn" onClick={() => setAddrOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    setAddress(addrDraft);
                    setAddrOpen(false);
                    if (addrDraft.trim()) toast("Address saved");
                  }}
                >
                  Save address
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const page = (
    <CoreShellV2 active="pos" crumb="POS" topbar={topbar}>
      {body}
    </CoreShellV2>
  );

  // Kiosk renders through a portal to document.body so the edge-to-edge POS
  // escapes any stacking context (CLAUDE.md rule #4); the subtree stays mounted,
  // so tab state, timers and the steering feed keep running. Wrapped in .corev2
  // so the scoped Core-v2 tokens apply.
  return kiosk
    ? createPortal(<div className="corev2">{page}</div>, document.body)
    : page;
}

// Floor-table status → mockup badge tone class.
const TABLE_STATUS_BADGE: Record<FloorTable["status"], string> = {
  available: "success",
  seated: "info",
  reserved: "warning",
  "out-of-service": "danger",
};

/* ─────────────────────────── product grid + chips ─────────────────────────── */

function CatChip({
  label,
  Ico,
  isActive,
  promiseSec,
  onClick,
}: {
  label: string;
  Ico: () => React.JSX.Element;
  isActive: boolean;
  promiseSec?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`cat${isActive ? " on" : ""}`} aria-pressed={isActive} onClick={onClick}>
      <Ico />
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
  const role = m.menuRole ? ROLE_BADGE[m.menuRole] : null;
  let eased = false;
  let makeNow = false;
  if (steerPlan?.active) {
    if (isBottleCat && steerPlan.throttle.includes(m.id)) eased = true;
    else if (!isBottleCat && steerPlan.makeNow.includes(m.id)) makeNow = true;
  }
  return (
    <button type="button" className="prod" onClick={() => onAdd(m.id)}>
      <div className="phead">
        <CatIco category={m.category} />
        <h3>{m.name}</h3>
        {role && <span className={`role ${role.cls}`}>{role.label}</span>}
      </div>
      {m.description && <p className="desc">{m.description}</p>}
      <div className="row">
        <div className="tags">
          {makeNow && (
            <span className="pace-tag make">
              <IcoCheck w={9} h={9} /> Make now
            </span>
          )}
          {eased && (
            <span className="pace-tag ease">
              <svg viewBox="0 0 24 24" width={9} height={9} fill="none" stroke="currentColor" strokeWidth={2.4}>
                <path d="M6 9l6 6 6-6" />
              </svg>
              Ease
            </span>
          )}
          {m.tags.map((t) => (
            <span key={t} className="badge neutral">
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
          const promise = steerPlan?.promiseSecondsByCategory[cat];
          return (
            <Fragment key={cat}>
              <div className="menu-sec">
                {MENU_CATEGORY_LABELS[cat]}
                {promise != null && promise > 0 && <span className="promise">{promiseLabel(promise)}</span>}
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
          {plan.bottleneck.label} {pct}%
        </b>{" "}
        — {plan.reason}
      </span>
      <span className="cap">
        Delivery cap {cap} / {windowMin}m
      </span>
    </div>
  );
}
