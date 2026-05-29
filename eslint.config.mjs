import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Pre-existing rules that predate this codebase and would each need
      // a cross-file sweep / per-call-site refactor to clear. We keep them
      // visible as warnings (CI logs still flag every occurrence) but stop
      // them from blocking unrelated PRs:
      //
      // - `react-hooks/set-state-in-effect` is a React 19 strict-mode rule
      //   that surfaces legitimate init-on-mount + async-resolution
      //   patterns across customer.tsx, Sheet.tsx, LanguageSwitcher.tsx,
      //   and several admin pages. Each occurrence needs case-by-case
      //   judgement (some are bugs, some are correct).
      //
      // - `react-hooks/refs` flags the cloneElement-with-ref pattern in
      //   the Popover / Tooltip primitives. The pattern is valid but
      //   needs refactoring to ref-forwarding components.
      //
      // - `react/no-unescaped-entities` flags raw `'` / `"` in JSX text.
      //   Cosmetic only; doesn't affect rendering. Mechanical sweep at a
      //   later date.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  // Audit guardrails — keep the silent-drift bugs we already fixed
  // from sneaking back in. See tests/audit-hardcoded.md for context.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/data/menus/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/data/menus/krakow",
              message:
                "Direct seed menu import bypasses runtime overrides. Use getMenu(slug) or getMenuWithOverrides(slug) from @/data/menus.",
            },
            {
              name: "@/data/menus/warszawa",
              message:
                "Direct seed menu import bypasses runtime overrides. Use getMenu(slug) or getMenuWithOverrides(slug) from @/data/menus.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
