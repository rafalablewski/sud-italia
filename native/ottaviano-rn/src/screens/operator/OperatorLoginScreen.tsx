import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { ApiError } from "@/api/envelope";
import { Button, Card, Muted } from "@/components/ui";

/**
 * Operator login — mirrors the web admin login: shared-owner password, or an
 * email-bound user with per-user password + optional TOTP. Hits
 * `POST /api/v1/auth/login` with `app: "ottaviano-kds"`. The token pair lands in
 * the Keychain; on success the session flips to signed-in and the navigator swaps
 * this screen for the Dashboard surface (no manual navigation needed).
 */
export function OperatorLoginScreen() {
  const { c } = useTheme();
  const { login } = useOperator();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login({ email: email.trim() || undefined, password, totp: totp.trim() || undefined });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sign-in failed");
      setBusy(false);
    }
  };

  const input = { color: c.textPrimary, borderColor: c.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, marginBottom: 12 } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ padding: 20, justifyContent: "center", flexGrow: 1, gap: 18 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: c.accent, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 }}>OttavianoKDS</Text>
        <Muted>Staff console · sign in to your operation</Muted>
      </View>
      <Card>
        <TextInput placeholder="Email (optional for owner)" placeholderTextColor={c.textSecondary} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={input} />
        <TextInput placeholder="Password" placeholderTextColor={c.textSecondary} value={password} onChangeText={setPassword} secureTextEntry style={input} />
        <TextInput placeholder="2FA code (if enabled)" placeholderTextColor={c.textSecondary} value={totp} onChangeText={setTotp} keyboardType="number-pad" style={input} />
        {error && <Text style={{ color: c.danger, marginBottom: 10 }}>{error}</Text>}
        <Button label={busy ? "Signing in…" : "Sign in"} onPress={submit} disabled={busy || password.length < 1} />
      </Card>
    </ScrollView>
  );
}
