"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/**
 * Cross-lens selection — the spine of the Service OS IA (see
 * docs/design-system/core/redesign/). One entity (a table today; tabs /
 * deliveries later) can be "in focus" and stays in focus as the operator
 * moves between Core surfaces, so its check is always one glance away in the
 * persistent Context Dock (`CoreDock`).
 *
 * Deliberately ADDITIVE: `useSelection()` returns a safe no-op default when no
 * provider is mounted, so any surface can call it without a hard dependency and
 * nothing regresses if the provider is absent. The payload carries pre-rendered
 * display fields (not just an id) so the dock needs zero fetching — the surface
 * that sets the selection already has the data in hand.
 */
export interface CoreSelection {
  kind: "table" | "order" | "tab";
  /** stable id (e.g. table id) */
  id: string;
  /** headline, e.g. "Table 10" */
  label: string;
  /** secondary line, e.g. "4 / 4 covers · Terrace" */
  sub?: string;
  /** status label, e.g. "Seated" */
  status?: string;
  /** status tone class from the surface (seated | freeing | booked | oos | available) */
  statusCls?: string;
  /** pre-formatted amount line, e.g. "218,00 zł to pay" or "✓ paid" */
  amount?: string;
  /** true when the amount represents money owed (tones the chip) */
  amountDue?: boolean;
  /** free-text note (allergy / seating) */
  note?: string;
  /** whether the note is an allergy flag */
  allergy?: boolean;
  /** where "Open" jumps to */
  href?: string;
}

interface SelectionCtx {
  selected: CoreSelection | null;
  select: (s: CoreSelection | null) => void;
  clear: () => void;
}

const Ctx = createContext<SelectionCtx | null>(null);

const NOOP: SelectionCtx = { selected: null, select: () => {}, clear: () => {} };

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<CoreSelection | null>(null);
  const select = useCallback((s: CoreSelection | null) => setSelected(s), []);
  const clear = useCallback(() => setSelected(null), []);
  return <Ctx.Provider value={{ selected, select, clear }}>{children}</Ctx.Provider>;
}

/** Safe everywhere — falls back to a no-op context if no provider is mounted. */
export function useSelection(): SelectionCtx {
  return useContext(Ctx) ?? NOOP;
}
