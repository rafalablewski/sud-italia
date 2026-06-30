import { Linking, ScrollView, Text, View } from "react-native";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Card, Muted } from "@/components/ui";
import type { OperatorNavItem } from "@/nav/operatorNav";

/**
 * Honest parity scaffold — for the two surfaces with no data source (SOC 2
 * controls, Capabilities). They are hardcoded TSX content pages on the web and the
 * Rule #9/#11 source of truth; mirroring their content in the app would duplicate
 * that ledger and drift. So we show what the surface is and link to the live web
 * page — never fabricated data (Rule #1).
 */
export function SurfaceScaffold({ surface }: { surface: OperatorNavItem }) {
  const { c } = useTheme();
  const webUrl = `https://sud-italia.vercel.app${surface.path}`;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ padding: 16, gap: 16, flexGrow: 1, justifyContent: "center" }}>
      <View style={{ alignItems: "center", gap: 10 }}>
        <MaterialCommunityIcons name={surface.icon as never} size={48} color={c.accent} />
        <Text style={{ color: c.textPrimary, fontSize: 22, fontWeight: "900", textAlign: "center" }}>{surface.label}</Text>
        <Muted style={{ textAlign: "center" }}>{surface.blurb}</Muted>
      </View>
      <Card>
        <Text style={{ color: c.textPrimary, fontWeight: "700", marginBottom: 6 }}>Parity scaffold</Text>
        <Text style={{ color: c.textSecondary, lineHeight: 20 }}>
          This is a content page with no data API of its own — it&apos;s a source of truth maintained on the web (the
          capabilities ledger / control evidence). To avoid duplicating and drifting from it, the app links to the live
          page rather than re-rendering it.
        </Text>
      </Card>
      <Button label="Open on the web" onPress={() => Linking.openURL(webUrl)} />
    </ScrollView>
  );
}
