import { redirect } from "next/navigation";

// Tasks & Announcements are now two separate surfaces (Tasks vs Announcements).
// The bare /admin/comms index keeps old bookmarks + the nav root working by
// landing on Tasks.
export default function AdminCommsIndexPage() {
  redirect("/admin/comms/tasks");
}
