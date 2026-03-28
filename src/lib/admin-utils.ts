// Shared admin utilities — eliminates hardcoded color logic across components

/** Format ingredient quantity: always display in g/ml for readability */
export function formatQty(quantity: number, unit: string): string {
  let displayQty = quantity;
  let displayUnit = unit;

  // Convert kg → g for display
  if (unit === "kg") {
    displayQty = quantity * 1000;
    displayUnit = "g";
  }
  // Convert L → ml for display
  if (unit === "L") {
    displayQty = quantity * 1000;
    displayUnit = "ml";
  }

  // Smart rounding
  if (displayQty >= 100) {
    displayQty = Math.round(displayQty);
  } else if (displayQty >= 1) {
    displayQty = Math.round(displayQty * 10) / 10;
  } else {
    displayQty = Math.round(displayQty * 100) / 100;
  }

  return `${displayQty} ${displayUnit}`;
}

/** Status badge CSS class for order/slot statuses */
export function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    pending: "badge-pending",
    confirmed: "badge-confirmed",
    preparing: "badge-preparing",
    ready: "badge-ready",
    completed: "badge-completed",
    draft: "badge-draft",
    active: "badge-active",
  };
  return `px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || "badge-info"}`;
}

/** Margin color class based on threshold */
export function marginColorClass(margin: number): string {
  if (margin >= 65) return "text-emerald-400";
  if (margin >= 50) return "text-amber-400";
  return "text-red-400";
}

/** Margin badge (background + text) for tables */
export function marginBadgeClass(margin: number): string {
  if (margin >= 65) return "badge-success";
  if (margin >= 50) return "badge-warning";
  return "badge-danger";
}

/** Utilization color for slot fill rate */
export function utilizationColorClass(pct: number): string {
  if (pct >= 80) return "text-red-400";
  if (pct >= 50) return "text-amber-400";
  return "text-emerald-400";
}

/** Utilization bar color */
export function utilizationBarClass(pct: number): string {
  if (pct >= 80) return "bg-red-500/60";
  if (pct >= 50) return "bg-amber-500/60";
  return "bg-emerald-500/60";
}

/** Spots-left indicator */
export function spotsLeftClass(left: number): string {
  if (left === 0) return "text-red-400 font-bold";
  if (left <= 3) return "text-amber-400 font-semibold";
  return "text-emerald-400 font-semibold";
}

/** Ranking badge (gold for top 3, dim for rest) */
export function rankBadgeClass(index: number): string {
  return index < 3
    ? "bg-amber-500/20 text-amber-400"
    : "bg-white/8 text-slate-400";
}
