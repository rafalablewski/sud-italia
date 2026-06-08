import type { ReactNode } from "react";
import { CoreV2Shell, type CoreV2Tab } from "./CoreV2Shell";

/**
 * Placeholder body for a Core v2 surface whose chrome is live but whose guts
 * are ported in a later step. Renders the real shell (switcher + subbar all
 * work) over an honest "scaffolded — wiring in Step N" panel, so the
 * foundation is navigable without pretending a surface is finished.
 */
export function ScaffoldSurface({
  eyebrow,
  tabs,
  icon,
  title,
  blurb,
  step,
  bleed,
}: {
  eyebrow: string;
  tabs?: CoreV2Tab[];
  icon: ReactNode;
  title: string;
  blurb: string;
  step: string;
  bleed?: boolean;
}) {
  return (
    <CoreV2Shell eyebrow={eyebrow} tabs={tabs} bleed={bleed}>
      <div className="cv-scaffold">
        <div className="box">
          <div className="ic">{icon}</div>
          <h2>{title}</h2>
          <p>{blurb}</p>
          <span className="step">{step}</span>
        </div>
      </div>
    </CoreV2Shell>
  );
}
