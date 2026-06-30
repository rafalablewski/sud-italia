import { Redirect } from "expo-router";
import { useOperator } from "@/auth/OperatorSession";
import { StateBlock } from "@/components/ui";
import { View } from "react-native";

/** Operator entry — gate to login or land on the Dashboard surface. */
export default function OperatorIndex() {
  const { status } = useOperator();
  if (status === "loading")
    return (
      <View style={{ flex: 1, backgroundColor: "#15110d" }}>
        <StateBlock kind="loading" message="Resuming session…" />
      </View>
    );
  if (status === "signed-out") return <Redirect href="/operator/login" />;
  return <Redirect href="/operator/surface/admin" />;
}
