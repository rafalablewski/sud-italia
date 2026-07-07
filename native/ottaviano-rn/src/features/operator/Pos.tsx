import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { useOperatorLocation } from "@/store/operatorLocation";
import { StateBlock } from "@/components/ui";
import { Aurora, LiquidGlass } from "@/components/LiquidGlass";
import { formatMoney } from "@/lib/format";
import { useBreakpoint } from "@/lib/useBreakpoint";

// Service · POS — the ADR-001 target screen. A bespoke operator POS mirroring the
// web `CorePos` dense console, in React Native, on the bridged SwiftUI Aurora +
// Liquid Glass surface. Registered in `bespoke.ts` under `/core/pos`.
//
// Every figure AND every write is REAL off `/api/v1` (Rule #1): the live menu,
// server till KPIs, the open checks, kitchen pressure, the steering plan, the
// daypart Popular set, and the 86 list — plus the full active-check lifecycle
// (create / add / restyle / void a check, and fire it to the KDS) through the
// same shared store/lib the web till drives.

/** `/api/v1/admin/menu?location=` — money in grosze. */
interface PosMenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  tags: string[];
  available: boolean;
  menuRole?: string | null;
}
/** `/api/v1/admin/pos/kpis` — server-computed till KPIs (money in grosze). */
interface PosKpis {
  avgCheck: number;
  avgCheckDeltaPct: number | null;
  salesPerHour: number;
  salesDeltaPct: number | null;
  tableTurns: number;
  tableTurnsDeltaPct: number | null;
  tableCount: number;
}
type Channel = "dine-in" | "takeout" | "delivery";
interface TabDiscount {
  type: "amount" | "percent";
  value: number;
  reason?: string;
}
/** `/api/v1/admin/pos/tabs` — a server-backed open check. */
interface PosTab {
  id: string;
  locationSlug?: string;
  name: string;
  status: string;
  channel?: Channel | null;
  covers?: number | null;
  tableId?: string | null;
  customerPhone?: string | null;
  customerName?: string | null;
  coursed?: boolean | null;
  discount?: TabDiscount | null;
  sentKds?: boolean;
  items: { menuItemId: string; quantity: number }[];
}
/** `/api/v1/admin/floor/tables` — a floor table. */
interface FloorTable {
  id: string;
  number: number;
  seats: number;
  zone: string | null;
  status: string;
}
/** `/api/v1/admin/customers/:phone` — the member-lookup subset we use. */
interface MemberInfo {
  phone: string;
  name: string | null;
  member: unknown | null;
  totals: { earnedPoints: number; manualPoints: number; redeemedPoints: number; orderCount: number; totalSpent: number };
}
/** `/api/v1/admin/pos/pressure` — live kitchen pressure for the risk badge. */
interface Pressure {
  tier: string;
  onLine: number;
  atRisk: number;
  oldestSec: number;
}
/** `/api/v1/admin/pace/steering` → `plan` — the demand-steering feed. */
interface SteerPlan {
  active: boolean;
  bottleneck: { label: string; util: number; tier: string } | null;
  reason: string | null;
  makeNow: string[];
  throttle: string[];
  promiseSecondsByCategory: Record<string, number>;
  deliveryCapNextWindow: number;
}
/** `/api/v1/admin/pos/suggestions` — a cross-sell chip. */
interface Suggestion {
  id: string;
  name: string;
  price: number;
  reason: string;
}
/** `/api/v1/admin/pos/combos` — the "complete the deal" prompt. */
interface ComboInfo {
  activeDeal: { id: string; name: string; description: string; discountPercent: number } | null;
  savings: number;
  missingItems: string[];
  missingCategories: string[];
  missingQuantity: number;
  isComplete: boolean;
  completeIds: string[];
}

const CATEGORY_ORDER = ["pizza", "pasta", "antipasti", "panini", "desserts", "drinks"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  pizza: "Pizza",
  pasta: "Pasta",
  antipasti: "Antipasti",
  panini: "Panini",
  desserts: "Dolci",
  drinks: "Drinks",
};
const CAT_GLYPH: Record<string, string> = {
  popular: "★",
  all: "▦",
  pizza: "◐",
  pasta: "≋",
  antipasti: "❦",
  panini: "▤",
  desserts: "♨",
  drinks: "◍",
};
const ROLE_BADGE: Record<string, string> = { hero: "HERO", "profit-driver": "PROFIT", anchor: "ANCHOR", lto: "LTO" };
const TAG_LABEL: Record<string, string> = { vegetarian: "V", vegan: "VG", spicy: "S", "gluten-free": "GF" };
const CHANNELS: { key: Channel; label: string }[] = [
  { key: "dine-in", label: "Dine-in" },
  { key: "takeout", label: "Takeaway" },
  { key: "delivery", label: "Delivery" },
];

const promiseMin = (sec?: number): string | null => (sec && sec > 0 ? `~${Math.round(sec / 60)}m` : null);
const pctChip = (p: number | null | undefined): { txt: string; up: boolean | null } =>
  p == null ? { txt: "—", up: null } : { txt: `${p >= 0 ? "+" : ""}${p}%`, up: p >= 0 };

