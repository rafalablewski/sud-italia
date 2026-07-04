import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { Card, Muted, Pill, StateBlock, StatTile } from "@/components/ui";

/**
 * Recipes — bespoke faithful mirror of the web `RecipesV3` board
 * (`src/admin-v3/RecipesV3.tsx`), replacing the generic `DataSurface` list.
 * Recipes are **chain-wide** (Rule #10 — one recipe per dish, keyed by base slug),
 * so there is no location switch. KPI rail (dishes · with-recipe · no-recipe · avg
 * ingredients) + a with/without-recipe filter, each row showing the ingredient
 * count, yield and prep time with a truncated ingredient preview. Every field is
 * real off `GET /api/v1/admin/recipes` (Rule #1). The web's food-cost KPIs need the
 * per-ingredient cost the recipe facade doesn't carry, so they're omitted rather
 * than faked. Search by dish. Pull to refresh.
 */

interface RecipeIngredient {
  name: string;
  unit: string;
  quantity: number;
}

interface RecipeRow {
  id: string;
  menuItemId: string;
  dishName: string;
  yieldPortions: number;
  prepTimeMinutes: number | null;
  ingredients: RecipeIngredient[];
}

type Filter = "all" | "costed" | "empty";
const FILTER_ORDER: Filter[] = ["all", "costed", "empty"];
const FILTER_LABEL: Record<Filter, string> = { all: "All", costed: "With recipe", empty: "No recipe" };

function hasRecipe(r: RecipeRow): boolean {
  return (r.ingredients?.length ?? 0) > 0;
}

export function Recipes() {
  const { c } = useTheme();
  const { authed } = useOperator();
  const [rows, setRows] = useState<RecipeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authed<RecipeRow[]>("/admin/recipes");
      setRows(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load recipes");
    }
  }, [authed]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const counts = useMemo<Record<Filter, number>>(() => {
    const list = rows ?? [];
    const costed = list.filter(hasRecipe).length;
    return { all: list.length, costed, empty: list.length - costed };
  }, [rows]);

  const avgIngredients = useMemo(() => {
    const costed = (rows ?? []).filter(hasRecipe);
    if (costed.length === 0) return 0;
    return Math.round(costed.reduce((s, r) => s + r.ingredients.length, 0) / costed.length);
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? [])
      .filter(
        (r) =>
          (filter === "all" || (filter === "costed" ? hasRecipe(r) : !hasRecipe(r))) &&
          (!needle || r.dishName.toLowerCase().includes(needle)),
      )
      .sort((a, b) => a.dishName.localeCompare(b.dishName));
  }, [rows, filter, q]);

  if (error) return <StateBlock kind="error" message={error} />;
  if (!rows) return <StateBlock kind="loading" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ padding: 14, gap: 12 }}
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
    >
      {/* KPI rail — food-cost KPIs omitted: the recipe facade carries no per-unit cost. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <StatTile label="Dishes" value={counts.all} />
        <StatTile label="With recipe" value={`${counts.costed}/${counts.all}`} tone={counts.empty === 0 ? "ok" : undefined} />
        <StatTile label="No recipe" value={counts.empty} tone={counts.empty > 0 ? "warn" : undefined} />
        <StatTile label="Avg items" value={avgIngredients} />
      </View>

      {/* With/without-recipe filter chips. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {FILTER_ORDER.map((f) => (
          <Pill
            key={f}
            label={`${FILTER_LABEL[f]} · ${counts[f]}`}
            active={filter === f}
            tone={f === "costed" ? "success" : f === "empty" ? "warning" : "default"}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      {/* Search by dish. */}
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
        <StateBlock kind="empty" message={q ? `No match for “${q.trim()}”.` : "No dishes in this filter."} />
      ) : (
        filtered.map((r) => {
          const n = r.ingredients.length;
          const preview = r.ingredients.slice(0, 3).map((i) => i.name).join(", ");
          const extra = n > 3 ? ` +${n - 3}` : "";
          return (
            <Card key={r.id}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>{r.dishName}</Text>
                  <Muted style={{ marginTop: 2, fontSize: 12 }}>
                    Yields {r.yieldPortions}
                    {r.prepTimeMinutes != null ? `  ·  ${r.prepTimeMinutes} min prep` : ""}
                  </Muted>
                </View>
                <IngredientBadge count={n} />
              </View>
              {n > 0 ? (
                <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 10 }} numberOfLines={1}>
                  {preview}
                  {extra}
                </Text>
              ) : (
                <Muted style={{ marginTop: 10, fontSize: 12 }}>No formula on file</Muted>
              )}
            </Card>
          );
        })
      )}

      <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: "center", marginTop: 2 }}>
        {filtered.length} of {rows.length} dish{rows.length === 1 ? "" : "es"} · chain-wide · live
      </Text>
    </ScrollView>
  );
}

function IngredientBadge({ count }: { count: number }) {
  const { c } = useTheme();
  const color = count > 0 ? c.accent : c.textSecondary;
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
        paddingVertical: 4,
        paddingHorizontal: 10,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: "700" }}>
        {count > 0 ? `${count} ingredient${count === 1 ? "" : "s"}` : "No recipe"}
      </Text>
    </View>
  );
}
