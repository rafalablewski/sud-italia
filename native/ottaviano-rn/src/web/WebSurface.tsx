import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import { API_BASE_URL } from "@/api/config";
import { Button } from "@/components/ui";
import { useTheme } from "@/theme/ThemeProvider";
import {
  buildInjectedBridge,
  handleBridgeMessage,
  type BridgeHostContext,
  type BridgeRegistry,
} from "./bridge";

/**
 * Embedded web surface (docs/native/IOS-WEB-MIRROR.md §2/§7). Renders a path of
 * the *same* Next.js deployment the web uses inside a WKWebView, so a surface
 * routed here is pixel-identical to the web with zero second build.
 *
 * It owns the three things that stop it "feeling like a webview":
 *   1. a NATIVE skeleton in the brand palette until the page calls `ready()`
 *      (no white flash, no FOUC),
 *   2. a NATIVE error/offline retry state in the brand palette (never the system
 *      "cannot open page" sheet),
 *   3. the JS ⇄ native bridge (`window.OttavianoNative`) injected before first
 *      paint, plus the skin + safe-area + bearer handoff.
 *
 * The perf/offline-critical surfaces (POS, KDS, live tracker, printer/BLE-driving
 * screens) are NEVER routed here — they stay native (the §1 routing rule).
 */

/** Web origin = the API base minus its `/api/v1` suffix (one host reference). */
const WEB_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export interface WebSurfaceProps {
  /** App-relative path to load, e.g. "/menu" or "/admin/reports". */
  path: string;
  /** Which experience this binary is acting as (picks the web skin + scopes auth). */
  app: "customer" | "operator";
  /** Returns the current bearer access token for the page's `fetch`, if signed in. */
  getAccessToken?: () => Promise<string | null>;
  /** Extra/overriding native capability handlers (print, scale, push, …). */
  handlers?: BridgeRegistry;
}

export function WebSurface({ path, app, getAccessToken, handlers }: WebSurfaceProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const tokenGetter = useMemo(() => getAccessToken ?? (async () => null), [getAccessToken]);

  // The host context every handler receives. `emit` lets a long-lived handler
  // (e.g. a BLE scale stream) push events back to the page.
  const ctx = useMemo<BridgeHostContext>(
    () => ({
      app,
      skin: theme.skin,
      insets,
      os: "ios",
      online: true,
      emit: (ev) =>
        webRef.current?.injectJavaScript(
          `window.__ottavianoReceive && window.__ottavianoReceive(${JSON.stringify(ev)}); true;`,
        ),
      getAccessToken: tokenGetter,
    }),
    [app, theme.skin, insets, tokenGetter],
  );

  // Default handlers that need no extra native module. Hardware capabilities
  // (print/scan/scale/push) are supplied by the caller via `handlers`; absent
  // ones fall through to the dispatcher's typed "UNAVAILABLE" (Rule #1 — no fakes).
  const registry = useMemo<BridgeRegistry>(
    () => ({
      getContext: (_p, c) => ({
        app: c.app,
        skin: c.skin,
        insets: c.insets,
        os: c.os,
        online: c.online,
      }),
      "auth:getSession": (_p, c) => c.getAccessToken().then((token) => ({ token })),
      "auth:getFreshToken": (_p, c) => c.getAccessToken().then((token) => ({ token })),
      ready: () => {
        setPhase("ready");
        return null;
      },
      haptic: () => null, // wire react-native-haptic-feedback to make this real
      share: async (p) => {
        const { message, url } = (p ?? {}) as { message?: string; url?: string };
        await Share.share({ message: message ?? url ?? "" });
        return null;
      },
      openExternal: async (p) => {
        const { url } = (p ?? {}) as { url?: string };
        if (url) await Linking.openURL(url);
        return null;
      },
      ...handlers,
    }),
    [handlers],
  );

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => handleBridgeMessage(webRef.current, e, ctx, registry),
    [ctx, registry],
  );

  const injected = useMemo(
    () =>
      buildInjectedBridge({
        app,
        skin: theme.skin,
        insets,
        // Token is fetched live via the bridge; we don't bake it into the seed so
        // a refresh in native is always the source of truth.
        accessToken: null,
      }),
    [app, theme.skin, insets],
  );

  // Keep the web's own history as the primary back stack; the RN navigator pops
  // only once the WebView can't go back (wired by the host screen via a ref).
  const onNavStateChange = useCallback((nav: WebViewNavigation) => {
    // exposed for the host screen to read nav.canGoBack if it intercepts back.
    void nav;
  }, []);

  const c = theme.c;

  if (phase === "error") {
    return (
      <View style={[styles.center, { backgroundColor: c.surface, paddingTop: insets.top }]}>
        <Text style={{ color: c.textPrimary, fontSize: 18, fontWeight: "700" }}>Can’t reach the kitchen</Text>
        <Text style={{ color: c.textSecondary, fontSize: 14, textAlign: "center", marginTop: 6, marginBottom: 18 }}>
          You appear to be offline. Order entry and the kitchen display keep working — this screen needs a connection.
        </Text>
        <Button
          label="Try again"
          onPress={() => {
            setPhase("loading");
            setReloadKey((k) => k + 1);
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <WebView
        key={reloadKey}
        ref={webRef}
        source={{ uri: `${WEB_ORIGIN}${path}` }}
        injectedJavaScriptBeforeContentLoaded={injected}
        onMessage={onMessage}
        onNavigationStateChange={onNavStateChange}
        onError={() => setPhase("error")}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 500) setPhase("error");
        }}
        // We drive the safe area ourselves via injected CSS vars (§6).
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        allowsBackForwardNavigationGestures
        decelerationRate="normal"
        cacheEnabled
        // Hidden until the page signals `ready()` so the native skeleton shows first.
        style={{ flex: 1, opacity: phase === "ready" ? 1 : 0, backgroundColor: c.surface }}
      />
      {phase === "loading" && (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: c.surface }]} pointerEvents="none">
          <ActivityIndicator color={c.accent} size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
});
