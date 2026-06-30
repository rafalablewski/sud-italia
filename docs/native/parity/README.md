# Native ⇄ Web Parity Harness

> **Stack note (2026-06-30):** the native **view layer is now bare React Native**
> (`native/ottaviano-rn`; no Expo, no EAS), not SwiftUI — the SwiftUI seed was
> retired. The harness below is unchanged in spirit and **still the source of
> truth**: the generators now emit TypeScript (`operatorNav.generated.ts`,
> `tokens.generated.ts`) into the RN app instead of Swift, and
> `npm run check:native` gates drift against it. Mentions of "SwiftUI" below refer
> to the retired seed; read them as "the native view layer".

> **Goal:** OttavianoKDS (and Ottaviano) stay **1:1 with the web** — every operator
> surface, same order, same role gates, same skin — and *can't silently drift*.
> You cannot literally share a React/Tailwind component with SwiftUI, and we
> deliberately don't try (a WebView would throw away "feels native"). Instead we
> make the **web the single source of truth for everything upstream of the
> pixels** — the IA, the role gates, the design tokens — and **generate** the
> native equivalents from it, with a **CI drift gate**. The native view layer is
> rebuilt in React Native; what each screen *is* and *shows* is generated.

## What's generated, and from where

| Generated artifact | Source of truth (web) | Native presentation input |
|---|---|---|
| `operatorNav.generated.ts` (the `OPERATOR_NAV` the drawer renders) | `src/admin-v3/nav.config.ts` (`NAV_SECTIONS_V3`), `src/core/routes.ts` (`CORE_SURFACES`), `src/lib/admin-roles.ts` (`ROLE_RANK`) | `operator-nav.overlay.json` (icon · blurb · live/scaffold) |
| `tokens.generated.ts` (the two `PALETTES`) | `src/app/themes/homepage/tokens.css` (customer), `src/app/themes/core/tokens.css` dark (operator) | — (pure web → TypeScript, with per-field provenance) |
| `operator-nav.manifest.json` | merged canonical IA (web + overlay) | — |
| `PARITY-LEDGER.md` | the human cross-reference (surface ↔ web route ↔ role ↔ state ↔ `/api/v1` endpoint) | — |

The web owns **structure** (which sections/items exist, order, labels, hrefs,
role gates) and **colour**. The overlay owns only what has no web equivalent: the
SF Symbol (lucide doesn't map 1:1), a one-line blurb, and whether the native
screen is `live` (wired to `/api/v1`) or a `scaffold`.

## The single command + the gate

```bash
npm run gen:native     # regenerate all four artifacts
npm run check:native   # exit 1 if any committed artifact is stale (CI runs this via npm test)
```

`tests/native-parity.test.ts` runs `check:native` inside the existing CI test
job, exactly like `tests/api-v1-openapi.test.ts` guards the committed
`openapi.json`. So a PR that adds a web admin page, changes a role gate, or
re-skins a token **fails CI** until `npm run gen:native` is run and the generated
files are committed — parity becomes a build invariant, not a manual audit.

## When you change the web operator surface

1. **Add an admin page** → add it to `NAV_SECTIONS_V3`, then add its
   `{ icon, blurb, kind }` to `operator-nav.overlay.json`, then `npm run gen:native`.
   (Skip the overlay and `check:native` tells you exactly which href is missing.)
2. **Remove a page** → drop it from `NAV_SECTIONS_V3`; the check flags the now-stale
   overlay entry to delete.
3. **Re-skin a token** → edit `themes/{homepage,core}/tokens.css`; the palette
   regenerates with new provenance comments.

## Why this lives in the backend repo

The native apps live in-repo at `native/ottaviano-rn` (the SwiftUI-era plan for a
separate `ottaviano-ios` repo, ARCHITECTURE §13 D, was not carried forward), and
the **contract is the seam**: the web is the source of truth, so the generators
and the gate live here where the web config does. The generated TypeScript + JSON
are committed as the reviewable artifacts the RN app consumes (same model as
`docs/native/openapi.json`).

## The honest gaps

`PARITY-LEDGER.md` lists **54 surfaces, 52 live, 2 scaffold**. The two scaffolds —
**SOC 2 controls** and **Capabilities** — are hardcoded TSX content pages with no
store/data source; mirroring them in Swift would duplicate a Rule #9/#11
source-of-truth and drift, so they stay honest parity scaffolds by design.
