"use client";

import type { ReactNode } from "react";

interface Props {
  /** Sticky toolbar slot (filter chips / segment control). Rendered just under
   * the topbar via position: sticky. */
  toolbar?: ReactNode;
  /** Full-bleed hero rendered above the regular page padding (e.g. an
   * onboarding banner). */
  hero?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function MobilePage({ toolbar, hero, className, children }: Props) {
  return (
    <div className={`v2-m-page ${className ?? ""}`.trim()}>
      {toolbar && <div className="v2-m-page-toolbar">{toolbar}</div>}
      {hero && <div className="v2-m-page-hero">{hero}</div>}
      <div className="v2-m-page-body">{children}</div>
    </div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="v2-m-page-header">
      <div className="v2-m-page-header-text">
        <h2 className="v2-m-page-title">{title}</h2>
        {subtitle && <div className="v2-m-page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="v2-m-page-actions">{actions}</div>}
    </header>
  );
}

interface SectionProps {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Section({ title, action, className, children }: SectionProps) {
  return (
    <section className={`v2-m-section ${className ?? ""}`.trim()}>
      <header className="v2-m-section-header">
        <h3 className="v2-m-section-title">{title}</h3>
        {action && <div className="v2-m-section-action">{action}</div>}
      </header>
      <div className="v2-m-section-body">{children}</div>
    </section>
  );
}
