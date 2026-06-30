import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import type { OrderDTO } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { Card, Pill, StatTile, StateBlock } from "@/components/ui";
import { useOrdersStream } from "@/features/kds/useOrdersStream";
import { channelTag } from "@/features/kds/kdsLogic";

const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | undefined> = {
  ready: "ok",
  preparing: "warn",
  confirmed: undefined,
  completed: "ok",
  cancelled: "bad",
};

/**
 * Operator Orders board — the live order spine across every fulfilment type
 * (`GET /api/v1/orders` + the `/orders/stream` SSE). Newest-first, scope-filtered
 * by the token. 1:1 with the web operator Orders surface.
 */
export function OrdersBoard() {
  const { c } = useTheme();
  const { orders, connected, error } = useOrdersStream();

  const sorted = useMemo(() => [...orders].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)), [orders]);
  const open = orders.filter((o) => !["completed", "cancelled", "delivered"].includes(o.status)).length;
  const revenue = orders.reduce((n, o) => n + o.totalAmount, 0);

  if (error && orders.length === 0) return <StateBlock kind="error" message={error} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ padding: 14, gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <StatTile label="Open" value={open} />
        <StatTile label="Total" value={orders.length} />
        <StatTile label="Revenue" value={formatMoney(revenue)} />
        <Pill label={connected ? "Live" : "…"} tone={connected ? "success" : "default"} />
      </View>

      {sorted.length === 0 ? (
        <StateBlock kind="empty" message="No orders in scope." />
      ) : (
        sorted.map((o: OrderDTO) => (
          <Card key={o.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 16 }}>#{o.shortId}</Text>
              <Pill label={o.status.replace("_", " ")} tone={STATUS_TONE[o.status] === "ok" ? "success" : STATUS_TONE[o.status] === "warn" ? "warning" : STATUS_TONE[o.status] === "bad" ? "danger" : "default"} />
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}>
              {channelTag(o)} · {o.customerName || "Guest"} · {o.locationSlug}
            </Text>
            <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 6 }}>
              {o.items.map((it) => `${it.quantity}× ${it.name}`).join(" · ")}
            </Text>
            <Text style={{ color: c.textPrimary, fontWeight: "700", marginTop: 8 }}>{formatMoney(o.totalAmount)}</Text>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
