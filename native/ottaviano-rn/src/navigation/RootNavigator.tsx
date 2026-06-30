import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import { LaunchScreen } from "@/screens/LaunchScreen";
import { CustomerNavigator } from "./CustomerNavigator";
import { OperatorNavigator } from "./OperatorNavigator";

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Top-level stack: the launcher, then either app. Each sub-navigator owns its
 *  own skin + header chrome, so the root keeps headers off. */
export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Launch" component={LaunchScreen} />
      <Stack.Screen name="Customer" component={CustomerNavigator} />
      <Stack.Screen name="Operator" component={OperatorNavigator} />
    </Stack.Navigator>
  );
}
