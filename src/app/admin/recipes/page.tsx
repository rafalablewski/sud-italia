import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminRecipes } from "@/components/admin/AdminRecipes";

export default async function AdminRecipesPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <AdminRecipes />;
}
