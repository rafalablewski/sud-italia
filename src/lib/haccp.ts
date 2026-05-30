/**
 * HACCP temperature bands + the cold/hot-holding points an operator logs each
 * shift. Client-safe (no server imports) so the log form can preview the exact
 * ok/flagged verdict that `store.saveTempLog` assigns on save — one source of
 * truth across the picker and the server.
 *
 * Temperatures are carried in tenths of a degree Celsius everywhere (so
 * -180 = -18.0 °C) to stay integer-clean through the DB column.
 */

export const TEMP_RANGES: Record<string, { minTenths: number; maxTenths: number }> = {
  // EU/UK HACCP guidance defaults. Operator-overridable per sensor later; for
  // now the sensor name selects the band ("freezer" / "hot" keywords, else
  // chilled storage).
  default: { minTenths: 0, maxTenths: 50 }, // chilled: 0–5 °C
  freezer: { minTenths: -300, maxTenths: -180 }, // frozen: -30 to -18 °C
  hot: { minTenths: 630, maxTenths: 800 }, // hot-hold: 63–80 °C
};

export function rangeForSensor(sensor: string): { minTenths: number; maxTenths: number } {
  const lower = sensor.toLowerCase();
  if (lower.includes("freezer")) return TEMP_RANGES.freezer;
  if (lower.includes("hot")) return TEMP_RANGES.hot;
  return TEMP_RANGES.default;
}

/** ok / flagged verdict for a reading (tenths °C) against its sensor's band. */
export function tempVerdict(sensor: string, tempTenths: number): "ok" | "flagged" {
  const r = rangeForSensor(sensor);
  return tempTenths < r.minTenths || tempTenths > r.maxTenths ? "flagged" : "ok";
}

/** Cold-/hot-holding points the log form offers. */
export const HACCP_SENSORS = [
  "Fridge — prep line",
  "Fridge — dough retarder",
  "Freezer — store",
  "Hot-hold — sauce",
] as const;
