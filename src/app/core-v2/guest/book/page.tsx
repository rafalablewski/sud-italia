import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreV2Book } from "@/core-v2/guest/CoreV2Book";

export default async function CoreV2BookPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreV2Book />;
}
