import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { useOperatorLocation } from "@/store/operatorLocation";
import { formatMoney } from "@/lib/format";
import { Card, Muted, Pill, StateBlock, StatTile } from "@/components/ui";

/**
 * Menu — bespoke faithful mirror of the web `MenuV3` per-site menu
 * (`src/admin-v3/MenuV3.tsx`), replacing the generic `DataSurface` list. The menu
 * is **per-location** (price/availability vary per site — CLAUDE.md Rule #10), so
 * this carries a location switcher and scopes `GET /api/v1/admin/menu?location=`.
 * KPI rail (items · available · off · avg margin) + a category filter with live
 * counts, and the web margin tone (≥65% ok, ≥50% warn, else thin) as a per-row
 * badge. Every field is real (Rule #1) — price/cost are server-side, margin is
 * derived. Search by name. Pull to refresh. (86 / un-86 — the facade's `PATCH` —
 * stays a later write wave; the KDS 86 sheet already covers it.)
 */

interface MenuRow {
  id: string;
  name: string;
  description: string;
  price: number;
  cost: number;
  category: string;
  available: boolean;
  tags: string[];
  menuRole: string | null;
  sku: string | null;
  prepTimeMinutes: number | null;
  isLimited: boolean;
}

// Web marginTone: ≥65% ok, ≥50% warn, else bad.
function marginPct(price: number, cost: number): number | null {
  if (price <= 0) return null;
  return ((price - cost) / price) * 100;
}
function marginColor(m: number, c: { success: string; warning: string; danger: string }): string {
  if (m >= 65) return c.success;
  if (m >= 50) return c.warning;
  return c.danger;
}

const ALL = "__all__";

export function Menu() {
  const { c } = useTheme();
  const { authed } = useOperator();
  const { slug, locations, error: locError, setSlug, ensureLoaded } = useOperatorLocation();
  const [rows, setRows] = useState<MenuRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<string>(ALL);
  const [q, setQ] = useState("");

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await authed<MenuRow[]>(`/admin/menu?location=${encodeURIComponent(slug)}`);
      setRows(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the menu");
    }
  }, [authed, slug]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows ?? []) set.add(r.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const margins = list.map((r) => marginPct(r.price, r.cost)).filter((n): n is number => n != null);
    return {
      total: list.length,
      available: list.filter((r) => r.available).length,
      off: list.filter((r) => !r.available).length,
      avgMargin: margins.length ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) : null,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? [])
      .filter(
        (r) =>
          (category === ALL || r.category === category) &&
          (!needle || r.name.toLowerCase().includes(needle)),
      )
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [rows, category, q]);

  if (locError) return <StateBlock kind="error" message={locError} />;
  if (!slug) return <StateBlock kind="loading" />;
  if (error) return <StateBlock kind="error" message={error} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ padding: 14, gap: 12 }}
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
    >
      {/* Location switcher — the menu is per-site. */}
      {locations.length > 1 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {locations.map((l) => (
            <Pill key={l.slug} label={l.city || l.name} active={l.slug === slug} onPress={() => setSlug(l.slug)} />
          ))}
        </View>
      )}

      {!rows ? (
        <StateBlock kind="loading" />
      ) : (
        <>
          {/* KPI rail. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <StatTile label="Items" value={stats.total} />
            <StatTile label="Available" value={stats.available} tone="ok" />
            <StatTile label="Off" value={stats.off} tone={stats.off > 0 ? "bad" : undefined} />
            <StatTile label="Avg margin" value={stats.avgMargin != null ? `${stats.avgMargin}%` : "—"} />
          </View>

          {/* Category filter chips. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Pill label={`All · ${stats.total}`} active={category === ALL} onPress={() => setCategory(ALL)} />
            {categories.map((cat) => (
              <Pill
                key={cat}
                label={`${cat} · ${(rows ?? []).filter((r) => r.category === cat).length}`}
                active={category === cat}
                onPress={() => setCategory(cat)}
              />
            ))}
          </View>

          {/* Search by name. */}
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search dish…"
            placeholderTextColor={c.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              backgroundColor: c.surface2,
              borderColor: c.line,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 10,
              color: c.textPrimary,
              fontSize: 15,
            }}
          />

          {filtered.length === 0 ? (
            <StateBlock kind="empty" message={q ? `No match for “${q.trim()}”.` : "No items in this category."} />
          ) : (
            filtered.map((r) => {
              const m = marginPct(r.price, r.cost);
              return (
                <Card key={r.id} style={!r.available ? { opacity: 0.55 } : undefined}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>{r.name}</Text>
                        {!r.available && <MiniTag label="Off" color={c.danger} />}
                        {r.isLimited && <MiniTag label="Limited" color={c.warning} />}
                      </View>
                      <Muted style={{ marginTop: 2, fontSize: 12 }}>{r.category}</Muted>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text style={{ color: c.textPrimary, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                        {formatMoney(r.price)}
                      </Text>
                      {m != null && <MarginBadge pct={m} />}
                    </View>
                  </View>
                </Card>
              );
            })
          )}

          <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: "center", marginTop: 2 }}>
            {filtered.length} of {rows.length} item{rows.length === 1 ? "" : "s"} · live
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function MiniTag({ label, color }: { label: string; color: string }) {
  const { c } = useTheme();
  return (
    <View style={{ borderColor: color, borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingVertical: 1, paddingHorizontal: 6 }}>
      <Text style={{ color: c.textPrimary, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
    </View>
  );
}

function MarginBadge({ pct }: { pct: number }) {
  const { c } = useTheme();
  const color = marginColor(pct, c);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: c.surface,
        borderColor: color,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 999,
        paddingVertical: 3,
        paddingHorizontal: 9,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color: c.textPrimary, fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{pct.toFixed(0)}% GP</Text>
    </View>
  );
}
