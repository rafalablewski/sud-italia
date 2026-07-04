"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** A Command Bar view-tab chip. Either a route `href` (soft `<Link>` nav) or a
 *  client `onClick` (in-surface view switch — Orders scope, POS order/tender). */
export interface CoreTab {
  label: string;
  href?: string;
  active?: boolean;
  onClick?: () => void;
}

/** The per-surface slice of chrome a surface feeds into the persistent frame:
 *  its eyebrow (hover context), its view tabs, and its body sub-toolbar
 *  (`subLeft`/`subRight`) + whether it paints full-bleed. Everything ELSE in the
 *  chrome (traffic lights, prompt, ⌘K, telemetry, bell, theme, the Lens Rail) is
 *  global and lives in the frame, rendered once. */
export interface CoreChromeState {
  eyebrow: string;
  tabs?: CoreTab[];
  subLeft?: ReactNode;
  subRight?: ReactNode;
  bleed?: boolean;
}

interface CoreShellCtx {
  chrome: CoreChromeState | null;
  setChrome: (c: CoreChromeState) => void;
}

const Ctx = createContext<CoreShellCtx | null>(null);

/**
 * Holds the active surface's chrome slice. Lives ABOVE the persistent frame AND
 * the page (both are its descendants) so a surface registering its chrome
 * re-renders the frame — NOT the surface. That's the whole point: the command
 * bar + Lens Rail render ONCE in the frame and never unmount across navigation,
 * so switching page/tab never tears the chrome down (no black flash, bars always
 * present). See CoreShellFrame + docs/design-system/core/theme/README.md → Shell.
 */
export function CoreShellProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<CoreChromeState | null>(null);
  return <Ctx.Provider value={{ chrome, setChrome }}>{children}</Ctx.Provider>;
}

/** Read the active chrome slice — the frame consumes this to paint the bar. */
export function useCoreShellChrome(): CoreChromeState | null {
  return useContext(Ctx)?.chrome ?? null;
}

/**
 * A surface publishes its chrome slice into the frame. Called by `CoreShell`, so
 * every surface keeps its existing `<CoreShell eyebrow tabs subRight>` API and
 * this stays an implementation detail. The effect re-publishes on every surface
 * render (tabs/subRight are fresh refs and often carry live data), which is
 * safe: it re-renders the frame, never the surface — the page is passed to the
 * frame as a stable `children` element, so it bails out of the frame's re-render
 * and this can't loop.
 */
export function useRegisterChrome(chrome: CoreChromeState): void {
  const set = useContext(Ctx)?.setChrome;
  const { eyebrow, tabs, subLeft, subRight, bleed } = chrome;
  useEffect(() => {
    set?.({ eyebrow, tabs, subLeft, subRight, bleed });
  }, [set, eyebrow, tabs, subLeft, subRight, bleed]);
}
