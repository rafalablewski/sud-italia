import { ScrollView, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useCustomer } from "@/auth/CustomerSession";
import { formatMoney } from "@/lib/format";
import { Card, StatTile, StateBlock } from "@/components/ui";
import { SignIn } from "@/features/customer/SignIn";

/** Rewards tab — the loyalty card off `GET /api/v1/customer/me` (points + tier). */
export function RewardsScreen() {
  const { c } = useTheme();
  const { status, profile } = useCustomer();

  if (status === "loading") return <StateBlock kind="loading" />;
  if (status === "signed-out" || !profile) return <SignIn reason="Sign in to see your loyalty points and rewards." />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card style={{ backgroundColor: c.brand }}>
        <Text style={{ color: "#f8efde", fontSize: 14, fontWeight: "700", opacity: 0.85 }}>OTTAVIANO FAMIGLIA</Text>
        <Text style={{ color: "#fff", fontSize: 44, fontWeight: "900", marginTop: 8 }}>{profile.points}</Text>
        <Text style={{ color: "#f8efde", fontSize: 14, opacity: 0.85 }}>points · {profile.tier} tier</Text>
        {profile.name ? <Text style={{ color: "#fff", marginTop: 14, fontWeight: "700" }}>{profile.name}</Text> : null}
        <Text style={{ color: "#f8efde", opacity: 0.7, fontSize: 12 }}>{profile.phone}</Text>
      </Card>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatTile label="Orders" value={profile.orderCount} />
        <StatTile label="Lifetime" value={formatMoney(profile.totalSpentGrosze)} />
      </View>

      <Card>
        <Text style={{ color: c.textPrimary, fontWeight: "800", marginBottom: 6 }}>How it works</Text>
        <Text style={{ color: c.textSecondary, lineHeight: 20 }}>
          Earn 1 point per złoty spent. Points are added automatically to the phone number on your order — no card to carry.
        </Text>
      </Card>
    </ScrollView>
  );
}
