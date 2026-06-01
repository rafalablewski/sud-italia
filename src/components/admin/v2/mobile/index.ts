/**
 * Surviving mobile primitives. The separate phone shell (`MobileShell` +
 * `BottomNav` + the per-page `Mobile*` components) was retired — the admin is
 * now 1:1 responsive desktop across phone / tablet / desktop (see
 * `docs/design-system/admin/mobile/README.md`). The only consumer left is the
 * standalone `/admin/alerts` page (`MobileAlerts`), a 1-column notifications
 * list that reuses these list/page/chip primitives.
 */
export { Chip, ChipStrip } from "./Chip";
export { MobilePage, PageHeader, Section } from "./MobilePage";
export { PullToRefresh } from "./PullToRefresh";
export { haptic } from "./haptics";
