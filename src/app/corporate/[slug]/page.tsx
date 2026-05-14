import { notFound } from "next/navigation";
import { getPublicCorporateRollup } from "@/lib/store";
import { CorporateJoinForm } from "./CorporateJoinForm";
import { Building2 } from "lucide-react";

/**
 * Sud Italia Corporate — public landing page (audit §3.4).
 *
 * URL companies share with their employees (e.g. /corporate/acme). Renders
 * the company hero stats and the join intake form. Members earn personal
 * loyalty points exactly like a solo customer; the company head additionally
 * accrues a configurable share of the corporate pool (default 20%).
 *
 * Corporate is intended for companies with more than 5 employees ordering
 * in bulk; the `minEmployees` threshold (default 6) is surfaced on the
 * landing page so prospects know up-front.
 */
export default async function CorporateLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const rollup = await getPublicCorporateRollup(slug);
  if (!rollup) notFound();

  const headBonusPct = (rollup.headBonusBps / 100).toFixed(0);
  const preorderCopy = formatPreorderSchedule(
    rollup.autoPreorderDay,
    rollup.autoPreorderTime,
  );

  return (
    <main className="min-h-screen bg-italia-cream py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_12px_24px_-10px_rgba(26,26,26,0.10)] p-7 md:p-9">
          <span
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-white shadow-[0_4px_14px_rgba(184,146,46,0.40),inset_0_1px_0_rgba(255,255,255,0.30)]"
            style={{
              background:
                "linear-gradient(135deg, var(--color-italia-gold) 0%, var(--color-italia-green) 100%)",
            }}
            aria-hidden
          >
            <Building2 className="h-7 w-7" />
          </span>

          <p className="text-[11px] font-bold uppercase tracking-widest text-italia-gold-dark mt-4">
            Sud Italia Corporate
          </p>
          <h1 className="font-heading text-3xl font-semibold mt-1 leading-tight text-italia-dark">
            Bulk lunch for {rollup.name},<br />
            on the company card.
          </h1>
          <p className="text-sm text-italia-gray mt-2 leading-relaxed">
            Employees order what they want. The company card pays. Each teammate keeps personal
            loyalty points; the company head earns {headBonusPct}% of the corporate pool.
            Built for companies with {rollup.minEmployees}+ employees.
          </p>

          <div className="grid grid-cols-3 gap-2 mt-5">
            <Stat n={String(rollup.memberCount)} label="Employees joined" />
            <Stat n={`${rollup.poolEarnedThisMonth} pts`} label="This month" />
            <Stat n={`${rollup.headBonusPoints} pts`} label="Head bonus" />
          </div>

          <CorporateJoinForm slug={rollup.slug} companyName={rollup.name} />

          <div className="mt-5 p-3 bg-gray-50 rounded-xl space-y-2">
            <Perk text={`One company card, one VAT-compliant invoice emailed each month.`} />
            <Perk text={`Personal points stay yours. Spend them on rewards exactly like a solo account.`} />
            <Perk text={`Designed for ${rollup.minEmployees}+ employee teams ordering in bulk.`} />
            {preorderCopy && <Perk text={`Auto-pre-order: ${preorderCopy}.`} />}
            <Perk text={`Share /corporate/${rollup.slug} in your company Slack and watch it fill in.`} />
          </div>
        </div>
      </div>
    </main>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="px-3 py-2.5 rounded-xl bg-italia-cream border border-italia-gold/15">
      <div className="font-heading text-xl font-semibold text-italia-dark leading-none">
        {n}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-italia-gray mt-1">
        {label}
      </div>
    </div>
  );
}

function Perk({ text }: { text: string }) {
  return (
    <div className="flex gap-2 items-start text-xs text-italia-dark leading-relaxed">
      <span
        className="flex-shrink-0 w-4.5 h-4.5 rounded-full inline-flex items-center justify-center text-italia-green-dark text-[10px] font-bold mt-0.5"
        style={{ background: "rgba(0,140,69,0.15)", width: 18, height: 18 }}
        aria-hidden
      >
        ✓
      </span>
      <span>{text}</span>
    </div>
  );
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

function formatPreorderSchedule(day?: number, time?: string): string | null {
  if (typeof day !== "number" || day < 0 || day > 6 || !time) return null;
  return `${DAY_NAMES[day]} ${time} reminder, every week`;
}
