import "../styles/service.css";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ServiceV2 } from "@/core-v2/service/ServiceV2";

export default async function CoreV2ServicePage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <ServiceV2 />;
}
