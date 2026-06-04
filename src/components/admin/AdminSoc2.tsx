"use client";

import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from "lucide-react";
import { Badge, Card, CardBody, PageHero } from "./v2/ui";
import { KpiCard } from "./v2/charts";
import type { BadgeTone } from "./v2/ui/Badge";

type Soc2Status = "met" | "partial" | "gap";
type Soc2Category = "Security" | "Availability" | "Confidentiality" | "Processing Integrity";

interface Soc2Control {
  id: string;
  criterion: string;
  category: Soc2Category;
  status: Soc2Status;
  evidence: string;
  remediation?: string;
}

interface Soc2Register {
  generatedAt: string;
  controls: Soc2Control[];
  summary: { met: number; partial: number; gap: number; total: number; scorePct: number };
}

const STATUS_TONE: Record<Soc2Status, BadgeTone> = {
  met: "success",
  partial: "warning",
  gap: "danger",
};
const STATUS_LABEL: Record<Soc2Status, string> = {
  met: "Met",
  partial: "Partial",
  gap: "Gap",
};
const STATUS_ICON: Record<Soc2Status, typeof CheckCircle2> = {
  met: CheckCircle2,
  partial: AlertTriangle,
  gap: XCircle,
};

const CATEGORY_ORDER: Soc2Category[] = [
  "Security",
  "Confidentiality",
  "Availability",
  "Processing Integrity",
];

export function AdminSoc2({ register }: { register: Soc2Register }) {
  const { controls, summary } = register;

  return (
    <div className="v2-page">
      <PageHero
        title="SOC 2 controls"
        subtitle={
          <>
            Live mapping of the platform&apos;s actual runtime posture to the
            SOC 2 Trust Services Criteria. Every status is introspected from
            real config, the admin-user table, and the audit log — not a static
            checklist. This is readiness, not certification (a Type II audit
            needs an external auditor + an observation window). Generated{" "}
            {new Date(register.generatedAt).toLocaleString("pl-PL")}.
          </>
        }
      />

      <section className="v2-kpi-grid">
        <KpiCard
          label="Readiness score"
          value={summary.scorePct}
          display={`${summary.scorePct}%`}
          icon={ShieldCheck}
          tone={summary.scorePct >= 80 ? "success" : summary.scorePct >= 50 ? "warning" : "danger"}
          hint={`${summary.total} controls assessed`}
        />
        <KpiCard label="Met" value={summary.met} icon={CheckCircle2} tone="success" />
        <KpiCard label="Partial" value={summary.partial} icon={AlertTriangle} tone="warning" />
        <KpiCard label="Gaps" value={summary.gap} icon={XCircle} tone={summary.gap > 0 ? "danger" : "neutral"} />
      </section>

      {CATEGORY_ORDER.map((category) => {
        const rows = controls.filter((c) => c.category === category);
        if (rows.length === 0) return null;
        return (
          <Card key={category}>
            <CardBody>
              <div className="v2-detail-head">
                <h2>{category}</h2>
                <span className="v2-detail-head-hint">
                  {rows.filter((r) => r.status === "met").length}/{rows.length} met
                </span>
              </div>
              <div className="v2-stack-12">
                {rows.map((c) => {
                  const Icon = STATUS_ICON[c.status];
                  return (
                    <div key={c.id} className="v2-soc2-control" style={{ paddingBlock: 10, borderTop: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <Badge tone={STATUS_TONE[c.status]} icon={<Icon className="h-3.5 w-3.5" />}>
                          {STATUS_LABEL[c.status]}
                        </Badge>
                        <strong className="tabular">{c.id}</strong>
                        <span>{c.criterion}</span>
                      </div>
                      <p style={{ margin: "6px 0 0", color: "var(--fg-muted)", fontSize: 13 }}>
                        {c.evidence}
                      </p>
                      {c.remediation && (
                        <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                          <span style={{ fontWeight: 600 }}>Remediation: </span>
                          {c.remediation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
