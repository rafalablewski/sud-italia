import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { useOperatorLocation } from "@/store/operatorLocation";
import { formatMoney } from "@/lib/format";
import { Card, Muted, Pill, StateBlock } from "@/components/ui";
import { useBreakpoint } from "@/lib/useBreakpoint";
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
  // Responsive (ADR-002): the record list becomes a multi-column grid on wide
  // screens (Mac / iPad landscape), single column on phone.
  const { isDesktop, isTablet } = useBreakpoint();
  const colWidth = isDesktop ? "32%" : isTablet ? "48.5%" : "100%";
  const { authed } = useOperator();
  const needsLocation = !!config.needsLocation;
  const { slug, locations, error: locError, setSlug, ensureLoaded } = useOperatorLocation();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // A per-location surface needs the active locations loaded before it can fetch.
  useEffect(() => {
    if (needsLocation) void ensureLoaded();
  }, [needsLocation, ensureLoaded]);

  // The fetch URL — scoped to the selected site when the endpoint requires it.
  // Null while we still need a location but don't have one yet (holds at loading).
  const url = useMemo(() => {
    if (!config.endpoint) return null;
    if (!needsLocation) return config.endpoint;
    if (!slug) return null;
    return `${config.endpoint}?location=${encodeURIComponent(slug)}`;
  }, [config.endpoint, needsLocation, slug]);

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const { data } = await authed<unknown>(url);
      setRows(asRows(data));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this surface");
    }
  }, [authed, url]);

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
  // Per-location surface still resolving which site to show.
  if (needsLocation && !slug) {
    return <StateBlock kind={locError ? "error" : "loading"} message={locError ?? undefined} />;
  }
  if (!rows) return <StateBlock kind="loading" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ padding: 14, gap: 10 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
    >
      {needsLocation && locations.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 2 }}>
          {locations.map((l) => (
            <Pill key={l.slug} label={l.city || l.name} active={l.slug === slug} onPress={() => setSlug(l.slug)} />
          ))}
        </View>
      )}

      <View style={{ marginBottom: 2 }}>
        <Muted>{surface.blurb}</Muted>
        <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}>
          {rows.length} record{rows.length === 1 ? "" : "s"} · live
        </Text>
      </View>

      {rows.length === 0 ? (
        <StateBlock kind="empty" message="No records yet." />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {rows.map((row, i) => {
            const subtitle = (config.subtitleKeys ?? [])
              .map((k) => {
                const t = fieldText(row, k);
                return t ? `${k}: ${t}` : null;
              })
              .filter(Boolean)
              .join("  ·  ");
            return (
              <View key={i} style={{ width: colWidth }}>
                <Card>
                  <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>{titleOf(row, config)}</Text>
                  {subtitle ? <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 4 }}>{subtitle}</Text> : null}
                </Card>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
