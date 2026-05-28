"use client";

import { useMemo, useState } from "react";
import { Badge, Card, CardBody, CardHeader, Tabs } from "@/components/admin/v2/ui";
import { core as coreTokens } from "@/app/themes/core/theme";
import { homepage as homepageTokens } from "@/app/themes/homepage/theme";
import { palette as adminPalette } from "@/components/admin/v2/theme";

/**
 * /admin/settings → Themes tab.
 *
 * Read-only inspector for the three-theme architecture documented in
 * docs/design-system/. Operators see what each theme owns, which
 * routes load it, the live token swatches, the font stack, and the
 * file paths to edit. Write capability (live token override, theme
 * upload) is a future capability that lands on this same surface.
 *
 * Token values are imported from each theme's typed mirror
 * (themes/core/theme.ts, themes/homepage/theme.ts,
 * components/admin/v2/theme.ts) so the swatches always match what
 * the code actually ships. If the CSS and TS mirror disagree, the
 * mirror is the bug (CSS wins on the page).
 */

type ThemeKey = "core" | "admin" | "homepage";

interface FileInfo {
  path: string;
  description: string;
  lines: number;
}

interface ThemeInfo {
  label: string;
  blurb: string;
  files: FileInfo[];
  routes: string[];
  fonts: string;
  selectorPrefixes: string[];
  docs: string;
  sourceDir: string;
}

const THEME_INFO: Record<ThemeKey, ThemeInfo> = {
  core: {
    label: "Core",
    blurb:
      "The productised IP — POS, KDS, and the unified Guest hub (CRM + Concierge + WhatsApp). Operational clarity outranks brand expression.",
    files: [
      {
        path: "src/app/themes/core/index.css",
        description:
          "Full Core CSS surface: --cmd-* palette + .cmd-* / .kds-* / .ka-* / .pos-* / .crm-* / .cncrg-* / .wa-* rules.",
        lines: 1443,
      },
      {
        path: "src/app/themes/core/theme.ts",
        description:
          "Typed JS mirror of the --cmd-* palette. Imported into the swatches below.",
        lines: 51,
      },
    ],
    routes: [
      "/admin/pos",
      "/admin/kds",
      "/admin/crm",
      "/admin/concierge",
      "/admin/whatsapp",
    ],
    fonts:
      "Inherits admin fonts (--font-admin-body, --font-admin-display) loaded by src/app/admin/layout.tsx. Core surfaces don't use the display serif — Inter throughout.",
    selectorPrefixes: [".cmd-*", ".kds-*", ".ka-*", ".pos-*", ".crm-*", ".cncrg-*", ".wa-*"],
    docs: "docs/design-system/core/",
    sourceDir: "src/app/themes/core/",
  },
  admin: {
    label: "Admin",
    blurb:
      "The back-office around the Core modules: Operations, Inventory, People, Customers, Finance, Growth, Intelligence, System. Glassmorphism + warm-neutral dark canvas.",
    files: [
      {
        path: "src/app/themes/admin/index.css",
        description:
          "Full Admin CSS surface: [data-admin-theme=\"dark\"|\"light\"] token blocks + AdminShell + glass-* + v2-* + admin mobile (.v2-m-*).",
        lines: 7974,
      },
      {
        path: "src/components/admin/v2/theme.ts",
        description:
          "Typed mirror of the [data-admin-theme] tokens for Recharts + inline SVG + the boot script that sets the theme attribute before paint.",
        lines: 97,
      },
    ],
    routes: ["/admin/*", "/kitchen, /kitchen/*", "/franchisee"],
    fonts:
      "src/app/admin/layout.tsx loads its own Inter + Fraunces as --font-admin-body and --font-admin-display. /kitchen and /franchisee layouts load the same independently so a kitchen-only font change wouldn't drift admin.",
    selectorPrefixes: ["[data-admin-theme]", ".v2-*", ".glass-*", ".admin-*", ".v2-m-*"],
    docs: "docs/design-system/admin/",
    sourceDir: "src/app/themes/admin/",
  },
  homepage: {
    label: "Homepage",
    blurb:
      "The public storefront — /, /menu, /checkout, /order, /rewards, location pages. Hospitality outranks density; warm cream canvas + deep burgundy brand.",
    files: [
      {
        path: "src/app/themes/homepage/tokens.css",
        description:
          "@theme inline block. @import-ed by globals.css so Tailwind v4 generates bg-italia-* / text-italia-* utilities (ships globally, ~50 lines).",
        lines: 48,
      },
      {
        path: "src/app/themes/homepage/index.css",
        description:
          ".pub-* form classes, body styling, delivery-* keyframes. JS-imported by (public)/layout.tsx, route-scoped.",
        lines: 101,
      },
      {
        path: "src/app/themes/homepage/theme.ts",
        description:
          "Typed JS mirror of --color-italia-* tokens. Imported into the swatches below.",
        lines: 43,
      },
    ],
    routes: [
      "/",
      "/locations/[slug]",
      "/order-confirmation",
      "/review/[orderId]",
      "/rewards",
      "/privacy",
    ],
    fonts:
      "src/app/(public)/layout.tsx loads its own Lora + Cormorant Garamond as --font-homepage-body and --font-homepage-heading (V8 Trattoria editorial-serif duo). Independent next/font instances from admin so weight / subset changes don't drift across themes.",
    selectorPrefixes: ["--color-italia-*", ".pub-*", ".delivery-*"],
    docs: "docs/design-system/homepage/",
    sourceDir: "src/app/themes/homepage/",
  },
};

function camelToKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

// Pulls the swatch list straight from each theme's typed mirror.
function getTokens(theme: ThemeKey): Array<{ name: string; value: string }> {
  if (theme === "core") {
    return Object.entries(coreTokens).map(([name, value]) => ({
      name: "--cmd-" + camelToKebab(name),
      value,
    }));
  }
  if (theme === "homepage") {
    return Object.entries(homepageTokens).map(([name, value]) => {
      // Homepage exports use camelCase like italiaRed → CSS var
      // --color-italia-red; background / foreground map to
      // --color-background / --color-foreground.
      const v =
        name === "background" || name === "foreground"
          ? "--color-" + name
          : "--color-" + camelToKebab(name);
      return { name: v, value };
    });
  }
  // admin — show the canonical dark palette
  return Object.entries(adminPalette.dark)
    .filter(([, v]) => typeof v === "string")
    .map(([name, value]) => ({
      name: "--" + camelToKebab(name),
      value: value as string,
    }));
}

export function ThemesTab() {
  const [active, setActive] = useState<ThemeKey>("core");
  const info = THEME_INFO[active];
  const tokens = useMemo(() => getTokens(active), [active]);

  return (
    <>
      <Card>
        <CardHeader
          title="Themes"
          description="Read-only inspector for the three independent themes. Each theme owns its own CSS files, fonts, and JS token mirror; edits to one cannot affect another. To change a theme, edit the source files listed below — see docs/design-system/ for the full guide."
        />
        <CardBody>
          <Tabs
            value={active}
            onChange={(v) => setActive(v as ThemeKey)}
            tabs={[
              { value: "core", label: "Core" },
              { value: "admin", label: "Admin" },
              { value: "homepage", label: "Homepage" },
            ]}
            variant="pill"
            ariaLabel="Theme"
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={info.label} description={info.blurb} />
      </Card>

      <Card>
        <CardHeader
          title="Files"
          description="The source-of-truth files for this theme."
        />
        <CardBody>
          <div className="v2-stack-12">
            {info.files.map((f) => (
              <div
                key={f.path}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "12px",
                  paddingBottom: "8px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <code className="text-xs" style={{ wordBreak: "break-all" }}>
                    {f.path}
                  </code>
                  <p className="v2-muted text-xs" style={{ margin: "4px 0 0" }}>
                    {f.description}
                  </p>
                </div>
                <span
                  className="tabular text-sm"
                  style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}
                >
                  {f.lines.toLocaleString()} lines
                </span>
              </div>
            ))}
          </div>
          <p className="v2-muted text-xs" style={{ marginTop: "10px" }}>
            Line counts are at-commit snapshots; they drift as files evolve. The
            order of magnitude (50 lines vs 8,000) is the point.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Routes"
          description="The routes that load this theme's CSS. Bundle-isolated via per-route-group layout imports."
        />
        <CardBody>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {info.routes.map((r) => (
              <code
                key={r}
                className="text-xs"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "4px 8px",
                }}
              >
                {r}
              </code>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Tokens"
          description="Live swatches imported from the typed JS mirror — what you see here is exactly the value the code paints with."
        />
        <CardBody>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "8px",
            }}
          >
            {tokens.map((t) => (
              <div
                key={t.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 10px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "6px",
                    background: t.value,
                    border: "1px solid var(--border)",
                    flex: "0 0 auto",
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    className="text-xs"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <code>{t.name}</code>
                  </div>
                  <div className="v2-muted text-xs tabular">{t.value}</div>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Fonts" description="Font loading for this theme." />
        <CardBody>
          <p className="text-sm v2-muted">{info.fonts}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Selectors"
          description="The CSS selector prefixes this theme owns. Uniquely prefixed per theme so cross-theme overrides are impossible by construction."
        />
        <CardBody>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {info.selectorPrefixes.map((p) => (
              <Badge key={p} tone="info" variant="soft">
                {p}
              </Badge>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Edit"
          description="Where to make changes. The Themes tab is read-only — token edits land in the CSS files; UI edits in the components folders."
        />
        <CardBody>
          <div className="v2-stack-12 text-sm">
            <div>
              <span className="v2-muted">Source files:</span>{" "}
              <code className="text-xs">{info.sourceDir}</code>
            </div>
            <div>
              <span className="v2-muted">Documentation:</span>{" "}
              <code className="text-xs">{info.docs}</code>
            </div>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
