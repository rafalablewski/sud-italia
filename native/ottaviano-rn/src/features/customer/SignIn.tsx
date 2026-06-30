import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useCustomer } from "@/auth/CustomerSession";
import { Button, Card, Muted } from "@/components/ui";

/**
 * Phone-OTP sign-in (Rule #6: zero-friction, no passwords). `request` sends a
 * 6-digit code; in non-prod with no SMS provider the API returns it as `devCode`,
 * which we prefill so the flow is testable. Sign-in only unlocks Rewards + order
 * history — guests can already order without it.
 */
export function SignIn({ reason }: { reason: string }) {
  const { c } = useTheme();
  const { request, verify } = useCustomer();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const { devCode } = await request(phone.trim());
      setStage("code");
      if (devCode) {
        setCode(devCode);
        setHint(`Dev code: ${devCode}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await verify(phone.trim(), code.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, padding: 16, justifyContent: "center", gap: 16 }}>
      <Text style={{ color: c.brand, fontSize: 24, fontWeight: "900", textAlign: "center" }}>Sign in</Text>
      <Muted style={{ textAlign: "center" }}>{reason}</Muted>
      <Card>
        {stage === "phone" ? (
          <>
            <TextInput placeholder="Phone number" placeholderTextColor={c.textSecondary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={{ color: c.textPrimary, borderBottomWidth: 1, borderBottomColor: c.line, paddingVertical: 10, marginBottom: 14, fontSize: 16 }} />
            <Button label={busy ? "Sending…" : "Send code"} onPress={send} disabled={busy || phone.trim().length < 6} />
          </>
        ) : (
          <>
            <TextInput placeholder="6-digit code" placeholderTextColor={c.textSecondary} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} style={{ color: c.textPrimary, borderBottomWidth: 1, borderBottomColor: c.line, paddingVertical: 10, marginBottom: 14, fontSize: 20, letterSpacing: 6, textAlign: "center" }} />
            {hint && <Muted style={{ textAlign: "center", marginBottom: 10 }}>{hint}</Muted>}
            <Button label={busy ? "Verifying…" : "Verify"} onPress={confirm} disabled={busy || code.trim().length !== 6} />
          </>
        )}
        {error && <Text style={{ color: c.danger, marginTop: 10, textAlign: "center" }}>{error}</Text>}
      </Card>
    </View>
  );
}
