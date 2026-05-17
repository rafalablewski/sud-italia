"use client";

import { createContext, useContext } from "react";

export interface ShellOverlays {
  openPalette: () => void;
  closePalette: () => void;
  openNotifications: () => void;
  closeNotif: () => void;
  openHelp: () => void;
  /** Current overlay state — read by the mobile shell to render full-screen
   * variants of the palette / notifications inline. */
  paletteOpen: boolean;
  notifOpen: boolean;
  /** Increment when notification state changes — Topbar refetches unread count. */
  notificationsVersion: number;
  /** Tell the shell to refetch the unread count. */
  bumpNotifications: () => void;
}

export const ShellContext = createContext<ShellOverlays | null>(null);

export function useAdminShell(): ShellOverlays {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useAdminShell must be inside <AdminShell>");
  return ctx;
}
