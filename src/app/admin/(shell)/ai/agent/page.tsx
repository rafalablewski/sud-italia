import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AgentV3 } from "@/admin-v3/AgentV3";
import { AiModelControl } from "@/admin-v3/AiModelControl";
import { gatewayConfigured } from "@/lib/ai/gateway";

export default async function AdminV3AIAgentPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <>
      <AiModelControl />
      <AgentV3 gatewayConfigured={gatewayConfigured()} />
    </>
  );
}
