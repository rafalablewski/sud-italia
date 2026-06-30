import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import type { CustomerTabParamList } from "./types";
import { PALETTES } from "@/theme/tokens";
import { MenuScreen } from "@/screens/customer/MenuScreen";
import { RewardsScreen } from "@/screens/customer/RewardsScreen";
import { OrdersScreen } from "@/screens/customer/OrdersScreen";
import { MoreScreen } from "@/screens/customer/MoreScreen";

const Tab = createBottomTabNavigator<CustomerTabParamList>();

/** Customer storefront tabs (Ottaviano) — Order · Rewards · Orders · More
 *  (APP-SHELL §2), warm parchment skin. */
export function CustomerTabs() {
  const c = PALETTES.ottaviano;
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTitleStyle: { color: c.textPrimary, fontWeight: "800" },
        headerTintColor: c.brand,
        sceneStyle: { backgroundColor: c.surface },
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textSecondary,
      }}
    >
      <Tab.Screen
        name="Menu"
        component={MenuScreen}
        options={{ title: "Order", tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="silverware-fork-knife" color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Rewards"
        component={RewardsScreen}
        options={{ title: "Rewards", tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="star-circle" color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ title: "Orders", tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="receipt" color={color} size={size} /> }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ title: "More", tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="dots-horizontal-circle" color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}
