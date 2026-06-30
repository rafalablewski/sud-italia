import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import type { FleetBoardDTO } from "@/api/types";
import { compactMoney } from "@/lib/format";
import { StateBlock, StatTile } from "@/components/ui";

/**
 * Owner Atlas (Fleet) — every active truck's live KDS health, the cross-truck
 * promise-accuracy benchmark, and fleet totals. Polls `/api/v1/admin/kds/fleet`
 * (owner) every 6 s, mirroring the web `<FleetWall>` in CoreKds.tsx.
 */
export function Fleet() {
  const { c, radius } = useTheme();
  const { authed } = useOperator();
  const [fleet, setFleet] = useState<FleetBoardDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data } = await authed<FleetBoardDTO>("/admin/kds/fleet?includeSimulated=1");
        if (alive) {
          setFleet(data);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load fleet");
      }
    };
    void load();
    const id = setInterval(load, 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [authed]);

  if (error) return <StateBlock kind="error" message={error} />;
  if (!fleet) return <StateBlock kind="loading" message="Loading fleet…" />;
  const tot = fleet.totals;
  const leaderSlug = fleet.tiles.reduce<string | null>(
    (best, t) => (t.promiseAccuracy > (fleet.tiles.find((x) => x.slug === best)?.promiseAccuracy ?? -1) ? t.slug : best),
    null,
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <StatTile label="Active" value={tot.active} />
        <StatTile label="At risk" value={tot.risk} tone={tot.risk ? "warn" : undefined} />
        <StatTile label="Late" value={tot.late} tone={tot.late ? "bad" : undefined} />
        <StatTile label="Ready" value={tot.ready} tone="ok" />
        <StatTile label="Throughput/hr" value={tot.throughputHr} />
        <StatTile label="Covers/hr" value={tot.coversHr} />
        <StatTile label="Revenue/hr" value={`${compactMoney(tot.revenueHr)} zł`} />
      </View>

      <View style={{ backgroundColor: c.surface2, borderRadius: radius.lg, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 }}>
        <Text style={{ color: c.textPrimary, fontWeight: "700" }}>
          Promise-accuracy · fleet {Math.round(fleet.benchmark.fleetAccuracy)}% · target {fleet.promiseTarget}%
        </Text>
        {fleet.tiles.map((t) => {
          const below = t.promiseAccuracy < fleet.promiseTarget;
          return (
            <View key={t.slug} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ color: c.textSecondary, width: 90, fontSize: 13 }}>{t.name}</Text>
              <View style={{ flex: 1, height: 8, backgroundColor: c.surface, borderRadius: 4, overflow: "hidden" }}>
                <View style={{ width: `${Math.min(100, Math.round(t.promiseAccuracy))}%`, height: "100%", backgroundColor: below ? c.warning : c.success }} />
              </View>
              <Text style={{ color: c.textPrimary, width: 64, textAlign: "right", fontSize: 13, fontWeight: "700" }}>
                {Math.round(t.promiseAccuracy)}%{!below && t.slug === leaderSlug ? " ◆" : ""}
              </Text>
            </View>
          );
        })}
      </View>

      {fleet.tiles.map((t) => (
        <View key={t.slug} style={{ backgroundColor: c.surface2, borderRadius: radius.lg, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, borderWidth: 2, borderColor: t.healthClass === "good" ? c.success : t.healthClass === "warn" ? c.warning : c.danger }}>
              <Text style={{ color: c.textPrimary, fontWeight: "800" }}>{t.health}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.textPrimary, fontSize: 16, fontWeight: "800" }}>{t.name}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                Open · {t.counts.active} active · {t.healthState.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <StatTile label="Active" value={t.counts.active} />
            <StatTile label="At risk" value={t.counts.risk} tone={t.counts.risk ? "warn" : undefined} />
            <StatTile label="Late" value={t.counts.late} tone={t.counts.late ? "bad" : undefined} />
            <StatTile label="Ready" value={t.counts.ready} tone="ok" />
            <StatTile label="On shift" value={t.onShift} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
