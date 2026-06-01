import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POS_COURSE_ORDER,
  POS_COURSE_LABELS,
  defaultCourseForCategory,
  courseOf,
  groupLinesByCourse,
} from "@/lib/pos-coursing";
import type { PosTabLine } from "@/data/types";

// Run with:  npx tsx --test tests/pos-coursing.test.ts

test("course order is starters → mains → dessert → drinks", () => {
  assert.deepEqual(POS_COURSE_ORDER, ["starter", "main", "dessert", "drink"]);
  for (const c of POS_COURSE_ORDER) assert.ok(POS_COURSE_LABELS[c], `label for ${c}`);
});

test("default course is derived from the menu category", () => {
  assert.equal(defaultCourseForCategory("antipasti"), "starter");
  assert.equal(defaultCourseForCategory("desserts"), "dessert");
  assert.equal(defaultCourseForCategory("drinks"), "drink");
  // Everything substantial (pizza / pasta / panini) is the main course.
  assert.equal(defaultCourseForCategory("pizza"), "main");
  assert.equal(defaultCourseForCategory("pasta"), "main");
  assert.equal(defaultCourseForCategory("panini"), "main");
});

test("courseOf treats absent / invalid courses as main", () => {
  assert.equal(courseOf({ course: "starter" }), "starter");
  assert.equal(courseOf({}), "main");
  // @ts-expect-error — exercising a legacy / corrupt value at runtime.
  assert.equal(courseOf({ course: "nonsense" }), "main");
});

test("groupLinesByCourse keeps course order and drops empty courses", () => {
  const lines: PosTabLine[] = [
    { menuItemId: "tiramisu", quantity: 1, course: "dessert" },
    { menuItemId: "margherita", quantity: 2, course: "main" },
    { menuItemId: "bruschetta", quantity: 1, course: "starter" },
    { menuItemId: "legacy", quantity: 1 }, // no course → main
  ];
  const groups = groupLinesByCourse(lines);
  // Drinks course is absent, so only three groups, in canonical order.
  assert.deepEqual(
    groups.map((g) => g.course),
    ["starter", "main", "dessert"],
  );
  // The legacy line falls into mains alongside the explicit main.
  const mains = groups.find((g) => g.course === "main");
  assert.equal(mains?.lines.length, 2);
});
