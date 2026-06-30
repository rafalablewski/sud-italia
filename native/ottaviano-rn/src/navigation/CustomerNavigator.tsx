import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { CustomerStackParamList } from "./types";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { PALETTES } from "@/theme/tokens";
import { CustomerTabs } from "./CustomerTabs";
import { ItemDetailScreen } from "@/screens/customer/ItemDetailScreen";
import { CartScreen } from "@/screens/customer/CartScreen";
import { OrderTrackerScreen } from "@/screens/customer/OrderTrackerScreen";

const Stack = createNativeStackNavigator<CustomerStackParamList>();

/** Customer app stack — the tabs plus the pushed Cart (checkout) and live
 *  OrderTracker screens. Warm parchment skin. */
export function CustomerNavigator() {
  const c = PALETTES.ottaviano;
  return (
    <ThemeProvider skin="ottaviano">
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerTitleStyle: { color: c.textPrimary, fontWeight: "800" },
          headerTintColor: c.brand,
          contentStyle: { backgroundColor: c.surface },
        }}
      >
        <Stack.Screen name="Tabs" component={CustomerTabs} options={{ headerShown: false }} />
        <Stack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: "", presentation: "modal" }} />
        <Stack.Screen name="Cart" component={CartScreen} options={{ title: "Your cart", presentation: "modal" }} />
        <Stack.Screen name="OrderTracker" component={OrderTrackerScreen} options={{ title: "Order" }} />
      </Stack.Navigator>
    </ThemeProvider>
  );
}
