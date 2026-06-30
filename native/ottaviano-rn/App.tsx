import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { CustomerSessionProvider } from "@/auth/CustomerSession";
import { OperatorSessionProvider } from "@/auth/OperatorSession";
import { RootNavigator } from "@/navigation/RootNavigator";

/**
 * Root of both experiences. The single binary hosts the customer storefront
 * (Ottaviano) and the operator console (OttavianoKDS); the launcher routes into
 * either. Session providers wrap the whole tree so a cold start resumes a
 * Keychain-stored session. Each navigator applies its own skin (ThemeProvider) —
 * there is intentionally no global theme here.
 */
export default function App() {
  return (
    <SafeAreaProvider>
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
