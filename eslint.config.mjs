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
  // ── Admin redesign — design-system governance (Phase 5+, ERROR + ratchet) ──
  // Catches control-layer drift the audit found (raw elements bypassing
  // primitives, legacy glass-* classes, inline hex). Scoped to the admin PAGE
  // layer (app/admin/** + the top-level Admin*.tsx components) — NOT the v2/
  // infrastructure, where the primitives themselves and the shell chrome
  // legitimately render raw <button>/<input>.
  //
  // GOVERNANCE MODEL (Phase 5 decision): this is now `error`, with the existing
  // violations grandfathered in `eslint-suppressions.json` (a bulk-suppressions
  // ratchet — the count can only shrink, never grow). So NEW drift fails CI while
  // legacy is tracked and burned down. Two ways to clear a suppression:
  //   1. Convert to the primitive (`Button` / `Input` / `Select` / `Card`), or
  //   2. For a *legitimately* custom interactive element (card-as-button, toggle,
  //      table-row icon action), keep it raw with an inline
  //      `// eslint-disable-next-line no-restricted-syntax -- ds-ok: <reason>`.
  // Reserve the primitives for genuine action buttons / form fields. After
  // editing, run `npx eslint --prune-suppressions` to drop stale entries.
  // See docs/design-system/admin/redesign-blueprint.md §7 + redesign-progress.md.
  {
    files: ["src/app/admin/**/*.tsx", "src/components/admin/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='button']",
          message:
            "Design system: use <Button> or <IconButton> from @/components/admin/v2/ui instead of a raw <button> (blueprint §3.1).",
        },
        {
          selector: "JSXOpeningElement[name.name='input']",
          message:
            "Design system: use <Input> / <Switch> from @/components/admin/v2/ui instead of a raw <input>.",
        },
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            "Design system: use <Select> from @/components/admin/v2/ui instead of a raw <select>.",
        },
        {
          selector: "Literal[value=/glass-(card|input|btn)/]",
          message:
            "Design system: glass-* classes are legacy. Use <Card> / <Input> / <Button> from v2/ui (blueprint §6, Phase 4).",
        },
        {
          selector: "TemplateElement[value.raw=/glass-(card|input|btn)/]",
          message:
            "Design system: glass-* classes are legacy. Use <Card> / <Input> / <Button> from v2/ui (blueprint §6, Phase 4).",
        },
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{6}$/]",
          message:
            "Design system: inline hex is banned — use a var(--token) colour (blueprint §3.5 / §5).",
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
