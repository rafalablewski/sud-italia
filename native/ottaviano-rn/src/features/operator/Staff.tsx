import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import type { Palette } from "@/theme/tokens";
import { useOperator } from "@/auth/OperatorSession";
import { formatMoney } from "@/lib/format";
import { Card, Muted, Pill, StateBlock, StatTile } from "@/components/ui";

/**
 * Staff — bespoke faithful mirror of the web `StaffV3` team roster
 * (`src/admin-v3/StaffV3.tsx`), replacing the generic `DataSurface` list. Same
 * role badge (manager brand · kitchen warm · front info) and the same
 * active/inactive filter, over a KPI rail derived from the roster (staff · active ·
 * inactive · avg rate). Every field is real off `GET /api/v1/admin/staff` (Rule #1,
 * role-scoped) — the "on shift now" KPI the web shows needs clock punches the
 * facade doesn't expose, so it's omitted rather than faked. Search over name /
 * role / email. Pull to refresh.
 */

type StaffRole = "manager" | "pizzaiolo" | "chef" | "kp" | "kitchen" | "waiter" | "front" | "driver" | "courier";
type StaffStatus = "active" | "inactive";
type Filter = "all" | StaffStatus;

interface StaffRow {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  role: StaffRole;
  locationSlug: string;
  hourlyRateGrosze: number;
  hireDate?: string | null;
  status: StaffStatus;
  notes?: string | null;
  createdAt: string;
}

const SITE_LABEL: Record<string, string> = { krakow: "Kraków", warszawa: "Warszawa" };
const ROLE_LABEL: Record<StaffRole, string> = {
  manager: "Manager",
  pizzaiolo: "Pizzaiolo",
  chef: "Chef",
  kp: "Kitchen porter",
  kitchen: "Kitchen",
  waiter: "Waiter",
  front: "Front of house",
  driver: "Driver",
  courier: "Courier",
};
const FILTER_ORDER: Filter[] = ["all", "active", "inactive"];
const FILTER_LABEL: Record<Filter, string> = { all: "All", active: "Active", inactive: "Inactive" };

// Web roleTone: manager=brand, kitchen roles=warn, front/waiter=info, else neutral.
function roleColor(role: StaffRole, c: Palette): string {
  if (role === "manager") return c.brand;
  if (role === "pizzaiolo" || role === "chef" || role === "kp" || role === "kitchen") return c.warning;
  if (role === "waiter" || role === "front") return c.accent;
  return c.textSecondary;
}

function siteOf(slug: string): string {
  return SITE_LABEL[slug] ?? slug;
}

export function Staff() {
  const { c } = useTheme();
  const { authed } = useOperator();
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authed<StaffRow[]>("/admin/staff");
      setRows(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load staff");
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
    return {
      all: list.length,
      active: list.filter((s) => s.status === "active").length,
      inactive: list.filter((s) => s.status === "inactive").length,
    };
  }, [rows]);

  // Average hourly rate over active staff (what the operator actually pays now).
  const avgRate = useMemo(() => {
    const active = (rows ?? []).filter((s) => s.status === "active");
    if (active.length === 0) return 0;
    return Math.round(active.reduce((s, r) => s + r.hourlyRateGrosze, 0) / active.length);
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (s) =>
        (filter === "all" || s.status === filter) &&
        (!needle ||
          s.name.toLowerCase().includes(needle) ||
          ROLE_LABEL[s.role].toLowerCase().includes(needle) ||
          (s.email ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, filter, q]);

  if (error) return <StateBlock kind="error" message={error} />;
  if (!rows) return <StateBlock kind="loading" />;

  const showSite = new Set(rows.map((r) => r.locationSlug)).size > 1;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ padding: 14, gap: 12 }}
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
    >
      {/* KPI rail — roster-derived (on-shift omitted: needs punches, not in facade). */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <StatTile label="Staff" value={counts.all} />
        <StatTile label="Active" value={counts.active} tone={counts.active > 0 ? "ok" : undefined} />
        <StatTile label="Inactive" value={counts.inactive} tone={counts.inactive > 0 ? "warn" : undefined} />
        <StatTile label="Avg rate" value={`${formatMoney(avgRate, false)}/h`} />
      </View>

      {/* Active/inactive filter chips with live counts. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {FILTER_ORDER.map((f) => (
          <Pill
            key={f}
            label={`${FILTER_LABEL[f]} · ${counts[f]}`}
            active={filter === f}
            tone={f === "active" ? "success" : f === "inactive" ? "warning" : "default"}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      {/* Search by name, role or email. */}
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search name, role, email…"
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
        <StateBlock kind="empty" message={q ? `No match for “${q.trim()}”.` : "No staff in this filter."} />
      ) : (
        filtered.map((s) => (
          <Card key={s.id} style={s.status === "inactive" ? { opacity: 0.6 } : undefined}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>{s.name}</Text>
                <Muted style={{ marginTop: 2, fontSize: 12 }}>
                  {formatMoney(s.hourlyRateGrosze, false)}/h
                  {showSite ? `  ·  ${siteOf(s.locationSlug)}` : ""}
                </Muted>
              </View>
              <RoleBadge role={s.role} />
            </View>
          </Card>
        ))
      )}

      <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: "center", marginTop: 2 }}>
        {filtered.length} of {rows.length} · live
      </Text>
    </ScrollView>
  );
}

function RoleBadge({ role }: { role: StaffRole }) {
  const { c } = useTheme();
  const color = roleColor(role, c);
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
      <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: "700" }}>{ROLE_LABEL[role]}</Text>
    </View>
  );
}
