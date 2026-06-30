import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import type { UpsellSuggestionDTO } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { Card } from "@/components/ui";

/**
 * "Pairs beautifully with —" cross-sell rail. Items + reason copy come from
 * `POST /api/v1/upsell` (the storefront getCartSuggestions engine). Tapping
 * + Add drops the suggestion into the cart; an `addedCount` flips the chip to
 * a basil "added ×N" while staying tappable (web CartUpsell parity).
 */
export function CrossSellRail({
  suggestions,
  addedCount,
  onAdd,
}: {
  suggestions: UpsellSuggestionDTO[];
  addedCount: (id: string) => number;
  onAdd: (s: UpsellSuggestionDTO) => void;
}) {
  const { c } = useTheme();
  if (suggestions.length === 0) return null;
  return (
    <Card>
      <Text style={{ color: c.brand, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 }}>
        L'abbinamento · tonight's pairing
      </Text>
      <Text style={{ color: c.textPrimary, fontSize: 17, fontWeight: "800", marginTop: 2, marginBottom: 10 }}>
        Pairs beautifully with —
      </Text>
      <View style={{ gap: 10 }}>
        {suggestions.map((s) => {
          const n = addedCount(s.id);
          return (
            <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.textPrimary, fontSize: 15, fontWeight: "700" }}>{s.name}</Text>
                <Text style={{ color: c.textSecondary, fontSize: 12.5, fontStyle: "italic", marginTop: 1 }}>{s.reason}</Text>
              </View>
              <Text style={{ color: c.textPrimary, fontSize: 14, fontWeight: "700" }}>{formatMoney(s.price)}</Text>
              <Pressable
                onPress={() => onAdd(s)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${s.name} to cart`}
                hitSlop={6}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: n > 0 ? c.success : c.surface, borderWidth: 1, borderColor: n > 0 ? c.success : c.line }}
              >
                <Text style={{ color: n > 0 ? "#fff" : c.accent, fontWeight: "800", fontSize: 13 }}>
                  {n > 0 ? `aggiunto ×${n}` : "+ Aggiungi"}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
