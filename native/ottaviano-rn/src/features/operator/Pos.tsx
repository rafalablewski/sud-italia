import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, TextInput, TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { useOperatorLocation } from "@/store/operatorLocation";
import { StateBlock } from "@/components/ui";
import { Aurora, LiquidGlass } from "@/components/LiquidGlass";
import { formatMoney } from "@/lib/format";

// Service · POS — the ADR-001 target screen. A bespoke operator POS that mirrors
// the web `CorePos` dense console 1:1, in React Native, floating on the bridged
// SwiftUI Aurora backdrop + Liquid Glass surfaces. Registered in `bespoke.ts`
// under `/core/pos`, replacing the generic DataSurface for that route.
//
// Every figure is REAL off `/api/v1` (Rule #1): the live menu, the server till
// KPIs, the open checks, kitchen pressure, the demand-steering plan, the daypart
// Popular set, and the 86 list. No invented numbers — the same seven feeds the
// web till reads, wired to the same shared store/lib through the v1 facade.

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
/** `/api/v1/admin/pos/tabs` — open checks (client-derived till state). */
interface PosTab {
  id: string;
  name: string;
  status: string;
  channel?: string | null;
  covers?: number | null;
  tableId?: string | null;
  sentKds?: boolean;
  items: { quantity: number }[];
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

// Category order + labels — the web `CATEGORY_ORDER` / `MENU_CATEGORY_LABELS`
// (config, not data): the till lays every truck's menu out identically.
const CATEGORY_ORDER = ["pizza", "pasta", "antipasti", "panini", "desserts", "drinks"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  pizza: "Pizza",
  pasta: "Pasta",
  antipasti: "Antipasti",
  panini: "Panini",
  desserts: "Dolci",
  drinks: "Drinks",
};
// Rail glyph — a single emblem per (pseudo-)category, mirroring the web icon rail.
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
// Dietary tag → chip label (web TAG_META): vegetarian V · vegan VG · spicy S · gluten-free GF.
const TAG_LABEL: Record<string, string> = { vegetarian: "V", vegan: "VG", spicy: "S", "gluten-free": "GF" };

const promiseMin = (sec?: number): string | null => (sec && sec > 0 ? `~${Math.round(sec / 60)}m` : null);
const pctChip = (p: number | null | undefined): { txt: string; up: boolean | null } =>
  p == null ? { txt: "—", up: null } : { txt: `${p >= 0 ? "+" : ""}${p}%`, up: p >= 0 };

export function Pos() {
  const { c, radius, spacing } = useTheme();
  const { authed } = useOperator();
  const { slug, locations, setSlug, ensureLoaded } = useOperatorLocation();

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
  const [ticket, setTicket] = useState<Record<string, number>>({});

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  useEffect(() => {
    if (!slug) return;
    const loc = encodeURIComponent(slug);
    setItems(null);
    setError(null);
    authed<PosMenuItem[]>(`/admin/menu?location=${loc}`)
      .then(({ data }) => setItems(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the menu"));
    authed<PosKpis>(`/admin/pos/kpis?location=${loc}`).then(({ data }) => setKpis(data)).catch(() => setKpis(null));
    authed<PosTab[]>(`/admin/pos/tabs?location=${loc}`)
      .then(({ data }) => {
        setTabs(data);
        setActiveTabId((cur) => cur ?? data[0]?.id ?? null);
      })
      .catch(() => setTabs([]));
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
  }, [authed, slug]);

  const byId = useMemo(() => {
    const m = new Map<string, PosMenuItem>();
    for (const i of items ?? []) m.set(i.id, i);
    return m;
  }, [items]);

  const isAvail = (m: PosMenuItem) => m.available && !eightySix.has(m.id);

  // Categories present on this menu, in the canonical order (web `categories`).
  const categories = useMemo(() => {
    const present = new Set((items ?? []).filter((m) => m.available).map((m) => m.category));
    return CATEGORY_ORDER.filter((cc) => present.has(cc));
  }, [items]);

  // ★ Popular — daypart top items that are on THIS menu, most-ordered first.
  const popularItems = useMemo(
    () => popularIds.map((id) => byId.get(id)).filter((m): m is PosMenuItem => !!m),
    [popularIds, byId],
  );
  const hasPopular = popularItems.length > 0;
  const activeCat = cat ?? (hasPopular ? "popular" : categories[0] ?? "all");

  // Live-plan item cues + per-category promise (web makeNowSet / throttleSet).
  const makeNowSet = useMemo(() => new Set(steer?.makeNow ?? []), [steer]);
  const throttleSet = useMemo(() => new Set(steer?.throttle ?? []), [steer]);

  // Grid source: channel-appropriate incl. sold-out; available first, 86'd sunk.
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

  // Rail rollup + live till stats — every figure from real till state (Rule #1).
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

  // Ticket (local quick-sale scratch — genuine operator input, not mock data).
  const ticketCount = Object.values(ticket).reduce((a, b) => a + b, 0);
  const ticketTotal = (items ?? []).reduce((s, i) => s + (ticket[i.id] ?? 0) * i.price, 0);
  // Capacity-true promise for the ticket = worst promise across its categories.
  const ticketPromiseSec = useMemo(() => {
    if (!steer) return 0;
    let worst = 0;
    for (const id of Object.keys(ticket)) {
      if ((ticket[id] ?? 0) <= 0) continue;
      const cc = byId.get(id)?.category ?? "";
      worst = Math.max(worst, steer.promiseSecondsByCategory[cc] ?? 0);
    }
    return worst;
  }, [ticket, steer, byId]);

  if (error && !items) return <StateBlock kind="error" message={error} />;
  if (!items) return <StateBlock kind="loading" />;

  const riskN = pressure?.atRisk ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#140f0d" }}>
      {/* Native SwiftUI ambient backdrop — the glass panels refract it (ADR-001). */}
      <Aurora style={StyleSheet.absoluteFill} />

      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: ticketCount > 0 ? 128 : 40 }}>
        {/* ── Command bar — identity · location · live risk badge ─────────── */}
        <LiquidGlass glassCornerRadius={radius.lg} style={{ padding: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text style={{ color: c.textPrimary, fontWeight: "900", fontSize: 18, letterSpacing: -0.3 }}>POS</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13, fontWeight: "600" }}>· Order</Text>
            <View style={{ flex: 1 }} />
            {/* Live kitchen-pressure badge (web command-bar "risk N"). */}
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
          {/* Location switcher (multi-truck operators). */}
          {locations.length > 1 && (
            <View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap", marginTop: spacing.sm }}>
              {locations.map((loc) => {
                const on = loc.slug === slug;
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
                      paddingHorizontal: 12,
                    }}
                  >
                    <Text style={{ color: on ? c.onAccent : c.textPrimary, fontWeight: "700", fontSize: 12 }}>{loc.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </LiquidGlass>

        {/* ── KPI stat strip — the dense-console metric row (web core-statstrip) ── */}
        <LiquidGlass glassCornerRadius={radius.lg} style={{ padding: spacing.sm }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: 4 }}>
            <KpiCell
              label="Open checks"
              value={String(railCount)}
              delta={parked > 0 ? `${parked} parked` : "all active"}
              deltaUp={parked > 0 ? false : true}
            />
            <KpiCell
              label="Covers seated"
              value={String(posStats.covers)}
              valueColor={c.success}
              delta={`${posStats.dineIn} dine-in`}
              deltaUp
            />
            <KpiCell
              label="Avg check"
              value={kpis ? formatMoney(kpis.avgCheck) : "…"}
              valueColor={c.accent}
              delta={pctChip(kpis?.avgCheckDeltaPct).txt}
              deltaUp={pctChip(kpis?.avgCheckDeltaPct).up}
            />
            <KpiCell
              label="Prep queue"
              value={String(posStats.prepItems)}
              valueColor={posStats.prepItems > 0 ? c.warning : c.textPrimary}
              delta={steer?.active && steer.bottleneck ? `${steer.bottleneck.label} at risk` : "on time"}
              deltaUp={steer?.active && steer.bottleneck ? false : true}
            />
            <KpiCell
              label="Table turns"
              value={kpis ? `${kpis.tableTurns.toFixed(1)}×` : "…"}
              valueColor={c.success}
              delta={pctChip(kpis?.tableTurnsDeltaPct).txt}
              deltaUp={pctChip(kpis?.tableTurnsDeltaPct).up}
            />
            <KpiCell
              label="Sales /hr"
              value={kpis ? formatMoney(kpis.salesPerHour) : "…"}
              delta={pctChip(kpis?.salesDeltaPct).txt}
              deltaUp={pctChip(kpis?.salesDeltaPct).up}
            />
          </ScrollView>
        </LiquidGlass>

        {/* ── Open-check tabs (web core-tabrail) ─────────────────────────── */}
        {tabs.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
            {tabs.map((t) => {
              const on = t.id === activeTabId;
              const n = t.items.reduce((s, l) => s + l.quantity, 0);
              const offPremise = t.channel === "takeout" || t.channel === "delivery";
              const ctx =
                t.channel === "takeout"
                  ? "takeaway"
                  : t.channel === "delivery"
                    ? "delivery"
                    : n > 0
                      ? `${n} ${n === 1 ? "item" : "items"}`
                      : "empty";
              const tint = offPremise ? c.accent : c.textSecondary;
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
                  <Text style={{ color: on ? c.onAccent : tint, fontSize: 11, fontWeight: "600" }}>
                    {t.status === "pay" ? "to pay · " : t.status === "parked" ? "parked · " : ""}
                    {ctx}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── Category rail with counts + per-category promise (web core-rail) ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
          {hasPopular && (
            <CatChip
              glyph={CAT_GLYPH.popular}
              label="Popular"
              count={popularItems.length}
              active={activeCat === "popular"}
              onPress={() => setCat("popular")}
            />
          )}
          <CatChip
            glyph={CAT_GLYPH.all}
            label="All"
            count={(items ?? []).filter(isAvail).length}
            active={activeCat === "all"}
            onPress={() => setCat("all")}
          />
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

        {/* ── Steering banner — only when a real bottleneck exists (web core-steer) ── */}
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

        {/* ── Menu grid (web core-menu-grid) ─────────────────────────────── */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {gridItems.map((item) => {
            const qty = ticket[item.id] ?? 0;
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
                onPress={() => setTicket((t) => ({ ...t, [item.id]: (t[item.id] ?? 0) + 1 }))}
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
                  {/* Header: name + role badge + qty */}
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
                    <Text
                      style={{
                        color: c.textPrimary,
                        fontWeight: "700",
                        fontSize: 14,
                        flex: 1,
                        textDecorationLine: avail ? "none" : "line-through",
                      }}
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

                  {/* Pace cues — ★ make now (basil) / ▼ ease (amber), from the live plan. */}
                  {(makeNow || ease) && (
                    <View style={{ flexDirection: "row", gap: 4, marginTop: 5 }}>
                      {makeNow && <Chip label="★ make now" fg={c.success} bg={c.success + "22"} />}
                      {ease && <Chip label="▼ ease" fg={c.warning} bg={c.warning + "22"} />}
                    </View>
                  )}

                  <View style={{ flex: 1 }} />

                  {/* Footer: price · dietary · add / 86 */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 5 }}>
                    <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 14 }}>{formatMoney(item.price)}</Text>
                    <View style={{ flex: 1 }} />
                    {dietary.map((d) => (
                      <Chip key={d} label={d} fg={c.success} bg={c.success + "1f"} />
                    ))}
                    {!avail ? (
                      <Chip label="86" fg={c.danger} bg={c.danger + "26"} />
                    ) : (
                      <Text style={{ color: c.accent, fontSize: 18, fontWeight: "800", marginLeft: 2 }}>+</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
          {gridItems.length === 0 && (
            <Text style={{ color: c.textSecondary, fontSize: 13, padding: spacing.md }}>No items match.</Text>
          )}
        </View>
      </ScrollView>

      {/* ── Docked check — a second Liquid Glass surface (web core-ticket) ── */}
      {ticketCount > 0 && (
        <View style={{ position: "absolute", left: spacing.md, right: spacing.md, bottom: spacing.md }}>
          <LiquidGlass glassCornerRadius={radius.lg} style={{ padding: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.accent }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>Quick sale</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                  {ticketCount} {ticketCount === 1 ? "item" : "items"}
                  {promiseMin(ticketPromiseSec) ? ` · ready ${promiseMin(ticketPromiseSec)}` : ""}
                </Text>
              </View>
              <Text style={{ color: c.textPrimary, fontWeight: "900", fontSize: 17 }}>{formatMoney(ticketTotal)}</Text>
              <TouchableOpacity onPress={() => setTicket({})}>
                <Text
                  style={{
                    color: c.onAccent,
                    backgroundColor: c.accent,
                    borderRadius: radius.pill,
                    paddingHorizontal: 16,
                    paddingVertical: 9,
                    fontWeight: "800",
                    overflow: "hidden",
                  }}
                >
                  Clear
                </Text>
              </TouchableOpacity>
            </View>
          </LiquidGlass>
        </View>
      )}
    </View>
  );
}

/** A KPI cell — label · coloured value · signed delta (web `.core-statstrip .cell`). */
function KpiCell({
  label,
  value,
  valueColor,
  delta,
  deltaUp,
}: {
  label: string;
  value: string;
  valueColor?: string;
  delta: string;
  deltaUp: boolean | null;
}) {
  const { c } = useTheme();
  const deltaColor = deltaUp == null ? c.textSecondary : deltaUp ? c.success : c.danger;
  return (
    <View style={{ minWidth: 96, paddingVertical: 4, paddingHorizontal: 6 }}>
      <Text style={{ color: c.textSecondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text style={{ color: valueColor ?? c.textPrimary, fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      <Text style={{ color: deltaColor, fontSize: 11, fontWeight: "700" }}>{delta}</Text>
    </View>
  );
}

/** A category-rail chip — glyph · label · count · optional ~Nm promise. */
function CatChip({
  glyph,
  label,
  count,
  promise,
  active,
  onPress,
}: {
  glyph: string;
  label: string;
  count: number;
  promise?: string | null;
  active: boolean;
  onPress: () => void;
}) {
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
    <Text
      style={{
        color: fg,
        backgroundColor: bg,
        fontSize: 9,
        fontWeight: "800",
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  riskBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
});
