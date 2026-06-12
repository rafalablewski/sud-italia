import { getSettings } from "@/lib/store";

/**
 * Global "sandbox mode" indicator. Shown across BOTH the admin back-office and
 * the public storefront whenever `sandboxModeEnabled` is on, so nobody mistakes
 * the demo dataset for live operations. Server component — reads the shared
 * (never-namespaced) settings blob, so it reflects the real toggle and SSRs
 * without a flash. Theme-agnostic inline styles so it renders identically on
 * the av3 admin surface and the parchment storefront.
 */
export async function SandboxBanner() {
  const on = (await getSettings()).sandboxModeEnabled === true;
  if (!on) return null;
  return (
    <div
      role="status"
      aria-label="Sandbox mode active"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 9999,
        width: "100%",
        background: "repeating-linear-gradient(45deg, #f59e0b, #f59e0b 14px, #fbbf24 14px, #fbbf24 28px)",
        color: "#231600",
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
      ⚠ Sandbox mode — demo data · real operations are paused
    </div>
  );
}
