import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { Card, Muted, StateBlock, StatTile } from "@/components/ui";

/**
 * Suppliers — bespoke faithful mirror of the web `SuppliersV3` vendor catalogue
 * (`src/admin-v3/SuppliersV3.tsx`), replacing the generic `DataSurface` list. Same
 * KPI rail (suppliers · avg lead · fastest · with-contact), the same lead-time
 * tone (≤2d fast, ≤5d ok, slower neutral), and the same search over name / contact
 * / email / phone. Every figure is a real field off `GET /api/v1/admin/suppliers`
 * (Rule #1) — suppliers are chain-wide, so there is no location switch. Pull to
 * refresh.
 */

interface SupplierRow {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  leadTimeDays?: number | null;
  notes?: string | null;
  createdAt: string;
}

// Web SuppliersV3 lead-time badge: ≤2d ok, ≤5d warn, slower neutral.
function leadTone(days: number): "success" | "warning" | "muted" {
  if (days <= 2) return "success";
  if (days <= 5) return "warning";
  return "muted";
}

export function Suppliers() {
  const { c } = useTheme();
  const { authed } = useOperator();
  const [rows, setRows] = useState<SupplierRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authed<SupplierRow[]>("/admin/suppliers");
      setRows(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load suppliers");
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

  // KPI figures mirror the web `stats`: total, average lead, fastest lead, and how
  // many carry any contact channel. Only suppliers with a numeric lead feed the
  // lead metrics (the web filters the same way).
  const stats = useMemo(() => {
    const list = rows ?? [];
    const leads = list.map((s) => s.leadTimeDays).filter((n): n is number => typeof n === "number");
    return {
      total: list.length,
      avgLead: leads.length ? Math.round(leads.reduce((a, b) => a + b, 0) / leads.length) : null,
      fastest: leads.length ? Math.min(...leads) : null,
      withContact: list.filter((s) => s.email || s.phone || s.contactName).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows ?? [];
    return (rows ?? []).filter((s) =>
      [s.name, s.contactName, s.email, s.phone].some((v) => v?.toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  if (error) return <StateBlock kind="error" message={error} />;
  if (!rows) return <StateBlock kind="loading" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ padding: 14, gap: 12 }}
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
    >
      {/* KPI rail — the four the web shows. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <StatTile label="Suppliers" value={stats.total} />
        <StatTile label="Avg lead" value={stats.avgLead != null ? `${stats.avgLead}d` : "—"} />
        <StatTile label="Fastest" value={stats.fastest != null ? `${stats.fastest}d` : "—"} tone="ok" />
        <StatTile label="With contact" value={`${stats.withContact}/${stats.total}`} />
      </View>

      {/* Search by supplier, contact, email or phone (web parity). */}
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search supplier, contact, email…"
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
        <StateBlock kind="empty" message={q ? `No match for “${q.trim()}”.` : "No suppliers yet."} />
      ) : (
        filtered.map((s) => {
          const contact = [s.email, s.phone].filter(Boolean).join("  ·  ");
          return (
            <Card key={s.id}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>{s.name}</Text>
                  {s.contactName ? <Muted style={{ marginTop: 2, fontSize: 12 }}>{s.contactName}</Muted> : null}
                </View>
                {typeof s.leadTimeDays === "number" ? <LeadBadge days={s.leadTimeDays} /> : null}
              </View>

              {contact ? (
                <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 10 }} selectable>
                  {contact}
                </Text>
              ) : (
                <Muted style={{ marginTop: 10, fontSize: 12 }}>No contact on file</Muted>
              )}
            </Card>
          );
        })
      )}

      <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: "center", marginTop: 2 }}>
        {filtered.length} of {rows.length} supplier{rows.length === 1 ? "" : "s"} · live
      </Text>
    </ScrollView>
  );
}

function LeadBadge({ days }: { days: number }) {
  const { c } = useTheme();
  const tone = leadTone(days);
  const color = tone === "success" ? c.success : tone === "warning" ? c.warning : c.textSecondary;
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
      <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{days}d lead</Text>
    </View>
  );
}
