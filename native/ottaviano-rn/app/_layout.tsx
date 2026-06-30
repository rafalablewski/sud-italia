import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OperatorSessionProvider } from "@/auth/OperatorSession";
import { CustomerSessionProvider } from "@/auth/CustomerSession";

/**
 * Root of both experiences. The single Expo binary hosts the customer storefront
 * (Ottaviano) and the operator console (OttavianoKDS); the launcher (`index`)
 * routes into either. Session providers wrap the whole tree so a deep-link into
 * `/operator` resumes a Keychain-stored operator session. Each app shell applies
 * its own skin (ThemeProvider) — there is intentionally no global theme here.
 *
 * To ship two App Store apps from this one codebase, build with two app variants
 * (app.config.ts reading APP_VARIANT) that set the entry route + bundle id; the
 * code below is unchanged. See README "Two apps, one codebase".
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CustomerSessionProvider>
          <OperatorSessionProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="customer" />
              <Stack.Screen name="operator" />
            </Stack>
          </OperatorSessionProvider>
        </CustomerSessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
