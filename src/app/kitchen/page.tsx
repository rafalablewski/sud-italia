import { redirect } from "next/navigation";

// The legacy kitchen hub is retired — Core KDS (`/core/kds`) is the single
// kitchen door now. Kept as a redirect so any bookmarked `/kitchen` link lands
// on the live board instead of a dead duplicate surface.
export default function KitchenHubPage() {
  redirect("/core/kds");
}
