import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminMenuDetail } from "@/components/admin/AdminMenuDetail";

export default async function AdminMenuDetailPage({
  params,
}: {
  params: Promise<{ baseSlug: string }>;
}) {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  const { baseSlug } = await params;
  return <AdminMenuDetail baseSlug={baseSlug} />;
}
