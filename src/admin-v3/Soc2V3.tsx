"use client";

import { useMemo, useState } from "react";
import { Badge, Card, Kpi, Table, type BadgeTone, type ColumnV3 } from "./ui";

type Status = "met" | "partial" | "gap";
interface Control { id: string; criterion: string; category: string; status: Status; evidence: string; remediation?: string }
interface Register { generatedAt: string; controls: Control[]; summary: { met: number; partial: number; gap: number; total: number; scorePct: number } }

const TONE: Record<Status, BadgeTone> = { met: "ok", partial: "warn", gap: "bad" };
const LABEL: Record<Status, string> = { met: "Met", partial: "Partial", gap: "Gap" };

export function Soc2V3({ register }: { register: Register }) {
  const { controls, summary } = register;
  const [filter, setFilter] = useState<"all" | Status>("all");
  const byCat = useMemo(() => {
    const order = ["Security", "Confidentiality", "Availability", "Processing Integrity"];
    const groups = new Map<string, Control[]>();
    for (const c of controls) { if (filter !== "all" && c.status !== filter) continue; const a = groups.get(c.category) ?? []; a.push(c); groups.set(c.category, a); }
    return [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [controls, filter]);
  const chips: ("all" | Status)[] = ["all", "met", "partial", "gap"];
  const chipCount = (f: "all" | Status) => (f === "all" ? controls.length : controls.filter((c) => c.status === f).length);

  const cols: ColumnV3<Control>[] = [
    { key: "crit", header: "Control", render: (c) => <span style={{ fontWeight: 500 }}>{c.criterion}</span> },
    { key: "ev", header: "Evidence", render: (c) => <span className="av3-cell-muted" style={{ display: "inline-block", maxWidth: 460 }}>{c.evidence}{c.remediation ? ` · ${c.remediation}` : ""}</span> },
    { key: "st", header: "Status", render: (c) => <Badge tone={TONE[c.status]} dot>{LABEL[c.status]}</Badge> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>SOC 2 controls</h1>
          <div className="av3-pagehead-sub">Live posture vs Trust Services Criteria — introspected, not a checklist · {new Date(register.generatedAt).toLocaleString("pl-PL")}</div>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Readiness" value={`${summary.scorePct}%`} accentVar={summary.scorePct >= 80 ? "--av3-c4" : summary.scorePct >= 50 ? "--av3-c5" : "--av3-c1"} />
        <Kpi label="Met" value={`${summary.met}`} accentVar="--av3-c4" />
        <Kpi label="Partial" value={`${summary.partial}`} accentVar="--av3-c5" />
        <Kpi label="Gaps" value={`${summary.gap}`} accentVar="--av3-c1" />
      </div>

      <div className="av3-filterchips">
        {chips.map((f) => (
          <button key={f} type="button" className={`av3-fchip ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)} style={{ textTransform: "capitalize" }}>
            {f === "all" ? "All" : LABEL[f]}<span className="av3-fchip-count">{chipCount(f)}</span>
          </button>
        ))}
      </div>

      {byCat.length === 0 ? (
        <div className="av3-card" style={{ padding: 0 }}><div className="av3-empty"><div className="av3-empty-title">Nothing here</div><div className="av3-empty-text">No controls in this status.</div></div></div>
      ) : byCat.map(([cat, list]) => (
        <Card key={cat} style={{ padding: 0 }}>
          <div className="av3-card-head"><div className="av3-card-title">{cat}</div><Badge tone="neutral">{list.filter((c) => c.status === "met").length}/{list.length} met</Badge></div>
          <Table columns={cols} rows={list} rowKey={(c) => c.id} />
        </Card>
      ))}
    </>
  );
}
