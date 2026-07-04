import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { formatMoney } from "@/lib/format";
import { Card, Muted, SectionHeading, StateBlock, StatTile } from "@/components/ui";

/**
 * Cash — bespoke faithful mirror of the web `CashV3` till reconciliation view
 * (`src/admin-v3/CashV3.tsx`), replacing the generic `DataSurface` list. Shows the
 * open session as a highlight card (opening float · expected-in-drawer · entries,
 * the same three the web surfaces) over a KPI rail (sessions · open · abs variance)
 * and the closed-session history with the web's variance tone (|Δ|<2 zł ok, <10 zł
 * warn, else short/over). Every figure is a real field off `GET /api/v1/admin/cash`
 * (Rule #1) — the facade returns per-session float, drops total, closing count and
 * variance, role-scoped and newest-first. Pull to refresh. (Opening a till stays a
 * later write wave — this screen is the read/parity upgrade.)
 */

interface CashRow {
  id: string;
  locationSlug: string;
  openedAt: string;
  openedBy: string;
  openingFloat: number;
  dropCount: number;
  dropsTotal: number;
  closingCountGrosze: number | null;
  varianceGrosze: number | null;
  closedAt: string | null;
  open: boolean;
}

const SITE_LABEL: Record<string, string> = { krakow: "Kraków", warszawa: "Warszawa" };

function siteOf(slug: string): string {
  return SITE_LABEL[slug] ?? slug;
}

// Web varianceTone: |Δ| < 200 gr ok, < 1000 gr warn, else bad.
function varianceColor(g: number, c: ReturnType<typeof useTheme>["c"]): string {
  const a = Math.abs(g);
  if (a < 200) return c.success;
  if (a < 1000) return c.warning;
  return c.danger;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${day} ${mon}`;
}

export function Cash() {
  const { c } = useTheme();
  const { authed } = useOperator();
  const [rows, setRows] = useState<CashRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authed<CashRow[]>("/admin/cash");
      setRows(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load cash sessions");
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

  const { openSessions, closed, absVariance } = useMemo(() => {
    const list = rows ?? [];
    const closedList = list.filter((s) => !s.open);
    return {
      openSessions: list.filter((s) => s.open),
      closed: closedList,
      absVariance: closedList.reduce((s, r) => s + Math.abs(r.varianceGrosze ?? 0), 0),
    };
  }, [rows]);

  if (error) return <StateBlock kind="error" message={error} />;
  if (!rows) return <StateBlock kind="loading" />;

  const showSite = new Set(rows.map((r) => r.locationSlug)).size > 1;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ padding: 14, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
    >
      {/* KPI rail — sessions, open, cumulative absolute variance across closed. */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatTile label="Sessions" value={rows.length} />
        <StatTile label="Open" value={openSessions.length} tone={openSessions.length > 0 ? "ok" : undefined} />
        <StatTile label="Abs variance" value={formatMoney(absVariance)} tone={absVariance >= 1000 ? "warn" : undefined} />
      </View>

      {/* Open sessions — the web highlights the live drawer (float · expected · entries). */}
      {openSessions.map((s) => {
        const expected = s.openingFloat + s.dropsTotal;
        return (
          <Card key={s.id} style={{ borderColor: c.success }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>
                Open till{showSite ? ` · ${siteOf(s.locationSlug)}` : ""}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.success }} />
                <Text style={{ color: c.success, fontSize: 12, fontWeight: "700" }}>Live</Text>
              </View>
            </View>
            <Muted style={{ marginTop: 2, fontSize: 12 }}>Opened {fmtWhen(s.openedAt)} · {s.openedBy}</Muted>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <StatTile label="Opening float" value={formatMoney(s.openingFloat)} />
              <StatTile label="Expected" value={formatMoney(expected)} />
              <StatTile label="Entries" value={s.dropCount} />
            </View>
          </Card>
        );
      })}

      {/* Closed-session history with variance badge. */}
      <SectionHeading>Session history</SectionHeading>
      {closed.length === 0 ? (
        <StateBlock kind="empty" message="No closed sessions yet." />
      ) : (
        closed.map((s) => {
          const variance = s.varianceGrosze ?? 0;
          const vColor = varianceColor(variance, c);
          return (
            <Card key={s.id}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>
                    {fmtWhen(s.closedAt)}
                    {showSite ? `  ·  ${siteOf(s.locationSlug)}` : ""}
                  </Text>
                  <Muted style={{ marginTop: 2, fontSize: 12 }}>
                    Float {formatMoney(s.openingFloat)} · counted {s.closingCountGrosze != null ? formatMoney(s.closingCountGrosze) : "—"}
                  </Muted>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: c.surface,
                    borderColor: vColor,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderRadius: 999,
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                  }}
                >
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: vColor }} />
                  <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                    {variance >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(variance), false)}
                  </Text>
                </View>
              </View>
            </Card>
          );
        })
      )}

      <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: "center", marginTop: 2 }}>
        {rows.length} session{rows.length === 1 ? "" : "s"} · live
      </Text>
    </ScrollView>
  );
}
