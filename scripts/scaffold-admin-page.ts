/**
 * Scaffold a new admin page from the canonical redesign pattern so it starts
 * 100% design-system compliant (no raw elements, no glass-*, primitives only).
 * Part of the Phase 6 governance lock — engineers never start from a blank file.
 *
 *   npm run scaffold:admin-page -- <slug> ["Page Title"]
 *   e.g. npm run scaffold:admin-page -- reservations "Reservations"
 *
 * Emits:
 *   src/app/admin/<slug>/page.tsx          — thin server auth wrapper
 *   src/components/admin/Admin<Name>.tsx   — client component (PageHeader +
 *                                            ViewToolbar + Card, the new surface)
 *
 * It does NOT edit nav.config / capabilities for you — by design (you must make
 * the placement + capability-ledger decisions). The printed checklist reminds you.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");

function pascal(slug: string): string {
  return slug
    .split(/[-_/]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function main(): void {
  const [slugRaw, ...titleParts] = process.argv.slice(2);
  if (!slugRaw) {
    console.error('Usage: npm run scaffold:admin-page -- <slug> ["Page Title"]');
    process.exit(1);
  }
  const slug = slugRaw.replace(/^\/+|\/+$/g, "");
  const name = pascal(slug);
  const title = titleParts.join(" ") || name;

  const pageDir = join(ROOT, "src/app/admin", slug);
  const pagePath = join(pageDir, "page.tsx");
  const compPath = join(ROOT, "src/components/admin", `Admin${name}.tsx`);

  if (existsSync(pagePath) || existsSync(compPath)) {
    console.error(`Refusing to overwrite existing files for "${slug}". Aborting.`);
    process.exit(1);
  }

  const page = `import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { Admin${name} } from "@/components/admin/Admin${name}";

export default async function Admin${name}Page() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return <Admin${name} />;
}
`;

  const comp = `"use client";

import { Card, CardBody, PageHeader } from "./v2/ui";

/**
 * ${title} — admin page. Built from the redesign command surface:
 * PageHeader (identity) + ViewToolbar (control) + Card content. Wire it to REAL
 * data (Rule #1: no mock/fake data) — fetch from /api/admin/* and gate loading
 * with <PageLoading name="${title}" />.
 */
export function Admin${name}() {
  return (
    <div className="v2-page">
      <PageHeader
        title="${title}"
        /* info={<>How to read this page…</>} */
        /* primaryAction={<Button variant="primary">New…</Button>} */
      />
      {/* Optional control bar — import ViewToolbar (+ Segmented) from ./v2/ui:
      <ViewToolbar tabs={{ value, onChange, options: [...] }}>
        <Segmented value={...} onChange={...} options={[...]} ariaLabel="..." />
      </ViewToolbar>
      */}
      <Card>
        <CardBody>{/* TODO: build from real data */}</CardBody>
      </Card>
    </div>
  );
}
`;

  mkdirSync(pageDir, { recursive: true });
  writeFileSync(pagePath, page, "utf-8");
  writeFileSync(compPath, comp, "utf-8");

  console.log(`✓ Created:
  ${pagePath.replace(ROOT + "/", "")}
  ${compPath.replace(ROOT + "/", "")}

Next (NOT automated — your decisions):
  1. Register in src/components/admin/v2/nav.config.ts (section + icon + role).
  2. Register in /admin/capabilities (CLAUDE.md Rule #9) — same commit.
  3. If it filters by location, read the shell scope: useAdminLocation() — never a
     per-page location control.
  4. Replace the placeholder with REAL data (Rule #1). Run \`npm run lint\` — the
     design-system ratchet will flag any raw <button>/<input>/<select> or glass-*.
`);
}

main();
