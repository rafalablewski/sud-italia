"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

/**
 * Sign-out for the standalone Manager portal (it lives outside the AdminShell,
 * so it can't borrow the Sidebar's logout). Clears the session cookie via the
 * shared admin logout route and returns to the universal /login door.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="av3-btn av3-btn-ghost av3-btn-sm"
    >
      <LogOut className="av3-btn-ico" />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
