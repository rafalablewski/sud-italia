"use client";

import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding flavour. `default` = 16px, `compact` = 12px, `none` = 0. */
  padding?: "default" | "compact" | "none";
}

export function Card({ padding = "none", className = "", children, ...rest }: CardProps) {
  const pad = padding === "default" ? "av3-card-p" : padding === "compact" ? "av3-card-pc" : "";
  return (
    <div className={`av3-card ${pad} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

interface HeadProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function CardHead({ title, description, actions }: HeadProps) {
  return (
    <div className="av3-card-head">
      <div>
        {title && <div className="av3-card-title">{title}</div>}
        {description && <div className="av3-card-desc">{description}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: "var(--av3-gap-2)" }}>{actions}</div>}
    </div>
  );
}

export function CardBody({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`av3-card-body ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
