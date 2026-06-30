import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useCustomer } from "@/auth/CustomerSession";
import { getMenu } from "@/api/public";
import type { OrderDTO } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { useCart } from "@/store/cart";
import { Card, SectionHeading, StateBlock } from "@/components/ui";
import { SignIn } from "@/features/customer/SignIn";

const ACTIVE = new Set(["pending", "confirmed", "preparing", "ready", "assigned", "picked_up"]);

/**
 * Orders tab — the customer's own history off `GET /api/v1/customer/orders`,
 * split into Active (tap → live tracker) and Past. Past orders carry a Reorder
 * action that resolves the order's dishes against the live menu and refills the
 * cart (modifiers are re-chosen, since the line DTO doesn't carry option ids).
 */
export function OrdersScreen() {
  const { c } = useTheme();
  const navigation = useNavigation<{ navigate: (s: string, p?: object) => void }>();
  const { status, authed } = useCustomer();
  const cart = useCart();
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);

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

  const reorder = async (o: OrderDTO) => {
    setReordering(o.id);
    try {
      const menu = await getMenu(o.locationSlug);
      const byId = new Map(menu.map((m) => [m.id, m]));
      let added = 0;
      for (const line of o.items) {
        const item = byId.get(line.menuItemId);
        if (item && item.available) {
          cart.add(item, o.locationSlug, [], line.quantity);
          added++;
        }
      }
      if (added > 0) navigation.navigate("Cart");
    } catch {
      // best-effort — leave the user on the orders list
    } finally {
      setReordering(null);
    }
  };

  if (status === "loading") return <StateBlock kind="loading" />;
  if (status === "signed-out") return <SignIn reason="Sign in to see your order history and track live orders." />;
  if (error && !orders) return <StateBlock kind="error" message={error} />;
  if (!orders) return <StateBlock kind="loading" />;
  if (orders.length === 0) return <StateBlock kind="empty" message="No orders yet." />;

  const active = orders.filter((o) => ACTIVE.has(o.status));
  const past = orders.filter((o) => !ACTIVE.has(o.status));

  const card = (o: OrderDTO, live: boolean) => (
    <Pressable key={o.id} onPress={() => navigation.navigate("OrderTracker", { id: o.id })} accessibilityRole="button" accessibilityLabel={`Order ${o.shortId}, ${o.status}`}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 16 }}>#{o.shortId}</Text>
          <View style={{ backgroundColor: live ? c.accent : c.surface, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 }}>
            <Text style={{ color: live ? c.onAccent : c.textSecondary, fontSize: 12, fontWeight: "700", textTransform: "capitalize" }}>{o.status.replace("_", " ")}</Text>
          </View>
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 6 }}>{o.items.map((it) => `${it.quantity}× ${it.name}`).join(" · ")}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <Text style={{ color: c.textPrimary, fontWeight: "700" }}>{formatMoney(o.totalAmount)}</Text>
          {!live && (
            <Pressable
              onPress={() => reorder(o)}
              disabled={reordering === o.id}
              accessibilityRole="button"
              accessibilityLabel={`Reorder ${o.shortId}`}
              hitSlop={6}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: c.accent }}
            >
              <Text style={{ color: c.accent, fontWeight: "800", fontSize: 13 }}>{reordering === o.id ? "…" : "Ordina ancora · Reorder"}</Text>
            </Pressable>
          )}
        </View>
      </Card>
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {active.length > 0 && (
        <View style={{ gap: 12 }}>
          <SectionHeading>In corso · active</SectionHeading>
          {active.map((o) => card(o, true))}
        </View>
      )}
      {past.length > 0 && (
        <View style={{ gap: 12, marginTop: active.length > 0 ? 8 : 0 }}>
          <SectionHeading>Precedenti · past</SectionHeading>
          {past.map((o) => card(o, false))}
        </View>
      )}
    </ScrollView>
  );
}
