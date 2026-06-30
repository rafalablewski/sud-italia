import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { formatMoney } from "@/lib/format";
import { Card, Muted, StateBlock } from "@/components/ui";
import type { OperatorNavItem } from "@/nav/operatorNav";
import type { SurfaceConfig } from "./surfaceConfig";

type Row = Record<string, unknown>;

const MONEY_KEYS = /price|amount|total|spent|revenue|cost|grosze/i;

function asRows(data: unknown): Row[] {
  if (Array.isArray(data)) return data as Row[];
  if (data && typeof data === "object") {
    // An object payload (e.g. settings, a summary) → flatten to key/value rows.
    return Object.entries(data as Record<string, unknown>).map(([key, value]) => ({ key, value }));
  }
  return [];
}

function fieldText(row: Row, key: string): string | null {
  const v = row[key];
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return MONEY_KEYS.test(key) ? formatMoney(v) : String(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return Array.isArray(v) ? `${v.length} item${v.length === 1 ? "" : "s"}` : JSON.stringify(v);
  return String(v);
}

function titleOf(row: Row, cfg: SurfaceConfig): string {
  for (const k of [cfg.titleKey, "name", "label", "title", "id", "key"]) {
    if (k && row[k] != null) return String(row[k]);
  }
  return "—";
}

/**
 * Generic live-collection renderer — fetches a surface's `/api/v1/admin/*`
 * endpoint and lists the real rows (title + a couple of secondary fields). Pull
 * to refresh. This is what makes the operator shell genuinely data-backed across
 * the breadth of surfaces without fabricating anything (Rule #1): every figure on
 * screen is a real field off the server.
 */
export function DataSurface({ surface, config }: { surface: OperatorNavItem; config: SurfaceConfig }) {
  const { c } = useTheme();
  const { authed } = useOperator();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!config.endpoint) return;
    try {
      const { data } = await authed<unknown>(config.endpoint);
      setRows(asRows(data));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this surface");
    }
  }, [authed, config.endpoint]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (error) return <StateBlock kind="error" message={error} />;
  if (!rows) return <StateBlock kind="loading" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ padding: 14, gap: 10 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
    >
      <View style={{ marginBottom: 2 }}>
        <Muted>{surface.blurb}</Muted>
        <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}>
          {rows.length} record{rows.length === 1 ? "" : "s"} · live
        </Text>
      </View>

      {rows.length === 0 ? (
        <StateBlock kind="empty" message="No records yet." />
      ) : (
        rows.map((row, i) => {
          const subtitle = (config.subtitleKeys ?? [])
            .map((k) => {
              const t = fieldText(row, k);
              return t ? `${k}: ${t}` : null;
            })
            .filter(Boolean)
            .join("  ·  ");
          return (
            <Card key={i}>
              <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>{titleOf(row, config)}</Text>
              {subtitle ? <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 4 }}>{subtitle}</Text> : null}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}
