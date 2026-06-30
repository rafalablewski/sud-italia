import type { ComponentType } from "react";
import { Inventory } from "./Inventory";

/**
 * Bespoke operator surfaces — screens hand-built to mirror their web counterpart
 * 1:1 (KPIs, filters, status taxonomy), as opposed to the generic `DataSurface`
 * list. Keyed by the web href. `OperatorSurfaceScreen` checks this registry first;
 * anything not listed falls through to `surfaceConfig`'s kind (kds/orders/
 * dashboard/data/scaffold). As more surfaces graduate from generic list → faithful
 * native screen, add them here — this is the upgrade path the parity ledger tracks.
 */
export const BESPOKE_SURFACES: Record<string, ComponentType> = {
  "/admin/inventory": Inventory,
};
