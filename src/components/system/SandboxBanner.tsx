import { getActiveDataMode } from "@/lib/store";

/**
 * Global isolated-data indicator. Shown across BOTH the admin back-office and
 * the public storefront whenever an isolated test mode is active, so nobody
 * mistakes test data for live operations. Covers both modes:
 *   • Sandbox    — seeded demo dataset (orange).
 *   • Simulation — the owner's hand-entered pre-launch dry-run (indigo).
 * Server component — reads the shared (never-namespaced) settings blob, so it
 * reflects the real toggle and SSRs without a flash. Theme-agnostic inline
 * styles so it renders identically on the av3 admin surface and the parchment
 * storefront.
 */
export async function SandboxBanner() {
  const mode = await getActiveDataMode();
  if (mode === "live") return null;

  const sim = mode === "simulation";
  const stripeA = sim ? "#6366f1" : "#f59e0b";
  const stripeB = sim ? "#818cf8" : "#fbbf24";
  const fg = sim ? "#0a0820" : "#231600";
  const label = sim
    ? "⚗ Simulation mode — your test data only · real operations are paused"
    : "⚠ Sandbox mode — demo data · real operations are paused";

  return (
    <div
      role="status"
      aria-label={sim ? "Simulation mode active" : "Sandbox mode active"}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 9999,
        width: "100%",
        background: `repeating-linear-gradient(45deg, ${stripeA}, ${stripeA} 14px, ${stripeB} 14px, ${stripeB} 28px)`,
        color: fg,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 12.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        textAlign: "center",
        padding: "5px 12px",
        borderBottom: "1px solid rgba(0,0,0,0.25)",
        boxShadow: "0 1px 6px rgba(0,0,0,0.18)",
      }}
    >
      {label}
    </div>
  );
}
