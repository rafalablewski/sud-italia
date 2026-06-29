/**
 * Native operator IA — parity generator + drift gate.
 *
 *   npm run gen:native        → (re)write the generated artifacts below
 *   npm run check:native      → fail (exit 1) if anything is stale or uncovered
 *
 * THE PROBLEM THIS SOLVES
 * The OttavianoKDS app's sidebar must stay 1:1 with the web operator IA — every
 * admin section + Core surface, same order, same role gates. Hand-mirroring that
 * (the old `OPERATOR_NAV` Swift literal) drifts the moment someone adds an admin
 * page on the web. So we make the WEB the single source of truth and GENERATE the
 * native nav from it; CI fails the build if the committed Swift drifts.
 *
 * SOURCES OF TRUTH
 *  - Structure (sections, order, labels, hrefs, role gates):
 *      src/admin-v3/nav.config.ts  (NAV_SECTIONS_V3, filterNavForRoleV3 gate)
 *      src/core/routes.ts          (CORE_SURFACES — the five Core hrefs)
 *      src/lib/admin-roles.ts      (ROLE_RANK)
 *  - Native presentation (no web equivalent — SF Symbol, blurb, live/scaffold):
 *      docs/native/parity/operator-nav.overlay.json   (hand-maintained)
 *
 * OUTPUTS (generated — never hand-edit; the banner says so)
 *  - docs/native/parity/operator-nav.manifest.json    canonical merged IA (JSON)
 *  - native/ottaviano-ios/Sources/AppInfra/OperatorNav.generated.swift
 *  - docs/native/parity/PARITY-LEDGER.md               human cross-reference table
 *
 * Mirrors the repo's existing gen:design-system / gen:openapi pattern: one
 * generator, a committed artifact, a CI drift check.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { NAV_SECTIONS_V3 } from "@/admin-v3/nav.config";
import { CORE_SURFACES } from "@/core/routes";
import { ROLE_RANK, type AdminRole } from "@/lib/admin-roles";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const PARITY_DIR = join(ROOT, "docs/native/parity");
const OVERLAY_PATH = join(PARITY_DIR, "operator-nav.overlay.json");
const MANIFEST_OUT = join(PARITY_DIR, "operator-nav.manifest.json");
const LEDGER_OUT = join(PARITY_DIR, "PARITY-LEDGER.md");
const SWIFT_OUT = join(
  ROOT,
  "native/ottaviano-ios/Sources/AppInfra/OperatorNav.generated.swift",
);
const V1_ADMIN_DIR = join(ROOT, "src/app/api/v1/admin");

const CHECK = process.argv.includes("--check");

/** A web item with no `requiredRole` is shown to everyone, i.e. gated at the
 *  lowest rank. `kitchen` is the floor in ROLE_RANK, so that's the native gate. */
const LOWEST_ROLE: AdminRole = "kitchen";

type Kind = "live" | "scaffold";
interface OverlayEntry {
  icon: string;
  blurb: string;
  kind: Kind;
  label?: string;
  role?: AdminRole;
}
interface Overlay {
  core: Record<string, OverlayEntry>;
  admin: Record<string, OverlayEntry>;
}

interface Item {
  href: string;
  label: string;
  role: AdminRole;
  icon: string;
  kind: Kind;
  blurb: string;
}
interface Section {
  id: string;
  label: string;
  items: Item[];
}

const errors: string[] = [];
const overlay = JSON.parse(readFileSync(OVERLAY_PATH, "utf-8")) as Overlay;

