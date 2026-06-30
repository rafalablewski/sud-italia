/**
 * The JS ⇄ Native bridge for embedded web surfaces (docs/native/IOS-WEB-MIRROR.md
 * §3). One typed, promise-based channel between the React Native host and the
 * Next.js page rendered inside a `WebSurface` WKWebView.
 *
 *   web → native   `window.OttavianoNative.<cap>(payload)`  → Promise<reply>
 *   native → web   unsolicited events (push tap, scale reading) the page subscribes to
 *
 * THE TRANSPORT IS REAL; THE HARDWARE HANDLERS ARE PLUGGABLE (CLAUDE.md Rule #1).
 * A capability whose native module isn't installed yet returns a typed
 * `{ ok:false, error:"UNAVAILABLE" }` — never a fake success. The web side
 * feature-detects (`window.OttavianoNative?.print`) and degrades to its existing
 * web behavior, so the same page still works in a desktop browser.
 */

import type { WebView, WebViewMessageEvent } from "react-native-webview";

// ── wire types ────────────────────────────────────────────────────────────────

/** Capabilities the web may request. Extend here + add a handler in `registry`. */
export type BridgeRequestType =
  | "getContext"
  | "auth:getSession"
  | "auth:getFreshToken"
  | "print"
  | "scale:subscribe"
  | "scale:unsubscribe"
  | "scan"
  | "push:register"
  | "haptic"
  | "share"
  | "openExternal"
  | "ready";

/** Events native pushes to the web without being asked. */
export type BridgeEventType =
  | "scale:reading"
  | "push:tap"
  | "push:token"
  | "connectivity";

export interface BridgeRequest {
  id: string;
  type: BridgeRequestType;
  payload?: unknown;
}

export interface BridgeReply {
  id: string;
  ok: boolean;
  result?: unknown;
  /** Stable machine code when `ok` is false, e.g. "UNAVAILABLE" | "DENIED" | "FAILED". */
  error?: string;
}

export interface BridgeEvent<T = unknown> {
  event: BridgeEventType;
  payload: T;
}

// ── host context passed to handlers ─────────────────────────────────────────────

export interface BridgeHostContext {
  /** Which target this binary is acting as. */
  app: "customer" | "operator";
  /** The active web skin to render: homepage (customer) | core (operator, dark). */
  skin: "ottaviano" | "kds";
  insets: { top: number; right: number; bottom: number; left: number };
  os: string;
  online: boolean;
  /** Emit an unsolicited event to the page (e.g. a scale reading). */
  emit: (event: BridgeEvent) => void;
  /** The signed-in access token, if any (for the web's bearer `fetch`). */
  getAccessToken: () => Promise<string | null>;
}

export type BridgeHandler = (
  payload: unknown,
  ctx: BridgeHostContext,
) => Promise<unknown> | unknown;

export type BridgeRegistry = Partial<Record<BridgeRequestType, BridgeHandler>>;

/** Thrown by a handler to return a typed `{ ok:false, error }` to the web. */
export class BridgeError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
    this.name = "BridgeError";
  }
}

// ── the script injected into the page BEFORE first paint ─────────────────────────
//
// Defines `window.OttavianoNative` so the page can call native on its very first
// effect (no race), seeds context, and maps safe-area insets + skin onto the same
// CSS custom properties the web already uses (`env(safe-area-inset-*)` via
// viewport-fit=cover). `__seed` is interpolated once at mount.

