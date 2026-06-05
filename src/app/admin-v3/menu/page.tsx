import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { MenuV3 } from "@/components/admin/v3/MenuV3";

// Menu is a chain-wide product board (manager+ in v2). Any authenticated
// operator can open it here; the menu endpoints enforce write access + the
// chain-wide base-slug rules server-side.
export default async function AdminV3MenuPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return <MenuV3 />;
}
