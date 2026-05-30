import { ROLE_RANK, type AdminRole } from "@/lib/admin-roles";
import type { RefundReasonCode } from "@/data/types";

/**
 * Refund/comp authorization caps. The audit (§11.2) asks "what stops a cashier
 * from comping the entire shift's revenue?" — role-gating already keeps
 * non-managers out of the refund flow entirely, but a manager could still comp
 * unbounded revenue. These caps put a ceiling on that:
 *
 *   • singleMaxGrosze   — any one refund/comp above this needs an owner.
 *   • compDailyCapGrosze — the running total of `manager_comp` (food given away,
 *     pure loss) by one actor at one location in a day. Once they're over it,
 *     further comps need an owner. Customer-initiated refunds (wrong item,
 *     quality, duplicate charge) are NOT counted toward this cap.
 *
 * `0` or `undefined` on either field disables that cap. Owners always bypass.
 * This module is pure + client-safe so the refund dialog can preview the same
 * decision the server enforces.
 */
export interface RefundControls {
  singleMaxGrosze?: number;
  compDailyCapGrosze?: number;
}

/** Shipped defaults so the guardrail is live out of the box, pre-configuration. */
export const DEFAULT_REFUND_CONTROLS: Required<RefundControls> = {
  singleMaxGrosze: 20_000, // 200 zł — a single refund above this needs an owner
  compDailyCapGrosze: 50_000, // 500 zł of comps per person per day per location
};

export type RefundGuardCode = "single_cap" | "daily_comp_cap";

export interface RefundGuardContext {
  role: AdminRole;
  reasonCode: RefundReasonCode;
  /** This refund's amount in grosze. */
  amountGrosze: number;
  /** Sum of this actor's `manager_comp` refunds at this location already today. */
  actorCompTotalTodayGrosze: number;
  limits: RefundControls;
}

export interface RefundGuardDecision {
  allowed: boolean;
  code?: RefundGuardCode;
  message?: string;
}

const zl = (grosze: number) => `${(grosze / 100).toFixed(2)} zł`;

/** Owners (and above) sit above every refund cap. */
export function bypassesRefundCaps(role: AdminRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.owner;
}

/**
 * Pure decision used by both the server (enforcement) and the dialog (preview).
 */
export function evaluateRefundGuard(ctx: RefundGuardContext): RefundGuardDecision {
  if (bypassesRefundCaps(ctx.role)) return { allowed: true };

  const single = ctx.limits.singleMaxGrosze ?? 0;
  if (single > 0 && ctx.amountGrosze > single) {
    return {
      allowed: false,
      code: "single_cap",
      message: `This refund (${zl(ctx.amountGrosze)}) is over the ${zl(
        single,
      )} per-refund limit. An owner has to approve it.`,
    };
  }

  if (ctx.reasonCode === "manager_comp") {
    const cap = ctx.limits.compDailyCapGrosze ?? 0;
    if (cap > 0 && ctx.actorCompTotalTodayGrosze + ctx.amountGrosze > cap) {
      const remaining = Math.max(0, cap - ctx.actorCompTotalTodayGrosze);
      return {
        allowed: false,
        code: "daily_comp_cap",
        message: `You've comped ${zl(
          ctx.actorCompTotalTodayGrosze,
        )} today — only ${zl(remaining)} of your ${zl(
          cap,
        )} daily comp limit is left. An owner has to approve this one.`,
      };
    }
  }

  return { allowed: true };
}
