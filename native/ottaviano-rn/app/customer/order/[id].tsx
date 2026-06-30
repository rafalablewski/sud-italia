import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { openSSE } from "@/api/sse";
import { useCustomer } from "@/auth/CustomerSession";
import type { OrderDTO, OrderStatus } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { Card, StateBlock } from "@/components/ui";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "confirmed", label: "Confirmed" },
  { status: "preparing", label: "In the oven" },
  { status: "ready", label: "Ready" },
  { status: "completed", label: "Picked up" },
];

/** Live order tracker — the customer Live Activity feed. Opens the Bearer SSE
 *  `/customer/orders/:id/stream`; the operator's KDS bump propagates here through
 *  the same in-process emitter (API-V1.md). */
export default function OrderTracker() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { authed, accessToken } = useCustomer();
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    authed<OrderDTO>(`/customer/orders/${id}`)
      .then(({ data }) => setOrder(data))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the order"));
  }, [id, authed]);

  useEffect(() => {
    if (!id || !accessToken) return;
    const handle = openSSE<{ order: OrderDTO }>({
      path: `/customer/orders/${id}/stream`,
      token: accessToken,
      onMessage: (f) => f.order && setOrder(f.order),
    });
    return () => handle.close();
  }, [id, accessToken]);

  if (error) return <StateBlock kind="error" message={error} />;
  if (!order) return <StateBlock kind="loading" />;

  const activeIdx = STEPS.findIndex((s) => s.status === order.status);
  const stage = order.status === "cancelled" ? -1 : activeIdx;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: c.brand, fontSize: 26, fontWeight: "900" }}>Order #{order.shortId}</Text>
        <Text style={{ color: c.textSecondary }}>{order.status === "cancelled" ? "Cancelled" : "Tracking live"}</Text>
      </View>

      <Card>
        {STEPS.map((s, i) => {
          const done = stage >= i;
          const current = stage === i;
          return (
            <View key={s.status} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: done ? c.success : "transparent", borderWidth: 2, borderColor: done ? c.success : c.line, alignItems: "center", justifyContent: "center" }}>
                {done && <Text style={{ color: "#fff", fontSize: 12, fontWeight: "900" }}>✓</Text>}
              </View>
              <Text style={{ color: current ? c.textPrimary : done ? c.textSecondary : c.textSecondary, fontWeight: current ? "800" : "600", fontSize: 16 }}>{s.label}</Text>
            </View>
          );
        })}
      </Card>

      <Card>
        {order.items.map((it, i) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
            <Text style={{ color: c.textPrimary }}>
              {it.quantity}× {it.name}
            </Text>
            <Text style={{ color: c.textSecondary }}>{formatMoney(it.unitPrice * it.quantity)}</Text>
          </View>
        ))}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10 }}>
          <Text style={{ color: c.textPrimary, fontWeight: "800" }}>Total</Text>
          <Text style={{ color: c.textPrimary, fontWeight: "800" }}>{formatMoney(order.totalAmount)}</Text>
        </View>
      </Card>
    </ScrollView>
  );
}
