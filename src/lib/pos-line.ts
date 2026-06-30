import type { PosTabLine, SelectedModifier } from "@/data/types";

/**
 * Stable identity for a POS check line — the till's equivalent of the guest
 * cart's `cartLineKey`. A line is the same line only when it is the same menu
 * item with the same modifier picks AND the same note, so a plain Margherita,
 * a Margherita "no chili", and a Margherita "well done" each sit on their own
 * row and the stepper / re-course / edit target the right one. A bare line
 * (no mods, no note) keys on the menu-item id, so every existing caller that
 * passed `menuItemId` keeps addressing the correct line unchanged.
 *
 * Pure + dependency-free so both the client till (`CorePos`) and the server
 * (`sanitizePosTabLines`, `fireTab`) dedupe and target lines identically.
 */
export function modifierSignature(mods?: SelectedModifier[]): string {
  if (!mods || mods.length === 0) return "";
  return mods
    .map((m) => `${m.groupId}:${m.optionId}`)
    .sort()
    .join("|");
}

export function posLineKey(
  line: Pick<PosTabLine, "menuItemId" | "modifiers" | "notes">,
): string {
  const sig = modifierSignature(line.modifiers);
  const note = (line.notes ?? "").trim();
  return `${line.menuItemId}${sig ? `#${sig}` : ""}${note ? `@${note}` : ""}`;
}
