/**
 * Instant Suspense fallback for /admin/pos. The page is an async server
 * component that awaits the active locations + each truck's menu and upsell
 * config; without this, clicking POS shows nothing until that work resolves
 * (which read as "it didn't open on the first click"). This paints immediately.
 */
export default function Loading() {
  // POS is a core route with no 53px admin topbar, so the `.v2-page` wrapper
  // (min-height: calc(100vh - 53px)) left a strip of the layer behind showing
  // at the bottom. Paint the same full-viewport `.core-suite` dark surface the
  // real POS renders so the fallback is seamless.
  return (
    <div className="core-suite">
      <div className="v2-page-loading">Loading POS…</div>
    </div>
  );
}
