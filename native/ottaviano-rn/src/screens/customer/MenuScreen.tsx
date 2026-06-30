import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { Animated, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { getLocations, getMenu } from "@/api/public";
import type { LocationDTO, MenuItemDTO } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { useCart } from "@/store/cart";
import { useSettings } from "@/store/settings";
import { categoryLabel, categoryRank, locationOpen } from "@/lib/menu";
import { Card, Pill, StateBlock } from "@/components/ui";
import { MenuItemCard } from "@/components/customer/MenuItemCard";

/**
 * Order tab — the storefront menu (web menu.md parity). Location switcher with a
 * live open-now pill, search, "All + per-category" tabs, an operator-set speed-
 * guarantee banner + combo previews, then the dish grid. Cards open the detail
 * sheet (or one-tap add for simple dishes). A floating cart bar + add toast keep
 * the order in thumb reach. All real data: `/locations`, `/menu`, `/settings/public`.
 */
export function MenuScreen() {
  const { c } = useTheme();
  const navigation = useNavigation<{ navigate: (s: string, p?: object) => void }>();
  const [locations, setLocations] = useState<LocationDTO[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuItemDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [toast, setToast] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const cart = useCart();
  const settings = useSettings((s) => s.settings);
  const loadSettings = useSettings((s) => s.load);
  const count = cart.count();
  const subtotal = cart.subtotal();

  const location = locations.find((l) => l.slug === slug) ?? null;
  const open = locationOpen(location);

  useEffect(() => {
    loadSettings();
    getLocations()
      .then((ls) => {
        setLocations(ls);
        setSlug((s) => s ?? ls[0]?.slug ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load locations"));
  }, [loadSettings]);

  useEffect(() => {
    if (!slug) return;
    setMenu(null);
    setCat("all");
    getMenu(slug)
      .then(setMenu)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the menu"));
  }, [slug]);

  const flash = (msg: string) => {
    setToast(msg);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  const available = useMemo(() => (menu ?? []).filter((m) => m.available), [menu]);

  const categories = useMemo(() => {
    const present = [...new Set(available.map((m) => m.category))].sort((a, b) => categoryRank(a) - categoryRank(b));
    return ["all", ...present];
  }, [available]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return available.filter((m) => {
      if (cat !== "all" && m.category !== cat) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [available, cat, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItemDTO[]>();
    for (const m of filtered) {
      const arr = map.get(m.category) ?? [];
      arr.push(m);
      map.set(m.category, arr);
    }
    return [...map.entries()].sort((a, b) => categoryRank(a[0]) - categoryRank(b[0]));
  }, [filtered]);

  const quickAdd = (m: MenuItemDTO) => {
    if (!slug) return;
    cart.add(m, slug);
    flash(`${m.name} aggiunto`);
  };

  if (error && !menu) return <StateBlock kind="error" message={error} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      {/* Location switcher + open-now status */}
      <View style={{ paddingTop: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
          {locations.map((l) => (
            <Pill key={l.slug} label={l.name} active={slug === l.slug} onPress={() => setSlug(l.slug)} />
          ))}
        </ScrollView>
        {location && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 16, marginTop: 10 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: open.open ? c.success : c.textSecondary }} />
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              {open.open ? `Aperto · open until ${open.closeLabel}` : "Chiuso · closed now"}
            </Text>
          </View>
        )}
      </View>

      {!menu ? (
        <StateBlock kind="loading" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 14, paddingBottom: count > 0 ? 104 : 28 }} keyboardShouldPersistTaps="handled">
          {/* Search */}
          <TextInput
            placeholder="Cerca · search the menu"
            placeholderTextColor={c.textSecondary}
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search the menu"
            style={{ color: c.textPrimary, backgroundColor: c.surface2, borderColor: c.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 }}
          />

          {/* Category tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {categories.map((k) => (
              <Pill key={k} label={k === "all" ? "Tutto · All" : categoryLabel(k)} active={cat === k} onPress={() => setCat(k)} />
            ))}
          </ScrollView>

          {/* Speed guarantee */}
          {settings?.speedGuarantee.active && (
            <Card style={{ borderColor: c.warning }}>
              <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 14 }}>
                {settings.speedGuarantee.maxMinutes} minuti garantiti
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2 }}>{settings.speedGuarantee.guaranteeText}</Text>
            </Card>
          )}

          {/* Combo previews (first two) */}
          {settings && settings.combos.length > 0 && cat === "all" && !query && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: c.brand, fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 }}>Offerte · combos</Text>
              {settings.combos.slice(0, 2).map((deal) => (
                <Card key={deal.id}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.textPrimary, fontWeight: "800" }}>{deal.name}</Text>
                      <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2 }}>{deal.description}</Text>
                    </View>
                    <View style={{ backgroundColor: c.brand, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>−{deal.discountPercent}%</Text>
                    </View>
                  </View>
                </Card>
              ))}
              <Text style={{ color: c.textSecondary, fontSize: 12, fontStyle: "italic" }}>Si attivano automaticamente nel carrello · applied automatically in your cart.</Text>
            </View>
          )}

          {/* Menu grid */}
          {grouped.length === 0 ? (
            <StateBlock kind="empty" message={query ? "Nessun piatto trovato · no dishes match." : "Nothing here yet."} />
          ) : (
            grouped.map(([k, items]) => (
              <View key={k} style={{ gap: 10 }}>
                <Text style={{ color: c.brand, fontSize: 20, fontWeight: "900" }}>{categoryLabel(k)}</Text>
                {items.map((m) => (
                  <MenuItemCard
                    key={m.id}
                    item={m}
                    onOpen={() => slug && navigation.navigate("ItemDetail", { item: m, locationSlug: slug })}
                    onQuickAdd={() => quickAdd(m)}
                  />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add-to-cart toast */}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: count > 0 ? 84 : 24,
            opacity: toastAnim,
            transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          }}
        >
          <View style={{ backgroundColor: c.success, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>{toast}</Text>
          </View>
        </Animated.View>
      )}

      {/* Floating cart */}
      {count > 0 && (
        <Pressable
          onPress={() => navigation.navigate("Cart")}
          accessibilityRole="button"
          accessibilityLabel={`View cart, ${count} items, ${formatMoney(subtotal)}`}
          style={({ pressed }) => ({ position: "absolute", left: 16, right: 16, bottom: 16, backgroundColor: c.brand, opacity: pressed ? 0.9 : 1, borderRadius: 16, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" })}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
            Vedi carrello · {count} item{count === 1 ? "" : "s"}
          </Text>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{formatMoney(subtotal)}</Text>
        </Pressable>
      )}
    </View>
  );
}
