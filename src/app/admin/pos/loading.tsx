/**
 * Instant Suspense fallback for /admin/pos. The page is an async server
 * component that awaits the active locations + each truck's menu and upsell
 * config; without this, clicking POS shows nothing until that work resolves
 * (which read as "it didn't open on the first click"). This paints immediately.
 */
export default function Loading() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "calc(100vh - 53px)",
        color: "#8a8f98",
        fontSize: 13,
        letterSpacing: "0.04em",
      }}
    >
      Loading POS…
    </div>
  );
}
