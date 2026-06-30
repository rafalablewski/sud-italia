import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { formatMoney } from "@/lib/format";
import { Card, Muted, Pill, StateBlock, StatTile } from "@/components/ui";

/**
 * Inventory — bespoke faithful mirror of the web `InventoryV3` stock view
 * (`src/admin-v3/InventoryV3.tsx`), replacing the generic `DataSurface` list so the
 * native screen is 1:1 with the web rather than a flat key/value dump. Same KPIs
 * (value · low/out · items), same status taxonomy (In stock / Low / Out) and
 * filter chips with live counts, same search. Every figure is a real field off
 * `GET /api/v1/admin/inventory` (Rule #1) — on-hand vs reorder, server-computed
 * valuation in `meta.totalValueGrosze`. Pull to refresh.
 */

interface StockRow {
  ingredientId: string;
  name: string;
  category: string;
  unit: string;
  locationSlug: string;
  onHand: number;
  parLevel: number;
  reorderPoint: number;
  low: boolean;
  costPerUnit: number;
  valueGrosze: number;
}

interface InventoryMeta {
  count?: number;
  lowCount?: number;
  outCount?: number;
  totalValueGrosze?: number;
}

type Status = "ok" | "low" | "out";
type Filter = "all" | "out" | "low" | "ok";

const SITE_LABEL: Record<string, string> = { krakow: "Kraków", warszawa: "Warszawa" };
const STATUS_LABEL: Record<Status, string> = { ok: "In stock", low: "Low", out: "Out" };
const STATUS_TONE: Record<Status, "success" | "warning" | "danger"> = { ok: "success", low: "warning", out: "danger" };
const FILTER_LABEL: Record<Filter, string> = { all: "All", out: "Out", low: "Low", ok: "In stock" };
const FILTER_ORDER: Filter[] = ["all", "out", "low", "ok"];

function classify(r: StockRow): Status {
  if (r.onHand <= 0) return "out";
  if (r.onHand <= r.reorderPoint) return "low";
  return "ok";
}

function siteOf(slug: string): string {
  return SITE_LABEL[slug] ?? slug;
}

export function Inventory() {
  const { c } = useTheme();
  const { authed } = useOperator();
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [meta, setMeta] = useState<InventoryMeta>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authed<StockRow[]>("/admin/inventory");
      setRows(Array.isArray(res.data) ? res.data : []);
      setMeta((res.meta as unknown as InventoryMeta) ?? {});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load inventory");
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

  // Counts mirror the web filter chips: out (onHand≤0), low (≤reorder, excl. out),
  // ok (the rest). Prefer the server meta where it exists; fall back to a local
  // tally so the chips are correct even on an older facade.
  const counts = useMemo<Record<Filter, number>>(() => {
    const list = rows ?? [];
    const out = meta.outCount ?? list.filter((r) => r.onHand <= 0).length;
    const lowIncl = meta.lowCount ?? list.filter((r) => r.onHand <= r.reorderPoint).length;
    const all = meta.count ?? list.length;
    return { all, out, low: Math.max(0, lowIncl - out), ok: Math.max(0, all - lowIncl) };
  }, [rows, meta]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rows ?? []).filter(
      (r) =>
        (filter === "all" || classify(r) === filter) &&
        (!needle || r.name.toLowerCase().includes(needle) || r.category.toLowerCase().includes(needle)),
    );
    const rank: Record<Status, number> = { out: 0, low: 1, ok: 2 };
    return [...list].sort((a, b) => rank[classify(a)] - rank[classify(b)] || a.name.localeCompare(b.name));
  }, [rows, filter, q]);

  if (error) return <StateBlock kind="error" message={error} />;
  if (!rows) return <StateBlock kind="loading" />;

  const totalValue = meta.totalValueGrosze ?? rows.reduce((s, r) => s + r.valueGrosze, 0);
  const showSite = new Set(rows.map((r) => r.locationSlug)).size > 1;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ padding: 14, gap: 12 }}
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
    >
      {/* KPI rail — same three the web shows (waste·7d omitted: not in this facade). */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatTile label="Inventory value" value={formatMoney(totalValue)} />
        <StatTile label="Low / out" value={counts.low + counts.out} tone={counts.low + counts.out > 0 ? "warn" : "ok"} />
        <StatTile label="Items" value={counts.all} />
      </View>

      {/* Status filter chips with live counts. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {FILTER_ORDER.map((f) => (
          <Pill
            key={f}
            label={`${FILTER_LABEL[f]} · ${counts[f]}`}
            active={filter === f}
            tone={f === "out" ? "danger" : f === "low" ? "warning" : f === "ok" ? "success" : "default"}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      {/* Search by ingredient or category. */}
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search ingredient…"
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
        <StateBlock kind="empty" message={q ? `No match for “${q.trim()}”.` : "No stock in this filter."} />
      ) : (
        filtered.map((r) => {
          const status = classify(r);
          const tone = status === "ok" ? c.success : status === "low" ? c.warning : c.danger;
          // Fill = on-hand against par (the target level), clamped 0–100%.
          const pct = r.parLevel > 0 ? Math.max(0, Math.min(1, r.onHand / r.parLevel)) : r.onHand > 0 ? 1 : 0;
          return (
            <Card key={`${r.ingredientId}-${r.locationSlug}`}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>{r.name}</Text>
                  <Muted style={{ marginTop: 2, fontSize: 12 }}>
                    {r.category}
                    {showSite ? `  ·  ${siteOf(r.locationSlug)}` : ""}
                  </Muted>
                </View>
                <StatusBadge status={status} tone={tone} />
              </View>

              {/* On-hand vs par bar, coloured by status. */}
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line, marginTop: 12, overflow: "hidden" }}>
                <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: tone, borderRadius: 3 }} />
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: "700" }}>
                    {r.onHand} {r.unit}
                  </Text>
                  {"  on hand · reorder "}
                  {r.reorderPoint} · par {r.parLevel}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                  {formatMoney(r.valueGrosze)}
                </Text>
              </View>
            </Card>
          );
        })
      )}

      <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: "center", marginTop: 2 }}>
        {filtered.length} of {rows.length} item{rows.length === 1 ? "" : "s"} · live
      </Text>
    </ScrollView>
  );
}

function StatusBadge({ status, tone }: { status: Status; tone: string }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: c.surface,
        borderColor: tone,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 999,
        paddingVertical: 4,
        paddingHorizontal: 10,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tone }} />
      <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: "700" }}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}
