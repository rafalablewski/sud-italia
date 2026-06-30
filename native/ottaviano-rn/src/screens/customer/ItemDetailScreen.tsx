import { useMemo, useState } from "react";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import type { SelectedModifier } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { defaultSelections, effectiveUnitPrice, requiredGroupsSatisfied } from "@/lib/menu";
import { useCart } from "@/store/cart";
import { Card, SectionHeading } from "@/components/ui";
import { AllergenRow, NutritionReadout } from "@/components/customer/DishMeta";
import { ModifierPicker } from "@/components/customer/ModifierPicker";
import type { CustomerStackParamList } from "@/navigation/types";

/**
 * Item detail sheet — the native twin of the web `ItemDetailDrawer`. Hero
 * (name + description), editorial meta (price · prep · calories), allergens,
 * nutrition readout, the modifier picker, and a sticky paybar whose price
 * re-quotes live as options are picked. The CTA is disabled (reads "Choose
 * options") until every required group is satisfied. Adding keys the line on
 * item + chosen options so each variant stacks separately.
 */
export function ItemDetailScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ goBack: () => void }>();
  const { item, locationSlug } = useRoute<RouteProp<CustomerStackParamList, "ItemDetail">>().params;
  const cart = useCart();
  const [selected, setSelected] = useState<SelectedModifier[]>(() => defaultSelections(item));

  const unit = useMemo(() => effectiveUnitPrice(item, selected), [item, selected]);
  const ready = requiredGroupsSatisfied(item, selected);

  const add = () => {
    if (!ready) return;
    cart.add(item, locationSlug, selected, 1);
    navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 120 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.brand, fontSize: 26, fontWeight: "900" }}>{item.name}</Text>
          {!!item.description && <Text style={{ color: c.textSecondary, fontSize: 15, lineHeight: 21 }}>{item.description}</Text>}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Text style={{ color: c.brand, fontSize: 20, fontWeight: "800" }}>{formatMoney(item.price)}</Text>
          {item.prepTimeMinutes != null && <Text style={{ color: c.textSecondary }}>· {item.prepTimeMinutes} min</Text>}
          {item.nutrition?.calories != null && <Text style={{ color: c.textSecondary }}>· {Math.round(item.nutrition.calories)} kcal</Text>}
        </View>

        <View style={{ gap: 8 }}>
          <SectionHeading>Allergeni · allergens</SectionHeading>
          <AllergenRow item={item} />
        </View>

        {item.nutrition && (
          <View style={{ gap: 10 }}>
            <SectionHeading>Valori nutrizionali · nutrition</SectionHeading>
            <Card>
              <NutritionReadout item={item} />
            </Card>
          </View>
        )}

        {item.modifierGroups.length > 0 && (
          <View style={{ gap: 10 }}>
            <SectionHeading>Personalizza · make it yours</SectionHeading>
            <ModifierPicker item={item} selected={selected} onChange={setSelected} />
          </View>
        )}
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 12,
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.line,
        }}
      >
        <Pressable
          onPress={add}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          accessibilityLabel={ready ? `Add to cart, ${formatMoney(unit)}` : "Choose required options"}
          style={({ pressed }) => ({
            backgroundColor: ready ? c.accent : c.surface2,
            opacity: pressed && ready ? 0.9 : 1,
            borderRadius: 16,
            paddingVertical: 16,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            borderWidth: ready ? 0 : 1,
            borderColor: c.line,
          })}
        >
          <Text style={{ color: ready ? c.onAccent : c.textSecondary, fontWeight: "800", fontSize: 16 }}>
            {ready ? `Aggiungi · Add to cart · ${formatMoney(unit)}` : "Choose options"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
