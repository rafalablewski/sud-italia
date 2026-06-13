import { getActiveDataMode } from "@/lib/store";

/**
 * Global isolated-data indicator. Shown across BOTH the admin back-office and
 * the public storefront whenever Simulation mode is active, so nobody mistakes
 * the pre-launch dry-run for live operations. Server component — reads the
 * shared (never-namespaced) settings blob, so it reflects the real toggle and
 * SSRs without a flash. Theme-agnostic inline styles so it renders identically
 * on the av3 admin surface and the parchment storefront.
 */
export async function SimulationBanner() {
  if ((await getActiveDataMode()) !== "simulation") return null;

  return (
    <div
      role="status"
      aria-label="Simulation mode active"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 9999,
        width: "100%",
        background:
          "repeating-linear-gradient(45deg, #6366f1, #6366f1 14px, #818cf8 14px, #818cf8 28px)",
        color: "#0a0820",
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
      ⚗ Simulation mode — your test data only · real operations are paused
    </div>
  );
}
