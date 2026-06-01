import { redirect } from "next/navigation";

// Floor is now the Floor view of the merged Service surface.
export default function AdminFloorPage() {
  redirect("/admin/service?view=floor");
}
