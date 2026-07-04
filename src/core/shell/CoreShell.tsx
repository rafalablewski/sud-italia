"use client";

import type { ReactNode } from "react";
import { useRegisterChrome, type CoreTab } from "./CoreShellContext";

export type { CoreTab } from "./CoreShellContext";

/**
 * A surface's handle on the shared chrome. The command bar + Lens Rail are NOT
 * rendered here — they live once in `CoreShellFrame`, mounted by the `/core`
 * layout, and never unmount across navigation. `CoreShell` simply **publishes**
 * this surface's slice of chrome (eyebrow · view tabs · body sub-toolbar ·
 * bleed) into that frame and renders its `children` into the persistent Canvas.
 *
 * Surfaces keep the exact same `<CoreShell eyebrow tabs subLeft subRight bleed>`
 * API they always had — moving the chrome into the layout is invisible to them.
 * That's what keeps both bars present at all times and makes page/tab switching
 * a no-remount, no-flash transition. See CoreShellFrame + CoreShellContext and
 * docs/design-system/core/theme/README.md → Shell.
 */
export function CoreShell({
  eyebrow,
  tabs,
  subLeft,
  subRight,
  bleed = false,
  children,
}: {
  eyebrow: string;
  tabs?: CoreTab[];
  /** Left-aligned label in the body sub-toolbar (POS "TILL 1 · DINNER SERVICE"). */
  subLeft?: ReactNode;
  subRight?: ReactNode;
  /** Surface paints its own full-bleed background (KDS dark wall). */
  bleed?: boolean;
  children: ReactNode;
}) {
  useRegisterChrome({ eyebrow, tabs, subLeft, subRight, bleed });
  return <>{children}</>;
}
