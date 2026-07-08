import { Dimensions, StatusBar } from "react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { CustomerSessionProvider } from "@/auth/CustomerSession";
import { OperatorSessionProvider } from "@/auth/OperatorSession";
import { RootNavigator } from "@/navigation/RootNavigator";

/**
 * Seed metrics for the SafeAreaProvider.
 *
 * SafeAreaProvider renders `null` for its children until the native side reports
 * insets via `onInsetsChange`. On react-native-macos that callback never fires —
 * desktop has no notch/safe-area, and the module autolinks against core RN (not
 * the Mac fork) — so an un-seeded provider holds the whole tree at `null` and the
 * window stays blank forever. Seeding `initialMetrics` makes it render on the
 * first frame instead of waiting for a callback that never comes. On iOS/Android
 * `initialWindowMetrics` is populated; on macOS it's null, so we fall back to
 * zero insets (correct for desktop) and the current window bounds as the frame.
 */
const win = Dimensions.get("window");
const INITIAL_METRICS = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: win.width, height: win.height },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/**
 * Root of both experiences. The single binary hosts the customer storefront
 * (Ottaviano) and the operator console (OttavianoKDS); the launcher routes into
 * either. Session providers wrap the whole tree so a cold start resumes a
 * Keychain-stored session. Each navigator applies its own skin (ThemeProvider) —
 * there is intentionally no global theme here.
 */
export default function App() {
  return (
    <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
      <CustomerSessionProvider>
        <OperatorSessionProvider>
          <StatusBar barStyle="dark-content" />
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </OperatorSessionProvider>
      </CustomerSessionProvider>
    </SafeAreaProvider>
  );
}
