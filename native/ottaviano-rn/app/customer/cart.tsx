import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { apiRequest } from "@/api/client";
import { ApiError } from "@/api/envelope";
import type { OrderDTO } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { useCart } from "@/store/cart";
import { useCustomer } from "@/auth/CustomerSession";
import { Button, Card, Divider, Muted, StateBlock } from "@/components/ui";

type Fulfillment = "takeout" | "delivery" | "dine-in";

/**
 * Cart → checkout. Builds the order from item ids + quantities and submits to
 * `POST /api/v1/orders` — server-priced (the client total here is only an
 * estimate). Works for a guest (name + phone) or a signed-in customer (phone from
 * the token). Idempotency-Key makes a retry safe. On success → the live tracker.
 */
export default function CartScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const cart = useCart();
  const { profile, accessToken } = useCustomer();
  const [fulfillment, setFulfillment] = useState<Fulfillment>("takeout");
  const [name, setName] = useState(profile?.name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (cart.lines.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <StateBlock kind="empty" message="Your cart is empty." />
      </View>
    );
  }

  const submit = async () => {
    setError(null);
    if (!accessToken && (!name.trim() || phone.trim().length < 6)) {
      setError("Enter your name and phone to place the order.");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        locationSlug: cart.locationSlug,
        fulfillmentType: fulfillment,
        items: cart.lines.map((l) => ({ id: l.item.id, quantity: l.quantity, ...(l.notes ? { notes: l.notes } : {}) })),
        immediate: true,
        ...(accessToken ? {} : { customerName: name.trim(), customerPhone: phone.trim() }),
      };
      const { data } = await apiRequest<OrderDTO>("/orders", {
        method: "POST",
        body,
        token: accessToken ?? undefined,
        idempotencyKey: `order-${cart.locationSlug}-${cart.count()}-${cart.subtotal()}`,
      });
      cart.clear();
      router.replace(`/customer/order/${data.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not place the order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card>
        {cart.lines.map((l) => (
          <View key={l.item.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Pressable onPress={() => cart.setQuantity(l.item.id, l.quantity - 1)} hitSlop={8}>
                <Text style={{ color: c.accent, fontSize: 22, fontWeight: "800", width: 24, textAlign: "center" }}>−</Text>
              </Pressable>
              <Text style={{ color: c.textPrimary, fontWeight: "800", minWidth: 18, textAlign: "center" }}>{l.quantity}</Text>
              <Pressable onPress={() => cart.setQuantity(l.item.id, l.quantity + 1)} hitSlop={8}>
                <Text style={{ color: c.accent, fontSize: 22, fontWeight: "800", width: 24, textAlign: "center" }}>＋</Text>
              </Pressable>
            </View>
            <Text style={{ color: c.textPrimary, flex: 1, fontWeight: "600" }}>{l.item.name}</Text>
            <Text style={{ color: c.textPrimary, fontWeight: "700" }}>{formatMoney(l.item.price * l.quantity)}</Text>
          </View>
        ))}
        <Divider />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 16 }}>Estimated total</Text>
          <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 16 }}>{formatMoney(cart.subtotal())}</Text>
        </View>
        <Muted style={{ marginTop: 4 }}>Final price is confirmed by the kitchen at checkout.</Muted>
      </Card>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["takeout", "delivery", "dine-in"] as Fulfillment[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFulfillment(f)}
            style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: fulfillment === f ? c.accent : c.line, backgroundColor: fulfillment === f ? c.accent : "transparent" }}
          >
            <Text style={{ color: fulfillment === f ? c.onAccent : c.textPrimary, fontWeight: "700", textTransform: "capitalize" }}>{f.replace("-", " ")}</Text>
          </Pressable>
        ))}
      </View>

      {!accessToken && (
        <Card>
          <Text style={{ color: c.textPrimary, fontWeight: "800", marginBottom: 8 }}>Your details</Text>
          <TextInput placeholder="Name" placeholderTextColor={c.textSecondary} value={name} onChangeText={setName} style={{ color: c.textPrimary, borderBottomWidth: 1, borderBottomColor: c.line, paddingVertical: 8, marginBottom: 8 }} />
          <TextInput placeholder="Phone" placeholderTextColor={c.textSecondary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={{ color: c.textPrimary, borderBottomWidth: 1, borderBottomColor: c.line, paddingVertical: 8 }} />
          <Muted style={{ marginTop: 8 }}>No account needed — sign in later to earn loyalty points.</Muted>
        </Card>
      )}

      {error && <Text style={{ color: c.danger, fontWeight: "600" }}>{error}</Text>}
      <Button label={submitting ? "Placing order…" : `Place order · ${formatMoney(cart.subtotal())}`} onPress={submit} disabled={submitting} />
    </ScrollView>
  );
}
