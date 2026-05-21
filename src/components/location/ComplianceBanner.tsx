import { ShieldCheck, AlertCircle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import type { PublicCompliance } from "./CompliancePills";

type DohGrade = "A" | "B" | "C" | "Pending";

const DOH_TONE: Record<DohGrade, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-amber-500 text-white",
  C: "bg-orange-600 text-white",
  Pending: "bg-gray-500 text-white",
};

/** Customer-facing regulatory header banner. Rendered server-side from
 *  the location page so SSR + client hydration agree and there's no
 *  fetch-on-mount delay before the operator-mandated disclosure shows. */
export function ComplianceBanner({ compliance }: { compliance: PublicCompliance | null }) {
  if (!compliance) return null;

  const showNyc = compliance.zone === "NYC" && compliance.dohGrade;
  const showSg = compliance.zone === "SG" && compliance.halalCertId;

  const halalExpired =
    compliance.zone === "SG" &&
    compliance.halalCertId &&
    compliance.halalCertExpires &&
    new Date(compliance.halalCertExpires) < new Date();

  if (!showNyc && !showSg && !halalExpired) return null;

  return (
    <>
      {(showNyc || showSg) && (
        <div className="bg-italia-cream/60 border-b border-italia-dark/5">
          <Container>
            <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs">
              {showNyc && compliance.dohGrade && (
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-md font-heading font-bold text-lg ${
                      DOH_TONE[compliance.dohGrade as DohGrade]
                    }`}
                    aria-label={`NYC Department of Health letter grade ${compliance.dohGrade}`}
                  >
                    {compliance.dohGrade === "Pending"
                      ? "P"
                      : compliance.dohGrade}
                  </span>
                  <div className="leading-tight">
                    <div className="font-semibold text-italia-dark">
                      NYC DOH grade{" "}
                      {compliance.dohGrade === "Pending"
                        ? "pending"
                        : compliance.dohGrade}
                    </div>
                    {compliance.dohGradeIssued && (
                      <div className="text-italia-gray">
                        Issued {compliance.dohGradeIssued}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {showSg && (
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-700" />
                  <div className="leading-tight">
                    <div className="font-semibold text-italia-dark">
                      MUIS Halal certified
                    </div>
                    <div className="text-italia-gray">
                      Cert {compliance.halalCertId}
                      {compliance.halalCertExpires
                        ? ` · valid until ${compliance.halalCertExpires}`
                        : ""}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Container>
        </div>
      )}
      {halalExpired && (
        <div className="bg-amber-500/10 border-b border-amber-400/30">
          <Container>
            <div className="flex items-center gap-2 py-2 text-xs text-amber-900">
              <AlertCircle className="h-4 w-4" />
              <span>
                MUIS Halal certificate {compliance.halalCertId} expired on{" "}
                {compliance.halalCertExpires}. Renewal pending — please
                ask staff for current status before ordering.
              </span>
            </div>
          </Container>
        </div>
      )}
    </>
  );
}
