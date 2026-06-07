import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Baseline security headers (m0_12). Applied to every response.
 *
 * - `Strict-Transport-Security` forces HTTPS once the site has been visited
 *   over TLS. We use a 2-year max-age + preload eligible window, which
 *   matches what hstspreload.org accepts.
 * - `X-Frame-Options: DENY` blocks clickjacking via iframe embedding. The
 *   public site has no legitimate cross-origin embed need (and admin pages
 *   absolutely shouldn't be embeddable).
 * - `X-Content-Type-Options: nosniff` stops the browser from guessing
 *   MIME types — important when serving the JPK XML / DSAR JSON exports.
 * - `Referrer-Policy: strict-origin-when-cross-origin` keeps URL path data
 *   (which includes order ids and phone numbers in some pages) from leaking
 *   to third-party origins.
 * - `Permissions-Policy` opts out of every powerful feature we don't use,
 *   so a future XSS can't grab camera/microphone/geolocation without the
 *   policy being explicitly relaxed.
 * - `Content-Security-Policy` allows our own origin, Stripe (checkout +
 *   webhook iframe), Sentry telemetry, and inline styles for Tailwind's
 *   utility classes. `script-src` excludes `unsafe-inline`; React + Next
 *   handle the no-inline-script constraint natively.
 */
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Only directives currently recognised by mainstream browsers (Chrome
    // logs `Unrecognized feature` warnings for anything else and silently
    // drops it, so listing them adds nothing). `ambient-light-sensor`,
    // `battery`, and `document-domain` were removed in 2024 once Chrome
    // stopped registering them as Permissions Policy features.
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=()",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=(self)",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=(self \"https://js.stripe.com\")",
      "picture-in-picture=()",
      "publickey-credentials-get=()",
      "screen-wake-lock=()",
      "sync-xhr=()",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.sentry.io",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.stripe.com https://*.ingest.sentry.io https://*.upstash.io https://*.neon.tech",
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
      "form-action 'self' https://checkout.stripe.com",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

/**
 * Relaxed CSP for /mockups/* — these are static design artifacts (HTML
 * concept files) that pull Google Fonts via @import, which the production
 * CSP would otherwise block. Everything else (frame-ancestors, nosniff,
 * referrer policy, permissions policy, HSTS) stays identical.
 */
const MOCKUP_HEADERS = [
  ...SECURITY_HEADERS.filter((h) => h.key !== "Content-Security-Policy"),
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async rewrites() {
    // Role-prefixed back-office. The admin pages live once under
    // src/app/admin-v3/*, but a manager navigates them as /manager/* and a
    // franchisee as /franchisee/* (the owner keeps /admin-v3/*) so the URL reads
    // as their space, not "admin". `:path+` requires at least one segment, so
    // the /manager and /franchisee *portal* pages (exact paths) are NOT
    // rewritten — only their sub-routes fall through to the shared v3 pages.
    // See src/lib/admin-base.ts (adminV3BaseForPath / withAdminV3Base — the v3
    // shell re-roots its nav onto the prefix). Rewrites keep the visible URL,
    // so usePathname() still reports /manager/inventory.
    //
    // Admin v3 cutover: managers/franchisees now run on the v3 rebuild. Revert
    // these destinations to /admin/:path+ to fall back to the v2 pages.
    return [
      { source: "/manager/:path+", destination: "/admin-v3/:path+" },
      { source: "/franchisee/:path+", destination: "/admin-v3/:path+" },
    ];
  },
  async redirects() {
    // The Core suite (POS, KDS, Guest Engagement, Service) moved out of the
    // owner's /admin back-office to its own top-level /core/* segment (so the
    // URL no longer reads as "admin" for a staff-facing surface). Permanent
    // redirects keep old bookmarks, QR codes, saved tabs and any external
    // links working — query strings (e.g. ?view=loyalty) are forwarded
    // automatically. The legacy /admin/{whatsapp,crm,loyalty,concierge,floor,
    // slots} stubs already redirect into these, so they now chain to /core.
    return [
      { source: "/admin/pos", destination: "/core/pos", permanent: true },
      { source: "/admin/pos/:path*", destination: "/core/pos/:path*", permanent: true },
      { source: "/admin/kds", destination: "/core/kds", permanent: true },
      { source: "/admin/kds/:path*", destination: "/core/kds/:path*", permanent: true },
      { source: "/admin/guest", destination: "/core/guest", permanent: true },
      { source: "/admin/guest/:path*", destination: "/core/guest/:path*", permanent: true },
      { source: "/admin/service", destination: "/core/service", permanent: true },
      { source: "/admin/service/:path*", destination: "/core/service/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // Negative-lookahead so the strict CSP doesn't double-up on /mockups/*
        // (browsers intersect duplicate CSP headers, so leaving both would
        // re-block the fonts even after the relaxed rule is added).
        source: "/((?!mockups/).*)",
        headers: SECURITY_HEADERS,
      },
      {
        source: "/mockups/:path*",
        headers: MOCKUP_HEADERS,
      },
    ];
  },
};

// Only wrap with Sentry when a DSN is configured. Without a DSN the wrapper
// still works (it just skips source-map upload + tunneling) but the explicit
// check keeps `next build` quieter for contributors who haven't set Sentry up.
const hasSentryDsn = !!(
  process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
);

export default hasSentryDsn
  ? withSentryConfig(nextConfig, {
      // Source-map upload only runs when `SENTRY_AUTH_TOKEN` is present in CI;
      // local builds skip the upload step automatically.
      silent: !process.env.CI,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      sourcemaps: {
        // Don't ship readable source maps in the public bundle — Sentry still
        // gets them via the upload step when SENTRY_AUTH_TOKEN is set.
        deleteSourcemapsAfterUpload: true,
      },
    })
  : nextConfig;
