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

const NUTRI_GRADE_LABEL: Record<Grade, string> = {
  A: "Healthier — least sugar / saturated fat",
  B: "Less sugar / saturated fat than D",
  C: "High sugar OR saturated fat",
  D: "Highest sugar AND saturated fat",
};

/**
 * V8 per-item regulatory pills surfaced under the price. Renders
 * nothing on EU/PL trucks unless the operator opts into kcal
 * disclosure. NYC trucks always show kcal (§81.50); SG trucks add
 * Nutri-Grade on beverages + halal status + contains-pork /
 * contains-alcohol chips.
 *
 * Visual chrome lives under `.v8-comp-*` in
 * themes/homepage/index.css. The Nutri-Grade medallion keeps the
 * regulatory A/B/C/D colour signal but re-tints it through the V8
 * palette so the rest of the chrome stays editorial.
 */
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
        className="v8-comp-pill is-kcal"
        title="Calories per serving (NYC Health Code §81.50)"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
          className="v8-comp-stamp"
        >
          <path
            d="M6 1.5 C 7.5 3, 8.5 4, 8.5 6 C 8.5 7.8, 7.2 9.2, 6 9.2 C 4.8 9.2, 3.5 7.8, 3.5 6 C 3.5 4, 4.5 3, 6 1.5 Z"
            fill="currentColor"
            fillOpacity="0.45"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
        {item.nutrition.calories} kcal
      </span>,
    );
  }

  if (
    compliance.zone === "SG" &&
    compliance.nutriGradeRequired &&
    item.nutriGrade
  ) {
    pills.push(
      <span
        key="nutri"
        className={`v8-comp-grade is-${item.nutriGrade}`}
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
          className="v8-comp-pill is-halal"
          title="Halal — covered by location MUIS certificate"
        >
          <span className="v8-comp-glyph" aria-hidden>✓</span>
          Halal
        </span>,
      );
    } else if (item.halalStatus === "non-halal") {
      pills.push(
        <span
          key="nonhalal"
          className="v8-comp-pill is-nonhalal"
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
        className="v8-comp-pill is-pork"
        title="Contains pork — religious dietary disclosure"
      >
        <span className="v8-comp-glyph" aria-hidden>🐷</span>
        Contains pork
      </span>,
    );
  }

  if (item.containsAlcohol) {
    pills.push(
      <span
        key="alc"
        className="v8-comp-pill is-alc"
        title="Contains alcohol — religious dietary + under-18 disclosure"
      >
        <span className="v8-comp-glyph" aria-hidden>🍷</span>
        Contains alcohol
      </span>,
    );
  }

  if (pills.length === 0) return null;

  return <div className="v8-comp-pills">{pills}</div>;
}
