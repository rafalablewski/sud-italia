import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import type { OrderDTO } from "@/api/types";
import {
  BUMP_LABEL,
  channelTag,
  dueLabel,
  groupItems,
  isAtRisk,
  type KdsTone,
  nextStatus,
  slaFraction,
  ticketAllergens,
} from "./kdsLogic";

const COURSE_LABELS: Record<string, string> = { first: "First", main: "Main", dessert: "Dessert", drinks: "Drinks" };

function toneColor(tone: KdsTone, c: ReturnType<typeof useTheme>["c"]): string {
  switch (tone) {
    case "ready":
      return c.success;
    case "late":
      return c.danger;
    case "risk":
      return "#a855f7"; // the shared at-risk violet tier (web ticketTone)
    case "warn":
      return c.warning;
    case "firing":
      return c.accent;
    default:
      return c.textSecondary;
  }
}

/**
 * One Kitchen Display ticket — 1:1 with the web `<TicketCard>` (CoreKds.tsx):
 * header (#shortId · channel chip · at-risk + due), coursing/held callout,
 * station-grouped lines with modifier flags + notes, allergen callout, the
 * special-instructions note, the cook-time SLA meter, and the bump button.
 * `now` is the shared 1 s kitchen clock from the parent.
 */
export const TicketCard = memo(function TicketCard({
  t,
  station,
  now,
  updating,
  onAdvance,
}: {
  t: OrderDTO;
  station: string;
  now: number;
  updating: boolean;
  onAdvance: (t: OrderDTO) => void;
}) {
  const { c, radius } = useTheme();
  const due = dueLabel(t, now);
  const tc = toneColor(due.tone, c);
  const pct = Math.round(slaFraction(t, now) * 100);
  const atRisk = isAtRisk(t);
  const groups = useMemo(() => groupItems(t.items), [t.items]);
  const allergens = useMemo(() => ticketAllergens(t), [t]);
  const grouped = station === "all" && groups.length > 1;
  const held = t.coursing?.held ?? [];
  const next = nextStatus(t.status);

  return (
    <View
      style={{
        backgroundColor: c.surface2,
        borderRadius: radius.lg,
        borderLeftWidth: 4,
        borderLeftColor: tc,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderTopColor: c.line,
        borderRightColor: c.line,
        borderBottomColor: c.line,
        padding: 12,
        gap: 8,
        opacity: t.simulated ? 0.85 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: c.textPrimary, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
            #{t.shortId}
          </Text>
          <View style={{ backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: "600" }}>{channelTag(t)}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {atRisk && (
            <Text style={{ color: "#a855f7", fontSize: 11, fontWeight: "800", textTransform: "uppercase" }}>At risk</Text>
          )}
          <Text style={{ color: tc, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{due.text}</Text>
        </View>
      </View>

      {t.simulated && (
        <Text style={{ color: c.warning, fontSize: 11, fontStyle: "italic" }}>Simulation — not a real order</Text>
      )}
      {held.length > 0 && (
        <Text style={{ color: c.accent, fontSize: 12, fontWeight: "600" }}>
          Coursed · {held.map((h) => COURSE_LABELS[h] ?? h).join(", ")} held
        </Text>
      )}

      <View style={{ gap: 6 }}>
        {groups.map((g) => (
          <View key={g.category} style={{ gap: 4 }}>
            {grouped && (
              <Text style={{ color: c.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {g.label}
              </Text>
            )}
            {g.items.map((it, i) => {
              const dim = station !== "all" && it.category !== station;
              return (
                <View key={i} style={{ flexDirection: "row", gap: 8, opacity: dim ? 0.4 : 1 }}>
                  <Text style={{ color: c.accent, fontSize: 15, fontWeight: "800", minWidth: 28 }}>{it.quantity}×</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.textPrimary, fontSize: 15, fontWeight: "700" }}>{it.name}</Text>
                    {it.modifiers.map((m, mi) => (
                      <Text key={mi} style={{ color: m.flag ? c.danger : c.textSecondary, fontSize: 13, fontWeight: m.flag ? "800" : "500" }}>
                        {m.label}
                      </Text>
                    ))}
                    {it.notes ? <Text style={{ color: c.textSecondary, fontSize: 13 }}>{it.notes}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {allergens.length > 0 && (
        <Text style={{ color: c.warning, fontSize: 12, fontWeight: "600" }}>Allergens · {allergens.join(" · ")}</Text>
      )}
      {t.specialInstructions ? (
        <Text style={{ color: c.textPrimary, fontSize: 13 }}>
          <Text style={{ fontWeight: "800" }}>Note </Text>
          {t.specialInstructions}
        </Text>
      ) : null}

      <View style={{ height: 6, backgroundColor: c.surface, borderRadius: 3, overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: tc }} />
      </View>

      {next && (
        <Pressable
          onPress={() => onAdvance(t)}
          disabled={updating}
          style={({ pressed }) => ({
            backgroundColor: c.accent,
            opacity: updating ? 0.5 : pressed ? 0.85 : 1,
            borderRadius: radius.md,
            paddingVertical: 11,
            alignItems: "center",
          })}
        >
          <Text style={{ color: c.onAccent, fontWeight: "800", fontSize: 15 }}>{BUMP_LABEL[t.status]}</Text>
        </Pressable>
      )}
    </View>
  );
});
