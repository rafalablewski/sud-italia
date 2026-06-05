import { redirect } from "next/navigation";

// Service is split into nested routes (floor / slots). The bare surface lands
// on Floor. Booking moved into the Guest hub (`/core/guest/book`).
export default function ServiceHubIndex() {
  redirect("/core/service/floor");
}
