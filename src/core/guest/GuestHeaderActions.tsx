"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The Guest-hub header actions — the WhatsApp channel-status badge plus
 * Funnel / Settings / Broadcast, exactly as the Core mockup shows them across
 * every Guest sub-view. The full controls (the dialogs + the channel toggle)
 * live on the Inbox surface, so on the other Guest views (Loyalty, CRM,
 * Concierge, Book) these route to `/core/guest/whatsapp` where they operate.
 * The Inbox renders its own fully-wired versions instead of this.
 *
 * The live/off badge reads the real channel status from
 * `/api/admin/whatsapp/settings` (no placeholder).
 */
export function GuestHeaderActions() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/whatsapp/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && typeof d.enabled === "boolean") setEnabled(d.enabled);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <Link
        href="/core/guest/whatsapp"
        className={`badge ${enabled ? "success" : "neutral"}`}
        title="WhatsApp ordering channel"
      >
        <span className="d" />
        WhatsApp {enabled === null ? "—" : enabled ? "live" : "off"}
      </Link>
      <Link href="/core/guest/whatsapp" className="btn ghost">
        Funnel
      </Link>
      <Link href="/core/guest/whatsapp" className="btn ghost">
        Settings
      </Link>
      <Link href="/core/guest/whatsapp" className="btn primary">
        Broadcast
      </Link>
    </>
  );
}
