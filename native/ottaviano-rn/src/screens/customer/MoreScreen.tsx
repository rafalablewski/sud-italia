import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useCustomer } from "@/auth/CustomerSession";
import { getLocations } from "@/api/public";
import type { LocationDTO } from "@/api/types";
import { Button, Card, Divider, Muted } from "@/components/ui";

/** More tab — famiglia / locations / account (APP-SHELL §2). Account deletion +
 *  data export are mandatory for any signed-in app (Guideline 5.1.1(v)). */
export function MoreScreen() {
  const { c } = useTheme();
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();
  const { status, profile, logout, authed } = useCustomer();
  const [locations, setLocations] = useState<LocationDTO[]>([]);

  useEffect(() => {
    getLocations().then(setLocations).catch(() => {});
  }, []);

  const deleteAccount = () => {
    Alert.alert("Delete account", "This permanently deletes your profile and loyalty data. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await authed("/customer/account", { method: "DELETE" });
            await logout();
          } catch {
            Alert.alert("Could not delete", "Please try again.");
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card>
        <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 16, marginBottom: 4 }}>
          {status === "signed-in" ? profile?.name ?? "Your account" : "Guest"}
        </Text>
        {status === "signed-in" ? (
          <Muted>{profile?.phone}</Muted>
        ) : (
          <Button label="Sign in" onPress={() => navigation.navigate("Rewards")} small />
        )}
      </Card>

      <Card>
        <Text style={{ color: c.textPrimary, fontWeight: "800", marginBottom: 8 }}>Our restaurants</Text>
        {locations.map((l, i) => (
          <View key={l.slug}>
            {i > 0 && <Divider />}
            <Text style={{ color: c.textPrimary, fontWeight: "700" }}>{l.name}</Text>
            <Muted>{l.address}</Muted>
          </View>
        ))}
      </Card>

      <Card>
        <Pressable onPress={() => Linking.openURL("https://sud-italia.vercel.app/privacy")} style={{ paddingVertical: 8 }}>
          <Text style={{ color: c.accent, fontWeight: "600" }}>Privacy policy</Text>
        </Pressable>
        {status === "signed-in" && (
          <>
            <Divider />
            <Pressable onPress={() => authed("/customer/account/export").then(() => Alert.alert("Export ready", "Your data export has been generated.")).catch(() => Alert.alert("Could not export"))} style={{ paddingVertical: 8 }}>
              <Text style={{ color: c.accent, fontWeight: "600" }}>Export my data</Text>
            </Pressable>
            <Divider />
            <Pressable onPress={() => logout()} style={{ paddingVertical: 8 }}>
              <Text style={{ color: c.textPrimary, fontWeight: "600" }}>Sign out</Text>
            </Pressable>
            <Divider />
            <Pressable onPress={deleteAccount} style={{ paddingVertical: 8 }}>
              <Text style={{ color: c.danger, fontWeight: "600" }}>Delete account</Text>
            </Pressable>
          </>
        )}
      </Card>

      <Pressable onPress={() => navigation.navigate("Launch")} style={{ alignItems: "center", paddingVertical: 8 }}>
        <Muted>Switch to staff sign-in</Muted>
      </Pressable>
    </ScrollView>
  );
}
