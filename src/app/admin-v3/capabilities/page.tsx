import { redirect } from "next/navigation";

// The capabilities ledger is shared infra (the source of truth for what's
// deployed) and isn't a themed surface worth rebuilding — point v3 at it.
export default function AdminV3CapabilitiesPage() {
  redirect("/admin/capabilities");
}
