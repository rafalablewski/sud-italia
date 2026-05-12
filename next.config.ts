import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
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
