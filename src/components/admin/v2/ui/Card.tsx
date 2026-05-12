"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Removes the default surface chrome — useful when nesting cards. */
  bare?: boolean;
  /** Adds the elevated shadow variant. */
  raised?: boolean;
  /** Inline padding flavour. `default` = 20px, `compact` = 14px, `none` = 0. */
  padding?: "default" | "compact" | "none";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { bare = false, raised = false, padding = "default", className = "", children, ...rest },
  ref,
) {
  const classes = [
    "v2-card",
    bare ? "v2-card-bare" : "",
    raised ? "v2-card-raised" : "",
    `v2-card-p-${padding}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div ref={ref} className={classes} {...rest}>
      {children}
    </div>
  );
});

interface SectionProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function CardHeader({ title, description, actions, className = "", children, ...rest }: SectionProps) {
  return (
    <div className={`v2-card-header ${className}`} {...rest}>
      <div className="v2-card-header-text">
        {title && <div className="v2-card-title">{title}</div>}
        {description && <div className="v2-card-desc">{description}</div>}
        {children}
      </div>
      {actions && <div className="v2-card-actions">{actions}</div>}
    </div>
  );
}

export function CardBody({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`v2-card-body ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`v2-card-footer ${className}`} {...rest}>
      {children}
    </div>
  );
}
