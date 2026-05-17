/**
 * Public entry-point for the admin v2 mobile component system.
 *
 * Mobile pages opt in via:
 *   import { MobilePage, MobileList, StatRow, BottomSheet, ... } from
 *     "@/components/admin/v2/mobile";
 *
 * The MobileShell itself is mounted by AdminShell at viewport < 900px —
 * pages do not need to import it.
 */

export { BottomNav, setBottomNavPin } from "./BottomNav";
export { BottomSheet } from "./BottomSheet";
export { BulkActionBar } from "./BulkActionBar";
export { Chip, ChipStrip } from "./Chip";
export { MobileCommandPalette } from "./MobileCommandPalette";
export { MobileList, type MobileListItem } from "./MobileList";
export { MobileNotifications } from "./MobileNotifications";
export { MobilePage, PageHeader, Section } from "./MobilePage";
export { MobileShell } from "./MobileShell";
export { MobileTopbar } from "./MobileTopbar";
export { MoreDrawer } from "./MoreDrawer";
export { PullToRefresh } from "./PullToRefresh";
export { QuickActionSheet } from "./QuickActionSheet";
export { SegmentControl, type SegmentOption } from "./SegmentControl";
export { StatRow, type StatItem } from "./StatRow";
export { SwipeRow } from "./SwipeRow";
export { haptic } from "./haptics";
export { useIsMobile } from "./useIsMobile";
export { BarcodeScanner } from "./BarcodeScanner";
export { useAdminPush } from "./useAdminPush";
export { useMultiSelect, type MultiSelectApi } from "./useMultiSelect";
export { useNavHistory } from "./useNavHistory";
export { useOfflineQueue } from "./useOfflineQueue";
export { useSpring } from "./useSpring";
export { useVirtual } from "./useVirtual";
