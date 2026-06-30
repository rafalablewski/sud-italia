import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useCustomer } from "@/auth/CustomerSession";
import type { OrderDTO } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { Card, StateBlock } from "@/components/ui";
import { SignIn } from "@/features/customer/SignIn";

const ACTIVE = new Set(["pending", "confirmed", "preparing", "ready", "assigned", "picked_up"]);

/** Orders tab — the customer's own order history off `GET /api/v1/customer/orders`,
 *  newest-first; tap an active order to open the live tracker. */
export default function OrdersScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { status, authed } = useCustomer();
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    authed<OrderDTO[]>("/customer/orders")
      .then(({ data }) => setOrders(data ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load orders"));
  }, [authed]);

  useFocusEffect(
    useCallback(() => {
      if (status === "signed-in") load();
    }, [status, load]),
  );
  useEffect(() => {
    if (status === "signed-out") setOrders(null);
  }, [status]);

  if (status === "loading") return <StateBlock kind="loading" />;
  if (status === "signed-out") return <SignIn reason="Sign in to see your order history and track live orders." />;
  if (error && !orders) return <StateBlock kind="error" message={error} />;
  if (!orders) return <StateBlock kind="loading" />;
  if (orders.length === 0) return <StateBlock kind="empty" message="No orders yet." />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {orders.map((o) => {
        const live = ACTIVE.has(o.status);
        return (
          <Pressable key={o.id} onPress={() => router.push(`/customer/order/${o.id}`)}>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 16 }}>#{o.shortId}</Text>
                <View style={{ backgroundColor: live ? c.accent : c.surface, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}>
                  <Text style={{ color: live ? c.onAccent : c.textSecondary, fontSize: 12, fontWeight: "700", textTransform: "capitalize" }}>{o.status.replace("_", " ")}</Text>
                </View>
              </View>
              <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 6 }}>
                {o.items.map((it) => `${it.quantity}× ${it.name}`).join(" · ")}
              </Text>
              <Text style={{ color: c.textPrimary, fontWeight: "700", marginTop: 8 }}>{formatMoney(o.totalAmount)}</Text>
            </Card>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
