"use client";

// Branded offline fallback for both PWAs (Ottaviano + OttavianoKDS). The service
// worker precaches this and serves it when a navigation fails with nothing else
// cached — so an installed app never shows the browser's raw error page. Kept
// fully self-contained (inline styles, no theme imports) so it's tiny, always
// cacheable, and not owned by any design-system theme. Adapts light/dark via
// prefers-color-scheme so it reads well behind the customer (light) and operator
// (dark) shells.

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: "max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom))",
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: "var(--bg)",
        color: "var(--fg)",
      }}
    >
      <style>{`
        :root { --bg:#FFF8F0; --fg:#1f1a1a; --muted:#6b625c; --accent:#C8102E; --card:#ffffff; }
        @media (prefers-color-scheme: dark) {
          :root { --bg:#070A0F; --fg:#f3f4f6; --muted:#9aa4b2; --accent:#E8B23A; --card:#11161F; }
        }
      `}</style>
      <div
        aria-hidden
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          display: "grid",
          placeItems: "center",
          background: "var(--card)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
          <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0122.58 9" />
          <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
          <path d="M8.53 16.11a6 6 0 016.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>You&apos;re offline</h1>
      <p style={{ color: "var(--muted)", maxWidth: 320, margin: 0, lineHeight: 1.5 }}>
        We couldn&apos;t reach Ottaviano. Anything you already opened still works — and
        actions you take are saved and sent the moment you&apos;re back online.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          marginTop: 4,
          padding: "12px 22px",
          borderRadius: 999,
          border: "none",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
          background: "var(--accent)",
          color: "#fff",
        }}
      >
        Try again
      </button>
    </main>
  );
}
