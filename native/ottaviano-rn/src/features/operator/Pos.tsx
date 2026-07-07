import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
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
/** `/api/v1/admin/pos/tabs` — a server-backed open check. */
interface PosTab {
  id: string;
  locationSlug?: string;
  name: string;
  status: string;
  channel?: Channel | null;
  covers?: number | null;
  tableId?: string | null;
  sentKds?: boolean;
  items: { menuItemId: string; quantity: number }[];
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
  const { width: winW } = useWindowDimensions();
  const cardW = winW - spacing.md * 2;

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

  const setChannel = useCallback(
    (channel: Channel) => {
      if (!activeTab) return;
      const next = { ...activeTab, channel };
      setTabs((prev) => prev.map((t) => (t.id === next.id ? next : t)));
      void persistTab(next);
    },
    [activeTab, persistTab],
  );

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

  if (error && !items) return <StateBlock kind="error" message={error} />;
  if (!items) return <StateBlock kind="loading" />;

  const riskN = pressure?.atRisk ?? 0;
  const cartOpen = !!activeTab && checkLines.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#140f0d" }}>
      {/* Native SwiftUI ambient backdrop — the glass panels refract it (ADR-001). */}
      <Aurora style={StyleSheet.absoluteFill} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: (cartOpen ? 340 : 40) + insets.bottom }}
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
                style={{ width: "48%", flexGrow: 1 }}
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
      {cartOpen && activeTab && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: spacing.md,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.sm,
            backgroundColor: "rgba(15,11,9,0.90)",
          }}
        >
          <GlassCard style={{ width: cardW }} contentStyle={{ padding: spacing.md, gap: spacing.sm }}>
            {/* header */}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: c.textPrimary, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>{activeTab.name}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
                  {checkCount} {checkCount === 1 ? "item" : "items"}
                  {promiseMin(checkPromiseSec) ? ` · ready ${promiseMin(checkPromiseSec)}` : ""}
                </Text>
              </View>
              <Text style={{ color: c.textPrimary, fontWeight: "900", fontSize: 22, flexShrink: 0 }}>{formatMoney(checkTotal)}</Text>
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

            {/* line items */}
            <View style={{ maxHeight: 168 }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {checkLines.map(({ item, qty }) => (
                  <View
                    key={item.id}
                    style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: c.textPrimary, fontWeight: "700", fontSize: 14 }} numberOfLines={1}>{item.name}</Text>
                      <Text style={{ color: c.textSecondary, fontSize: 11 }}>{formatMoney(item.price)} each</Text>
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
              </ScrollView>
            </View>

            {/* actions */}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 2 }}>
              <TouchableOpacity
                onPress={() => void voidCheck()}
                style={{ flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.danger + "88" }}
              >
                <Text style={{ color: c.danger, fontWeight: "800", fontSize: 14 }}>Void</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void fire()}
                disabled={firing}
                style={{ flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: radius.md, backgroundColor: c.accent, opacity: firing ? 0.6 : 1 }}
              >
                <Text style={{ color: c.onAccent, fontWeight: "900", fontSize: 15 }}>
                  {firing ? "Firing…" : `Fire to KDS · ${formatMoney(checkTotal)}`}
                </Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </View>
      )}
    </View>
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
