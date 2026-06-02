import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { OpsAgentChat } from "@/components/admin/OpsAgentChat";
import { gatewayConfigured } from "@/lib/ai/gateway";

export default async function AdminAIAgentPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  const configured = gatewayConfigured();
  return <OpsAgentChat gatewayConfigured={configured} />;
}
