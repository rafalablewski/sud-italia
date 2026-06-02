import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionLocationScope, userLocationSlugs } from "./user-locations";
import type { AdminUser } from "@/data/types";

// Minimal AdminUser shaper — only the fields the scope resolver reads.
function u(p: Partial<AdminUser>): AdminUser {
  return { role: "manager", ...p } as AdminUser;
}

test("sessionLocationScope: owner is always all sites", () => {
  assert.equal(sessionLocationScope(u({ role: "owner" })), "*");
  // Even if an owner somehow carries a location binding, they stay unrestricted.
  assert.equal(sessionLocationScope(u({ role: "owner", locationSlugs: ["krakow"] })), "*");
});

test("sessionLocationScope: a manager is scoped to their assigned sites", () => {
  // The regression: locations live in the `locationSlugs` ARRAY, singular field
  // empty. Must scope to those sites — NOT fall through to '*'.
  assert.equal(sessionLocationScope(u({ role: "manager", locationSlugs: ["krakow"] })), "krakow");
  assert.equal(
    sessionLocationScope(u({ role: "manager", locationSlugs: ["krakow", "warszawa"] })),
    "krakow,warszawa",
  );
});

test("sessionLocationScope: legacy singular locationSlug still works", () => {
  assert.equal(sessionLocationScope(u({ role: "staff", locationSlug: "warszawa" })), "warszawa");
});

test("sessionLocationScope: a non-owner with no binding gets all sites", () => {
  assert.equal(sessionLocationScope(u({ role: "manager" })), "*");
});

test("sessionLocationScope agrees with userLocationSlugs for non-owners", () => {
  // The scope string is exactly the join of the canonical resolver (or '*' when
  // empty) — so password / PIN / passkey logins can't drift from each other.
  const m = u({ role: "manager", locationSlugs: ["krakow"] });
  assert.equal(sessionLocationScope(m), userLocationSlugs(m).join(","));
});
