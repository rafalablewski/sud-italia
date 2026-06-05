import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { RecipesV3 } from "@/components/admin/v3/RecipesV3";

// Recipes are chain-wide formulas (manager+ in v2). The recipe endpoints derive
// the base slug + enforce write access server-side.
export default async function AdminV3RecipesPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return <RecipesV3 />;
}
