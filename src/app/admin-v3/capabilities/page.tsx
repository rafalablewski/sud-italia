import { redirect } from "next/navigation";

// The capabilities ledger is shared infra (the source of truth for what's
// deployed) and isn't a themed surface worth rebuilding — point v3 at the
// standalone, shell-less /capabilities route.
export default function AdminV3CapabilitiesPage() {
  redirect("/capabilities");
}
