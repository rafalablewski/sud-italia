import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { formatMoney } from "@/lib/format";
import { Card, Pill, StateBlock, StatTile } from "@/components/ui";

/**
 * Customers — bespoke faithful mirror of the web `CustomersV3` CRM roster
 * (`src/admin-v3/CustomersV3.tsx`), replacing the generic `DataSurface` list. Same
 * KPI rail (customers · repeat · lifetime revenue), the same Repeat/New tag, plus a
 * VIP tag on the same rule the store uses (orderCount ≥ 6 · spend ≥ 800 zł · points
 * ≥ 500) and filter chips with live counts. Every figure is a real field off
 * `GET /api/v1/admin/customers` (Rule #1) — chain-wide rollups derived from real
 * orders, returned highest-spend-first. Search over name or phone. Pull to refresh.
 */

interface CustomerRow {
  phone: string;
  name: string | null;
  email: string | null;
  birthday: string | null;
  totalSpentGrosze: number;
  orderCount: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  loyaltyPointsBalance: number;
  manualPointsAdjust: number;
  smsOptout: boolean;
  emailOptout: boolean;
  notes: string | null;
}

type Tier = "vip" | "repeat" | "new";
type Filter = "all" | Tier;

const FILTER_ORDER: Filter[] = ["all", "vip", "repeat", "new"];
const FILTER_LABEL: Record<Filter, string> = { all: "All", vip: "VIP", repeat: "Repeat", new: "New" };

// Mirrors the store's VIP gate (CLAUDE.md / store `vip`): a big spender, a frequent
// orderer, or a points-rich member.
function isVip(c: CustomerRow): boolean {
  return c.orderCount >= 6 || c.totalSpentGrosze >= 80_000 || c.loyaltyPointsBalance >= 500;
}

function tierOf(c: CustomerRow): Tier {
  if (isVip(c)) return "vip";
  return c.orderCount >= 2 ? "repeat" : "new";
}

// Space-grouped integer — Hermes ships a minimal Intl, so `toLocaleString` can't
// be relied on for grouping (see lib/format). Matches the money formatter's style.
function groupInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${day} ${mon} ${d.getUTCFullYear()}`;
}

export function Customers() {
  const { c } = useTheme();
  const { authed } = useOperator();
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authed<CustomerRow[]>("/admin/customers");
      setRows(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load customers");
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

  // KPI figures mirror the web: total customers, repeat (2+ orders), lifetime rev.
  const stats = useMemo(() => {
    const list = rows ?? [];
    return {
      total: list.length,
      repeat: list.filter((r) => r.orderCount >= 2).length,
      revenue: list.reduce((s, r) => s + r.totalSpentGrosze, 0),
    };
  }, [rows]);

  const counts = useMemo<Record<Filter, number>>(() => {
    const list = rows ?? [];
    const base: Record<Filter, number> = { all: list.length, vip: 0, repeat: 0, new: 0 };
    for (const r of list) base[tierOf(r)]++;
    return base;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (filter === "all" || tierOf(r) === filter) &&
        (!needle || (r.name ?? "").toLowerCase().includes(needle) || r.phone.includes(needle)),
    );
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
      {/* KPI rail — the three the web shows. */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatTile label="Customers" value={stats.total} />
        <StatTile label="Repeat" value={stats.repeat} tone={stats.repeat > 0 ? "ok" : undefined} />
        <StatTile label="Lifetime rev" value={formatMoney(stats.revenue)} />
      </View>

      {/* Tier filter chips with live counts. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {FILTER_ORDER.map((f) => (
          <Pill
            key={f}
            label={`${FILTER_LABEL[f]} · ${counts[f]}`}
            active={filter === f}
            tone={f === "vip" ? "warning" : f === "repeat" ? "success" : "default"}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      {/* Search by name or phone (web parity). */}
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search name or phone…"
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
        <StateBlock kind="empty" message={q ? `No match for “${q.trim()}”.` : "No customers in this filter."} />
      ) : (
        filtered.map((r) => {
          const tier = tierOf(r);
          const points = r.loyaltyPointsBalance;
          return (
            <Card key={r.phone}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>{r.name || "—"}</Text>
                  <Text selectable style={{ color: c.textSecondary, fontSize: 12, marginTop: 2, fontVariant: ["tabular-nums"] }}>
                    {r.phone}
                  </Text>
                </View>
                <TierBadge tier={tier} />
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: "700" }}>{r.orderCount}</Text>
                  {` order${r.orderCount === 1 ? "" : "s"} · `}
                  <Text style={{ color: c.textPrimary, fontWeight: "700" }}>{groupInt(points)}</Text>
                  {" pts · last "}
                  {fmtDate(r.lastOrderAt)}
                </Text>
                <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                  {formatMoney(r.totalSpentGrosze)}
                </Text>
              </View>
            </Card>
          );
        })
      )}

      <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: "center", marginTop: 2 }}>
        {filtered.length} of {rows.length} customer{rows.length === 1 ? "" : "s"} · live
      </Text>
    </ScrollView>
  );
}

const TIER_LABEL: Record<Tier, string> = { vip: "VIP", repeat: "Repeat", new: "New" };

function TierBadge({ tier }: { tier: Tier }) {
  const { c } = useTheme();
  const color = tier === "vip" ? c.warning : tier === "repeat" ? c.success : c.textSecondary;
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
      <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: "700" }}>{TIER_LABEL[tier]}</Text>
    </View>
  );
}
