"use client";

import { useEffect, useState, type ReactNode } from "react";
import { fetchPublicSettings, type PublicSettings } from "@/lib/public-settings";

type LayoutFlag = keyof NonNullable<PublicSettings["layout"]>;

interface LayoutGateProps {
  /** The boolean flag in PublicSettings.layout that controls visibility.
   *  Default behaviour when undefined is "show" — a freshly-deployed
   *  instance with no saved layout settings keeps the historical UI. */
  flag: LayoutFlag;
  children: ReactNode;
}

/**
 * Client-side visibility gate for storefront components controlled by
 * the admin Settings → Layout tab.
 *
 * When the named flag in /api/settings/public is explicitly `false`, the
 * gate renders `null` so the wrapped subtree drops out of the DOM (no
 * painted CSS, no event listeners, no layout impact). On `true` /
 * `undefined` / fetch failure, the child renders as normal — the
 * fail-open default protects the storefront if the settings endpoint is
 * briefly unavailable.
 *
 * Wrapping a server component is fine: the server still renders the
 * child HTML inside the client boundary, and this gate decides at hydrate
 * time whether to keep it mounted.
 */
export function LayoutGate({ flag, children }: LayoutGateProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPublicSettings().then((data) => {
      if (cancelled) return;
      if (data?.layout && data.layout[flag] === false) {
        setVisible(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [flag]);

  if (!visible) return null;
  return <>{children}</>;
}
