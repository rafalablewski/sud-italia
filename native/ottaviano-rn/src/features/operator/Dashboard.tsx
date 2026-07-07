import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { formatMoney } from "@/lib/format";
import { Card, SectionHeading, StatTile, StateBlock } from "@/components/ui";
import { useBreakpoint } from "@/lib/useBreakpoint";

interface SummaryStats {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  totalOrders: number;
  totalItems: number;
  avgOrderValue: number;
  takeoutCount: number;
  deliveryCount: number;
  dineInCount: number;
  topItems: { name: string; quantity: number; revenue: number }[];
}

/**
 * Dashboard / Reports — the sales/cost/profit rollup off `GET /api/v1/admin/summary`
 * (the same `getSummary` engine the web `/admin/reports` uses). Money is grosze on
 * the wire, formatted here. Manager+.
 */
export function Dashboard() {
  const { c } = useTheme();
  const { isDesktop } = useBreakpoint();
  const { authed } = useOperator();
  const [s, setS] = useState<SummaryStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authed<SummaryStats>("/admin/summary")
      .then(({ data }) => setS(data))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the dashboard"));
  }, [authed]);

  if (error) return <StateBlock kind="error" message={error} />;
  if (!s) return <StateBlock kind="loading" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ padding: 14, gap: 14, width: "100%", maxWidth: isDesktop ? 1120 : undefined, alignSelf: isDesktop ? "center" : "auto" }}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <StatTile label="Revenue" value={formatMoney(s.totalRevenue)} tone="ok" />
        <StatTile label="Profit" value={formatMoney(s.totalProfit)} tone={s.totalProfit >= 0 ? "ok" : "bad"} />
        <StatTile label="Margin" value={`${s.profitMargin}%`} />
        <StatTile label="Orders" value={s.totalOrders} />
        <StatTile label="Avg order" value={formatMoney(s.avgOrderValue)} />
        <StatTile label="Items" value={s.totalItems} />
      </View>

      <View>
        <SectionHeading>Fulfilment mix</SectionHeading>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <StatTile label="Takeaway" value={s.takeoutCount} />
          <StatTile label="Delivery" value={s.deliveryCount} />
          <StatTile label="Dine-in" value={s.dineInCount} />
        </View>
      </View>

      {s.topItems?.length > 0 && (
        <View>
          <SectionHeading>Top sellers</SectionHeading>
          <Card>
            {s.topItems.map((it, i) => (
              <View key={it.name} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: i ? 0.5 : 0, borderTopColor: c.line }}>
                <Text style={{ color: c.textPrimary, flex: 1 }}>
                  <Text style={{ color: c.accent, fontWeight: "800" }}>{it.quantity}× </Text>
                  {it.name}
                </Text>
                <Text style={{ color: c.textSecondary }}>{formatMoney(it.revenue)}</Text>
              </View>
            ))}
          </Card>
        </View>
      )}
    </ScrollView>
  );
}
