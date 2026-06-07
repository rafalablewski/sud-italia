// Admin v3 overlay portal target. Per CLAUDE.md rule #4, admin overlays must
// escape the `.admin-bg > *` stacking trap AND stay inside the admin font
// scope — both satisfied by mounting into the layout wrapper `#admin-portal-root`
// (the v3 layout re-creates it). Falls back to <body> if not present.
export function adminOverlayTargetV3(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (document.getElementById("admin-portal-root") as HTMLElement | null) ?? document.body;
}
