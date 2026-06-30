import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { getLocations, getMenu } from "@/api/public";
import type { LocationDTO, MenuItemDTO } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { useCart } from "@/store/cart";
import { Card, Pill, StateBlock } from "@/components/ui";
import { MENU_CATEGORY_LABELS } from "@/features/kds/kdsLogic";

const CATEGORY_ORDER = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];

/** Order tab — browse the live menu for a location and build the cart. Wired to
 *  the public `GET /locations` + `GET /menu?location=` (Rule #1, real data). */
export default function MenuScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const [locations, setLocations] = useState<LocationDTO[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuItemDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cart = useCart();
  const count = cart.count();
  const subtotal = cart.subtotal();

  useEffect(() => {
    getLocations()
      .then((ls) => {
        setLocations(ls);
        setSlug((s) => s ?? ls[0]?.slug ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load locations"));
  }, []);

  useEffect(() => {
    if (!slug) return;
    setMenu(null);
    getMenu(slug)
      .then(setMenu)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the menu"));
  }, [slug]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItemDTO[]>();
    for (const m of menu ?? []) {
      if (!m.available) continue;
      const arr = map.get(m.category) ?? [];
      arr.push(m);
      map.set(m.category, arr);
    }
    return [...map.entries()].sort((a, b) => {
      const ra = CATEGORY_ORDER.indexOf(a[0]);
      const rb = CATEGORY_ORDER.indexOf(b[0]);
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
    });
  }, [menu]);

  if (error && !menu) return <StateBlock kind="error" message={error} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8 }}>
        {locations.map((l) => (
          <Pill key={l.slug} label={l.name} active={slug === l.slug} onPress={() => setSlug(l.slug)} />
        ))}
      </ScrollView>

      {!menu ? (
        <StateBlock kind="loading" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 18, paddingBottom: count > 0 ? 96 : 24 }}>
          {grouped.map(([cat, items]) => (
            <View key={cat} style={{ gap: 10 }}>
              <Text style={{ color: c.brand, fontSize: 20, fontWeight: "900" }}>{MENU_CATEGORY_LABELS[cat] ?? cat}</Text>
              {items.map((m) => (
                <Card key={m.id}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.textPrimary, fontSize: 16, fontWeight: "800" }}>{m.name}</Text>
                      {!!m.description && <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2 }}>{m.description}</Text>}
                      <Text style={{ color: c.textPrimary, fontSize: 15, fontWeight: "700", marginTop: 8 }}>{formatMoney(m.price)}</Text>
                    </View>
                    <Pressable
                      onPress={() => slug && cart.add(m, slug)}
                      style={({ pressed }) => ({ backgroundColor: c.accent, opacity: pressed ? 0.85 : 1, borderRadius: 12, paddingHorizontal: 16, justifyContent: "center" })}
                    >
                      <Text style={{ color: c.onAccent, fontSize: 22, fontWeight: "800" }}>＋</Text>
                    </Pressable>
                  </View>
                </Card>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {count > 0 && (
        <Pressable
          onPress={() => router.push("/customer/cart")}
          style={({ pressed }) => ({ position: "absolute", left: 16, right: 16, bottom: 16, backgroundColor: c.brand, opacity: pressed ? 0.9 : 1, borderRadius: 16, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" })}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
            View cart · {count} item{count === 1 ? "" : "s"}
          </Text>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{formatMoney(subtotal)}</Text>
        </Pressable>
      )}
    </View>
  );
}
