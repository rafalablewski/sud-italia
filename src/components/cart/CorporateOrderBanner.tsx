"use client";

import { useEffect, useState } from "react";

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
 * "Ordering with [company]" banner (audit §3.4) — shown in the V8 cart
 * drawer when the active wallet is productised as a Sud Italia Corporate
 * account. Self-hides for solo customers and family wallets without a
 * corporate config.
 *
 * V8 styling: ochre paper card (.v8-cart-corp) — italic Cormorant
 * "Sud Italia per le aziende" eyebrow, italic "Ordering with [name]"
 * headline in Cormorant 17px, italic Lora rollup line.
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
    <div className="v8-cart-corp">
      <span className="v8-cart-corp-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
          <rect x="5" y="9" width="22" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 14 L27 14" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 9 L12 6 L20 6 L20 9" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
      <div className="v8-cart-corp-body">
        <div className="v8-cart-corp-kicker">
          Sud Italia for businesses <span className="v8-cart-corp-it">· per le aziende</span>
        </div>
        <div className="v8-cart-corp-title">
          Ordering with <em>{rollup.name}</em>
          {!isHead && <span className="v8-cart-corp-soft"> · billed to the company card</span>}
        </div>
        <div className="v8-cart-corp-sub">
          <span className="num">{rollup.memberCount}</span> employee{rollup.memberCount === 1 ? "" : "s"}
          {preorderCopy && <span> · {preorderCopy}</span>}
          {isHead && (
            <span> · <span className="num">{rollup.headBonusPoints}</span> pts head bonus this month</span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatPreorder(day?: number, time?: string): string | null {
  if (typeof day !== "number" || day < 0 || day > 6 || !time) return null;
  return `${DAY_NAMES[day]} ${time} corporate lunch`;
}
