import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, TextInput, TouchableOpacity, View, Text } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { useOperatorLocation } from "@/store/operatorLocation";
import { Card, Pill, StatTile, StateBlock, Muted, SectionHeading } from "@/components/ui";
import { LiquidGlass } from "@/components/LiquidGlass";
import { formatMoney } from "@/lib/format";

// Service · POS — the ADR-001 spike screen. A bespoke operator POS that mirrors
// the web `CorePos` dense console, in React Native, on a bridged SwiftUI Liquid
// Glass surface. Registered in `bespoke.ts` under `/core/pos`, so it replaces the
// generic DataSurface for that route. Every figure is real off `/api/v1` (Rule #1).

/** Menu item as returned by `/api/v1/admin/menu?location=` (money in grosze). */
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

/** `/api/v1/admin/pos/tabs` — open checks (for the client-derived counts). */
interface PosTab {
  id: string;
  status: string;
  channel?: string | null;
  covers?: number | null;
  sentKds?: boolean;
  items: { quantity: number }[];
}

const ROLE_BADGE: Record<string, string> = {
  hero: "HERO",
  "profit-driver": "PROFIT",
  anchor: "ANCHOR",
  lto: "LTO",
};

export function Pos() {
  const { c, radius, spacing } = useTheme();
  const { authed } = useOperator();
  const { slug, locations, setSlug, ensureLoaded } = useOperatorLocation();

  const [items, setItems] = useState<PosMenuItem[] | null>(null);
  const [kpis, setKpis] = useState<PosKpis | null>(null);
  const [tabs, setTabs] = useState<PosTab[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ticket, setTicket] = useState<Record<string, number>>({});

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  useEffect(() => {
    if (!slug) return;
    setItems(null);
    setError(null);
    authed<PosMenuItem[]>(`/admin/menu?location=${encodeURIComponent(slug)}`)
      .then(({ data }) => setItems(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the menu"));
    authed<PosKpis>(`/admin/pos/kpis?location=${encodeURIComponent(slug)}`)
      .then(({ data }) => setKpis(data))
      .catch(() => setKpis(null));
    authed<PosTab[]>(`/admin/pos/tabs?location=${encodeURIComponent(slug)}`)
      .then(({ data }) => setTabs(data))
      .catch(() => setTabs([]));
  }, [authed, slug]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const i of items ?? []) if (!seen.has(i.category)) { seen.add(i.category); out.push(i.category); }
    return out;
  }, [items]);

  const filtered = useMemo(
    () =>
      (items ?? []).filter(
        (i) =>
          (category == null || i.category === category) &&
          (search.trim() === "" || i.name.toLowerCase().includes(search.trim().toLowerCase())),
      ),
    [items, category, search],
  );

  // Client-derived counts (mirror the web + SwiftUI: real till state, no mock).
  const openChecks = tabs.filter((t) => t.status !== "parked").length;
  const covers = tabs.filter((t) => t.status !== "parked" && t.channel === "dine-in").reduce((s, t) => s + (t.covers ?? 0), 0);
  const prepQueue = tabs.filter((t) => t.sentKds).reduce((s, t) => s + t.items.reduce((a, l) => a + l.quantity, 0), 0);

  const ticketCount = Object.values(ticket).reduce((a, b) => a + b, 0);
  const ticketTotal = (items ?? []).reduce((s, i) => s + (ticket[i.id] ?? 0) * i.price, 0);

  if (error && !items) return <StateBlock kind="error" message={error} />;
  if (!items) return <StateBlock kind="loading" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 96 }}>
        {/* Location switcher */}
        {locations.length > 1 && (
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            {locations.map((loc) => (
              <Pill key={loc.slug} label={loc.name} active={loc.slug === slug} onPress={() => setSlug(loc.slug)} />
            ))}
          </View>
        )}

        {/* KPI strip — on a Liquid Glass surface (the ADR-001 showcase). */}
        <LiquidGlass glassCornerRadius={radius.lg} style={{ padding: spacing.md }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <StatTile label="Open checks" value={openChecks} />
            <StatTile label="Covers" value={covers} tone="ok" />
            <StatTile label="Avg check" value={kpis ? formatMoney(kpis.avgCheck) : "…"} />
            <StatTile label="Prep queue" value={prepQueue} tone={prepQueue > 0 ? "warn" : "ok"} />
            <StatTile label="Table turns" value={kpis ? `${kpis.tableTurns.toFixed(1)}×` : "…"} tone="ok" />
            <StatTile label="Sales /hr" value={kpis ? formatMoney(kpis.salesPerHour) : "…"} />
          </View>
        </LiquidGlass>

        {/* Search */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            backgroundColor: c.surface2,
            borderColor: c.line,
            borderWidth: 1,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            height: 42,
          }}
        >
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search the menu"
            placeholderTextColor={c.textSecondary}
            style={{ flex: 1, color: c.textPrimary, fontSize: 15 }}
          />
        </View>

        {/* Category rail with counts */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
          <Pill label={`All ${items.length}`} active={category == null} onPress={() => setCategory(null)} />
          {categories.map((cat) => (
            <Pill
              key={cat}
              label={`${cat[0].toUpperCase()}${cat.slice(1)} ${items.filter((i) => i.category === cat).length}`}
              active={category === cat}
              onPress={() => setCategory(cat)}
            />
          ))}
        </ScrollView>

        <SectionHeading>Menu</SectionHeading>

        {/* Menu grid (2-up) */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          {filtered.map((item) => {
            const qty = ticket[item.id] ?? 0;
            const badge = item.menuRole ? ROLE_BADGE[item.menuRole] : undefined;
            const veg = item.tags.some((t) => t.toLowerCase().includes("vegetar") || t.toLowerCase().includes("vegan"));
            const spicy = item.tags.some((t) => /spicy|piccante|hot/i.test(t));
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.8}
                disabled={!item.available}
                onPress={() => setTicket((t) => ({ ...t, [item.id]: (t[item.id] ?? 0) + 1 }))}
                style={{ width: "47.5%", flexGrow: 1 }}
              >
                <Card style={{ minHeight: 120, opacity: item.available ? 1 : 0.5 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
                    <Text style={{ color: c.textPrimary, fontWeight: "700", fontSize: 15, flex: 1 }} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {badge && (
                      <Text
                        style={{
                          color: c.accent,
                          backgroundColor: c.accent + "28",
                          fontSize: 8,
                          fontWeight: "800",
                          paddingHorizontal: 4,
                          paddingVertical: 1,
                          borderRadius: 4,
                          overflow: "hidden",
                        }}
                      >
                        {badge}
                      </Text>
                    )}
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
                        }}
                      >
                        {qty}
                      </Text>
                    )}
                  </View>
                  {item.description ? (
                    <Muted style={{ marginTop: 4 }}>{item.description}</Muted>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 6 }}>
                    <Text style={{ color: c.textPrimary, fontWeight: "700", fontSize: 15 }}>{formatMoney(item.price)}</Text>
                    <View style={{ flex: 1 }} />
                    {veg && <Badge label="V" color={c.success} />}
                    {spicy && <Badge label="S" color={c.warning} />}
                    {!item.available ? <Badge label="86" color={c.danger} /> : <Text style={{ color: c.accent, fontSize: 18, fontWeight: "700" }}>+</Text>}
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Docked check bar — a second Liquid Glass surface. */}
      {ticketCount > 0 && (
        <View style={{ position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg }}>
          <LiquidGlass glassCornerRadius={radius.lg} style={{ padding: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>Quick sale</Text>
                <Muted>{`${ticketCount} item${ticketCount === 1 ? "" : "s"}`}</Muted>
              </View>
              <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 16 }}>{formatMoney(ticketTotal)}</Text>
              <TouchableOpacity onPress={() => setTicket({})}>
                <Text style={{ color: c.onAccent, backgroundColor: c.accent, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, fontWeight: "800", overflow: "hidden" }}>
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

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <Text
      style={{
        color,
        backgroundColor: color + "28",
        fontSize: 9,
        fontWeight: "800",
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {label}
    </Text>
  );
}
