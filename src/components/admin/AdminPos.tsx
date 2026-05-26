"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  Gauge,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  Package,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
  Truck,
  Users,
  Utensils,
} from "lucide-react";
import { Badge, Button, Dialog, EmptyState, Select, useToast } from "./v2/ui";
import type { BadgeTone } from "./v2/ui";
import { useAdminLocation } from "./v2/LocationContext";
import { getActiveComboDeals, getCartSuggestions, type UpsellConfig } from "@/lib/upsell";
import {
  MENU_CATEGORY_LABELS,
  type CartItem,
  type FloorTable,
  type FulfillmentType,
  type MenuCategory,
  type MenuItem,
  type PosTab,
} from "@/data/types";

// Prices are grosze (integers); the chain renders PLN with a comma decimal.
function fmtPLN(grosze: number): string {
  return `${(grosze / 100).toFixed(2).replace(".", ",")} zł`;
}

const CHANNELS: { value: FulfillmentType; label: string; icon: React.ReactNode }[] = [
  { value: "takeout", label: "Takeout", icon: <ShoppingBag className="h-4 w-4" /> },
  { value: "delivery", label: "Delivery", icon: <Truck className="h-4 w-4" /> },
  { value: "dine-in", label: "Dine-in", icon: <Utensils className="h-4 w-4" /> },
];
const CHANNEL_LABEL: Record<FulfillmentType, string> = {
  takeout: "Takeout",
  delivery: "Delivery",
  "dine-in": "Dine-in",
};
const CHANNEL_CLASS: Record<FulfillmentType, string> = {
  takeout: "chan-takeout",
  delivery: "chan-delivery",
  "dine-in": "chan-dinein",
};

const STATUS_LABEL: Record<PosTab["status"], string> = {
  open: "Open",
  parked: "Parked",
  pay: "Ready · Pay",
};

const ROLE_LABELS: Record<NonNullable<MenuItem["menuRole"]>, { label: string; tone: BadgeTone }> = {
  hero: { label: "Hero", tone: "info" },
  "profit-driver": { label: "Profit", tone: "success" },
  anchor: { label: "Anchor", tone: "brand" },
  lto: { label: "LTO", tone: "warning" },
};

interface SteeringPlan {
  active: boolean;
  promiseSecondsByCategory: Partial<Record<MenuCategory, number>>;
  makeNow: string[];
  throttle: string[];
  deliveryCapNextWindow: number | null;
  bottleneck: { id: MenuCategory; label: string; util: number; tier: "calm" | "warn" | "risk" } | null;
  reason: string | null;
}
interface SteeringResp {
  paceWindowMin: number;
  plan: SteeringPlan;
}

function promiseLabel(sec: number): string {
  if (sec <= 0) return "~0 min";
  if (sec < 90) return "~1 min";
  return `~${Math.round(sec / 60)} min`;
}

interface Offer {
  key: string;
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
  const toast = useToast();

  const locationKeys = useMemo(() => Object.keys(menusByLocation), [menusByLocation]);
  const fallbackLoc = locationKeys[0] ?? "";
  const [pageLoc, setPageLoc] = useState<string>(location || fallbackLoc);
  useEffect(() => {
    if (location && menusByLocation[location]) setPageLoc(location);
  }, [location, menusByLocation]);

