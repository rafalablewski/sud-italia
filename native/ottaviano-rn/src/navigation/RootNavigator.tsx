import type { RootStackParamList } from "./types";
import { createAppStackNavigator } from "./createAppStack";
import { LaunchScreen } from "@/screens/LaunchScreen";
import { CustomerNavigator } from "./CustomerNavigator";
import { OperatorNavigator } from "./OperatorNavigator";

const Stack = createAppStackNavigator<RootStackParamList>();

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
