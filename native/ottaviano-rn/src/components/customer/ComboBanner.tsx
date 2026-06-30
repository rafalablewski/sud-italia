import { Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { formatMoney } from "@/lib/format";
import type { ComboResult } from "@/lib/combos";
import { Card, ProgressBar } from "@/components/ui";

/**
 * Combo-deal banner. When complete it shows the applied saving (which the cart
 * total actually subtracts — CLAUDE rule #8); when partial it nudges what's
 * still missing with a hairline progress rail. Mirrors web `ComboDealBanner`.
 */
export function ComboBanner({ combo }: { combo: ComboResult }) {
  const { c } = useTheme();
  if (!combo.activeDeal) return null;
  const deal = combo.activeDeal;
  const missing = [...combo.missingItems];
  if (combo.missingQuantity > 0) missing.push(`${combo.missingQuantity} more item${combo.missingQuantity === 1 ? "" : "s"}`);

  return (
    <Card style={{ borderColor: combo.isComplete ? c.success : c.line }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: c.textPrimary, fontSize: 15, fontWeight: "800", flex: 1 }}>{deal.name}</Text>
        {combo.isComplete ? (
          <Text style={{ color: c.success, fontWeight: "800", fontSize: 14 }}>− {formatMoney(combo.savings)}</Text>
        ) : (
          <Text style={{ color: c.brand, fontWeight: "800", fontSize: 13 }}>−{deal.discountPercent}%</Text>
        )}
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 2 }}>{deal.description}</Text>
      {combo.isComplete ? (
        <Text style={{ color: c.success, fontSize: 12.5, fontWeight: "700", marginTop: 8 }}>
          attivato · applied — saving {formatMoney(combo.savings)}
        </Text>
      ) : (
        <View style={{ marginTop: 10, gap: 6 }}>
          <ProgressBar fraction={combo.progress} tone="warning" />
          {missing.length > 0 && (
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>Add {missing.join(" + ")} to unlock</Text>
          )}
        </View>
      )}
    </Card>
  );
}
