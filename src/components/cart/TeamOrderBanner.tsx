"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";

import { useCustomer } from "@/store/customer";

interface PublicTeamRollup {
  slug: string;
  name: string;
  memberCount: number;
  poolEarnedThisMonth: number;
  headBonusPoints: number;
  headBonusBps: number;
  autoPreorderDay?: number;
  autoPreorderTime?: string;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * "Ordering with [team]" banner (audit §3.4) — shown in the cart drawer
 * when the active wallet is productised as a team. The banner self-hides
 * for solo customers and for family wallets without a team config, so it
 * doesn't add chrome to the existing flow.
 *
 * The banner reads the team slug off the customer's wallet (only `id` is
 * stored client-side), then resolves the public rollup so we can show
 * member count + auto-pre-order copy without leaking PII.
 */
export function TeamOrderBanner() {
  const { customer } = useCustomer();
  const [rollup, setRollup] = useState<PublicTeamRollup | null>(null);

  const teamSlug = customer?.wallet?.team?.slug;
  const walletStatus = customer?.wallet?.myStatus;
  const eligible = !!teamSlug && walletStatus === "active";
  useEffect(() => {
    if (!eligible || !teamSlug) return;
    let cancelled = false;
    fetch(`/api/team/${encodeURIComponent(teamSlug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data === "object" && "slug" in data) {
          setRollup(data as PublicTeamRollup);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eligible, teamSlug]);

  if (!eligible || !rollup) return null;

  const isHead = customer?.wallet?.role === "head";
  const preorderCopy = formatPreorder(rollup.autoPreorderDay, rollup.autoPreorderTime);

  return (
    <div className="px-5 mt-3">
      <div
        className="flex items-start gap-3 p-3 rounded-xl border border-italia-gold/30"
        style={{
          background:
            "linear-gradient(135deg, rgba(184,146,46,0.10) 0%, rgba(0,140,69,0.06) 100%)",
        }}
      >
        <span
          className="flex-shrink-0 w-9 h-9 rounded-lg inline-flex items-center justify-center text-white"
          style={{
            background:
              "linear-gradient(135deg, var(--color-italia-gold) 0%, var(--color-italia-green) 100%)",
            boxShadow: "0 2px 6px rgba(184,146,46,0.30)",
          }}
        >
          <Users className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0 leading-snug">
          <p className="text-sm font-semibold text-italia-dark">
            Ordering with <span className="font-bold">{rollup.name}</span>
            {!isHead && <span className="text-italia-gray font-normal"> · billed to the team head</span>}
          </p>
          <p className="text-xs text-italia-gray mt-0.5">
            {rollup.memberCount} member{rollup.memberCount === 1 ? "" : "s"}
            {preorderCopy && <span> · {preorderCopy}</span>}
            {isHead && (
              <span> · {rollup.headBonusPoints} pts head bonus this month</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatPreorder(day?: number, time?: string): string | null {
  if (typeof day !== "number" || day < 0 || day > 6 || !time) return null;
  return `${DAY_NAMES[day]} ${time} team lunch`;
}
