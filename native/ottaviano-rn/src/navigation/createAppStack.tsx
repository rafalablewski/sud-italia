import { Platform, Pressable, Text, View } from "react-native";
import {
  createNavigatorFactory,
  StackRouter,
  useNavigationBuilder,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

/**
 * macOS-safe stack navigator.
 *
 * `@react-navigation/native-stack` is backed by react-native-screens' native
 * views (RNSScreenStack, RNSScreenContentWrapper, …). Those views are NOT
 * registered on macOS with the classic architecture (RCT_NEW_ARCH_ENABLED=0) —
 * the device log showed `No component found for view with name "RNSScreenStack"`,
 * so the navigator rendered nothing and the window was blank.
 *
 * This is a pure-JS stack built on React Navigation's core (StackRouter +
 * useNavigationBuilder). It renders the focused screen in a plain <View> with a
 * minimal header — no native modules, so it always renders on macOS. iOS/Android
 * keep the real native-stack below for native transitions + performance.
 *
 * Only the options the app actually sets are honoured (headerShown, title,
 * headerStyle/Title/Tint, contentStyle). `presentation: "modal"` degrades to a
 * plain full-screen push on macOS — cosmetic only; every screen stays reachable.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MacStackNavigator({ id, initialRouteName, children, screenOptions }: any) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder(StackRouter, {
    id,
    initialRouteName,
    children,
    screenOptions,
  });

  const route = state.routes[state.index];
  const descriptor = descriptors[route.key];
  const options = (descriptor.options ?? {}) as {
    headerShown?: boolean;
    title?: string;
    headerStyle?: { backgroundColor?: string };
    headerTitleStyle?: { color?: string };
    headerTintColor?: string;
    contentStyle?: { backgroundColor?: string };
  };

  const showHeader = options.headerShown !== false;
  const canGoBack = state.index > 0;

  return (
    <NavigationContent>
      <View style={{ flex: 1, backgroundColor: options.contentStyle?.backgroundColor }}>
        {showHeader ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              height: 52,
              paddingHorizontal: 16,
              backgroundColor: options.headerStyle?.backgroundColor ?? "#ffffff",
              borderBottomWidth: 1,
              borderBottomColor: "rgba(0,0,0,0.12)",
            }}
          >
            {canGoBack ? (
              <Pressable onPress={() => navigation.goBack()} accessibilityRole="button">
                <Text style={{ color: options.headerTintColor ?? "#007aff", fontSize: 16, fontWeight: "700" }}>
                  ‹ Back
                </Text>
              </Pressable>
            ) : null}
            <Text style={{ color: options.headerTitleStyle?.color ?? "#111111", fontSize: 17, fontWeight: "800" }}>
              {options.title ?? route.name}
            </Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>{descriptor.render()}</View>
      </View>
    </NavigationContent>
  );
}

const createMacStackNavigator = createNavigatorFactory(MacStackNavigator);

/**
 * Drop-in for `createNativeStackNavigator`: native-stack everywhere except
 * macOS, where react-native-screens has no classic-arch views.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createAppStackNavigator: any =
  Platform.OS === "macos" ? createMacStackNavigator : createNativeStackNavigator;
