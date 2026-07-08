import { useState, type ReactNode } from "react";
import { useNavigation } from "@react-navigation/native";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { filterNavForRole, type OperatorNavItem } from "@/nav/operatorNav";

/**
 * The operator console chrome — a top command bar (hamburger + surface title +
 * role) and a slide-in nav drawer that renders the full role-filtered IA (the
 * 54-surface mirror of the web admin rail + Core surfaces, gated by role rank
 * exactly like `filterNavForRoleV3`). Every surface wraps its content in this, so
 * the whole operation is one tap away from anywhere. Always-dark KDS skin.
 */
export function OperatorShell({ active, title, children }: { active: OperatorNavItem; title?: string; children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ navigate: (screen: string, params: { path: string }) => void }>();
  const { role, user, logout } = useOperator();
  const [open, setOpen] = useState(false);
  const { isDesktop } = useBreakpoint();
  const sections = filterNavForRole(role);
  const allItems = sections.flatMap((s) => s.items);

  const go = (item: OperatorNavItem) => {
    setOpen(false);
    // Same route name + new params → React Navigation updates the surface in place.
    navigation.navigate("OperatorSurface", { path: item.path });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top, flexDirection: isDesktop ? "row" : "column" }}>
      {/* Desktop: a persistent vertical icon rail (the web nav sidebar). */}
      {isDesktop && (
        <View style={{ width: 68, backgroundColor: c.surface2, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: c.line }}>
          <View style={{ alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: c.onAccent, fontWeight: "900", fontSize: 18 }}>O</Text>
            </View>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
            {allItems.map((item) => {
              const isActive = item.path === active.path;
              return (
                <Pressable
                  key={item.path}
                  onPress={() => go(item)}
                  style={{ alignItems: "center", paddingVertical: 9, gap: 2, backgroundColor: isActive ? c.accent + "22" : "transparent", borderLeftWidth: 2, borderLeftColor: isActive ? c.accent : "transparent" }}
                >
                  <MaterialCommunityIcons name={item.icon as never} size={20} color={isActive ? c.accent : c.textSecondary} />
                  <Text numberOfLines={1} style={{ color: isActive ? c.textPrimary : c.textSecondary, fontSize: 8, fontWeight: "700", maxWidth: 62, textAlign: "center" }}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable onPress={() => logout()} style={{ alignItems: "center", paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
            <MaterialCommunityIcons name="logout" size={20} color={c.danger} />
          </Pressable>
        </View>
      )}

      <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
        {!isDesktop && (
          <Pressable onPress={() => setOpen(true)} hitSlop={10}>
            <MaterialCommunityIcons name="menu" size={26} color={c.textPrimary} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.textPrimary, fontSize: 18, fontWeight: "800" }} numberOfLines={1}>
            {title ?? active.label}
          </Text>
          <Text style={{ color: c.textSecondary, fontSize: 11 }}>OttavianoKDS · {role ?? "—"}</Text>
        </View>
        <MaterialCommunityIcons name={active.icon as never} size={22} color={c.accent} />
      </View>

      <View style={{ flex: 1 }}>{children}</View>
      </View>

      <Modal visible={open && !isDesktop} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} onPress={() => setOpen(false)}>
          <Pressable style={{ width: 300, maxWidth: "85%", flex: 1, backgroundColor: c.surface2, paddingTop: insets.top + 8 }} onPress={() => {}}>
            <View style={{ paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
              <Text style={{ color: c.accent, fontSize: 20, fontWeight: "900" }}>OttavianoKDS</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>{user?.name ?? user?.email ?? "Operator"} · {role}</Text>
            </View>
            <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
              {sections.map((section) => (
                <View key={section.id} style={{ marginBottom: 6 }}>
                  <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
                    {section.label}
                  </Text>
                  {section.items.map((item) => {
                    const isActive = item.path === active.path;
                    return (
                      <Pressable
                        key={item.path}
                        onPress={() => go(item)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: isActive ? c.surface : "transparent" }}
                      >
                        <MaterialCommunityIcons name={item.icon as never} size={20} color={isActive ? c.accent : c.textSecondary} />
                        <Text style={{ color: isActive ? c.textPrimary : c.textSecondary, fontWeight: isActive ? "800" : "600", flex: 1 }}>{item.label}</Text>
                        {item.status === "scaffold" && (
                          <Text style={{ color: c.textSecondary, fontSize: 9, fontWeight: "700", borderWidth: 1, borderColor: c.line, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>DOC</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              <Pressable onPress={() => { setOpen(false); logout(); }} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
                <MaterialCommunityIcons name="logout" size={20} color={c.danger} />
                <Text style={{ color: c.danger, fontWeight: "700" }}>Sign out</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