// ── Core section — hrefs from CORE_SURFACES; label/role from the web v3 `core`
//    section where present, else the overlay (only /core/orders needs that). ──
const CORE_ORDER = ["pos", "kds", "orders", "guest", "service"] as const;
const webCore = NAV_SECTIONS_V3.find((s) => s.id === "core");
const webCoreByHref = new Map(
  (webCore?.items ?? []).map((i) => [i.href, i]),
);
// Every web Core href must be one of the canonical CORE_SURFACES (else the
// generator would silently drop a surface the web shows).
const coreHrefSet = new Set<string>(Object.values(CORE_SURFACES));
for (const i of webCore?.items ?? []) {
  if (!coreHrefSet.has(i.href))
    errors.push(`web core item ${i.href} is not in CORE_SURFACES — extend the Core section mapping`);
}
const overlayCoreHrefs = new Set(Object.keys(overlay.core));
for (const href of coreHrefSet) {
  if (!overlayCoreHrefs.has(href))
    errors.push(`Core surface ${href} has no presentation in operator-nav.overlay.json → add { icon, blurb, kind }`);
}
for (const href of overlayCoreHrefs) {
  if (!coreHrefSet.has(href))
    errors.push(`overlay.core has stale href ${href} — not in CORE_SURFACES; remove it`);
}

const coreItems: Item[] = CORE_ORDER.map((key) => {
  const href = CORE_SURFACES[key];
  const ov = overlay.core[href];
  const web = webCoreByHref.get(href);
  if (!ov) return null; // already reported above
  const label = web?.label ?? ov.label;
  const role = (web?.requiredRole ?? ov.role ?? LOWEST_ROLE) as AdminRole;
  if (!label)
    errors.push(`Core surface ${href} has no label (no web nav entry) — add "label" to overlay.core["${href}"]`);
  return { href, label: label ?? href, role, icon: ov.icon, kind: ov.kind, blurb: ov.blurb };
}).filter(Boolean) as Item[];

// ── Admin sections — everything except the web `core` section (superseded by the
//    CORE_SURFACES-derived Core section above). Structure from web, presentation
//    from the overlay. ──
const adminOverlayHrefs = new Set(Object.keys(overlay.admin));
const seenAdminHrefs = new Set<string>();
const adminSections: Section[] = NAV_SECTIONS_V3.filter((s) => s.id !== "core").map(
  (section) => ({
    id: section.id,
    label: section.label,
    items: section.items.map((webItem) => {
      seenAdminHrefs.add(webItem.href);
      const ov = overlay.admin[webItem.href];
      if (!ov) {
        errors.push(`web surface ${webItem.href} (${webItem.label}) has no presentation in operator-nav.overlay.json → add { icon, blurb, kind }`);
        return null;
      }
      const role = (webItem.requiredRole ?? LOWEST_ROLE) as AdminRole;
      return {
        href: webItem.href,
        label: webItem.label,
        role,
        icon: ov.icon,
        kind: ov.kind,
        blurb: ov.blurb,
      };
    }).filter(Boolean) as Item[],
  }),
);
for (const href of adminOverlayHrefs) {
  if (!seenAdminHrefs.has(href))
    errors.push(`overlay.admin has stale href ${href} — the web nav no longer lists it; remove the entry`);
}

const sections: Section[] = [
  { id: "core", label: "Core", items: coreItems },
  ...adminSections,
];

// ── /api/v1/admin/* coverage cross-reference (informational, surfaced in the
//    ledger). Authored map: an admin data endpoint → the surface(s) it backs.
//    Many config surfaces share the wave-4 generic `settings` endpoint. ──
const ENDPOINT_SURFACE: Record<string, string[]> = {
  summary: ["/admin"],
  alerts: ["/admin/alerts"],
  tasks: ["/admin/comms/tasks"],
  announcements: ["/admin/comms/announcements"],
  menu: ["/admin/menu"],
  recipes: ["/admin/recipes"],
  haccp: ["/admin/haccp"],
  waste: ["/admin/waste"],
  handover: ["/admin/handover"],
  inventory: ["/admin/inventory"],
  suppliers: ["/admin/suppliers"],
  "purchase-orders": ["/admin/purchase-orders"],
  staff: ["/admin/staff"],
  schedule: ["/admin/schedule"],
  customers: ["/admin/customers"],
  corporate: ["/admin/corporate"],
  feedback: ["/admin/feedback"],
  surveys: ["/admin/surveys"],
  cash: ["/admin/cash"],
  "business-costs": ["/admin/business-costs"],
  simulation: ["/admin/simulation"],
  campaigns: ["/admin/growth"],
  events: ["/admin/events"],
  locations: ["/admin/locations"],
  "manage-locations": ["/admin/locations/manage"],
  "menu-engineering": ["/admin/menu-engineering"],
  "agent-hq": ["/admin/agent-hq"],
  insights: ["/admin/ai"],
  agent: ["/admin/ai/agent"],
  expansion: ["/admin/expansion"],
  users: ["/admin/users"],
  permissions: ["/admin/permissions"],
  compliance: ["/admin/compliance"],
  regulatory: ["/admin/regulatory-compliance"],
  "audit-log": ["/admin/audit-log"],
  "scheduled-bundles": ["/admin/scheduled-bundles"],
  pos: ["/core/pos"],
  slots: ["/core/service"],
  loyalty: ["/core/guest"],
  kds: ["/core/kds"],
  // wave-4 generic settings endpoint backs the config surfaces (no secrets — env holds those)
  settings: [
    "/admin/settings",
    "/admin/payments",
    "/admin/qr-ordering",
    "/admin/integrations",
    "/admin/currency",
    "/admin/languages",
    "/admin/upsell",
    "/admin/crosssell",
  ],
};
const hrefToEndpoint = new Map<string, string>();
for (const [ep, hrefs] of Object.entries(ENDPOINT_SURFACE))
  for (const h of hrefs) hrefToEndpoint.set(h, ep);

