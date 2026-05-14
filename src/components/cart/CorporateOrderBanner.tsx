"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";

import { useCustomer } from "@/store/customer";

interface PublicCorporateRollup {
  slug: string;
  name: string;
  memberCount: number;
  minEmployees: number;
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
 * "Ordering with [company]" banner (audit §3.4) — shown in the cart drawer
 * when the active wallet is productised as a Sud Italia Corporate account.
 * The banner self-hides for solo customers and for family wallets without a
 * corporate config, so it doesn't add chrome to the existing flow.
 *
 * The banner reads the corporate slug off the customer's wallet (only `id`
 * is stored client-side), then resolves the public rollup so we can show
 * employee count + auto-pre-order copy without leaking PII.
 */
export function CorporateOrderBanner() {
  const { customer } = useCustomer();
  const [rollup, setRollup] = useState<PublicCorporateRollup | null>(null);

  const corpSlug = customer?.wallet?.corporate?.slug;
  const walletStatus = customer?.wallet?.myStatus;
  const eligible = !!corpSlug && walletStatus === "active";
  useEffect(() => {
    if (!eligible || !corpSlug) return;
    let cancelled = false;
    fetch(`/api/corporate/${encodeURIComponent(corpSlug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data === "object" && "slug" in data) {
          setRollup(data as PublicCorporateRollup);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eligible, corpSlug]);

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
          <Building2 className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0 leading-snug">
          <p className="text-[10px] font-bold uppercase tracking-widest text-italia-gold-dark">
            Sud Italia Corporate
          </p>
          <p className="text-sm font-semibold text-italia-dark mt-0.5">
            Ordering with <span className="font-bold">{rollup.name}</span>
            {!isHead && <span className="text-italia-gray font-normal"> · billed to the company card</span>}
          </p>
          <p className="text-xs text-italia-gray mt-0.5">
            {rollup.memberCount} employee{rollup.memberCount === 1 ? "" : "s"}
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
  return `${DAY_NAMES[day]} ${time} corporate lunch`;
}
