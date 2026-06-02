import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminCustomerDetail } from "@/components/admin/AdminCustomerDetail";

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ phone: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");
  const { phone } = await params;
  return <AdminCustomerDetail phoneEncoded={phone} />;
}
