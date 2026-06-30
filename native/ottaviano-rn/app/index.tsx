import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

/**
 * Launcher — picks which experience to open. The single binary hosts both the
 * customer storefront (Ottaviano) and the operator console (OttavianoKDS); in a
 * two-target store build, app variants deep-link straight past this. Skinned with
 * the warm Ottaviano palette.
 */
function Launcher() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top, paddingBottom: insets.bottom, padding: 24, justifyContent: "center", gap: 28 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: c.brand, fontSize: 40, fontWeight: "900", letterSpacing: -1 }}>Ottaviano</Text>
        <Text style={{ color: c.textSecondary, fontSize: 16 }}>Sud Italia · Neapolitan pizza</Text>
      </View>
      <View style={{ gap: 14 }}>
        <Choice
          title="Order"
          subtitle="Browse the menu, order and track — no account needed"
          bg={c.accent}
          fg={c.onAccent}
          onPress={() => router.push("/customer")}
        />
        <Choice
          title="Staff sign-in"
          subtitle="OttavianoKDS — kitchen display, orders & the full console"
          bg={c.surface2}
          fg={c.textPrimary}
          border={c.line}
          onPress={() => router.push("/operator")}
        />
      </View>
    </View>
  );
}

function Choice({ title, subtitle, bg, fg, border, onPress }: { title: string; subtitle: string; bg: string; fg: string; border?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderColor: border ?? "transparent",
        borderWidth: border ? 1 : 0,
        borderRadius: 18,
        padding: 20,
        opacity: pressed ? 0.9 : 1,
        gap: 4,
      })}
    >
      <Text style={{ color: fg, fontSize: 22, fontWeight: "800" }}>{title}</Text>
      <Text style={{ color: fg, opacity: 0.8, fontSize: 14 }}>{subtitle}</Text>
    </Pressable>
  );
}

export default function LauncherRoute() {
  return (
    <ThemeProvider skin="ottaviano">
      <Launcher />
    </ThemeProvider>
  );
}
