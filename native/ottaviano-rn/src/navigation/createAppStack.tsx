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
 * useNavigationBuilder). It renders a plain <View> with a minimal header — no
 * native modules, so it always renders on macOS. iOS/Android keep the real
 * native-stack below for native transitions + performance.
 *
 * CRITICAL: every route is rendered and kept MOUNTED, keyed by route.key, with
 * only the focused one visible (non-focused → display:none). Rendering just the
 * focused route (no stable key) let React remount a screen whenever this
 * navigator re-rendered — which remounted POS, reset its state to a fresh
 * loading spinner, and re-fired its data every time the session context updated.
 * Keeping keyed routes mounted is the standard react-navigation custom-navigator
 * pattern and fixes that.
 *
 * Only the options the app actually sets are honoured (headerShown, title,
 * headerStyle/Title/Tint, contentStyle). `presentation: "modal"` degrades to a
 * plain full-screen push on macOS — cosmetic only; every screen stays reachable.
 */

interface StackOptions {
  headerShown?: boolean;
  title?: string;
  headerStyle?: { backgroundColor?: string };
  headerTitleStyle?: { color?: string };
  headerTintColor?: string;
  contentStyle?: { backgroundColor?: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MacStackNavigator({ id, initialRouteName, children, screenOptions }: any) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder(StackRouter, {
    id,
    initialRouteName,
    children,
    screenOptions,
  });

  return (
    <NavigationContent>
      <View style={{ flex: 1 }}>
        {state.routes.map((route, i) => {
          const descriptor = descriptors[route.key];
          const focused = i === state.index;
          const options = (descriptor.options ?? {}) as StackOptions;
          const showHeader = options.headerShown !== false;
          const canGoBack = i > 0;
          return (
            <View
              key={route.key}
              // Stable key + always mounted — only the focused route is shown.
              style={focused ? { flex: 1, backgroundColor: options.contentStyle?.backgroundColor } : { display: "none" }}
            >
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
          );
        })}
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