export function buildInjectedBridge(seed: {
  app: string;
  skin: string;
  insets: { top: number; right: number; bottom: number; left: number };
  accessToken: string | null;
}): string {
  return `(function () {
  if (window.OttavianoNative) return;
  var SEED = ${JSON.stringify(seed)};
  var pending = {};
  var listeners = {};
  var seq = 0;

  function post(type, payload) {
    return new Promise(function (resolve) {
      var id = "b" + (++seq);
      pending[id] = resolve;
      window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, type: type, payload: payload }));
    });
  }

  // native → web: replies and events arrive here.
  window.__ottavianoReceive = function (msg) {
    try { msg = typeof msg === "string" ? JSON.parse(msg) : msg; } catch (e) { return; }
    if (msg.id && pending[msg.id]) {
      var r = pending[msg.id]; delete pending[msg.id];
      r(msg.ok ? { ok: true, result: msg.result } : { ok: false, error: msg.error });
    } else if (msg.event) {
      (listeners[msg.event] || []).forEach(function (fn) { try { fn(msg.payload); } catch (e) {} });
    }
  };

  function unwrap(p) { return p.then(function (r) { return r.ok ? r.result : Promise.reject(new Error(r.error || "FAILED")); }); }

  window.OttavianoNative = {
    seed: SEED,
    getContext: function () { return unwrap(post("getContext")); },
    getSession: function () { return unwrap(post("auth:getSession")); },
    getFreshToken: function () { return unwrap(post("auth:getFreshToken")); },
    print: function (p) { return post("print", p); },          // returns {ok,...} (don't reject the caller)
    scan: function (p) { return post("scan", p); },
    registerPush: function () { return post("push:register"); },
    subscribeScale: function () { return unwrap(post("scale:subscribe")); },
    unsubscribeScale: function () { return post("scale:unsubscribe"); },
    haptic: function (kind) { post("haptic", { kind: kind || "light" }); },
    share: function (p) { return post("share", p); },
    openExternal: function (url) { return post("openExternal", { url: url }); },
    ready: function () { post("ready"); },
    on: function (event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
      return function () { listeners[event] = (listeners[event] || []).filter(function (f) { return f !== fn; }); };
    },
  };

  // Skin + safe-area handoff: the page honors the native notch and renders the
  // skin matching the shell it's embedded in. Maps onto the web's existing vars.
  var el = document.documentElement;
  el.setAttribute("data-skin", SEED.skin === "kds" ? "core" : "homepage");
  el.style.colorScheme = SEED.skin === "kds" ? "dark" : "light";
  el.style.setProperty("--safe-top", SEED.insets.top + "px");
  el.style.setProperty("--safe-right", SEED.insets.right + "px");
  el.style.setProperty("--safe-bottom", SEED.insets.bottom + "px");
  el.style.setProperty("--safe-left", SEED.insets.left + "px");

  // Bearer handoff so the embedded page is signed in without a second login.
  if (SEED.accessToken) { try { window.__ottavianoToken = SEED.accessToken; } catch (e) {} }
})();
true;`;
}

// ── native-side dispatcher ───────────────────────────────────────────────────────

/**
 * Handle one `onMessage` from the WebView: run the matching handler, post the
 * reply back. Unknown types and missing handlers return a typed error — the web
 * degrades gracefully rather than hanging on an unresolved promise.
 */
export async function handleBridgeMessage(
  webview: WebView | null,
  event: WebViewMessageEvent,
  ctx: BridgeHostContext,
  registry: BridgeRegistry,
): Promise<void> {
  let req: BridgeRequest;
  try {
    req = JSON.parse(event.nativeEvent.data) as BridgeRequest;
  } catch {
    return; // not ours / malformed
  }
  if (!req || typeof req.id !== "string" || typeof req.type !== "string") return;

  const reply = (r: Omit<BridgeReply, "id">) =>
    webview?.injectJavaScript(
      `window.__ottavianoReceive && window.__ottavianoReceive(${JSON.stringify({ id: req.id, ...r })}); true;`,
    );

  const handler = registry[req.type];
  if (!handler) {
    reply({ ok: false, error: "UNAVAILABLE" });
    return;
  }
  try {
    const result = await handler(req.payload, ctx);
    reply({ ok: true, result });
  } catch (e) {
    const code = e instanceof BridgeError ? e.code : "FAILED";
    reply({ ok: false, error: code });
  }
}

/** Push an unsolicited event to a mounted WebView (scale reading, push tap, …). */
export function emitToWeb(webview: WebView | null, ev: BridgeEvent): void {
  webview?.injectJavaScript(
    `window.__ottavianoReceive && window.__ottavianoReceive(${JSON.stringify(ev)}); true;`,
  );
}