const adminEndpoints = existsSync(V1_ADMIN_DIR)
  ? readdirSync(V1_ADMIN_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  : [];
const unmappedEndpoints = adminEndpoints.filter((e) => !ENDPOINT_SURFACE[e]);

// ── Build the canonical manifest ──
const ALL_ITEMS = sections.flatMap((s) => s.items);
const manifest = {
  _generated:
    "Auto-generated by scripts/gen-native-nav.ts — do not edit. Edit src/admin-v3/nav.config.ts (web structure) or docs/native/parity/operator-nav.overlay.json (native presentation), then run `npm run gen:native`.",
  source: {
    structure: ["src/admin-v3/nav.config.ts", "src/core/routes.ts", "src/lib/admin-roles.ts"],
    presentation: "docs/native/parity/operator-nav.overlay.json",
  },
  roleRank: ROLE_RANK,
  sections: sections.map((s) => ({
    id: s.id,
    label: s.label,
    items: s.items.map((i) => ({
      href: i.href,
      label: i.label,
      requiredRole: i.role,
      kind: i.kind,
      icon: i.icon,
      blurb: i.blurb,
      v1Endpoint: hrefToEndpoint.get(i.href) ?? null,
    })),
  })),
  v1AdminEndpoints: adminEndpoints,
  unmappedV1AdminEndpoints: unmappedEndpoints,
  counts: {
    sections: sections.length,
    surfaces: ALL_ITEMS.length,
    live: ALL_ITEMS.filter((i) => i.kind === "live").length,
    scaffold: ALL_ITEMS.filter((i) => i.kind === "scaffold").length,
  },
};

// ── Emit the generated Swift (the OPERATOR_NAV data the app renders) ──
const SWIFT_ROLE: Record<AdminRole, string> = {
  owner: ".owner",
  franchisee: ".franchisee",
  manager: ".manager",
  staff: ".staff",
  kitchen: ".kitchen",
};
function swiftStr(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}
function swiftItem(i: Item): string {
  return (
    `        OperatorNavItem(${swiftStr(i.href)}, ${swiftStr(i.label)}, ${swiftStr(i.icon)}, ` +
    `${SWIFT_ROLE[i.role]}, .${i.kind},\n                        ${swiftStr(i.blurb)}),`
  );
}
function swiftSection(s: Section): string {
  return (
    `    OperatorNavSection(${swiftStr(s.id)}, ${swiftStr(s.label)}, [\n` +
    s.items.map(swiftItem).join("\n") +
    `\n    ]),`
  );
}
const swift = `import Foundation

// @generated by scripts/gen-native-nav.ts — DO NOT EDIT.
// Source of truth for structure: src/admin-v3/nav.config.ts + src/core/routes.ts.
// Source of truth for SF Symbol / blurb / live-scaffold: docs/native/parity/operator-nav.overlay.json.
// Regenerate: \`npm run gen:native\`. CI fails on drift: \`npm run check:native\`.
//
// The operator (OttavianoKDS) information architecture — a verifiably 1:1 mirror
// of the web admin nav plus the Core surfaces. ${manifest.counts.surfaces} surfaces across
// ${manifest.counts.sections} sections (${manifest.counts.live} live on /api/v1, ${manifest.counts.scaffold} parity scaffolds).
// Types, the role enum, and \`filteredNav(for:)\` live in OperatorNav.swift.

public let OPERATOR_NAV: [OperatorNavSection] = [
${sections.map(swiftSection).join("\n")}
]
`;

// ── Emit the human ledger ──
function ledger(): string {
  const lines: string[] = [];
  lines.push("# OttavianoKDS ↔ Web — Operator Parity Ledger");
  lines.push("");
  lines.push(
    "> **Generated** by `scripts/gen-native-nav.ts` — do not edit. This is the cross-reference the README's “52 of 54 surfaces” claim resolves to. Structure comes from the web nav (`src/admin-v3/nav.config.ts`, `src/core/routes.ts`); presentation (icon, blurb, live/scaffold) from `docs/native/parity/operator-nav.overlay.json`.",
  );
  lines.push("");
  lines.push(
    `**${manifest.counts.surfaces} surfaces · ${manifest.counts.sections} sections · ${manifest.counts.live} live · ${manifest.counts.scaffold} scaffold.** Each native surface mirrors the web href shown; \`live\` = rendered from \`/api/v1\`, \`scaffold\` = layout-parity pending facade coverage.`,
  );
  lines.push("");
  for (const s of sections) {
    lines.push(`## ${s.label}`);
    lines.push("");
    lines.push("| Surface | Web route | Min role | State | v1 endpoint |");
    lines.push("|---|---|---|---|---|");
    for (const i of s.items) {
      const ep = hrefToEndpoint.get(i.href);
      lines.push(
        `| ${i.label} | \`${i.href}\` | ${i.role} | ${i.kind === "live" ? "🟢 live" : "⚪️ scaffold"} | ${ep ? `\`/api/v1/admin/${ep}\`` : "—"} |`,
      );
    }
    lines.push("");
  }
  lines.push("## /api/v1/admin coverage");
  lines.push("");
  lines.push(
    `${adminEndpoints.length} admin endpoints. ${unmappedEndpoints.length === 0 ? "Every endpoint is mapped to a surface." : "Endpoints **not** yet mapped to a surface in this generator (review):"}`,
  );
  if (unmappedEndpoints.length) {
    lines.push("");
    for (const e of unmappedEndpoints) lines.push(`- \`/api/v1/admin/${e}\``);
  }
  lines.push("");
  return lines.join("\n");
}

// ── Write or check ──
const outputs: { path: string; content: string }[] = [
  { path: MANIFEST_OUT, content: JSON.stringify(manifest, null, 2) + "\n" },
  { path: SWIFT_OUT, content: swift },
  { path: LEDGER_OUT, content: ledger() },
];

if (errors.length) {
  console.error("✗ native nav parity errors:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

if (CHECK) {
  let drift = false;
  for (const { path, content } of outputs) {
    const cur = existsSync(path) ? readFileSync(path, "utf-8") : "";
    if (cur !== content) {
      drift = true;
      console.error(`✗ stale: ${path.replace(ROOT + "/", "")} — run \`npm run gen:native\``);
    }
  }
  if (drift) process.exit(1);
  console.log(`✓ native nav parity in sync — ${manifest.counts.surfaces} surfaces, ${manifest.counts.sections} sections`);
} else {
  mkdirSync(PARITY_DIR, { recursive: true });
  for (const { path, content } of outputs) writeFileSync(path, content, "utf-8");
  console.log(
    `✓ gen-native-nav — ${manifest.counts.surfaces} surfaces (${manifest.counts.live} live, ${manifest.counts.scaffold} scaffold) across ${manifest.counts.sections} sections`,
  );
  if (unmappedEndpoints.length)
    console.log(`  note: ${unmappedEndpoints.length} /api/v1/admin endpoints unmapped → see ledger`);
}
