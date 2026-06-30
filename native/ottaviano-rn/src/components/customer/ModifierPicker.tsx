import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import type { MenuItemDTO, ModifierGroup, SelectedModifier } from "@/api/types";
import { formatMoney } from "@/lib/format";
import { isGroupRequired, isMultiSelect } from "@/lib/menu";

/**
 * Modifier picker — one section per `MenuItem.modifierGroups` entry (Crust,
 * Premium toppings). Radio when `maxSelections === 1`, checkbox when > 1 (capped
 * at the max). Mirrors the web `ItemDetailDrawer` modifier section: a rule chip
 * (required / optional / choose N), a `+price` delta on surcharge options, and
 * a basil-filled selected state. The chosen options drive the line price.
 */
export function ModifierPicker({
  item,
  selected,
  onChange,
}: {
  item: MenuItemDTO;
  selected: SelectedModifier[];
  onChange: (next: SelectedModifier[]) => void;
}) {
  const { c, radius } = useTheme();
  if (item.modifierGroups.length === 0) return null;

  const ruleChip = (g: ModifierGroup): string => {
    if (isGroupRequired(g) && !isMultiSelect(g)) return "obbligatorio · required";
    const max = g.maxSelections ?? 1;
    if (isMultiSelect(g)) return `scegli fino a ${max} · choose up to ${max}`;
    return "facoltativo · optional";
  };

  const toggle = (g: ModifierGroup, optionId: string) => {
    const inGroup = selected.filter((s) => s.groupId === g.id);
    const has = inGroup.some((s) => s.optionId === optionId);
    const others = selected.filter((s) => s.groupId !== g.id);
    if (!isMultiSelect(g)) {
      // Radio — required groups can't be cleared by re-tapping.
      if (has && isGroupRequired(g)) return;
      onChange(has ? others : [...others, { groupId: g.id, optionId }]);
      return;
    }
    // Checkbox — toggle, capped at maxSelections.
    if (has) {
      onChange([...others, ...inGroup.filter((s) => s.optionId !== optionId)]);
    } else {
      const max = g.maxSelections ?? 99;
      if (inGroup.length >= max) return;
      onChange([...others, ...inGroup, { groupId: g.id, optionId }]);
    }
  };

  return (
    <View style={{ gap: 18 }}>
      {item.modifierGroups.map((g) => {
        const radio = !isMultiSelect(g);
        return (
          <View key={g.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: c.textPrimary, fontSize: 16, fontWeight: "800" }}>{g.label}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12, fontStyle: "italic" }}>{ruleChip(g)}</Text>
            </View>
            {g.options.map((o) => {
              const on = selected.some((s) => s.groupId === g.id && s.optionId === o.id);
              return (
                <Pressable
                  key={o.id}
                  onPress={() => toggle(g, o.id)}
                  accessibilityRole={radio ? "radio" : "checkbox"}
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${o.label}${o.priceDelta > 0 ? `, plus ${formatMoney(o.priceDelta)}` : ""}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    minHeight: 48,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: on ? c.success : c.line,
                    backgroundColor: on ? c.success + "1A" : "transparent",
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: radio ? 11 : 6,
                      borderWidth: 2,
                      borderColor: on ? c.success : c.line,
                      backgroundColor: on ? c.success : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {on && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "900" }}>✓</Text>}
                  </View>
                  <Text style={{ color: c.textPrimary, fontSize: 15, fontWeight: "600", flex: 1 }}>{o.label}</Text>
                  {o.priceDelta > 0 && (
                    <Text style={{ color: c.brand, fontSize: 14, fontWeight: "700" }}>+{formatMoney(o.priceDelta)}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
