/**
 * Bare React Native entry. Registers the root component under the moduleName
 * "Ottaviano" — both Xcode app targets (pl.ottaviano.customer and
 * pl.ottaviano.kds) boot this same JS bundle via `RCTAppDelegate.moduleName`.
 */
import { AppRegistry, Platform } from "react-native";
import { enableScreens } from "react-native-screens";
import App from "./App";
import { name as appName } from "./app.json";

// react-native-screens has no classic-architecture native views on macOS
// (RCT_NEW_ARCH_ENABLED=0) — "No component found for view with name
// RNSScreenStack". Disabling screens makes @react-navigation/bottom-tabs fall
// back to plain <View>s there (the stacks use the pure-JS createAppStack on
// macOS). iOS/Android keep screens on for native perf.
if (Platform.OS === "macos") {
  enableScreens(false);
}

AppRegistry.registerComponent(appName, () => App);
