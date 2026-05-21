import type { MenuItem } from "@/data/types";

type Zone = "EU" | "NYC" | "SG";
type Grade = "A" | "B" | "C" | "D";

export interface PublicCompliance {
  zone: Zone;
  calorieDisclosureRequired?: boolean;
  nutriGradeRequired?: boolean;
  dohGrade?: "A" | "B" | "C" | "Pending" | null;
  dohGradeIssued?: string | null;
  halalCertId?: string | null;
  halalCertExpires?: string | null;
  gstRegistered?: boolean;
  gstNumber?: string | null;
  gstRateBps?: number;
  packagingDisclosure?: string | null;
  pdpaConsentText?: string | null;
}

const NUTRI_GRADE_TONE: Record<Grade, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-lime-500 text-white",
  C: "bg-orange-500 text-white",
  D: "bg-red-600 text-white",
};

const NUTRI_GRADE_LABEL: Record<Grade, string> = {
  A: "Healthier — least sugar / saturated fat",
  B: "Less sugar / saturated fat than D",
  C: "High sugar OR saturated fat",
  D: "Highest sugar AND saturated fat",
};

/** Per-item regulatory pills surfaced under the price. Renders nothing
 *  on EU/PL trucks unless the operator opts into kcal disclosure. NYC
 *  trucks always show kcal (§81.50); SG trucks show Nutri-Grade on
 *  beverages + halal status + contains-pork / contains-alcohol chips. */
export function CompliancePills({
  item,
  compliance,
}: {
  item: MenuItem;
  compliance: PublicCompliance | null;
}) {
  if (!compliance) return null;

  const pills: React.ReactNode[] = [];

  if (
    (compliance.zone === "NYC" || compliance.calorieDisclosureRequired) &&
    item.nutrition?.calories
  ) {
    pills.push(
      <span
        key="kcal"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-italia-cream border border-italia-dark/10 text-[11px] font-semibold text-italia-dark"
        title="Calories per serving (NYC Health Code §81.50)"
      >
        {item.nutrition.calories} kcal
      </span>,
    );
  }

  if (
    compliance.zone === "SG" &&
    compliance.nutriGradeRequired &&
    item.nutriGrade
  ) {
    const tone = NUTRI_GRADE_TONE[item.nutriGrade];
    pills.push(
      <span
        key="nutri"
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs ${tone}`}
        title={`NEA Nutri-Grade ${item.nutriGrade}: ${NUTRI_GRADE_LABEL[item.nutriGrade]}`}
        aria-label={`NEA Nutri-Grade ${item.nutriGrade}`}
      >
        {item.nutriGrade}
      </span>,
    );
  }

  if (compliance.zone === "SG") {
    if (item.halalStatus === "halal") {
      pills.push(
        <span
          key="halal"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-[11px] font-semibold text-emerald-900"
          title="Halal — covered by location MUIS certificate"
        >
          ✓ Halal
        </span>,
      );
    } else if (item.halalStatus === "non-halal") {
      pills.push(
        <span
          key="nonhalal"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 border border-red-300 text-[11px] font-semibold text-red-900"
          title="Non-halal — contains non-halal ingredients or prep"
        >
          Non-halal
        </span>,
      );
    }
  }

  if (item.containsPork) {
    pills.push(
      <span
        key="pork"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 border border-rose-300 text-[11px] font-semibold text-rose-900"
        title="Contains pork — religious dietary disclosure"
      >
        🐷 Contains pork
      </span>,
    );
  }

  if (item.containsAlcohol) {
    pills.push(
      <span
        key="alc"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-[11px] font-semibold text-amber-900"
        title="Contains alcohol — religious dietary + under-18 disclosure"
      >
        🍷 Contains alcohol
      </span>,
    );
  }

  if (pills.length === 0) return null;

  return <div className="flex flex-wrap items-center gap-1.5">{pills}</div>;
}
