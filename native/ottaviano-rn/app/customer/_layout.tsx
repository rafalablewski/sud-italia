import { Tabs } from "expo-router";
import { Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { PALETTES } from "@/theme/tokens";

/**
 * Customer app shell (Ottaviano) — the storefront tabs mirroring the web IA:
 * Order · Rewards · Orders · More (APP-SHELL §2). Warm parchment skin.
 */
export default function CustomerLayout() {
  const c = PALETTES.ottaviano;
  return (
    <ThemeProvider skin="ottaviano">
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerTitleStyle: { color: c.textPrimary, fontWeight: "800" },
          headerTintColor: c.brand,
          sceneStyle: { backgroundColor: c.surface },
          tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
          tabBarActiveTintColor: c.accent,
          tabBarInactiveTintColor: c.textSecondary,
          tabBarLabel: ({ color, children }) => <Text style={{ color, fontSize: 11, fontWeight: "600" }}>{children}</Text>,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: "Order", tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="silverware-fork-knife" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="rewards"
          options={{ title: "Rewards", tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="star-circle" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="orders"
          options={{ title: "Orders", tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="receipt" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="more"
          options={{ title: "More", tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="dots-horizontal-circle" color={color} size={size} /> }}
        />
        {/* Checkout — routable but hidden from the tab bar. */}
        <Tabs.Screen name="cart" options={{ href: null, title: "Cart" }} />
        <Tabs.Screen name="order/[id]" options={{ href: null, title: "Order" }} />
      </Tabs>
    </ThemeProvider>
  );
}
