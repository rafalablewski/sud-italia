"use client";

import { createContext, useContext } from "react";

export interface ShellOverlays {
  openPalette: () => void;
  openNotifications: () => void;
  openHelp: () => void;
  /** Increment when notification state changes — Topbar refetches unread count. */
  notificationsVersion: number;
}

export const ShellContext = createContext<ShellOverlays | null>(null);

export function useAdminShell(): ShellOverlays {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useAdminShell must be inside <AdminShell>");
  return ctx;
}
