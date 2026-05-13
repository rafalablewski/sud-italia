import { defineConfig } from "drizzle-kit";

/**
 * `npm run db:generate` reads schema from `src/db/schema.ts` and writes SQL
 * migrations to `migrations/`. Migrations are applied by `npm run db:migrate`
 * (or the equivalent step in the deploy pipeline) against DATABASE_URL.
 *
 * Fails fast when DATABASE_URL is unset — drizzle-kit otherwise receives an
 * empty string and emits a cryptic driver error far from the missing config.
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Run `npm run db:generate` / `db:migrate` with the env var pointed at your Neon instance.",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
