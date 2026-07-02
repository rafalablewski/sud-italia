import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getLoyaltySettings } from "@/lib/store";
import { CoreLoyalty } from "@/core/guest/CoreLoyalty";

export default async function CoreLoyaltyPage() {
  if (!(await isAuthenticated())) redirect("/login");
  // The reward ladder (active rewards, cheapest first) drives the members
  // table's live "next reward" progress — real config, no guessing (Rule #1).
  const settings = await getLoyaltySettings();
  const rewards = settings.rewards
    .filter((r) => r.active)
    .map((r) => ({ id: r.id, name: r.name, pointsCost: r.pointsCost }))
    .sort((a, b) => a.pointsCost - b.pointsCost);
  return <CoreLoyalty rewards={rewards} />;
}
