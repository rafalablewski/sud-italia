import { View, Text } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import type { MenuItemDTO } from "@/api/types";
import { dietBadges } from "@/lib/menu";
import { Badge } from "@/components/ui";

/** Pretty allergen names — wire codes ("gluten") → label ("Gluten"). */
function allergenLabel(a: string): string {
  return a.replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Dietary badges + a "Limited" / "New" / "Pizzaiolo's pick" role flag for a
 *  menu card. Reads only off the item's tags / menuRole / isLimited (Rule #1). */
export function DietRow({ item }: { item: MenuItemDTO }) {
  const diets = dietBadges(item);
  const limited = item.isLimited;
  const role = item.menuRole;
  if (diets.length === 0 && !limited && !role) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {limited && <Badge label="Stagionale" tone="warn" filled />}
      {role === "hero" && <Badge label="Pizzaiolo's pick" tone="brand" />}
      {role === "anchor" && <Badge label="Signature" tone="brand" />}
      {diets.map((d) => (
        <Badge key={d.key} label={d.label} tone={d.tone} />
      ))}
    </View>
  );
}

/** The allergen chip row for the item detail sheet (allergeni). */
export function AllergenRow({ item }: { item: MenuItemDTO }) {
  const { c } = useTheme();
  if (!item.allergens || item.allergens.length === 0) {
    return (
      <Text style={{ color: c.success, fontWeight: "600", fontSize: 13 }}>
        Senza allergeni maggiori · no major allergens
      </Text>
    );
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {item.allergens.map((a) => (
        <Badge key={a} label={allergenLabel(a)} tone="danger" />
      ))}
    </View>
  );
}

/** Bilingual printed-menu nutrition readout (label · value, dotted leaders). */
export function NutritionReadout({ item }: { item: MenuItemDTO }) {
  const { c } = useTheme();
  const n = item.nutrition;
  if (!n) return null;
  const rows: { label: string; value: string }[] = [
    { label: "Calorie · calories", value: `${Math.round(n.calories)} kcal` },
    { label: "Proteine · protein", value: `${Math.round(n.protein)} g` },
    { label: "Carboidrati · carbs", value: `${Math.round(n.carbs)} g` },
    { label: "Grassi · fat", value: `${Math.round(n.fat)} g` },
  ];
  if (n.fiber != null) rows.push({ label: "Fibre · fiber", value: `${Math.round(n.fiber)} g` });
  if (n.sodium != null) rows.push({ label: "Sodio · sodium", value: `${Math.round(n.sodium)} mg` });
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{r.label}</Text>
          <View style={{ flex: 1, borderBottomWidth: 1, borderColor: c.line, borderStyle: "dashed", marginHorizontal: 8, marginBottom: 3 }} />
          <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}
