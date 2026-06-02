/**
 * Instant Suspense fallback for /core/pos. The page is an async server
 * component that awaits the active locations + each truck's menu and upsell
 * config; without this, clicking POS shows nothing until that work resolves
 * (which read as "it didn't open on the first click"). This paints immediately.
 */
export default function Loading() {
  // POS is a core route with no 53px admin topbar, so the `.v2-page` wrapper
  // (min-height: calc(100vh - 53px)) left a strip of the layer behind showing
  // at the bottom. Paint a full-viewport dark backdrop (the core canvas colour)
  // so the fallback is seamless — but keep the pill OUTSIDE `.core-suite` so it
  // resolves the admin tokens and renders identically to every other
  // "Loading …" pill (wrapping it in `.core-suite` re-scoped its padding/shape).
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1, background: "var(--bg)" }}>
      <div className="v2-page-loading">Loading POS…</div>
    </div>
  );
}
