"use client";

/**
 * The shared Core **date picker** — one styled pill (calendar glyph · formatted
 * date · chevron) with a full-bleed transparent native `<input type="date">`
 * driving it, so the value binding + the OS picker stay fully functional while
 * the chrome matches the theme. ONE treatment across Book + Slots (which had two
 * bespoke date fields — a raw native input vs. a custom label).
 *
 * See `docs/design-system/core/theme/README.md` → `.core-datefield`.
 */
export function CoreDateField({
  value,
  onChange,
  ariaLabel = "Date",
  display,
}: {
  /** ISO `yyyy-mm-dd`. */
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  /** Override the formatted display (defaults to `Sun 5 Jul`). */
  display?: string;
}) {
  const shown =
    display ??
    (value
      ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
      : "—");
  return (
    <label className="core-datefield core-datefield-pick" title="Change date">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path d="M8 2v4M16 2v4M3 8h18M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
      </svg>
      <span className="dv">{shown}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
          } catch {
            /* not supported */
          }
        }}
        aria-label={ariaLabel}
      />
    </label>
  );
}
