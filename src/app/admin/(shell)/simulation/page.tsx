import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CalculatorV3 } from "@/admin-v3/CalculatorV3";

export default async function AdminV3CalculatorPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CalculatorV3 />;
}