  const menu = useMemo(() => menusByLocation[pageLoc] ?? [], [menusByLocation, pageLoc]);
  const config = upsellByLocation[pageLoc] ?? null;
  const byId = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);
  const locName = useMemo(() => {
    const found = activeLocations.find((l) => l.slug === pageLoc);
    return found?.city ?? pageLoc;
  }, [activeLocations, pageLoc]);

  // --- Tabs (open checks) — server-persisted ---
  const [tabs, setTabs] = useState<PosTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tabsRef = useRef<PosTab[]>([]);
  useEffect(() => {
    tabsRef.current = tabs;
  });

  // Serialise every PATCH through one chain so rapid taps can't race; `pending`
  // gates the poll so a refresh never clobbers an edit that's still in flight.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const patchTab = useCallback(
    (tab: PosTab) => {
      pending.current++;
      const run = async () => {
        try {
          const res = await fetch(
            `/api/admin/pos/tabs/${tab.id}?location=${encodeURIComponent(tab.locationSlug)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: tab.name,
                channel: tab.channel,
                status: tab.status,
                items: tab.items,
                tableId: tab.tableId ?? null,
                covers: tab.covers ?? null,
                address: tab.address ?? null,
              }),
            },
          );
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            toast.error("Couldn't save tab", (d as { error?: string }).error);
          }
        } catch {
          /* offline — local state stays; the poll reconciles when back */
        } finally {
          pending.current--;
        }
      };
      saveChain.current = saveChain.current.then(run, run);
      return saveChain.current;
    },
    [toast],
  );

  const updateActiveTab = useCallback(
    (updater: (t: PosTab) => PosTab) => {
      const cur = tabsRef.current.find((t) => t.id === activeTabId);
      if (!cur) return;
      const next = updater(cur);
      setTabs((prev) => prev.map((t) => (t.id === next.id ? next : t)));
      patchTab(next);
    },
    [activeTabId, patchTab],
  );

  const fetchTabs = useCallback(async () => {
    if (!pageLoc) {
      // No truck resolved yet — don't sit on a spinner forever.
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`);
      if (!res.ok) return;
      const data: { tabs?: PosTab[] } = await res.json();
      const server = Array.isArray(data.tabs) ? data.tabs : [];
      if (pending.current > 0) return; // don't clobber an in-flight edit
      setTabs(server);
      setActiveTabId((cur) => (server.some((t) => t.id === cur) ? cur : (server[0]?.id ?? null)));
    } catch {
      /* network blip — keep what we have; the next poll retries */
    } finally {
      setLoading(false);
    }
  }, [pageLoc]);

  useEffect(() => {
    setLoading(true);
    fetchTabs();
    const id = setInterval(fetchTabs, 8000);
    return () => clearInterval(id);
  }, [fetchTabs]);

  const active = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? null, [tabs, activeTabId]);

  // --- Steering (Pace → POS), real plan off the live line ---
  const [steer, setSteer] = useState(true);
  const [steerResp, setSteerResp] = useState<SteeringResp | null>(null);
  const fetchSteer = useCallback(async () => {
    if (!pageLoc) return;
    try {
      const res = await fetch(`/api/admin/pace/steering?location=${encodeURIComponent(pageLoc)}`);
      if (!res.ok) return;
      setSteerResp(await res.json());
    } catch {
      /* steering is advisory — a miss just shows the normal menu */
    }
  }, [pageLoc]);
  useEffect(() => {
    fetchSteer();
    const id = setInterval(fetchSteer, 15000);
    return () => clearInterval(id);
  }, [fetchSteer]);
  const plan = steer ? (steerResp?.plan ?? null) : null;
  const bottleneckCat = plan?.active ? plan.bottleneck?.id : undefined;

  // --- Tables (dine-in) ---
  const [tables, setTables] = useState<FloorTable[]>([]);
  const fetchTables = useCallback(async () => {
    if (!pageLoc) return;
    try {
      const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(pageLoc)}`);
      if (!res.ok) return;
      const data = await res.json();
      setTables(Array.isArray(data) ? data : []);
    } catch {
      /* table picker just stays empty */
    }
  }, [pageLoc]);
  useEffect(() => {
    setTables([]);
    fetchTables();
  }, [fetchTables]);

  // --- Cart maths for the active tab (combo discount is the real engine) ---
  const cartItemsFor = useCallback(
    (t: PosTab): CartItem[] =>
      t.items
        .map((l) => {
          const m = byId.get(l.menuItemId);
          return m ? { menuItem: m, quantity: l.quantity, locationSlug: pageLoc } : null;
        })
        .filter((x): x is CartItem => x !== null),
    [byId, pageLoc],
  );
  const tabGrand = useCallback(
    (t: PosTab): number => {
      const cis = cartItemsFor(t);
      const sub = cis.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0);
      const r = getActiveComboDeals(cis, config, t.channel ?? null);
      return Math.max(0, sub - (r.isComplete ? r.savings : 0));
    },
    [cartItemsFor, config],
  );
  const tabCount = (t: PosTab) => t.items.reduce((s, l) => s + l.quantity, 0);

  const activeCartItems = useMemo(
    () => (active ? cartItemsFor(active) : []),
    [active, cartItemsFor],
  );
  const combo = useMemo(
    () => getActiveComboDeals(activeCartItems, config, active?.channel ?? null),
    [activeCartItems, config, active],
  );
  const itemsTotal = useMemo(
    () => activeCartItems.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0),
    [activeCartItems],
  );
  const comboSavings = combo.isComplete ? combo.savings : 0;
  const grand = Math.max(0, itemsTotal - comboSavings);

  // --- Cart mutations on the active tab ---
  const addItem = useCallback(
    (id: string) =>
      updateActiveTab((t) => {
        const items = [...t.items];
        const i = items.findIndex((l) => l.menuItemId === id);
        if (i >= 0) items[i] = { ...items[i], quantity: items[i].quantity + 1 };
        else items.push({ menuItemId: id, quantity: 1 });
        return { ...t, items, status: t.status === "parked" ? "open" : t.status, sentKds: false };
      }),
    [updateActiveTab],
  );
  const addItems = useCallback(
    (ids: string[]) =>
      updateActiveTab((t) => {
        const items = [...t.items];
        for (const id of ids) {
          const i = items.findIndex((l) => l.menuItemId === id);
          if (i >= 0) items[i] = { ...items[i], quantity: items[i].quantity + 1 };
          else items.push({ menuItemId: id, quantity: 1 });
        }
        return { ...t, items, status: t.status === "parked" ? "open" : t.status, sentKds: false };
      }),
    [updateActiveTab],
  );
  const changeQty = useCallback(
    (id: string, delta: number) =>
      updateActiveTab((t) => {
        const items = t.items
          .map((l) => (l.menuItemId === id ? { ...l, quantity: l.quantity + delta } : l))
          .filter((l) => l.quantity > 0);
        return { ...t, items, sentKds: false };
      }),
    [updateActiveTab],
  );
  const setChannel = useCallback(
    (c: FulfillmentType) =>
      updateActiveTab((t) => ({
        ...t,
        channel: c,
        covers: c === "dine-in" && t.covers == null ? 2 : t.covers,
      })),
    [updateActiveTab],
  );
  const togglePark = useCallback(
    () => updateActiveTab((t) => ({ ...t, status: t.status === "parked" ? "open" : "parked" })),
    [updateActiveTab],
  );
  const setTable = useCallback(
    (id: string | null) => updateActiveTab((t) => ({ ...t, tableId: id ?? undefined })),
    [updateActiveTab],
  );
  const changeCovers = useCallback(
    (delta: number) =>
      updateActiveTab((t) => ({ ...t, covers: Math.max(1, Math.min(50, (t.covers || 2) + delta)) })),
    [updateActiveTab],
  );
  const setAddress = useCallback(
    (v: string) => updateActiveTab((t) => ({ ...t, address: v.trim() || undefined })),
    [updateActiveTab],
  );

  const newTab = useCallback(async () => {
    if (!pageLoc) return;
    const name = `Tab ${tabsRef.current.length + 1}`;
    try {
      const res = await fetch(`/api/admin/pos/tabs?location=${encodeURIComponent(pageLoc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error("Couldn't open tab", (d as { error?: string }).error);
        return;
      }
      const { tab } = (await res.json()) as { tab: PosTab };
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    } catch {
      toast.error("Couldn't open tab");
    }
  }, [pageLoc, toast]);

  const discardTab = useCallback(
    async (t: PosTab) => {
      const rest = tabsRef.current.filter((x) => x.id !== t.id);
      setTabs(rest);
      setActiveTabId((cur) => (cur === t.id ? (rest[0]?.id ?? null) : cur));
      try {
        await saveChain.current;
        await fetch(`/api/admin/pos/tabs/${t.id}?location=${encodeURIComponent(pageLoc)}`, {
          method: "DELETE",
        });
      } catch {
        toast.error("Couldn't discard tab");
        fetchTabs();
      }
    },
    [pageLoc, toast, fetchTabs],
  );

  const [sending, setSending] = useState(false);
  const sendKds = useCallback(async () => {
    const t = active;
    if (!t || t.items.length === 0) return;
    if (!t.channel) {
      toast.error("Pick a channel first");
      return;
    }
    setSending(true);
    try {
      await saveChain.current; // flush pending edits so the kitchen gets them
      const res = await fetch(`/api/admin/pos/tabs/${t.id}/send?location=${encodeURIComponent(pageLoc)}`, {
        method: "POST",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error("Couldn't send to KDS", (d as { error?: string }).error);
        return;
      }
      const { tab } = (await res.json()) as { tab: PosTab };
      setTabs((prev) => prev.map((x) => (x.id === tab.id ? tab : x)));
      toast.success("Sent to KDS", `#${tab.id}`);
    } finally {
      setSending(false);
    }
  }, [active, pageLoc, toast]);

  const [tenderOpen, setTenderOpen] = useState(false);
  const [charging, setCharging] = useState(false);
  const pay = useCallback(
    async (method: "Cash" | "Card") => {
      const t = active;
      if (!t) return;
      setCharging(true);
      try {
        await saveChain.current;
        const res = await fetch(`/api/admin/pos/tabs/${t.id}/pay?location=${encodeURIComponent(pageLoc)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error("Couldn't charge", (d as { error?: string }).error);
          return;
        }
        const { total } = (await res.json()) as { total: number };
        setTenderOpen(false);
        const rest = tabsRef.current.filter((x) => x.id !== t.id);
        setTabs(rest);
        setActiveTabId(rest[0]?.id ?? null);
        toast.success("Paid", `#${t.id} · ${method} · ${fmtPLN(total)}`);
        fetchSteer();
      } finally {
        setCharging(false);
      }
    },
    [active, pageLoc, toast, fetchSteer],
  );

  // --- Table conflict (another open dine-in check on the same table) ---
  const tabsOnTable = useCallback(
    (tableId: string | undefined, exceptId: string) =>
      tableId
        ? tabs.filter(
            (t) =>
              t.id !== exceptId &&
              t.channel === "dine-in" &&
              t.status !== "parked" &&
              t.tableId === tableId,
          )
        : [],
    [tabs],
  );

  // --- Fullscreen ---
  const rootRef = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState(false);
  const toggleFs = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => setFs((v) => !v));
  }, []);
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // --- Clock ---
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

  // --- Keyboard ---
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [addrDialogOpen, setAddrDialogOpen] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTenderOpen(false);
        setTableDialogOpen(false);
        setAddrDialogOpen(false);
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        newTab();
        return;
      }
      if (k === "f") {
        toggleFs();
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const list = tabsRef.current;
        if (list[idx]) setActiveTabId(list[idx].id);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [newTab, toggleFs]);

  // --- Categories present in the menu, channel-aware ---
  const channelMenu = useMemo(() => {
    const ch = active?.channel;
    return menu.filter((m) => m.available && (ch === "delivery" || !m.deliveryOnly));
  }, [menu, active]);
  const categories = useMemo(() => {
    const present = new Set(channelMenu.map((m) => m.category));
    return (Object.keys(MENU_CATEGORY_LABELS) as MenuCategory[]).filter((c) => present.has(c));
  }, [channelMenu]);
  const [activeCat, setActiveCat] = useState<MenuCategory | "all">("all");
  useEffect(() => {
    if (activeCat !== "all" && !categories.includes(activeCat)) setActiveCat("all");
  }, [categories, activeCat]);

  // --- AI offers (real combo-completion + cross-sell engines) ---
  const offers = useMemo<Offer[]>(() => {
    if (!active || activeCartItems.length === 0) return [];
    const out: Offer[] = [];
    if (!combo.isComplete && combo.activeDeal && combo.savings > 0) {
      const deal = combo.activeDeal;
      const missingReq = (deal.requiredItems ?? []).filter((req) =>
        combo.missingItems.includes(req.label),
      );
      const addList = missingReq
        .map((req) => menu.find((m) => m.available && m.id.endsWith(req.suffix)))
        .filter((m): m is MenuItem => !!m);
      if (addList.length > 0) {
        out.push({
          key: `combo:${deal.id}`,
          kind: "combo",
          title: `Make it the ${deal.name}`,
          sub: `Add ${addList.map((m) => m.name).join(" + ")} — save ${fmtPLN(combo.savings)}`,
          cta: `−${fmtPLN(combo.savings)}`,
          apply: () => addItems(addList.map((m) => m.id)),
        });
      }
    }
    for (const s of getCartSuggestions(activeCartItems, menu, 4, config)) {
      if (out.length >= 3) break;
      out.push({
        key: `add:${s.item.id}`,
        kind: "add",
        title: `Add ${s.item.name}`,
        sub: s.reason,
        cta: `+ ${fmtPLN(s.item.price)}`,
        apply: () => addItem(s.item.id),
      });
    }
    return out.slice(0, 3);
  }, [active, activeCartItems, combo, menu, config, addItem, addItems]);

  // per-tab honest promise: worst station promise across this tab's categories
  const tabPromise = useMemo(() => {
    if (!plan || !active || active.items.length === 0) return null;
    const cats = new Set(active.items.map((l) => byId.get(l.menuItemId)?.category).filter(Boolean));
    let maxSec = 0;
    let maxCat: MenuCategory | null = null;
    for (const c of cats) {
      const sec = plan.promiseSecondsByCategory[c as MenuCategory] ?? 0;
      if (sec > maxSec) {
        maxSec = sec;
        maxCat = c as MenuCategory;
      }
    }
    const tier = plan.active && plan.bottleneck?.id === maxCat ? plan.bottleneck.tier : "calm";
    return { sec: maxSec, tier };
  }, [plan, active, byId]);

  const deliveryPaused =
    !!plan?.active && active?.channel === "delivery" && plan.deliveryCapNextWindow === 0;

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === active?.tableId) ?? null,
    [tables, active],
  );
  const tableConflict = !!active?.tableId && tabsOnTable(active.tableId, active.id).length > 0;

  const renderProduct = (item: MenuItem) => {
    const role = item.menuRole ? ROLE_LABELS[item.menuRole] : null;
    const makeNow = !!plan?.active && plan.makeNow.includes(item.id) && item.category !== bottleneckCat;
    const ease = !!plan?.active && item.category === bottleneckCat && plan.throttle.includes(item.id);
    return (
      <button
        key={item.id}
        type="button"
        className={`v2-pos-product${ease ? " v2-pos-product-eased" : ""}`}
        onClick={() => addItem(item.id)}
        disabled={!active}
      >
        <div className="v2-pos-product-top">
          <span className="v2-pos-product-name">{item.name}</span>
          {(role || item.isLimited) && (
            <span className="v2-pos-product-badges">
              {role && (
                <Badge tone={role.tone} variant="soft">
                  {role.label}
                </Badge>
              )}
              {item.isLimited && !role && (
                <Badge tone="warning" variant="soft">
                  LTO
                </Badge>
              )}
            </span>
          )}
        </div>
        <div className="v2-pos-product-foot">
          <span className="v2-pos-product-price mono tnum">{fmtPLN(item.price)}</span>
          {makeNow && <span className="v2-pos-makenow">★ Make now</span>}
          {ease && <span className="v2-pos-ease">▼ ease</span>}
        </div>
      </button>
    );
  };

  const locOptions = locationKeys.map((slug) => {
    const found = activeLocations.find((l) => l.slug === slug);
    return { value: slug, label: found?.city ?? slug };
  });

  const readyToPay = tabs.filter((t) => t.status === "pay").length;
  const parked = tabs.filter((t) => t.status === "parked").length;
  const openValue = tabs.reduce((s, t) => s + tabGrand(t), 0);

  return (
    <div className={`v2-page v2-pos2${fs ? " v2-pos2-fs" : ""}`} ref={rootRef}>
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">POS</h1>
          <p className="v2-page-subtitle">
            Counter terminal for {locName}. Juggle several open checks at the window — each rings
            straight onto the Kitchen Display.
          </p>
        </div>
        <div className="v2-pos2-clock mono tnum">
          <Clock className="h-4 w-4 v2-muted" /> {clock}
        </div>
      </header>

      <div className="v2-filters">
        <div className="v2-field-inline">
          <MapPin className="h-3.5 w-3.5 v2-muted" />
          <Select
            value={pageLoc}
            onChange={(e) => setPageLoc(e.target.value)}
            options={locOptions}
            aria-label="Location"
          />
        </div>
        <Button
          size="sm"
          variant={steer ? "primary" : "secondary"}
          leadingIcon={<Gauge className="h-3.5 w-3.5" />}
          onClick={() => setSteer((v) => !v)}
          aria-pressed={steer}
        >
          Steer {steer ? "on" : "off"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<RefreshCw className={`h-3.5 w-3.5 ${loading ? "v2-spin" : ""}`} />}
          onClick={() => {
            fetchTabs();
            fetchSteer();
          }}
        >
          Refresh
        </Button>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={fs ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          onClick={toggleFs}
        >
          {fs ? "Exit" : "Fullscreen"}
        </Button>
      </div>

      {/* Tab rail — open checks */}
      <section className="v2-pos2-rail-wrap" aria-label="Open checks">
        <div className="v2-pos2-rail-head">
          <span className="v2-pos2-rail-title">
            <Package className="h-3.5 w-3.5" /> Open checks
          </span>
          <span className="v2-pos2-rail-summary v2-muted">
            <b>{tabs.length}</b> tabs · <b>{readyToPay}</b> ready to pay · <b>{parked}</b> parked ·
            open value <b className="mono tnum">{fmtPLN(openValue)}</b>
          </span>
        </div>
        <div className="v2-pos2-rail">
          {tabs.map((t) => {
            const cnt = tabCount(t);
            const conflict = t.channel === "dine-in" && tabsOnTable(t.tableId, t.id).length > 0;
            const tbl = tables.find((x) => x.id === t.tableId);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTabId(t.id)}
                className={`v2-pos2-tab ${t.channel ? CHANNEL_CLASS[t.channel] : "chan-none"}${
                  t.id === activeTabId ? " is-active" : ""
                }${t.status === "parked" ? " is-parked" : ""}${t.status === "pay" ? " is-pay" : ""}`}
              >
                <div className="v2-pos2-tab-top">
                  <span className="v2-pos2-tab-dot" />
                  <span className="v2-pos2-tab-name">{t.name}</span>
                  {t.channel && <span className="v2-pos2-tab-chan">{CHANNEL_LABEL[t.channel]}</span>}
                </div>
                <div className="v2-pos2-tab-meta">
                  <span className="v2-pos2-tab-id mono tnum">#{t.id}</span>
                  {t.channel === "dine-in" && t.tableId && (
                    <Badge tone={conflict ? "warning" : "success"} variant="soft">
                      {tbl ? `T${tbl.number}` : "table"}
                      {t.covers ? ` · ${t.covers}` : ""}
                    </Badge>
                  )}
                  <span className="v2-pos2-tab-status">{STATUS_LABEL[t.status]}</span>
                </div>
                <div className="v2-pos2-tab-foot">
                  <span className="v2-pos2-tab-items">
                    {cnt} item{cnt === 1 ? "" : "s"}
                  </span>
                  <span className="v2-pos2-tab-total mono tnum">{fmtPLN(tabGrand(t))}</span>
                </div>
              </button>
            );
          })}
          <button type="button" className="v2-pos2-tab-new" onClick={newTab}>
            <Plus className="h-5 w-5" />
            New tab
          </button>
        </div>
      </section>

      {/* Editor */}
      {!active ? (
        <div className="v2-pos2-empty">
          {locationKeys.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No active location"
              description="This POS has no truck to ring up against. Activate a location in Locations, then reload."
            />
          ) : loading ? (
            <span className="v2-muted">Loading checks…</span>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="No open checks"
              description="The window is clear. Start a new tab to ring up an order."
              action={
                <Button variant="primary" leadingIcon={<Plus className="h-4 w-4" />} onClick={newTab}>
                  Start a new tab
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <div className="v2-pos2-editor">
          {/* LEFT — products */}
          <div className="v2-pos2-products">
            {plan && (
              <div
                className={`v2-pos2-steer${
                  plan.active && plan.bottleneck ? ` tier-${plan.bottleneck.tier}` : ""
                }`}
              >
                {plan.active && plan.bottleneck ? (
                  <>
                    <span className="v2-pos2-steer-badge">
                      <Gauge className="h-3.5 w-3.5" /> {plan.bottleneck.label}{" "}
                      <b className="mono">
                        {Number.isFinite(plan.bottleneck.util)
                          ? `${Math.round(plan.bottleneck.util * 100)}%`
                          : "—"}
                      </b>
                    </span>
                    <span className="v2-pos2-steer-reason">{plan.reason}</span>
                    {plan.deliveryCapNextWindow != null && (
                      <span
                        className={`v2-pos2-steer-cap${plan.deliveryCapNextWindow === 0 ? " zero" : ""}`}
                      >
                        cap {plan.deliveryCapNextWindow}/{steerResp?.paceWindowMin ?? 15}m
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="v2-pos2-steer-badge ok">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Line clear
                    </span>
                    <span className="v2-pos2-steer-reason">
                      All stations within capacity — normal menu, honest promise times live.
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="v2-pos-chips" role="tablist" aria-label="Categories">
              <button
                type="button"
                role="tab"
                aria-selected={activeCat === "all"}
                onClick={() => setActiveCat("all")}
                className={`v2-badge v2-badge-${activeCat === "all" ? "solid" : "outline"} v2-badge-tone-${
                  activeCat === "all" ? "brand" : "neutral"
                } v2-pos-chip`}
              >
                All
              </button>
              {categories.map((c) => {
                const sec = plan ? (plan.promiseSecondsByCategory[c] ?? 0) : 0;
                return (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={c === activeCat}
                    onClick={() => setActiveCat(c)}
                    className={`v2-badge v2-badge-${c === activeCat ? "solid" : "outline"} v2-badge-tone-${
                      c === activeCat ? "brand" : "neutral"
                    } v2-pos-chip`}
                  >
                    {MENU_CATEGORY_LABELS[c]}
                    {plan?.active && sec > 0 && <span className="v2-pos-chip-prom"> · {promiseLabel(sec)}</span>}
                  </button>
                );
              })}
            </div>

            <div className="v2-pos2-grid-scroll">
              {activeCat === "all" ? (
                <div className="v2-pos-cat-groups">
                  {categories.map((c) => {
                    const items = channelMenu.filter((m) => m.category === c);
                    return (
                      <section key={c} className="v2-pos-cat-group">
                        <h3 className="v2-pos-cat-head">
                          {MENU_CATEGORY_LABELS[c]}
                          <span className="v2-muted"> · {items.length}</span>
                        </h3>
                        <div className="v2-pos-grid">{items.map(renderProduct)}</div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="v2-pos-grid">
                  {channelMenu.filter((m) => m.category === activeCat).map(renderProduct)}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — ticket */}
          <div className="v2-pos2-ticket">
            <div className="v2-pos2-ticket-head">
              <div className="v2-pos2-th-row1">
                <span
                  className={`v2-pos2-th-dot ${active.status}${active.channel ? " " + CHANNEL_CLASS[active.channel] : ""}`}
                />
                <span className="v2-pos2-th-name">{active.name}</span>
                <span className="v2-pos2-th-id mono tnum">#{active.id}</span>
                <span className="v2-pos2-th-status v2-muted">
                  {active.channel ? CHANNEL_LABEL[active.channel] : "No channel"} · {STATUS_LABEL[active.status]}
                </span>
                {tabPromise && (
                  <span className={`v2-pos2-th-promise${tabPromise.tier !== "calm" ? " tier-" + tabPromise.tier : ""}`}>
                    <Clock className="h-3 w-3" /> ready {promiseLabel(tabPromise.sec)}
                  </span>
                )}
              </div>

              <div className="v2-pos-channel" role="tablist" aria-label="Channel">
                {CHANNELS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="tab"
                    aria-selected={active.channel === c.value}
                    className={`v2-pos-channel-btn ${active.channel === c.value ? "is-active" : ""}`}
                    onClick={() => setChannel(c.value)}
                  >
                    {c.icon}
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
              {!active.channel && (
                <div className="v2-pos2-th-req">Choose a channel to send or charge this order.</div>
              )}

              {active.channel === "dine-in" && (
                <div className="v2-pos2-th-detail">
                  <Button
                    variant="secondary"
                    className={tableConflict ? "v2-pos2-detail-conflict" : selectedTable ? "v2-pos2-detail-on" : ""}
                    onClick={() => {
                      fetchTables();
                      setTableDialogOpen(true);
                    }}
                  >
                    {selectedTable ? `Table ${selectedTable.number}${tableConflict ? " ⚠" : ""}` : "Assign table"}
                  </Button>
                  <div className="v2-pos-stepper v2-pos-stepper-inline">
                    <Button size="sm" variant="ghost" aria-label="Fewer covers" onClick={() => changeCovers(-1)}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="v2-pos-qty mono tnum">
                      <Users className="h-3.5 w-3.5 v2-muted" /> {active.covers ?? 2}
                    </span>
                    <Button size="sm" variant="ghost" aria-label="More covers" onClick={() => changeCovers(1)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
              {active.channel === "delivery" && (
                <div className="v2-pos2-th-detail">
                  <Button
                    variant="secondary"
                    block
                    className={active.address ? "v2-pos2-detail-on" : ""}
                    onClick={() => setAddrDialogOpen(true)}
                  >
                    {active.address ? active.address : "Add delivery address"}
                  </Button>
                </div>
              )}
              {deliveryPaused && (
                <div className="v2-pos-warn">
                  Delivery intake paused — the bottleneck station can&apos;t absorb more this window.
                </div>
              )}

              <div className="v2-pos2-th-actions">
                <Button
                  variant="secondary"
                  leadingIcon={
                    active.status === "parked" ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />
                  }
                  onClick={togglePark}
                >
                  {active.status === "parked" ? "Resume" : "Park"}
                </Button>
                <Button
                  variant="secondary"
                  loading={sending}
                  disabled={active.items.length === 0 || !active.channel}
                  className={active.sentKds ? "v2-pos2-kds-sent" : ""}
                  leadingIcon={<Send className="h-4 w-4" />}
                  onClick={sendKds}
                >
                  {active.sentKds ? "Sent ✓" : "Send to KDS"}
                </Button>
              </div>
            </div>

            <div className="v2-pos2-lines">
              {active.items.length === 0 ? (
                <EmptyState
                  compact
                  icon={Package}
                  title={`${active.name} is empty`}
                  description="Tap a product on the left to start this check."
                />
              ) : (
                <div className="v2-pos-lines">
                  {active.items.map((line) => {
                    const m = byId.get(line.menuItemId);
                    if (!m) return null;
                    return (
                      <div key={line.menuItemId} className="v2-pos-line">
                        <div className="v2-pos-line-body">
                          <span className="v2-pos-line-name">{m.name}</span>
                          <span className="v2-pos-line-each v2-muted mono tnum">{fmtPLN(m.price)} each</span>
                        </div>
                        <div className="v2-pos-stepper">
                          <Button size="sm" variant="ghost" aria-label={`Decrease ${m.name}`} onClick={() => changeQty(m.id, -1)}>
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="v2-pos-qty mono tnum">{line.quantity}</span>
                          <Button size="sm" variant="ghost" aria-label={`Increase ${m.name}`} onClick={() => changeQty(m.id, 1)}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <span className="v2-pos-line-total mono tnum">{fmtPLN(m.price * line.quantity)}</span>
                        <Button size="sm" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => changeQty(m.id, -line.quantity)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {offers.length > 0 && (
                <div className="v2-pos2-offers">
                  <div className="v2-pos2-offers-head">
                    <Sparkles className="h-3.5 w-3.5" /> Best offers for this order
                  </div>
                  {offers.map((o) => (
                    <button key={o.key} type="button" className="v2-pos2-offer" onClick={o.apply}>
                      <span className="v2-pos2-offer-main">
                        <span className="v2-pos2-offer-title">{o.title}</span>
                        <span className="v2-pos2-offer-sub v2-muted">{o.sub}</span>
                      </span>
                      <span className={`v2-pos2-offer-cta ${o.kind}`}>{o.cta}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="v2-pos2-foot">
              <div className="v2-pos-totals">
                <div className="v2-pos-total-row">
                  <span className="v2-muted">Subtotal</span>
                  <span className="mono tnum">{fmtPLN(itemsTotal)}</span>
                </div>
                {comboSavings > 0 && (
                  <div className="v2-pos-total-row v2-pos2-discount">
                    <span>Combo · {combo.activeDeal?.name}</span>
                    <span className="mono tnum">−{fmtPLN(comboSavings)}</span>
                  </div>
                )}
                <div className="v2-pos-total-row v2-pos-total-grand">
                  <span>Total</span>
                  <span className="mono tnum">{fmtPLN(grand)}</span>
                </div>
              </div>
              <Button
                variant="primary"
                block
                disabled={active.items.length === 0 || !active.channel}
                leadingIcon={<CreditCard className="h-4 w-4" />}
                onClick={() => setTenderOpen(true)}
              >
                {active.items.length > 0 && !active.channel ? "Select a channel" : `Charge ${fmtPLN(grand)}`}
              </Button>
              <button type="button" className="v2-pos2-discard" onClick={() => active && discardTab(active)}>
                Discard tab
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tender sheet */}
      <Dialog
        open={tenderOpen}
        onClose={() => setTenderOpen(false)}
        size="sm"
        title="Take payment"
        description={active ? `${active.name} · ${fmtPLN(grand)}` : undefined}
      >
        <div className="v2-pos2-tender">
          <button type="button" className="v2-pos2-tender-opt" disabled={charging} onClick={() => pay("Cash")}>
            <Banknote className="h-6 w-6" />
            Cash
          </button>
          <button type="button" className="v2-pos2-tender-opt" disabled={charging} onClick={() => pay("Card")}>
            <CreditCard className="h-6 w-6" />
            Card
          </button>
        </div>
      </Dialog>

      {/* Table picker */}
      <Dialog
        open={tableDialogOpen}
        onClose={() => setTableDialogOpen(false)}
        size="md"
        title="Assign a table"
        description="Tables flagged in amber already have an active dine-in check — you can still seat here."
        footer={
          <>
            {active?.tableId && (
              <Button
                variant="ghost"
                onClick={() => {
                  setTable(null);
                  setTableDialogOpen(false);
                }}
              >
                Clear table
              </Button>
            )}
            <Button variant="ghost" onClick={() => setTableDialogOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        {tables.length === 0 ? (
          <EmptyState
            compact
            icon={Utensils}
            title="No tables configured"
            description="Add tables on the Floor page to seat dine-in checks."
          />
        ) : (
          <div className="v2-pos-tables">
            {tables.map((t) => {
              const occupied = active ? tabsOnTable(t.id, active.id).length > 0 : false;
              const isSel = t.id === active?.tableId;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`v2-pos-table${isSel ? " is-selected" : ""}`}
                  onClick={() => {
                    setTable(t.id);
                    setTableDialogOpen(false);
                  }}
                >
                  <div className="v2-pos-table-top">
                    <span className="v2-pos-table-num mono">T{t.number}</span>
                    {occupied && (
                      <Badge tone="warning" variant="soft">
                        In use
                      </Badge>
                    )}
                  </div>
                  <span className="v2-pos-table-meta v2-muted">
                    {t.seats} seat{t.seats === 1 ? "" : "s"}
                    {t.zone ? ` · ${t.zone}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Dialog>

      {/* Delivery address */}
      <AddressDialog
        open={addrDialogOpen}
        initial={active?.address ?? ""}
        onClose={() => setAddrDialogOpen(false)}
        onSave={(v) => {
          setAddress(v);
          setAddrDialogOpen(false);
        }}
      />
    </div>
  );
}

function AddressDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: string;
  onClose: () => void;
  onSave: (v: string) => void;
}) {
  // Uncontrolled: the textarea remounts (keyed on open) so it re-seeds from
  // `initial` each time the sheet opens, without a setState-in-effect sync.
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Delivery address"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              if (ref.current) ref.current.value = "";
              ref.current?.focus();
            }}
          >
            Clear
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(ref.current?.value ?? "")}>
            Save
          </Button>
        </>
      }
    >
      <textarea
        key={open ? `open-${initial}` : "closed"}
        ref={ref}
        className="v2-pos2-addr"
        rows={3}
        defaultValue={initial}
        placeholder="Street & number, flat / buzzer, city — plus any note for the driver"
      />
    </Dialog>
  );
}
