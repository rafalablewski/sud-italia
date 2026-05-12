"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Primary CTA — typically a Button or a Link. */
  action?: ReactNode;
  /** Compact mode for use inside cards. */
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, compact = false }: Props) {
  return (
    <div className={`v2-empty ${compact ? "v2-empty-compact" : ""}`}>
      {Icon && (
        <div className="v2-empty-icon" aria-hidden>
          <Icon className={compact ? "h-5 w-5" : "h-6 w-6"} />
        </div>
      )}
      <div className="v2-empty-title">{title}</div>
      {description && <div className="v2-empty-desc">{description}</div>}
      {action && <div className="v2-empty-action">{action}</div>}
    </div>
  );
}
