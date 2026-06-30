import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { StateBlock } from "@/components/ui";

interface MenuRow {
  id: string;
  name: string;
  category: string;
  available: boolean;
}

/**
 * 86 (eighty-six) — quick item availability. Loads the operator menu
 * (`GET /api/v1/admin/menu?location=`) and toggles availability with
 * `PATCH /api/v1/admin/menu { itemId, available }` (manager+). 1:1 with the web
 * `<EightySix>` dialog in CoreKds.tsx; an 86'd dish stops firing on the line.
 */
export function EightySixSheet({ location, open, onClose }: { location: string; open: boolean; onClose: () => void }) {
  const { c, radius } = useTheme();
  const { authed } = useOperator();
  const [rows, setRows] = useState<MenuRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!location) return;
    try {
      const { data } = await authed<MenuRow[]>(`/admin/menu?location=${encodeURIComponent(location)}`);
      setRows(data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the menu");
    }
  }, [authed, location]);

  useEffect(() => {
    if (open) {
      setRows(null);
      void load();
    }
  }, [open, load]);

  const toggle = async (row: MenuRow) => {
    setBusy(row.id);
    try {
      await authed("/admin/menu", { method: "PATCH", body: { itemId: row.id, available: !row.available } });
      setRows((prev) => (prev ? prev.map((r) => (r.id === row.id ? { ...r, available: !r.available } : r)) : prev));
    } catch {
      /* forbidden for kitchen-only tokens — non-fatal */
    } finally {
      setBusy(null);
    }
  };

  const off = rows?.filter((r) => !r.available) ?? [];
  const on = rows?.filter((r) => r.available) ?? [];

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "82%", padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ color: c.textPrimary, fontSize: 18, fontWeight: "800" }}>86 — item availability</Text>
            <Pressable onPress={onClose}><Text style={{ color: c.textSecondary, fontSize: 22 }}>✕</Text></Pressable>
          </View>
          {error ? (
            <StateBlock kind="error" message={error} />
          ) : !rows ? (
            <StateBlock kind="loading" />
          ) : (
            <ScrollView>
              {off.length > 0 && (
                <>
                  <Text style={{ color: c.textSecondary, fontWeight: "700", marginBottom: 8 }}>86&apos;d · tap to restore</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                    {off.map((r) => (
                      <Chip key={r.id} row={r} busy={busy === r.id} onPress={() => toggle(r)} restore />
                    ))}
                  </View>
                </>
              )}
              <Text style={{ color: c.textSecondary, fontWeight: "700", marginBottom: 8 }}>On the menu · tap to 86</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 24 }}>
                {on.map((r) => (
                  <Chip key={r.id} row={r} busy={busy === r.id} onPress={() => toggle(r)} />
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );

  function Chip({ row, busy: b, onPress, restore }: { row: MenuRow; busy: boolean; onPress: () => void; restore?: boolean }) {
    return (
      <Pressable
        onPress={onPress}
        disabled={b}
        style={{
          backgroundColor: restore ? "transparent" : c.surface2,
          borderColor: restore ? c.danger : c.line,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.pill,
          paddingVertical: 8,
          paddingHorizontal: 14,
          opacity: b ? 0.5 : 1,
        }}
      >
        <Text style={{ color: restore ? c.danger : c.textPrimary, fontWeight: "600" }}>
          {row.name}
          {restore ? " ↺" : ""}
        </Text>
      </Pressable>
    );
  }
}
