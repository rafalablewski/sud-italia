import { useEffect, useMemo, useState } from "react";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { Share, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { openSSE } from "@/api/sse";
import { useCustomer } from "@/auth/CustomerSession";
import { useSettings } from "@/store/settings";
import type { OrderDTO, OrderStatus } from "@/api/types";
import { formatMoney, parseMs } from "@/lib/format";
import { earnPreview } from "@/lib/loyalty";
import { Button, Card, StateBlock } from "@/components/ui";
import type { CustomerStackParamList } from "@/navigation/types";

const STEPS: { status: OrderStatus; label: string; sub: string }[] = [
  { status: "confirmed", label: "Confirmed · confermato", sub: "We've got your order." },
  { status: "preparing", label: "In the oven · in forno", sub: "Our pizzaiolo is on it." },
  { status: "ready", label: "Ready · pronto", sub: "Hot and ready for you." },
  { status: "completed", label: "Picked up · ritirato", sub: "Buon appetito!" },
];

const FULFILMENT_LABEL: Record<string, string> = { takeout: "Takeout · asporto", delivery: "Delivery · consegna", "dine-in": "Dine-in · a tavola" };

/**
 * Live order tracker (web order.md parity). The Bearer SSE feed keeps the step
 * stack + ETA live; the operator's KDS bump propagates here through the same
 * in-process emitter. Adds an ETA card, a fulfilment chip, the order summary,
 * the loyalty points earned on the order, and a share action.
 */
export function OrderTrackerScreen() {
  const { c } = useTheme();
  const { id } = useRoute<RouteProp<CustomerStackParamList, "OrderTracker">>().params;
  const { authed, accessToken } = useCustomer();
  const settings = useSettings((s) => s.settings);
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const foodSubtotal = useMemo(() => (order ? order.items.reduce((s, it) => s + it.unitPrice * it.quantity, 0) : 0), [order]);

  if (error) return <StateBlock kind="error" message={error} />;
  if (!order) return <StateBlock kind="loading" />;

  const activeIdx = STEPS.findIndex((s) => s.status === order.status);
  const stage = order.status === "cancelled" ? -1 : activeIdx;
  const cancelled = order.status === "cancelled";

  const etaMs = parseMs(order.estimatedReadyAt) ?? order.prediction?.predictedReadyAtMs ?? null;
  const etaMin = etaMs != null ? Math.round((etaMs - now) / 60000) : null;
  const etaLabel =
    order.status === "ready" || order.status === "completed"
      ? "Ready now!"
      : etaMin == null
        ? "—"
        : etaMin <= 0
          ? "Any minute"
          : `~${etaMin} min`;

  const earn = earnPreview(foodSubtotal, settings, 0);

  const share = () =>
    Share.share({ message: `My Ottaviano order #${order.shortId} — ${order.items.map((it) => `${it.quantity}× ${it.name}`).join(", ")}` }).catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <View style={{ padding: 16, gap: 16 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: c.brand, fontSize: 26, fontWeight: "900" }}>Order #{order.shortId}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cancelled ? c.danger : c.success }} />
            <Text style={{ color: c.textSecondary }}>{cancelled ? "Cancelled" : "Tracking live · in diretta"}</Text>
            <Text style={{ color: c.textSecondary }}>· {FULFILMENT_LABEL[order.fulfillmentType] ?? order.fulfillmentType}</Text>
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 16, flex: 1 }}>
        {!cancelled && (
          <Card style={{ borderColor: c.brand }}>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>Stimato · estimated</Text>
            <Text style={{ color: c.brand, fontSize: 24, fontWeight: "900", marginTop: 2 }}>{etaLabel}</Text>
          </Card>
        )}

        <Card>
          {STEPS.map((s, i) => {
            const done = stage >= i;
            const current = stage === i;
            return (
              <View key={s.status} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: done ? c.success : "transparent", borderWidth: 2, borderColor: done ? c.success : c.line, alignItems: "center", justifyContent: "center" }}>
                  {done && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "900" }}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: current ? c.textPrimary : done ? c.textPrimary : c.textSecondary, fontWeight: current ? "800" : "600", fontSize: 16 }}>{s.label}</Text>
                  {current && <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 1 }}>{s.sub}</Text>}
                </View>
              </View>
            );
          })}
        </Card>

        <Card>
          {order.items.map((it, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
              <Text style={{ color: c.textPrimary, flex: 1 }}>
                {it.quantity}× {it.name}
                {it.modifiers.length > 0 ? ` · ${it.modifiers.map((m) => m.label).join(", ")}` : ""}
              </Text>
              <Text style={{ color: c.textSecondary }}>{formatMoney(it.unitPrice * it.quantity)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10 }}>
            <Text style={{ color: c.textPrimary, fontWeight: "800" }}>Total</Text>
            <Text style={{ color: c.textPrimary, fontWeight: "800" }}>{formatMoney(order.totalAmount)}</Text>
          </View>
        </Card>

        {!cancelled && earn > 0 && (
          <Card style={{ borderColor: c.warning }}>
            <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>★ +{earn} points earned</Text>
            <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2 }}>Credited to {order.customerPhone} — no card to carry.</Text>
          </Card>
        )}

        <Button label="Condividi · Share" variant="ghost" onPress={share} />
      </View>
    </View>
  );
}
