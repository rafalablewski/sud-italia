/**
 * Bare React Native entry. Registers the root component under the moduleName
 * "Ottaviano" — both Xcode app targets (pl.ottaviano.customer and
 * pl.ottaviano.kds) boot this same JS bundle via `RCTAppDelegate.moduleName`.
 */
import { AppRegistry } from "react-native";
import App from "./App";
import { name as appName } from "./app.json";

AppRegistry.registerComponent(appName, () => App);
