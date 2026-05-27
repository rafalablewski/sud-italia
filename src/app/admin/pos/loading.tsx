/**
 * Instant Suspense fallback for /admin/pos. The page is an async server
 * component that awaits the active locations + each truck's menu and upsell
 * config; without this, clicking POS shows nothing until that work resolves
 * (which read as "it didn't open on the first click"). This paints immediately.
 */
export default function Loading() {
  return <div className="v2-page-loading">Loading POS…</div>;
}