export function Pos() {
  const { c, radius, spacing } = useTheme();
  const { authed } = useOperator();
  const { slug, locations, setSlug, ensureLoaded } = useOperatorLocation();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  // Responsive layout (ADR-002): wide screens (Mac / iPad landscape) pack the
  // menu grid tighter, on the way to the full desktop console.
  const { isDesktop, isTablet } = useBreakpoint();
  const menuCardWidth = isDesktop ? "15.6%" : isTablet ? "31.5%" : "48%";
  const DESKTOP_TICKET_W = 420;
  const cardW = isDesktop ? winW - DESKTOP_TICKET_W - spacing.md * 3 : winW - spacing.md * 2;

  // Draggable cart sheet: snaps between a peek (controls only) and a tall state
  // (full line list). The grabber drives it; height is pinned to bottom:0 so the
  // sheet is always flush to the screen edge.
  const SHEET_MIN = 452 + insets.bottom;
  const SHEET_MAX = Math.max(SHEET_MIN + 140, Math.round(winH * 0.86));
  // Keep the live snap bounds in a ref so the (once-created) PanResponder always
  // reads current values even though insets/winH resolve after the first render.
  const boundsRef = useRef({ min: SHEET_MIN, max: SHEET_MAX });
  boundsRef.current = { min: SHEET_MIN, max: SHEET_MAX };
  const sheetH = useRef(new Animated.Value(SHEET_MIN)).current;
  const sheetFrom = useRef(SHEET_MIN);
  const snapTo = useCallback(
    (v: number) => Animated.spring(sheetH, { toValue: v, useNativeDriver: false, bounciness: 4 }).start(),
    [sheetH],
  );
  const sheetPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 3,
      onPanResponderGrant: () => {
        sheetH.stopAnimation((v: number) => {
          sheetFrom.current = v;
        });
      },
      onPanResponderMove: (_e, g) => {
        const { min, max } = boundsRef.current;
        sheetH.setValue(Math.min(max, Math.max(min, sheetFrom.current - g.dy)));
      },
      onPanResponderRelease: (_e, g) => {
        const { min, max } = boundsRef.current;
        const mid = (min + max) / 2;
        // A tap (tiny drag) toggles; a real drag snaps to the nearer stop.
        if (Math.abs(g.dy) < 6) {
          snapTo(sheetFrom.current < mid ? max : min);
          return;
        }
        snapTo(sheetFrom.current - g.dy > mid ? max : min);
      },
    }),
  ).current;

  const [items, setItems] = useState<PosMenuItem[] | null>(null);
  const [kpis, setKpis] = useState<PosKpis | null>(null);
  const [tabs, setTabs] = useState<PosTab[]>([]);
  const [pressure, setPressure] = useState<Pressure | null>(null);
  const [steer, setSteer] = useState<SteerPlan | null>(null);
  const [windowMin, setWindowMin] = useState(15);
  const [popularIds, setPopularIds] = useState<string[]>([]);
  const [eightySix, setEightySix] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const [cat, setCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [firing, setFiring] = useState(false);
  const [charging, setCharging] = useState(false);
  const [tenderOpen, setTenderOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [combo, setCombo] = useState<ComboInfo | null>(null);

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  // Open checks — its own loader so mutations can re-sync from the server.
  const loadTabs = useCallback(async () => {
    if (!slug) return;
    try {
      const { data } = await authed<PosTab[]>(`/admin/pos/tabs?location=${encodeURIComponent(slug)}`);
      setTabs(data);
      // Keep the current selection only if it still exists (a fired/voided check
      // drops out); never auto-select — the till starts on the menu, not a check.
      setActiveTabId((cur) => (cur && data.some((t) => t.id === cur) ? cur : null));
    } catch {
      /* non-fatal */
    }
  }, [authed, slug]);

  useEffect(() => {
    if (!slug) return;
    const loc = encodeURIComponent(slug);
    setItems(null);
    setError(null);
    authed<PosMenuItem[]>(`/admin/menu?location=${loc}`)
      .then(({ data }) => setItems(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the menu"));
    authed<PosKpis>(`/admin/pos/kpis?location=${loc}`).then(({ data }) => setKpis(data)).catch(() => setKpis(null));
    authed<Pressure>(`/admin/pos/pressure?location=${loc}`).then(({ data }) => setPressure(data)).catch(() => setPressure(null));
    authed<{ paceWindowMin?: number; plan?: SteerPlan }>(`/admin/pace/steering?location=${loc}`)
      .then(({ data }) => {
        setSteer(data.plan ?? null);
        if (data.paceWindowMin) setWindowMin(data.paceWindowMin);
      })
      .catch(() => setSteer(null));
    authed<{ popular?: string[] }>(`/admin/pos/popular?location=${loc}`)
      .then(({ data }) => setPopularIds(data.popular ?? []))
      .catch(() => setPopularIds([]));
    authed<{ eightySixed?: { id: string }[] }>(`/admin/kds/eighty-six?location=${loc}`)
      .then(({ data }) => setEightySix(new Set((data.eightySixed ?? []).map((m) => m.id))))
      .catch(() => setEightySix(new Set()));
    authed<FloorTable[]>(`/admin/floor/tables?location=${loc}`).then(({ data }) => setTables(data)).catch(() => setTables([]));
    void loadTabs();
  }, [authed, slug, loadTabs]);

  const byId = useMemo(() => {
    const m = new Map<string, PosMenuItem>();
    for (const i of items ?? []) m.set(i.id, i);
    return m;
  }, [items]);

  const isAvail = (m: PosMenuItem) => m.available && !eightySix.has(m.id);

  const categories = useMemo(() => {
    const present = new Set((items ?? []).filter((m) => m.available).map((m) => m.category));
    return CATEGORY_ORDER.filter((cc) => present.has(cc));
  }, [items]);

  const popularItems = useMemo(
    () => popularIds.map((id) => byId.get(id)).filter((m): m is PosMenuItem => !!m),
    [popularIds, byId],
  );
  const hasPopular = popularItems.length > 0;
  const activeCat = cat ?? (hasPopular ? "popular" : categories[0] ?? "all");

  const makeNowSet = useMemo(() => new Set(steer?.makeNow ?? []), [steer]);
  const throttleSet = useMemo(() => new Set(steer?.throttle ?? []), [steer]);

  const gridItems = useMemo(() => {
    const source =
      activeCat === "popular"
        ? popularItems
        : activeCat === "all"
          ? (items ?? [])
          : (items ?? []).filter((m) => m.category === activeCat);
    const q = search.trim().toLowerCase();
    return source
      .filter((m) => q === "" || m.name.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => Number(isAvail(b)) - Number(isAvail(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, popularItems, activeCat, search, eightySix]);

  const railCount = tabs.length;
  const parked = tabs.filter((t) => t.status === "parked").length;
  const posStats = useMemo(() => {
    const live = tabs.filter((t) => t.status !== "parked");
    const covers = live.filter((t) => t.channel === "dine-in").reduce((s, t) => s + (t.covers ?? 0), 0);
    const dineIn = live.filter((t) => t.channel === "dine-in").length;
    const prepItems = tabs.filter((t) => t.sentKds).reduce((s, t) => s + t.items.reduce((a, l) => a + l.quantity, 0), 0);
    return { covers, dineIn, prepItems };
  }, [tabs]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const checkLines = useMemo(
    () =>
      (activeTab?.items ?? [])
        .map((l) => ({ item: byId.get(l.menuItemId), qty: l.quantity }))
        .filter((l): l is { item: PosMenuItem; qty: number } => !!l.item),
    [activeTab, byId],
  );
  const checkCount = checkLines.reduce((s, l) => s + l.qty, 0);
  const checkTotal = checkLines.reduce((s, l) => s + l.item.price * l.qty, 0);
  const checkPromiseSec = useMemo(() => {
    if (!steer) return 0;
    let worst = 0;
    for (const l of checkLines) worst = Math.max(worst, steer.promiseSecondsByCategory[l.item.category] ?? 0);
    return worst;
  }, [checkLines, steer]);
  const qtyOnCheck = (id: string) => activeTab?.items.find((l) => l.menuItemId === id)?.quantity ?? 0;

  // ── Active-check writes (real, persisted through the v1 facade) ───────────
  const persistTab = useCallback(
    async (tab: PosTab) => {
      if (!slug) return;
      try {
        const { data } = await authed<PosTab>(`/admin/pos/tabs`, {
          method: "PUT",
          body: {
            id: tab.id,
            locationSlug: slug,
            name: tab.name,
            channel: tab.channel ?? null,
            status: tab.status,
            items: tab.items.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
            // Carry the whole check so an item edit never wipes these.
            tableId: tab.tableId ?? undefined,
            covers: tab.covers ?? undefined,
            customerPhone: tab.customerPhone ?? undefined,
            customerName: tab.customerName ?? undefined,
            coursed: tab.coursed ?? undefined,
            discount: tab.discount ?? null,
          },
        });
        setTabs((prev) => prev.map((t) => (t.id === data.id ? data : t)));
      } catch {
        void loadTabs();
      }
    },
    [authed, slug, loadTabs],
  );

  const newCheck = useCallback(async (): Promise<PosTab | null> => {
    if (!slug) return null;
    const maxNum = tabs.reduce((m, t) => {
      const mm = /^Tab (\d+)$/.exec(t.name);
      return mm ? Math.max(m, parseInt(mm[1], 10)) : m;
    }, 0);
    try {
      const { data } = await authed<PosTab>(`/admin/pos/tabs?location=${encodeURIComponent(slug)}`, {
        method: "POST",
        body: { name: `Tab ${maxNum + 1}` },
      });
      // Zero-friction: default new checks to takeaway so a sale fires with one tap
      // (the channel chips still let the operator switch to dine-in / delivery).
      const tab: PosTab = { ...data, channel: data.channel ?? "takeout" };
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      return tab;
    } catch {
      Alert.alert("Couldn't open a check", "Try again.");
      return null;
    }
  }, [authed, slug, tabs]);

  const addItem = useCallback(
    async (menuItemId: string) => {
      let tab = activeTab;
      if (!tab) tab = await newCheck();
      if (!tab) return;
      const items = [...tab.items];
      const i = items.findIndex((l) => l.menuItemId === menuItemId);
      if (i >= 0) items[i] = { ...items[i], quantity: Math.min(99, items[i].quantity + 1) };
      else items.push({ menuItemId, quantity: 1 });
      const next = { ...tab, items };
      setTabs((prev) => prev.map((t) => (t.id === next.id ? next : t)));
      void persistTab(next);
    },
    [activeTab, newCheck, persistTab],
  );

  const setLineQty = useCallback(
    (menuItemId: string, delta: number) => {
      if (!activeTab) return;
      const items = activeTab.items
        .map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0);
      const next = { ...activeTab, items };
      setTabs((prev) => prev.map((t) => (t.id === next.id ? next : t)));
      void persistTab(next);
    },
    [activeTab, persistTab],
  );

  // Patch fields on the active check + persist (discount / table / member / …).
  const patchActive = useCallback(
    (changes: Partial<PosTab>) => {
      if (!activeTab) return;
      const next = { ...activeTab, ...changes };
      setTabs((prev) => prev.map((t) => (t.id === next.id ? next : t)));
      void persistTab(next);
    },
    [activeTab, persistTab],
  );
  const setChannel = useCallback((channel: Channel) => patchActive({ channel }), [patchActive]);

  const voidCheck = useCallback(async () => {
    const t = activeTab;
    if (!t || !slug) return;
    const rest = tabs.filter((x) => x.id !== t.id);
    setTabs(rest);
    setActiveTabId(rest[0]?.id ?? null);
    try {
      await authed(`/admin/pos/tabs?location=${encodeURIComponent(slug)}&id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
    } catch {
      void loadTabs();
    }
  }, [activeTab, slug, tabs, authed, loadTabs]);

  const fire = useCallback(async () => {
    const t = activeTab;
    if (!t || t.items.length === 0 || firing || !slug) return;
    if (!t.channel) {
      Alert.alert("Pick a channel", "Choose dine-in, takeaway or delivery before firing to the kitchen.");
      return;
    }
    setFiring(true);
    try {
      await authed<{ firedCourses?: string[] }>(
        `/admin/pos/tabs/${encodeURIComponent(t.id)}/fire?location=${encodeURIComponent(slug)}`,
        { method: "POST", body: { fireAll: true } },
      );
      Alert.alert("Fired to kitchen ✓", `${t.name} sent to the KDS.`);
      setActiveTabId(null);
      await loadTabs();
    } catch (e) {
      Alert.alert("Couldn't fire", e instanceof Error ? e.message : "Try again.");
    } finally {
      setFiring(false);
    }
  }, [activeTab, firing, slug, authed, loadTabs]);

  // Add several ids to the active check in one write (combo completion).
  const addMany = useCallback(
    (ids: string[]) => {
      if (!activeTab || ids.length === 0) return;
      const items = [...activeTab.items];
      for (const id of ids) {
        const i = items.findIndex((l) => l.menuItemId === id);
        if (i >= 0) items[i] = { ...items[i], quantity: Math.min(99, items[i].quantity + 1) };
        else items.push({ menuItemId: id, quantity: 1 });
      }
      const next = { ...activeTab, items };
      setTabs((prev) => prev.map((t) => (t.id === next.id ? next : t)));
      void persistTab(next);
    },
    [activeTab, persistTab],
  );

  // Settle the check via the tender sheet — the server re-derives + clamps the
  // bill (tip / cash / change), stamps it paid, closes the tab.
  const doCharge = useCallback(
    async (tender: { tipGrosze?: number; defaultMethod: "cash" | "card"; cashTenderedGrosze?: number; compGrosze?: number; compNote?: string; compOverridePin?: string }) => {
      const t = activeTab;
      if (!t || t.items.length === 0 || charging || !slug) return;
      setTenderOpen(false);
      setCharging(true);
      try {
        const { data } = await authed<{ totalAmount?: number; change?: number }>(
          `/admin/pos/tabs/${encodeURIComponent(t.id)}/charge?location=${encodeURIComponent(slug)}`,
          { method: "POST", body: tender },
        );
        const change = data.change && data.change > 0 ? ` · change ${formatMoney(data.change)}` : "";
        Alert.alert("Paid ✓", `${t.name} · ${formatMoney(data.totalAmount ?? 0)} · ${tender.defaultMethod}${change}`);
        setActiveTabId(null);
        await loadTabs();
      } catch (e) {
        Alert.alert("Payment failed", e instanceof Error ? e.message : "Try again.");
      } finally {
        setCharging(false);
      }
    },
    [activeTab, charging, slug, authed, loadTabs],
  );
  const lookupMember = useCallback(
    async (phone: string): Promise<MemberInfo> => {
      const { data } = await authed<MemberInfo>(`/admin/customers/${encodeURIComponent(phone)}`);
      return data;
    },
    [authed],
  );

  // Live cross-sell + combo panel for the open check (real engines off v1).
  const checkItemIds = useMemo(
    () => (activeTab?.items ?? []).flatMap((l) => Array<string>(l.quantity).fill(l.menuItemId)),
    [activeTab],
  );
  const activeChannel = activeTab?.channel ?? null;
  useEffect(() => {
    if (!slug || checkItemIds.length === 0) {
      setSuggestions([]);
      setCombo(null);
      return;
    }
    let cancelled = false;
    authed<Suggestion[]>(`/admin/pos/suggestions`, { method: "POST", body: { locationSlug: slug, itemIds: checkItemIds } })
      .then(({ data }) => !cancelled && setSuggestions(data))
      .catch(() => !cancelled && setSuggestions([]));
    authed<ComboInfo>(`/admin/pos/combos`, { method: "POST", body: { locationSlug: slug, itemIds: checkItemIds, channel: activeChannel ?? undefined } })
      .then(({ data }) => !cancelled && setCombo(data.activeDeal ? data : null))
      .catch(() => !cancelled && setCombo(null));
    return () => {
      cancelled = true;
    };
  }, [authed, slug, checkItemIds, activeChannel]);

  if (error && !items) return <StateBlock kind="error" message={error} />;
  if (!items) return <StateBlock kind="loading" />;

  const riskN = pressure?.atRisk ?? 0;
  const cartOpen = !!activeTab && checkLines.length > 0;
  // Pricing preview — server re-prices at fire/charge; this only informs the till.
  const comboDiscount = combo?.isComplete ? combo.savings ?? 0 : 0;
  const afterCombo = Math.max(0, checkTotal - comboDiscount);
  const manualDiscount = activeTab?.discount
    ? activeTab.discount.type === "amount"
      ? Math.min(afterCombo, Math.max(0, activeTab.discount.value))
      : Math.round((afterCombo * Math.min(100, Math.max(0, activeTab.discount.value))) / 100)
    : 0;
  const discount = comboDiscount + manualDiscount;
  const grandTotal = Math.max(0, checkTotal - discount);
  const tableNo = tables.find((t) => t.id === activeTab?.tableId)?.number ?? null;
  const onCheck = new Set(activeTab?.items.map((l) => l.menuItemId) ?? []);
  const crossSell = suggestions.filter((s) => !onCheck.has(s.id)).slice(0, 3);
  const showCombo = !!combo && !combo.isComplete && combo.completeIds.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#140f0d", flexDirection: isDesktop ? "row" : "column" }}>
      {/* Native SwiftUI ambient backdrop — the glass panels refract it (ADR-001). */}
      <Aurora style={StyleSheet.absoluteFill} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: !isDesktop && cartOpen ? SHEET_MIN + 24 : 40 + insets.bottom }}
      >
        {/* ── Command bar — identity · location · live risk badge ─────────── */}
        <GlassCard style={{ width: cardW }} contentStyle={{ padding: spacing.md, gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text style={{ color: c.textPrimary, fontWeight: "900", fontSize: 18, letterSpacing: -0.3 }}>POS</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>· Order</Text>
            <View style={{ flex: 1 }} />
            {riskN > 0 ? (
              <View style={[styles.riskBadge, { backgroundColor: c.danger + "22", borderColor: c.danger }]}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.danger }} />
                <Text style={{ color: c.danger, fontWeight: "800", fontSize: 12 }}>{riskN} at risk</Text>
              </View>
            ) : (
              <View style={[styles.riskBadge, { backgroundColor: c.success + "1f", borderColor: c.success + "88" }]}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.success }} />
                <Text style={{ color: c.success, fontWeight: "800", fontSize: 12 }}>line clear</Text>
              </View>
            )}
          </View>
          {locations.length > 1 && (
            <View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}>
              {locations.map((loc) => {
                const on = loc.slug === slug;
                const city = loc.name.includes("-") ? loc.name.split("-").pop()!.trim() : loc.name;
                return (
                  <TouchableOpacity
                    key={loc.slug}
                    onPress={() => setSlug(loc.slug)}
                    style={{
                      backgroundColor: on ? c.accent : "transparent",
                      borderColor: on ? c.accent : c.line,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderRadius: radius.pill,
                      paddingVertical: 5,
                      paddingHorizontal: 14,
                    }}
                  >
                    <Text style={{ color: on ? c.onAccent : c.textPrimary, fontWeight: "700", fontSize: 12 }}>{city}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </GlassCard>

        {/* ── KPI stat strip — a tight 3-across grid ───────────────────────── */}
        <GlassCard
          style={{ width: cardW }}
          contentStyle={{ paddingVertical: spacing.sm, paddingHorizontal: 4, flexDirection: "row", flexWrap: "wrap", rowGap: 10 }}
        >
          {[
            { label: "Open checks", value: String(railCount), delta: parked > 0 ? `${parked} parked` : "all active", up: parked > 0 ? false : true },
            { label: "Covers", value: String(posStats.covers), color: c.success, delta: `${posStats.dineIn} dine-in`, up: true as boolean | null },
            { label: "Avg check", value: kpis ? formatMoney(kpis.avgCheck) : "…", color: c.accent, delta: pctChip(kpis?.avgCheckDeltaPct).txt, up: pctChip(kpis?.avgCheckDeltaPct).up },
            { label: "Prep queue", value: String(posStats.prepItems), color: posStats.prepItems > 0 ? c.warning : c.textPrimary, delta: steer?.active && steer.bottleneck ? `${steer.bottleneck.label} risk` : "on time", up: steer?.active && steer.bottleneck ? false : true },
            { label: "Table turns", value: kpis ? `${kpis.tableTurns.toFixed(1)}×` : "…", color: c.success, delta: pctChip(kpis?.tableTurnsDeltaPct).txt, up: pctChip(kpis?.tableTurnsDeltaPct).up },
            { label: "Sales /hr", value: kpis ? formatMoney(kpis.salesPerHour) : "…", delta: pctChip(kpis?.salesDeltaPct).txt, up: pctChip(kpis?.salesDeltaPct).up },
          ].map((k) => (
            <View key={k.label} style={{ width: "33.33%", paddingHorizontal: 8 }}>
              <KpiCell label={k.label} value={k.value} valueColor={k.color} delta={k.delta} deltaUp={k.up} />
            </View>
          ))}
        </GlassCard>

        {/* ── Open-check rail — select a check or start a new one ──────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
          {tabs.map((t) => {
            const on = t.id === activeTabId;
            const n = t.items.reduce((s, l) => s + l.quantity, 0);
            const ctx =
              t.status === "pay" || t.sentKds
                ? "sent"
                : t.channel === "takeout"
                  ? "takeaway"
                  : t.channel === "delivery"
                    ? "delivery"
                    : n > 0
                      ? `${n} ${n === 1 ? "item" : "items"}`
                      : "empty";
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => setActiveTabId(t.id)}
                style={{
                  backgroundColor: on ? c.accent : c.surface2 + "cc",
                  borderColor: on ? c.accent : c.line,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderRadius: radius.md,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  minWidth: 92,
                }}
              >
                <Text style={{ color: on ? c.onAccent : c.textPrimary, fontWeight: "800", fontSize: 13 }}>{t.name}</Text>
                <Text style={{ color: on ? c.onAccent : c.textSecondary, fontSize: 11, fontWeight: "600" }}>{ctx}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => void newCheck()}
            style={{
              backgroundColor: "transparent",
              borderColor: c.accent,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.md,
              paddingVertical: 6,
              paddingHorizontal: 14,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: c.accent, fontWeight: "800", fontSize: 13 }}>＋ New</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ── Category rail with counts + per-category promise ─────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
          {hasPopular && (
            <CatChip glyph={CAT_GLYPH.popular} label="Popular" count={popularItems.length} active={activeCat === "popular"} onPress={() => setCat("popular")} />
          )}
          <CatChip glyph={CAT_GLYPH.all} label="All" count={(items ?? []).filter(isAvail).length} active={activeCat === "all"} onPress={() => setCat("all")} />
          {categories.map((cc) => (
            <CatChip
              key={cc}
              glyph={CAT_GLYPH[cc]}
              label={CATEGORY_LABEL[cc] ?? cc}
              count={(items ?? []).filter((m) => m.available && m.category === cc).length}
              promise={steer?.active ? promiseMin(steer.promiseSecondsByCategory[cc]) : null}
              active={activeCat === cc}
              onPress={() => setCat(cc)}
            />
          ))}
        </ScrollView>

        {/* Search */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: c.surface2 + "cc",
            borderColor: c.line,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            height: 40,
          }}
        >
          <Text style={{ color: c.textSecondary, marginRight: 8 }}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search the menu"
            placeholderTextColor={c.textSecondary}
            style={{ flex: 1, color: c.textPrimary, fontSize: 15 }}
          />
        </View>

        {/* ── Steering banner — only when a real bottleneck exists ─────────── */}
        {steer?.active && steer.bottleneck && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              backgroundColor: (steer.bottleneck.tier === "late" ? c.danger : c.warning) + "1c",
              borderColor: (steer.bottleneck.tier === "late" ? c.danger : c.warning) + "99",
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.md,
              padding: spacing.sm,
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: steer.bottleneck.tier === "late" ? c.danger : c.warning }} />
            <Text style={{ color: c.textPrimary, fontSize: 12, flex: 1 }}>
              <Text style={{ fontWeight: "800" }}>
                {steer.bottleneck.label} {Math.round(steer.bottleneck.util)}%
              </Text>
              {" — "}
              {steer.reason ?? "nearing capacity; pace the firing."}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: "700" }}>cap · {windowMin}m</Text>
          </View>
        )}

        {/* ── Menu grid — tap to add to the active check ──────────────────── */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {gridItems.map((item) => {
            const qty = qtyOnCheck(item.id);
            const avail = isAvail(item);
            const badge = item.menuRole ? ROLE_BADGE[item.menuRole] : undefined;
            const dietary = item.tags.map((t) => TAG_LABEL[t]).filter(Boolean);
            const makeNow = makeNowSet.has(item.id);
            const ease = throttleSet.has(item.id);
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.85}
                disabled={!avail}
                onPress={() => void addItem(item.id)}
                style={{ width: menuCardWidth, flexGrow: 1 }}
              >
                <View
                  style={{
                    backgroundColor: c.surface2 + (avail ? "d8" : "80"),
                    borderColor: qty > 0 ? c.accent : c.line,
                    borderWidth: qty > 0 ? 1.5 : StyleSheet.hairlineWidth,
                    borderRadius: radius.md,
                    padding: spacing.sm,
                    minHeight: 116,
                    opacity: avail ? 1 : 0.55,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
                    <Text
                      style={{ color: c.textPrimary, fontWeight: "700", fontSize: 14, flex: 1, textDecorationLine: avail ? "none" : "line-through" }}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                    {badge && <Chip label={badge} fg={c.accent} bg={c.accent + "26"} />}
                    {qty > 0 && (
                      <Text
                        style={{
                          color: c.onAccent,
                          backgroundColor: c.accent,
                          minWidth: 20,
                          textAlign: "center",
                          borderRadius: 10,
                          fontWeight: "800",
                          fontSize: 12,
                          overflow: "hidden",
                          paddingVertical: 1,
                        }}
                      >
                        {qty}
                      </Text>
                    )}
                  </View>

                  {item.description ? (
                    <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 3, lineHeight: 15 }} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}

                  {(makeNow || ease) && (
                    <View style={{ flexDirection: "row", gap: 4, marginTop: 5 }}>
                      {makeNow && <Chip label="★ make now" fg={c.success} bg={c.success + "22"} />}
                      {ease && <Chip label="▼ ease" fg={c.warning} bg={c.warning + "22"} />}
                    </View>
                  )}

                  <View style={{ flex: 1 }} />

                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 5 }}>
                    <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 14 }}>{formatMoney(item.price)}</Text>
                    <View style={{ flex: 1 }} />
                    {dietary.map((d) => (
                      <Chip key={d} label={d} fg={c.success} bg={c.success + "1f"} />
                    ))}
                    {!avail ? <Chip label="86" fg={c.danger} bg={c.danger + "26"} /> : <Text style={{ color: c.accent, fontSize: 18, fontWeight: "800", marginLeft: 2 }}>+</Text>}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
          {gridItems.length === 0 && <Text style={{ color: c.textSecondary, fontSize: 13, padding: spacing.md }}>No items match.</Text>}
        </View>
      </ScrollView>

      {/* ── Active-check cart — anchored flush to the bottom over a scrim so no
          menu peeks under it. Real server check: channel, line steppers, void +
          fire-to-KDS. ──────────────────────────────────────────────────────── */}
      {(isDesktop || (cartOpen && activeTab)) && (() => {
        // Desktop always shows the ticket column (empty placeholder when no check
        // is open, like the web); phone shows the draggable bottom sheet only when
        // a check is active. `inner` is the check panel or the empty state.
        const inner = !(cartOpen && activeTab) ? (
          <View style={{ flex: 1, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.10)", backgroundColor: c.surface2, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm }}>
            <Text style={{ fontSize: 30 }}>🧾</Text>
            <Text style={{ color: c.textPrimary, fontWeight: "900", fontSize: 16 }}>No open check</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: "center" }}>Start a check with ＋ New, then tap menu items to build the ticket.</Text>
          </View>
        ) : (
          <View
            style={{
              flex: 1,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              overflow: "hidden",
              borderTopWidth: StyleSheet.hairlineWidth,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: c.surface2,
              shadowColor: "#000",
              shadowOpacity: 0.45,
              shadowRadius: 22,
              shadowOffset: { width: 0, height: -8 },
            }}
          >
            {/* SwiftUI glass sheen over the solid sheet — no menu bleed-through */}
            <LiquidGlass glassCornerRadius={26} pointerEvents="none" style={StyleSheet.absoluteFill} />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(15,11,8,0.90)" }]} />
            <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingBottom: insets.bottom + spacing.sm, gap: spacing.sm }}>
              {/* grabber — drag up / down to resize the sheet (phone only) */}
              {!isDesktop && (
                <View {...sheetPan.panHandlers} style={{ paddingTop: spacing.sm, paddingBottom: 4, alignItems: "center" }}>
                  <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.34)" }} />
                </View>
              )}
              {/* header */}
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: c.textPrimary, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>{activeTab.name}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
                  {checkCount} {checkCount === 1 ? "item" : "items"}
                  {promiseMin(checkPromiseSec) ? ` · ready ${promiseMin(checkPromiseSec)}` : ""}
                </Text>
              </View>
              <Text style={{ color: c.textPrimary, fontWeight: "900", fontSize: 22, flexShrink: 0 }}>{formatMoney(grandTotal)}</Text>
            </View>

            {/* channel chips */}
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              {CHANNELS.map((ch) => {
                const on = activeTab.channel === ch.key;
                return (
                  <TouchableOpacity
                    key={ch.key}
                    onPress={() => setChannel(ch.key)}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: 8,
                      borderRadius: radius.md,
                      backgroundColor: on ? c.accent + "26" : "transparent",
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: on ? c.accent : c.line,
                    }}
                  >
                    <Text style={{ color: on ? c.accent : c.textSecondary, fontWeight: "800", fontSize: 12 }}>{ch.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* dine-in: covers + course-by-course firing */}
            {activeTab.channel === "dine-in" && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: "700" }}>Covers</Text>
                <Stepper label="−" onPress={() => patchActive({ covers: Math.max(1, (activeTab.covers ?? 2) - 1) })} c={c} />
                <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15, minWidth: 18, textAlign: "center" }}>{activeTab.covers ?? 2}</Text>
                <Stepper label="+" onPress={() => patchActive({ covers: Math.min(50, (activeTab.covers ?? 2) + 1) })} accent c={c} />
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  onPress={() => patchActive({ coursed: !(activeTab.coursed ?? true) })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: (activeTab.coursed ?? true) ? c.accent : c.line }}
                >
                  <Text style={{ color: (activeTab.coursed ?? true) ? c.accent : c.textSecondary, fontWeight: "800", fontSize: 12 }}>
                    {(activeTab.coursed ?? true) ? "⧗ Coursed" : "⚡ All at once"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* line items — name · variant · stepper · line total */}
            <View style={{ flex: 1, minHeight: 60 }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {checkLines.map(({ item, qty }) => (
                  <View
                    key={item.id}
                    style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: c.textPrimary, fontWeight: "700", fontSize: 14 }} numberOfLines={1}>{item.name}</Text>
                      <Text style={{ color: c.textSecondary, fontSize: 11 }} numberOfLines={1}>
                        {CATEGORY_LABEL[item.category] ?? item.category} · {formatMoney(item.price)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Stepper label="−" onPress={() => setLineQty(item.id, -1)} c={c} />
                      <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15, minWidth: 18, textAlign: "center", fontVariant: ["tabular-nums"] }}>{qty}</Text>
                      <Stepper label="+" onPress={() => setLineQty(item.id, 1)} accent c={c} />
                    </View>
                    <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 14, minWidth: 68, textAlign: "right", fontVariant: ["tabular-nums"] }}>
                      {formatMoney(item.price * qty)}
                    </Text>
                  </View>
                ))}

                {/* combo-completion prompt (real getActiveComboDeals) */}
                {showCombo && combo?.activeDeal && (
                  <TouchableOpacity
                    onPress={() => addMany(combo.completeIds)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.sm,
                      marginTop: 8,
                      padding: spacing.sm,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: c.accent,
                      borderStyle: "dashed",
                      backgroundColor: c.accent + "1c",
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>🎁</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 13 }} numberOfLines={2}>
                        Make it the {combo.activeDeal.name}
                      </Text>
                      {combo.missingItems.length > 0 && (
                        <Text style={{ color: c.textSecondary, fontSize: 11 }} numberOfLines={1}>add {combo.missingItems.join(", ")}</Text>
                      )}
                    </View>
                    <Chip label={`DEAL −${combo.activeDeal.discountPercent}%`} fg={c.accent} bg={c.accent + "26"} />
                  </TouchableOpacity>
                )}

                {/* cross-sell suggestions (real getCartSuggestions) */}
                {crossSell.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => void addItem(s.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.sm,
                      marginTop: 6,
                      padding: spacing.sm,
                      borderRadius: radius.md,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: c.line,
                      borderStyle: "dashed",
                    }}
                  >
                    <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: c.accent + "26", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: c.accent, fontWeight: "900", fontSize: 16, lineHeight: 18 }}>+</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>{s.name}</Text>
                      <Text style={{ color: c.textSecondary, fontSize: 11 }} numberOfLines={1}>{s.reason}</Text>
                    </View>
                    <Text style={{ color: c.textSecondary, fontWeight: "800", fontSize: 13 }}>{formatMoney(s.price)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* totals */}
            <View style={{ gap: 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>Subtotal</Text>
                <Text style={{ color: c.textSecondary, fontSize: 13, fontVariant: ["tabular-nums"] }}>{formatMoney(checkTotal)}</Text>
              </View>
              {comboDiscount > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: c.success, fontSize: 13 }}>{combo?.activeDeal?.name ?? "Deal"}</Text>
                  <Text style={{ color: c.success, fontSize: 13, fontVariant: ["tabular-nums"] }}>−{formatMoney(comboDiscount)}</Text>
                </View>
              )}
              {manualDiscount > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: c.success, fontSize: 13 }}>{activeTab.discount?.reason || "Discount"}</Text>
                  <Text style={{ color: c.success, fontSize: 13, fontVariant: ["tabular-nums"] }}>−{formatMoney(manualDiscount)}</Text>
                </View>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ color: c.textPrimary, fontSize: 14, fontWeight: "800" }}>Total</Text>
                <Text style={{ color: c.textPrimary, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{formatMoney(grandTotal)}</Text>
              </View>
            </View>

            {/* actions — Send to KDS · Charge */}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 2 }}>
              <TouchableOpacity
                onPress={() => void fire()}
                disabled={firing}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, opacity: firing ? 0.6 : 1 }}
              >
                <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 14 }}>{firing ? "Firing…" : "➤ Send to KDS"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTenderOpen(true)}
                disabled={charging}
                style={{ flex: 1.4, alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: radius.md, backgroundColor: c.accent, opacity: charging ? 0.6 : 1 }}
              >
                <Text style={{ color: c.onAccent, fontWeight: "900", fontSize: 15 }}>{charging ? "Charging…" : `Charge ${formatMoney(grandTotal)}`}</Text>
              </TouchableOpacity>
            </View>

            {/* footer toolbar — discount · member · table · void */}
            <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: 2 }}>
              <ToolBtn
                icon="🏷"
                label={
                  activeTab.discount
                    ? activeTab.discount.type === "percent"
                      ? `−${activeTab.discount.value}%`
                      : `−${formatMoney(activeTab.discount.value)}`
                    : "Discount"
                }
                active={!!activeTab.discount}
                onPress={() => setDiscountOpen(true)}
              />
              <ToolBtn
                icon="👤"
                label={activeTab.customerName || (activeTab.customerPhone ? "Member" : "Member")}
                active={!!activeTab.customerPhone}
                onPress={() => setMemberOpen(true)}
              />
              <ToolBtn
                icon="🍽"
                label={tableNo ? `T${tableNo}` : "Table"}
                active={!!activeTab.tableId}
                onPress={() => {
                  if (activeTab.channel !== "dine-in") setChannel("dine-in");
                  setTableOpen(true);
                }}
              />
              <ToolBtn icon="🗑" label="Void" danger onPress={() => void voidCheck()} />
            </View>
            </View>
          </View>
        );
        return isDesktop ? (
          <View style={{ width: DESKTOP_TICKET_W, paddingTop: spacing.md, paddingBottom: spacing.md, paddingRight: spacing.md }}>{inner}</View>
        ) : (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1 }} pointerEvents="none" />
            <Animated.View style={{ height: sheetH }}>{inner}</Animated.View>
          </View>
        );
      })()}

      {/* Check-action sheets — tender · discount · member · table. */}
      {activeTab && (
        <>
          <TenderSheet visible={tenderOpen} total={grandTotal} onClose={() => setTenderOpen(false)} onConfirm={(t) => void doCharge(t)} />
          <DiscountSheet
            visible={discountOpen}
            current={activeTab.discount ?? null}
            onClose={() => setDiscountOpen(false)}
            onApply={(d) => {
              setDiscountOpen(false);
              patchActive({ discount: d });
            }}
            onClear={() => {
              setDiscountOpen(false);
              patchActive({ discount: null });
            }}
          />
          <MemberSheet
            visible={memberOpen}
            current={{ phone: activeTab.customerPhone ?? null, name: activeTab.customerName ?? null }}
            onLookup={lookupMember}
            onClose={() => setMemberOpen(false)}
            onAttach={(phone, name) => {
              setMemberOpen(false);
              patchActive({ customerPhone: phone, customerName: name });
            }}
            onRemove={() => {
              setMemberOpen(false);
              patchActive({ customerPhone: null, customerName: null });
            }}
          />
          <TableSheet
            visible={tableOpen}
            tables={tables}
            currentId={activeTab.tableId ?? null}
            onClose={() => setTableOpen(false)}
            onPick={(t) => {
              setTableOpen(false);
              patchActive({ tableId: t.id, channel: "dine-in", covers: activeTab.covers ?? t.seats ?? 2 });
            }}
            onClear={() => {
              setTableOpen(false);
              patchActive({ tableId: null });
            }}
          />
        </>
      )}
    </View>
  );
}

/** Tender sheet — choose method, add a tip, take cash & show change. The server
 *  re-derives and clamps every figure at /charge; this only proposes them. */
function TenderSheet({
  visible,
  total,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  total: number;
  onClose: () => void;
  onConfirm: (t: { tipGrosze?: number; defaultMethod: "cash" | "card"; cashTenderedGrosze?: number; compGrosze?: number; compOverridePin?: string }) => void;
}) {
  const { c, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [method, setMethod] = useState<"cash" | "card">("card");
  const [tipPct, setTipPct] = useState(0);
  const [cash, setCash] = useState<number | null>(null);
  const [compZl, setCompZl] = useState("");
  const [pin, setPin] = useState("");

  const tip = Math.round((total * tipPct) / 100);
  const compG = Math.max(0, Math.round((parseFloat(compZl.replace(",", ".")) || 0) * 100));
  const due = Math.max(0, total + tip - Math.min(total, compG));
  const change = method === "cash" && cash != null ? Math.max(0, cash - due) : 0;
  // Quick cash buttons — exact, then the next round notes above the amount due.
  const roundUp = (g: number, step: number) => Math.ceil(g / step) * step;
  const cashOptions = Array.from(new Set([due, roundUp(due, 1000), roundUp(due, 2000), roundUp(due, 5000)])).slice(0, 4);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: c.surface2,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: c.line,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.lg,
            gap: spacing.md,
          }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.textSecondary + "55" }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ color: c.textPrimary, fontSize: 18, fontWeight: "900" }}>Tender</Text>
            <Text style={{ color: c.textPrimary, fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{formatMoney(due)}</Text>
          </View>

          {/* method */}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {(["card", "cash"] as const).map((m) => {
              const on = method === m;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => setMethod(m)}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: radius.md, backgroundColor: on ? c.accent + "26" : "transparent", borderWidth: StyleSheet.hairlineWidth, borderColor: on ? c.accent : c.line }}
                >
                  <Text style={{ color: on ? c.accent : c.textSecondary, fontWeight: "800", fontSize: 14 }}>{m === "card" ? "💳 Card" : "💵 Cash"}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* tip */}
          <View>
            <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Tip</Text>
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              {[0, 5, 10, 15].map((p) => {
                const on = tipPct === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setTipPct(p)}
                    style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, backgroundColor: on ? c.accent : "transparent", borderWidth: StyleSheet.hairlineWidth, borderColor: on ? c.accent : c.line }}
                  >
                    <Text style={{ color: on ? c.onAccent : c.textPrimary, fontWeight: "800", fontSize: 13 }}>{p === 0 ? "None" : `${p}%`}</Text>
                    {p > 0 && <Text style={{ color: on ? c.onAccent : c.textSecondary, fontSize: 10 }}>{formatMoney(Math.round((total * p) / 100))}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* cash received + change */}
          {method === "cash" && (
            <View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>Cash received</Text>
                {cash != null && <Text style={{ color: change > 0 ? c.success : c.textSecondary, fontSize: 12, fontWeight: "800" }}>change {formatMoney(change)}</Text>}
              </View>
              <View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}>
                {cashOptions.map((amt) => {
                  const on = cash === amt;
                  return (
                    <TouchableOpacity
                      key={amt}
                      onPress={() => setCash(amt)}
                      style={{ flexGrow: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, backgroundColor: on ? c.accent + "26" : "transparent", borderWidth: StyleSheet.hairlineWidth, borderColor: on ? c.accent : c.line }}
                    >
                      <Text style={{ color: on ? c.accent : c.textPrimary, fontWeight: "800", fontSize: 13 }}>{formatMoney(amt)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* comp — a manager courtesy off the bill (server verifies the PIN) */}
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Comp (zł)</Text>
              <TextInput
                value={compZl}
                onChangeText={setCompZl}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={c.textSecondary}
                style={{ color: c.textPrimary, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Manager PIN</Text>
              <TextInput
                value={pin}
                onChangeText={setPin}
                keyboardType="number-pad"
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={c.textSecondary}
                style={{ color: c.textPrimary, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}
              />
            </View>
          </View>

          <TouchableOpacity
            onPress={() =>
              onConfirm({
                tipGrosze: tip || undefined,
                defaultMethod: method,
                cashTenderedGrosze: method === "cash" && cash != null ? cash : undefined,
                compGrosze: compG || undefined,
                compOverridePin: compG > 0 && pin.trim() ? pin.trim() : undefined,
              })
            }
            style={{ alignItems: "center", paddingVertical: 15, borderRadius: radius.md, backgroundColor: c.accent, marginTop: 2 }}
          >
            <Text style={{ color: c.onAccent, fontWeight: "900", fontSize: 16 }}>
              {method === "cash" ? `Take ${formatMoney(due)} cash` : `Charge ${formatMoney(due)}`}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A check-action toolbar button (discount / member / table / void). */
function ToolBtn({ icon, label, active, danger, onPress }: { icon: string; label: string; active?: boolean; danger?: boolean; onPress: () => void }) {
  const { c, radius } = useTheme();
  const col = danger ? c.danger : active ? c.accent : c.textSecondary;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: "center",
        paddingVertical: 8,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: danger ? c.danger + "77" : active ? c.accent : c.line,
        backgroundColor: active && !danger ? c.accent + "1c" : "transparent",
      }}
    >
      <Text style={{ fontSize: 15 }}>{icon}</Text>
      <Text numberOfLines={1} style={{ color: col, fontWeight: "800", fontSize: 10, marginTop: 2 }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Shared slide-up bottom-sheet chrome (backdrop · grabber · surface). */
function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const { c, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: c.surface2,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: c.line,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.lg,
            gap: spacing.md,
          }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.textSecondary + "55" }} />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Manual discount — percent or złoty off, with a reason (server re-prices). */
function DiscountSheet({
  visible,
  current,
  onClose,
  onApply,
  onClear,
}: {
  visible: boolean;
  current: TabDiscount | null;
  onClose: () => void;
  onApply: (d: TabDiscount) => void;
  onClear: () => void;
}) {
  const { c, radius, spacing } = useTheme();
  const [mode, setMode] = useState<"percent" | "amount">(current?.type ?? "percent");
  const [val, setVal] = useState(current ? String(current.type === "amount" ? current.value / 100 : current.value) : "");
  const [reason, setReason] = useState(current?.reason ?? "");
  const apply = () => {
    const n = parseFloat(val.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;
    onApply({ type: mode, value: mode === "amount" ? Math.round(n * 100) : Math.round(n), reason: reason.trim() || undefined });
  };
  const presets = mode === "percent" ? [5, 10, 15, 20] : [5, 10, 20, 50];
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={{ color: c.textPrimary, fontSize: 18, fontWeight: "900" }}>Discount</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {(["percent", "amount"] as const).map((m) => {
          const on = mode === m;
          return (
            <TouchableOpacity
              key={m}
              onPress={() => { setMode(m); setVal(""); }}
              style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, backgroundColor: on ? c.accent + "26" : "transparent", borderWidth: StyleSheet.hairlineWidth, borderColor: on ? c.accent : c.line }}
            >
              <Text style={{ color: on ? c.accent : c.textSecondary, fontWeight: "800", fontSize: 13 }}>{m === "percent" ? "Percent %" : "Amount zł"}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: spacing.xs }}>
        {presets.map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => setVal(String(p))}
            style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }}
          >
            <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 13 }}>{mode === "percent" ? `${p}%` : `${p} zł`}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        value={val}
        onChangeText={setVal}
        keyboardType="decimal-pad"
        placeholder={mode === "percent" ? "Custom %" : "Custom zł"}
        placeholderTextColor={c.textSecondary}
        style={{ color: c.textPrimary, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}
      />
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="Reason (optional)"
        placeholderTextColor={c.textSecondary}
        style={{ color: c.textPrimary, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}
      />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {current && (
          <TouchableOpacity onPress={onClear} style={{ flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.danger + "88" }}>
            <Text style={{ color: c.danger, fontWeight: "800", fontSize: 14 }}>Remove</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={apply} style={{ flex: 2, alignItems: "center", paddingVertical: 14, borderRadius: radius.md, backgroundColor: c.accent }}>
          <Text style={{ color: c.onAccent, fontWeight: "900", fontSize: 15 }}>Apply discount</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

/** Loyalty member lookup — attach a customer + show their points balance. */
function MemberSheet({
  visible,
  current,
  onLookup,
  onClose,
  onAttach,
  onRemove,
}: {
  visible: boolean;
  current: { phone: string | null; name: string | null };
  onLookup: (phone: string) => Promise<MemberInfo>;
  onClose: () => void;
  onAttach: (phone: string, name: string) => void;
  onRemove: () => void;
}) {
  const { c, radius, spacing } = useTheme();
  const [phone, setPhone] = useState(current.phone ?? "");
  const [info, setInfo] = useState<MemberInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const points = info ? info.totals.earnedPoints + info.totals.manualPoints - info.totals.redeemedPoints : 0;
  const lookup = async () => {
    const p = phone.trim();
    if (!p) return;
    setLoading(true);
    setErr(null);
    try {
      const data = await onLookup(p);
      setInfo(data);
    } catch {
      setErr("No customer found for that number.");
      setInfo(null);
    } finally {
      setLoading(false);
    }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={{ color: c.textPrimary, fontSize: 18, fontWeight: "900" }}>Member</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="Phone number"
          placeholderTextColor={c.textSecondary}
          style={{ flex: 1, color: c.textPrimary, fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 }}
        />
        <TouchableOpacity onPress={() => void lookup()} style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: c.accent }}>
          <Text style={{ color: c.onAccent, fontWeight: "800", fontSize: 14 }}>{loading ? "…" : "Look up"}</Text>
        </TouchableOpacity>
      </View>
      {err && <Text style={{ color: c.danger, fontSize: 12 }}>{err}</Text>}
      {info && (
        <View style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderRadius: radius.md, padding: spacing.md, gap: 4 }}>
          <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>{info.name || info.phone}</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{info.totals.orderCount} orders · {formatMoney(info.totals.totalSpent)}</Text>
            <Text style={{ color: c.accent, fontWeight: "800", fontSize: 13 }}>{points} pts</Text>
          </View>
        </View>
      )}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {current.phone && (
          <TouchableOpacity onPress={onRemove} style={{ flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.danger + "88" }}>
            <Text style={{ color: c.danger, fontWeight: "800", fontSize: 14 }}>Remove</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => info && onAttach(info.phone, info.name || info.phone)}
          disabled={!info}
          style={{ flex: 2, alignItems: "center", paddingVertical: 14, borderRadius: radius.md, backgroundColor: c.accent, opacity: info ? 1 : 0.5 }}
        >
          <Text style={{ color: c.onAccent, fontWeight: "900", fontSize: 15 }}>Attach to check</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

/** Table picker — assign a dine-in check to a floor table, grouped by zone. */
function TableSheet({
  visible,
  tables,
  currentId,
  onClose,
  onPick,
  onClear,
}: {
  visible: boolean;
  tables: FloorTable[];
  currentId: string | null;
  onClose: () => void;
  onPick: (t: FloorTable) => void;
  onClear: () => void;
}) {
  const { c, radius, spacing } = useTheme();
  const zones = useMemo(() => {
    const m = new Map<string, FloorTable[]>();
    for (const t of tables) {
      const z = t.zone || "Floor";
      (m.get(z) ?? m.set(z, []).get(z)!).push(t);
    }
    return [...m.entries()];
  }, [tables]);
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={{ color: c.textPrimary, fontSize: 18, fontWeight: "900" }}>Assign table</Text>
      {tables.length === 0 ? (
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>No tables configured for this location.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
          {zones.map(([zone, ts]) => (
            <View key={zone} style={{ marginBottom: spacing.md }}>
              <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{zone}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {ts.map((t) => {
                  const on = t.id === currentId;
                  const free = t.status === "available" || t.status === "free";
                  return (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() => onPick(t)}
                      style={{ width: 68, height: 60, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: on ? c.accent : "transparent", borderWidth: StyleSheet.hairlineWidth, borderColor: on ? c.accent : free ? c.line : c.warning + "88" }}
                    >
                      <Text style={{ color: on ? c.onAccent : c.textPrimary, fontWeight: "900", fontSize: 16 }}>{t.number}</Text>
                      <Text style={{ color: on ? c.onAccent : c.textSecondary, fontSize: 10 }}>{t.seats} seats</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      {currentId && (
        <TouchableOpacity onPress={onClear} style={{ alignItems: "center", paddingVertical: 14, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.danger + "88" }}>
          <Text style={{ color: c.danger, fontWeight: "800", fontSize: 14 }}>Clear table</Text>
        </TouchableOpacity>
      )}
    </BottomSheet>
  );
}

/** A round +/− stepper button for the cart lines. */
function Stepper({ label, onPress, accent, c }: { label: string; onPress: () => void; accent?: boolean; c: ReturnType<typeof useTheme>["c"] }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: accent ? c.accent : "transparent",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: accent ? c.accent : c.line,
      }}
    >
      <Text style={{ color: accent ? c.onAccent : c.textPrimary, fontWeight: "900", fontSize: 18, lineHeight: 20 }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** A KPI cell — label · coloured value · signed delta. */
function KpiCell({ label, value, valueColor, delta, deltaUp }: { label: string; value: string; valueColor?: string; delta: string; deltaUp: boolean | null }) {
  const { c } = useTheme();
  const deltaColor = deltaUp == null ? c.textSecondary : deltaUp ? c.success : c.danger;
  return (
    <View>
      <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 }}>
        {label}
      </Text>
      <Text numberOfLines={1} style={{ color: valueColor ?? c.textPrimary, fontSize: 19, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      <Text numberOfLines={1} style={{ color: deltaColor, fontSize: 11, fontWeight: "700" }}>{delta}</Text>
    </View>
  );
}

/** A category-rail chip — glyph · label · count · optional ~Nm promise. */
function CatChip({ glyph, label, count, promise, active, onPress }: { glyph: string; label: string; count: number; promise?: string | null; active: boolean; onPress: () => void }) {
  const { c, radius } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: active ? c.accent : c.surface2 + "cc",
        borderColor: active ? c.accent : c.line,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.md,
        paddingVertical: 6,
        paddingHorizontal: 11,
        alignItems: "center",
        minWidth: 62,
      }}
    >
      <Text style={{ color: active ? c.onAccent : c.textPrimary, fontSize: 16 }}>{glyph}</Text>
      <Text style={{ color: active ? c.onAccent : c.textPrimary, fontSize: 11, fontWeight: "700" }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text style={{ color: active ? c.onAccent : c.textSecondary, fontSize: 10, fontWeight: "700" }}>{count}</Text>
        {promise ? <Text style={{ color: active ? c.onAccent : c.warning, fontSize: 10, fontWeight: "800" }}>{promise}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

/** A tiny inline pill (role badge, dietary flag, pace cue). */
function Chip({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <Text style={{ color: fg, backgroundColor: bg, fontSize: 9, fontWeight: "800", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: "hidden" }}>
      {label}
    </Text>
  );
}

/**
 * A glass card whose native SwiftUI Liquid Glass rides as an absolute-fill
 * BACKDROP behind an ordinary RN view. The bridged glass view mis-sizes to its
 * content under the Fabric interop layer, so it must never own layout — the inner
 * `<View>` measures + clips the children, and the glass only fills behind them.
 * A depth shadow (outer, un-clipped) + a faint tint overlay give the panel more
 * presence against the aurora.
 */
function GlassCard({ style, contentStyle, children }: { style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>; children: ReactNode }) {
  const { radius } = useTheme();
  return (
    <View
      style={[
        { borderRadius: radius.lg, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
        style,
      ]}
    >
      <View style={{ borderRadius: radius.lg, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.09)" }}>
        <LiquidGlass glassCornerRadius={radius.lg} pointerEvents="none" style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(28,22,17,0.34)" }]} />
        <View style={contentStyle}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  riskBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
});
