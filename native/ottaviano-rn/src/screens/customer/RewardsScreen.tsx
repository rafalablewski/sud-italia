import { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useCustomer } from "@/auth/CustomerSession";
import { useSettings } from "@/store/settings";
import { formatMoney } from "@/lib/format";
import { TIER_ORDER, tierProgress, type TierKey } from "@/lib/loyalty";
import { Card, ProgressBar, StatTile, StateBlock, SectionHeading, Badge } from "@/components/ui";
import { SignIn } from "@/features/customer/SignIn";

/**
 * Rewards tab (web loyalty.md parity). The tier card with live progress to the
 * next tier, lifetime stats, the full tier roadmap, the rewards catalogue
 * (affordable vs locked off the real points balance), and the referral terms —
 * all from `/customer/me` + `/settings/public`, so an operator's programme edit
 * lands with no app release (loyalty.md rule #1 — never hardcode tiers/rewards).
 */
export function RewardsScreen() {
  const { c } = useTheme();
  const { status, profile } = useCustomer();
  const settings = useSettings((s) => s.settings);
  const loadSettings = useSettings((s) => s.load);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (status === "loading") return <StateBlock kind="loading" />;
  if (status === "signed-out" || !profile) return <SignIn reason="Sign in to see your loyalty points and rewards." />;
  if (!settings) return <StateBlock kind="loading" />;

  const tiers = settings.loyalty.tiers;
  const prog = tierProgress(profile.points, tiers);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* Tier card */}
      <Card style={{ backgroundColor: c.brand }}>
        <Text style={{ color: "#f8efde", fontSize: 14, fontWeight: "700", opacity: 0.85 }}>OTTAVIANO FAMIGLIA</Text>
        <Text style={{ color: "#fff", fontSize: 44, fontWeight: "900", marginTop: 8, fontVariant: ["tabular-nums"] }}>{profile.points}</Text>
        <Text style={{ color: "#f8efde", fontSize: 14, opacity: 0.85 }}>
          points · {prog.currentConfig.label}
          {prog.currentConfig.multiplier > 1 ? ` · ${prog.currentConfig.multiplier}× earn` : ""}
        </Text>
        {profile.name ? <Text style={{ color: "#fff", marginTop: 14, fontWeight: "700" }}>{profile.name}</Text> : null}
        <Text style={{ color: "#f8efde", opacity: 0.7, fontSize: 12 }}>{profile.phone}</Text>

        {prog.next && prog.nextConfig && (
          <View style={{ marginTop: 16, gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: "#f8efde", fontSize: 12, opacity: 0.85 }}>{prog.currentConfig.label}</Text>
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{prog.toNext} pts to {prog.nextConfig.label}</Text>
            </View>
            <ProgressBar fraction={prog.fraction} tone="warning" />
          </View>
        )}
      </Card>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatTile label="Orders" value={profile.orderCount} />
        <StatTile label="Lifetime" value={formatMoney(profile.totalSpentGrosze)} />
      </View>

      {/* Tier roadmap */}
      <View style={{ gap: 10 }}>
        <SectionHeading>I livelli · tiers</SectionHeading>
        {TIER_ORDER.map((key: TierKey) => {
          const t = tiers[key];
          const current = key === prog.current;
          const reached = profile.points >= t.threshold;
          return (
            <Card key={key} style={{ borderColor: current ? c.accent : c.line, opacity: reached || current ? 1 : 0.7 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 16 }}>{t.label}</Text>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  {current && <Badge label="Attuale · current" tone="ok" filled />}
                  <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t.threshold === 0 ? "from start" : `${t.threshold} pts`}</Text>
                </View>
              </View>
              <Text style={{ color: c.brand, fontSize: 13, fontWeight: "700", marginTop: 4 }}>{t.multiplier}× points</Text>
              {t.perks.map((p) => (
                <Text key={p} style={{ color: c.textSecondary, fontSize: 13, marginTop: 3 }}>• {p}</Text>
              ))}
            </Card>
          );
        })}
      </View>

      {/* Rewards catalogue */}
      {settings.loyalty.rewards.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeading>Premi · rewards</SectionHeading>
          {settings.loyalty.rewards.map((r) => {
            const affordable = profile.points >= r.pointsCost;
            return (
              <Card key={r.id} style={{ opacity: affordable ? 1 : 0.7 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: c.textPrimary, fontWeight: "800", flex: 1 }}>{r.name}</Text>
                  <Text style={{ color: affordable ? c.success : c.textSecondary, fontWeight: "800", fontSize: 13 }}>{r.pointsCost} pts</Text>
                </View>
                <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 3 }}>{r.description}</Text>
                <Text style={{ color: affordable ? c.success : c.textSecondary, fontSize: 12.5, fontWeight: "600", marginTop: 6 }}>
                  {affordable ? "Disponibile — show at pickup to redeem" : `Need ${r.pointsCost - profile.points} more pts`}
                </Text>
              </Card>
            );
          })}
        </View>
      )}

      {/* Referral terms */}
      {settings.loyalty.referral && (
        <Card style={{ borderColor: c.success }}>
          <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 16 }}>Invita gli amici · refer friends</Text>
          <Text style={{ color: c.textSecondary, fontSize: 14, marginTop: 4 }}>
            They get {formatMoney(settings.loyalty.referral.refereeDiscountGrosze)} off their first order; you earn {settings.loyalty.referral.referrerPoints} points when they order.
          </Text>
        </Card>
      )}

      <Card>
        <Text style={{ color: c.textPrimary, fontWeight: "800", marginBottom: 6 }}>How it works</Text>
        <Text style={{ color: c.textSecondary, lineHeight: 20 }}>
          Earn {settings.loyalty.pointsPerCurrencyUnit} point per złoty spent, multiplied by your tier. Points are added automatically to the phone number on your order — no card to carry.
        </Text>
      </Card>
    </ScrollView>
  );
}
