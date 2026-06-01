"use client";

import { useMemo, useState } from "react";
import { Badge, Card, CardBody, CardHeader, Tabs } from "@/components/admin/v2/ui";
import { core as coreTokens } from "@/app/themes/core/theme";
import { homepage as homepageTokens } from "@/app/themes/homepage/theme";
import { palette as adminPalette } from "@/components/admin/v2/theme";
import designSystem from "@/generated/design-system.json";

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
 *
 * The per-theme metadata (blurb, files, routes, fonts, selectors) comes from
 * docs/design-system/themes.manifest.json via the build-time generated
 * src/generated/design-system.json (scripts/gen-design-system-manifest.ts),
 * which also computes each file's live line count — so nothing here is a
 * hand-typed snapshot that can go stale.
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

// Generated at build time from docs/design-system/themes.manifest.json (the
// hand-maintained source of truth) by scripts/gen-design-system-manifest.ts,
// which fills in each file's live line count. Edit the manifest, never this
// object or the per-file numbers (they're computed). See docs/design-system/.
const THEME_INFO = designSystem.themes as unknown as Record<ThemeKey, ThemeInfo>;

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
            Line counts are computed at build from the live files (regenerated
            every deploy from docs/design-system/themes.manifest.json), so they
            track the deployed code rather than a hand-typed snapshot.
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
