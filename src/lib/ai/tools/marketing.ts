import { getLoyaltySettings } from "@/lib/store";
import { registerTool } from "./registry";

/**
 * get_marketing_settings — read-only snapshot of the loyalty/growth
 * levers the CMO actually controls: tier structure, active rewards,
 * referral program, challenges, and seasonal LTOs. Use to judge whether
 * a lever is already firing before proposing a new campaign.
 */
registerTool<Record<string, never>>({
  name: "get_marketing_settings",
  description:
    "Read-only marketing/loyalty configuration: loyalty tier thresholds + multipliers, active rewards " +
    "and their point costs, the referral program, running challenges, and seasonal limited-time items. " +
    "Use to see which growth levers are already active before proposing a campaign.",
  minRole: "manager",
  mutates: false,
  inputSchema: { type: "object" as const, properties: {} },
  async execute() {
    const s = await getLoyaltySettings();
    return {
      ok: true,
      output: {
        tiers: Object.fromEntries(
          Object.entries(s.tiers).map(([k, v]) => [k, { threshold: v.threshold, multiplier: v.multiplier }]),
        ),
        activeRewards: s.rewards.filter((r) => r.active).map((r) => ({ name: r.name, pointsCost: r.pointsCost })),
        referral: s.referral,
        activeChallenges: s.challenges.filter((c) => c.active).map((c) => ({ title: c.title, rewardPoints: c.rewardPoints })),
        seasonalItems: s.seasonalItems
          .filter((i) => i.active)
          .map((i) => ({ name: i.name, locationSlug: i.locationSlug ?? "all", availableUntil: i.availableUntil })),
      },
    };
  },
});
