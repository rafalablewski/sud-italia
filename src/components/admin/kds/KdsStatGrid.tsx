import type { ReactNode } from "react";

export type KdsStatTone = "good" | "warn" | "risk" | "alert";

export interface KdsStat {
  /** Tiny uppercase label across the top of the tile. */
  label: string;
  /** The headline figure. */
  value: ReactNode;
  /** Tiny caption under the figure. */
  sub?: string;
  /** Status colour for the figure + the tile's left accent bar. */
  tone?: KdsStatTone;
}

/**
 * The KDS "command" KPI strip — a framed row of stat tiles, each with a
 * coloured status accent bar. Shared between the Fleet command bar and the
 * floor board's ops header so the two render byte-for-byte identical tiles
 * (styled by `.kds-atlas .ka-fb-grid` / `.ka-ftile`, which both surfaces sit
 * under). Expects up to seven stats — the command-bar layout.
 */
export function KdsStatGrid({ stats }: { stats: KdsStat[] }) {
  return (
    <div className="ka-fb-grid">
      {stats.map((s) => (
        <div className={`ka-ftile${s.tone ? ` ${s.tone}` : ""}`} key={s.label}>
          <span className="ka-ft-lab">{s.label}</span>
          <span className={`ka-ft-val tabular${s.tone ? ` ${s.tone}` : ""}`}>{s.value}</span>
          {s.sub ? <span className="ka-ft-sub">{s.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}
