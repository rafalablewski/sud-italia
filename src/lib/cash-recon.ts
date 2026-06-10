/**
 * Cash-drawer reconciliation math — the money path behind a till close and a
 * shift handover. Kept as a pure, dependency-free leaf (types only) so both the
 * server pipeline (`closeCashSession`, `saveShiftHandover` in store.ts) and any
 * preview UI compute the **same** expected drawer and variance — a mismatch here
 * is a real-złoty discrepancy, and the EOD variance is the #1 shift-boundary
 * shrink/theft signal, so it must never drift between call sites.
 *
 * All amounts are grosze (1 PLN = 100 grosze). Drops may be negative (a payout
 * or correction removes cash), so the expected drawer is the *net* of them.
 */
import type { CashSession } from "@/data/types";

/** Just the fields the drawer math reads — lets callers pass a full session or a stub. */
type DrawerLike = Pick<CashSession, "openingFloat" | "drops">;

/**
 * The cash the drawer *should* hold: opening float plus the net of every drop
 * (sales add, payouts/adjustments may subtract). This is what a close or
 * handover counts against.
 */
export function expectedDrawerGrosze(session: DrawerLike): number {
  return session.openingFloat + session.drops.reduce((acc, d) => acc + d.amountGrosze, 0);
}

/**
 * Counted − expected. Negative ⇒ the till is **short** (money missing);
 * positive ⇒ **over** (uncounted sale / wrong float). `countedGrosze` is passed
 * in already-prepared (the caller clamps/rounds its own input) so this stays a
 * pure subtraction over the canonical expected total.
 */
export function cashVarianceGrosze(session: DrawerLike, countedGrosze: number): number {
  return countedGrosze - expectedDrawerGrosze(session);
}
