/**
 * Shared table-label convention for the Service surfaces: prefix a bare number
 * with "T" (`12` → `T12`), leave an already-named table ("Bar 3", "Patio A")
 * alone. Kept in one place so Tables (`CoreTables`) and Book (`CoreBook`) can
 * never drift on how a table reads.
 */
export function tLabel(n: string): string {
  return /^\d+$/.test(n) ? `T${n}` : n;
}
