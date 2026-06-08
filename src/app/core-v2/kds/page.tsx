import "../styles/kds.css";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { KdsV2 } from "@/core-v2/kds/KdsV2";

export default async function CoreV2KdsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <KdsV2 />;
}
