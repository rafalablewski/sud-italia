import { useEffect, useMemo, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { apiRequest } from "@/api/client";
import { ApiError } from "@/api/envelope";
import { getCartUpsell } from "@/api/public";
import type { OrderDTO, UpsellSuggestionDTO } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { modifierLabels } from "@/lib/menu";
import { earnPreview } from "@/lib/loyalty";
import { getActiveComboDeals } from "@/lib/combos";
import { useCart, type CartLine } from "@/store/cart";
import { useSettings } from "@/store/settings";
import { useCustomer } from "@/auth/CustomerSession";
import { Button, Card, Divider, Muted, SegmentedControl, StateBlock, Stepper } from "@/components/ui";
import { CrossSellRail } from "@/components/customer/CrossSellRail";
import { ComboBanner } from "@/components/customer/ComboBanner";

/**
 * Cart → checkout (web checkout.md parity, one screen). Item rows with modifier
 * chips + steppers + per-line notes; the cross-sell pairing rail; the combo
 * banner whose saving subtracts from the real total (Rule #8); a fulfilment
 * toggle that reveals a delivery address or a dine-in party stepper; a tip
 * picker; the loyalty earn preview; and a totals block. Placing the order POSTs
 * to `/orders` (server-priced) with the chosen modifiers, tip, address + party.
 */
export function CartScreen() {
  const { c } = useTheme();
  const navigation = useNavigation<{ replace: (s: string, p: { id: string }) => void; navigate: (s: string) => void }>();
  const cart = useCart();
  const settings = useSettings((s) => s.settings);
  const loadSettings = useSettings((s) => s.load);
  const { profile, accessToken } = useCustomer();
  const [name, setName] = useState(profile?.name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<UpsellSuggestionDTO[]>([]);
  const [noteFor, setNoteFor] = useState<string | null>(null);

  const subtotal = cart.subtotal();
  const combo = useMemo(
    () => getActiveComboDeals(cart.lines.map((l) => ({ item: l.item, quantity: l.quantity })), settings?.combos ?? []),
    [cart.lines, settings],
  );
  const comboSavings = combo.isComplete ? combo.savings : 0;
  const deliveryFee =
    cart.fulfillment === "delivery" && settings && subtotal - comboSavings < settings.delivery.freeThresholdGrosze
      ? settings.delivery.fee
      : 0;
  const total = Math.max(0, subtotal - comboSavings) + deliveryFee + cart.tipGrosze;
  const earn = earnPreview(subtotal - comboSavings, settings, profile?.points ?? 0);
  const belowMin = !!settings && settings.minOrderGrosze > 0 && subtotal < settings.minOrderGrosze;

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Refresh the cross-sell rail whenever the set of cart items changes.
  const itemIdKey = cart.lines.map((l) => l.item.id).join(",");
  useEffect(() => {
    if (!cart.locationSlug || cart.lines.length === 0) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    getCartUpsell(cart.locationSlug, [...new Set(cart.lines.map((l) => l.item.id))])
      .then((s) => {
        if (!alive) return;
        // Drop suggestions already on the order.
        const have = new Set(cart.lines.map((l) => l.item.id));
        setSuggestions(s.filter((x) => !have.has(x.id)));
      })
      .catch(() => alive && setSuggestions([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIdKey, cart.locationSlug]);

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
    if (cart.fulfillment === "delivery" && cart.deliveryAddress.trim().length < 6) {
      setError("Enter a delivery address.");
      return;
    }
    if (belowMin && settings) {
      setError(`Minimum order is ${formatMoney(settings.minOrderGrosze)}.`);
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        locationSlug: cart.locationSlug,
        fulfillmentType: cart.fulfillment,
        items: cart.lines.map((l) => ({
          id: l.item.id,
          quantity: l.quantity,
          ...(l.notes ? { notes: l.notes } : {}),
          ...(l.selectedModifiers.length ? { selectedModifiers: l.selectedModifiers } : {}),
        })),
        immediate: true,
        ...(cart.tipGrosze > 0 ? { tipAmount: cart.tipGrosze } : {}),
        ...(cart.fulfillment === "delivery" ? { deliveryAddress: cart.deliveryAddress.trim() } : {}),
        ...(cart.fulfillment === "dine-in" ? { partySize: cart.partySize } : {}),
        ...(accessToken ? {} : { customerName: name.trim(), customerPhone: phone.trim() }),
      };
      const { data } = await apiRequest<OrderDTO>("/orders", {
        method: "POST",
        body,
        token: accessToken ?? undefined,
        idempotencyKey: `order-${cart.locationSlug}-${cart.count()}-${subtotal}-${cart.fulfillment}-${cart.tipGrosze}`,
      });
      cart.clear();
      navigation.replace("OrderTracker", { id: data.id });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not place the order");
    } finally {
      setSubmitting(false);
    }
  };

  const row = (l: CartLine) => {
    const mods = modifierLabels(l.item, l.selectedModifiers);
    return (
      <View key={l.key} style={{ paddingVertical: 10, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <Stepper value={l.quantity} min={0} onChange={(q) => cart.setQuantity(l.key, q)} label={`${l.item.name} quantity`} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textPrimary, fontWeight: "700" }}>{l.item.name}</Text>
            {mods.length > 0 && <Text style={{ color: c.textSecondary, fontSize: 12.5, marginTop: 1 }}>{mods.join(" · ")}</Text>}
            {l.notes ? <Text style={{ color: c.textSecondary, fontSize: 12.5, fontStyle: "italic", marginTop: 1 }}>“{l.notes}”</Text> : null}
            <Pressable onPress={() => setNoteFor(noteFor === l.key ? null : l.key)} hitSlop={6} accessibilityRole="button">
              <Text style={{ color: c.accent, fontSize: 12.5, marginTop: 3 }}>{l.notes ? "edit note" : "+ add note"}</Text>
            </Pressable>
          </View>
          <Text style={{ color: c.textPrimary, fontWeight: "700" }}>{formatMoney(cart.lineTotal(l))}</Text>
        </View>
        {noteFor === l.key && (
          <TextInput
            placeholder="e.g. no basil, well done"
            placeholderTextColor={c.textSecondary}
            defaultValue={l.notes}
            onChangeText={(t) => cart.setNotes(l.key, t)}
            maxLength={140}
            accessibilityLabel={`Note for ${l.item.name}`}
            style={{ color: c.textPrimary, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}
          />
        )}
      </View>
    );
  };

  const tipPresets = settings?.tipPresets?.length ? settings.tipPresets : [0.1, 0.15, 0.2];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Card>
        {cart.lines.map((l, i) => (
          <View key={l.key}>
            {i > 0 && <Divider />}
            {row(l)}
          </View>
        ))}
      </Card>

      <ComboBanner combo={combo} />

      <CrossSellRail
        suggestions={suggestions}
        addedCount={(id) => cart.lines.filter((l) => l.item.id === id).reduce((n, l) => n + l.quantity, 0)}
        onAdd={(s) => {
          if (!cart.locationSlug) return;
          cart.add(
            { ...s, currency: "PLN", image: null, tags: [], available: true, menuRole: null, allergens: [], nutrition: null, prepTimeMinutes: null, isLimited: false, deliveryOnly: false, modifierGroups: [], disclosures: { halalStatus: null, nutriGrade: null, containsPork: false, containsAlcohol: false } },
            cart.locationSlug,
          );
        }}
      />

      {/* Fulfilment */}
      <View style={{ gap: 10 }}>
        <SegmentedControl
          label="Fulfilment"
          value={cart.fulfillment}
          onChange={cart.setFulfillment}
          options={[
            { value: "takeout", label: "Takeout", sub: "asporto" },
            { value: "delivery", label: "Delivery", sub: "consegna" },
            { value: "dine-in", label: "Dine-in", sub: "a tavola" },
          ]}
        />
        {cart.fulfillment === "delivery" && (
          <TextInput
            placeholder="Delivery address · indirizzo"
            placeholderTextColor={c.textSecondary}
            value={cart.deliveryAddress}
            onChangeText={cart.setDeliveryAddress}
            accessibilityLabel="Delivery address"
            style={{ color: c.textPrimary, backgroundColor: c.surface2, borderColor: c.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 }}
          />
        )}
        {cart.fulfillment === "dine-in" && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: c.textPrimary, fontWeight: "700" }}>Party size · coperti</Text>
            <Stepper value={cart.partySize} min={1} onChange={cart.setPartySize} label="Party size" />
          </View>
        )}
      </View>

      {/* Tip */}
      <Card>
        <Text style={{ color: c.textPrimary, fontWeight: "800", marginBottom: 8 }}>Mancia · tip</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[0, ...tipPresets].map((frac) => {
            const grosze = Math.round(subtotal * frac);
            const on = cart.tipGrosze === grosze;
            return (
              <Pressable
                key={frac}
                onPress={() => cart.setTip(grosze)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={frac === 0 ? "No tip" : `${Math.round(frac * 100)} percent tip`}
                style={{ flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accent : "transparent" }}
              >
                <Text style={{ color: on ? c.onAccent : c.textPrimary, fontWeight: "700" }}>{frac === 0 ? "—" : `${Math.round(frac * 100)}%`}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Guest identity */}
      {!accessToken && (
        <Card>
          <Text style={{ color: c.textPrimary, fontWeight: "800", marginBottom: 8 }}>I tuoi dati · your details</Text>
          <TextInput placeholder="Name" placeholderTextColor={c.textSecondary} value={name} onChangeText={setName} accessibilityLabel="Your name" style={{ color: c.textPrimary, borderBottomWidth: 1, borderBottomColor: c.line, paddingVertical: 8, marginBottom: 8 }} />
          <TextInput placeholder="Phone" placeholderTextColor={c.textSecondary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" accessibilityLabel="Your phone number" style={{ color: c.textPrimary, borderBottomWidth: 1, borderBottomColor: c.line, paddingVertical: 8 }} />
          <Muted style={{ marginTop: 8 }}>No account needed — sign in later to earn loyalty points.</Muted>
        </Card>
      )}

      {/* Totals */}
      <Card>
        <TotalRow label="Subtotale · subtotal" value={formatMoney(subtotal)} />
        {comboSavings > 0 && <TotalRow label={`Combo · ${combo.activeDeal?.name ?? ""}`} value={`− ${formatMoney(comboSavings)}`} tone="success" />}
        {deliveryFee > 0 && <TotalRow label="Consegna · delivery" value={formatMoney(deliveryFee)} />}
        {cart.tipGrosze > 0 && <TotalRow label="Mancia · tip" value={formatMoney(cart.tipGrosze)} />}
        <Divider />
        <TotalRow label="Totale · total" value={formatMoney(total)} bold />
        {earn > 0 && <Muted style={{ marginTop: 6 }}>★ You'll earn {earn} point{earn === 1 ? "" : "s"} on this order.</Muted>}
        {belowMin && settings && <Text style={{ color: c.warning, fontSize: 13, marginTop: 6 }}>Add {formatMoney(settings.minOrderGrosze - subtotal)} more to reach the {formatMoney(settings.minOrderGrosze)} minimum.</Text>}
        <Muted style={{ marginTop: 6 }}>Final price is confirmed by the kitchen at checkout.</Muted>
      </Card>

      {error && <Text style={{ color: c.danger, fontWeight: "600" }}>{error}</Text>}
      <Button label={submitting ? "Placing order…" : `Procedi · Place order · ${formatMoney(total)}`} onPress={submit} disabled={submitting || belowMin} />
    </ScrollView>
  );
}

function TotalRow({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: "success" }) {
  const { c } = useTheme();
  const color = tone === "success" ? c.success : c.textPrimary;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <Text style={{ color, fontWeight: bold ? "800" : "600", fontSize: bold ? 16 : 14 }}>{label}</Text>
      <Text style={{ color, fontWeight: bold ? "800" : "700", fontSize: bold ? 16 : 14, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}
