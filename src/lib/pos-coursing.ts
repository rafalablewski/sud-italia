import type { MenuCategory, PosCourse, PosTabLine } from "@/data/types";

/**
 * Dine-in coursing helpers — shared by the POS terminal (client) and the
 * order actuator (server) so both agree on the course order, labels and the
 * category → course default. No server-only imports, so it's safe to pull
 * into a `"use client"` component.
 */

/** Display + firing order: starters away first, drinks alongside. */
export const POS_COURSE_ORDER: PosCourse[] = ["starter", "main", "dessert", "drink"];

export const POS_COURSES = new Set<PosCourse>(POS_COURSE_ORDER);

export const POS_COURSE_LABELS: Record<PosCourse, string> = {
  starter: "Starters",
  main: "Mains",
  dessert: "Dessert",
  drink: "Drinks",
};

/** The course a freshly-added line lands in, derived from its menu category so
 *  the operator rarely has to re-course by hand. */
export function defaultCourseForCategory(category: MenuCategory): PosCourse {
  switch (category) {
    case "antipasti":
      return "starter";
    case "desserts":
      return "dessert";
    case "drinks":
      return "drink";
    default:
      // pizza / pasta / panini → the main course.
      return "main";
  }
}

/** Resolve a line's course, treating absent / legacy values as "main". */
export function courseOf(line: Pick<PosTabLine, "course">): PosCourse {
  return line.course && POS_COURSES.has(line.course) ? line.course : "main";
}

/** Group a tab's lines into ordered course buckets, dropping empty courses. */
export function groupLinesByCourse(
  lines: PosTabLine[],
): { course: PosCourse; lines: PosTabLine[] }[] {
  return POS_COURSE_ORDER.map((course) => ({
    course,
    lines: lines.filter((l) => courseOf(l) === course),
  })).filter((g) => g.lines.length > 0);
}
