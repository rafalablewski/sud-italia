import { defineConfig } from "drizzle-kit";

/**
 * `npm run db:generate` reads schema from `src/db/schema.ts` and writes SQL
 * migrations to `migrations/`. Migrations are applied by `npm run db:migrate`
 * (or the equivalent step in the deploy pipeline) against DATABASE_URL.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
