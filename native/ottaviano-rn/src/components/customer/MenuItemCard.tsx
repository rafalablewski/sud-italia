import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import type { MenuItemDTO } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { needsConfiguration } from "@/lib/menu";
import { Card } from "@/components/ui";
import { DietRow } from "./DishMeta";

/**
 * One menu dish card. Tapping the body opens the detail sheet; the round + adds
 * straight to cart for simple items, or routes to the sheet when the dish has a
 * required modifier group (so required picks happen before the line lands —
 * web menu.md contract). Prep time + a dietary/role badge row read off the DTO.
 */
export function MenuItemCard({
  item,
  onOpen,
  onQuickAdd,
}: {
  item: MenuItemDTO;
  onOpen: () => void;
  onQuickAdd: () => void;
}) {
  const { c } = useTheme();
  const configurable = needsConfiguration(item) || item.modifierGroups.length > 0;
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${item.name}, ${formatMoney(item.price)}. View details`}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textPrimary, fontSize: 16, fontWeight: "800" }}>{item.name}</Text>
            {!!item.description && (
              <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 }} numberOfLines={2}>
                {item.description}
              </Text>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
              <Text style={{ color: c.textPrimary, fontSize: 15, fontWeight: "700" }}>{formatMoney(item.price)}</Text>
              {item.prepTimeMinutes != null && (
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>· {item.prepTimeMinutes} min</Text>
              )}
            </View>
            <DietRow item={item} />
          </View>
          <Pressable
            onPress={configurable ? onOpen : onQuickAdd}
            accessibilityRole="button"
            accessibilityLabel={configurable ? `Customise ${item.name}` : `Add ${item.name} to cart`}
            hitSlop={6}
            style={({ pressed }) => ({
              backgroundColor: c.accent,
              opacity: pressed ? 0.85 : 1,
              borderRadius: 12,
              width: 46,
              alignSelf: "flex-start",
              height: 46,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Text style={{ color: c.onAccent, fontSize: 24, fontWeight: "800", lineHeight: 26 }}>{configurable ? "›" : "＋"}</Text>
          </Pressable>
        </View>
      </Card>
    </Pressable>
  );
}
