/**
 * Emit the committed OpenAPI artifact for the native apps.
 *
 *   npx tsx scripts/gen-openapi.ts        → writes docs/native/openapi.json
 *
 * The `ottaviano-ios` repo runs Apple's swift-openapi-generator against this
 * file to produce the `CoreModels` Swift package, so the wire types are
 * generated end-to-end from the server Zod contract (src/lib/api/v1/schemas.ts).
 * The live route `/api/v1/openapi.json` serves the same builder output; this
 * committed copy is the codegen input + a reviewable diff when the contract
 * changes. CI guards drift via tests/api-v1-openapi.test.ts.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildOpenApiDocument } from "@/lib/api/v1/openapi";

async function main(): Promise<void> {
  const out = join(process.cwd(), "docs", "native", "openapi.json");
  const doc = buildOpenApiDocument();
  await writeFile(out, JSON.stringify(doc, null, 2) + "\n");
  const paths = Object.keys((doc as { paths: object }).paths).length;
  const schemas = Object.keys(
    (doc as { components: { schemas: object } }).components.schemas,
  ).length;
  console.log(`✓ docs/native/openapi.json — ${paths} paths, ${schemas} schemas`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
