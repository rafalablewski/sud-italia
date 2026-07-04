import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { Card, Muted, Pill, SectionHeading, StateBlock, StatTile } from "@/components/ui";

/**
 * Schedule — bespoke faithful mirror of the web `ScheduleV3` rota
 * (`src/admin-v3/ScheduleV3.tsx`), replacing the generic `DataSurface` list. Same
 * status taxonomy (scheduled/in-progress/done/missed) with the web tones, shifts
 * grouped by day like the web list view, over a KPI rail (shifts · hours · on-rota).
 * Every field is real off `GET /api/v1/admin/schedule` (Rule #1, role-scoped) — the
 * facade resolves the staff name and returns start/end/role/status. The web's
 * labour-cost KPI needs the hourly rate the schedule facade doesn't carry, so it's
 * omitted rather than faked. Pull to refresh. (Status advance stays a later write
 * wave.)
 */

type ShiftStatus = "scheduled" | "in-progress" | "done" | "missed";
type Filter = "all" | ShiftStatus;

interface ShiftRow {
  id: string;
  staffId: string;
  staffName: string;
  locationSlug: string;
  startAt: string;
  endAt: string;
  role: string;
  status: ShiftStatus;
}

const SITE_LABEL: Record<string, string> = { krakow: "Kraków", warszawa: "Warszawa" };
const STATUS_LABEL: Record<ShiftStatus, string> = {
  scheduled: "Scheduled",
  "in-progress": "In progress",
  done: "Done",
  missed: "Missed",
};
// Web STATUS_TONE: scheduled=info, in-progress=warn, done=ok, missed=bad.
const STATUS_TONE: Record<ShiftStatus, "info" | "warning" | "success" | "danger"> = {
  scheduled: "info",
  "in-progress": "warning",
  done: "success",
  missed: "danger",
};
const FILTER_ORDER: Filter[] = ["all", "scheduled", "in-progress", "done", "missed"];
const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  scheduled: "Scheduled",
  "in-progress": "Live",
  done: "Done",
  missed: "Missed",
};

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function siteOf(slug: string): string {
  return SITE_LABEL[slug] ?? slug;
}

function dayKey(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  return `${DAY[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]}`;
}

function clock(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function hoursBetween(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb) || tb <= ta) return 0;
  return (tb - ta) / 3_600_000;
}

export function Schedule() {
  const { c } = useTheme();
  const { authed } = useOperator();
  const [rows, setRows] = useState<ShiftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      const res = await authed<ShiftRow[]>("/admin/schedule");
      setRows(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the schedule");
    }
  }, [authed]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const counts = useMemo<Record<Filter, number>>(() => {
    const list = rows ?? [];
    const base: Record<Filter, number> = { all: list.length, scheduled: 0, "in-progress": 0, done: 0, missed: 0 };
    for (const s of list) base[s.status]++;
    return base;
  }, [rows]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    return {
      hours: list.reduce((s, r) => s + hoursBetween(r.startAt, r.endAt), 0),
      onRota: new Set(list.map((r) => r.staffId)).size,
    };
  }, [rows]);

  // Filter, then group into day buckets (earliest first) like the web list view.
  const groups = useMemo(() => {
    const list = (filter === "all" ? rows ?? [] : (rows ?? []).filter((s) => s.status === filter))
      .slice()
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
    const map = new Map<string, ShiftRow[]>();
    for (const s of list) {
      const k = dayKey(s.startAt);
      const arr = map.get(k);
      if (arr) arr.push(s);
      else map.set(k, [s]);
    }
    return [...map.entries()];
  }, [rows, filter]);

  if (error) return <StateBlock kind="error" message={error} />;
  if (!rows) return <StateBlock kind="loading" />;

  const showSite = new Set(rows.map((r) => r.locationSlug)).size > 1;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ padding: 14, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
    >
      {/* KPI rail — shifts, total hours, distinct staff on rota. */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatTile label="Shifts" value={counts.all} />
        <StatTile label="Hours" value={`${stats.hours.toFixed(0)}h`} />
        <StatTile label="On rota" value={stats.onRota} />
      </View>

      {/* Status filter chips with live counts. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {FILTER_ORDER.map((f) => (
          <Pill
            key={f}
            label={`${FILTER_LABEL[f]} · ${counts[f]}`}
            active={filter === f}
            tone={f === "all" ? "default" : STATUS_TONE[f]}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      {groups.length === 0 ? (
        <StateBlock kind="empty" message="No shifts in this filter." />
      ) : (
        groups.map(([day, shifts]) => (
          <View key={day} style={{ gap: 8 }}>
            <SectionHeading>{day}</SectionHeading>
            {shifts.map((s) => {
              const tone = STATUS_TONE[s.status];
              const color = tone === "success" ? c.success : tone === "warning" ? c.warning : tone === "danger" ? c.danger : c.accent;
              return (
                <Card key={s.id}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>{s.staffName}</Text>
                      <Muted style={{ marginTop: 2, fontSize: 12 }}>
                        {s.role}
                        {showSite ? `  ·  ${siteOf(s.locationSlug)}` : ""}
                      </Muted>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                        {clock(s.startAt)}–{clock(s.endAt)}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          backgroundColor: c.surface,
                          borderColor: color,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderRadius: 999,
                          paddingVertical: 3,
                          paddingHorizontal: 9,
                        }}
                      >
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                        <Text style={{ color: c.textPrimary, fontSize: 11, fontWeight: "700" }}>{STATUS_LABEL[s.status]}</Text>
                      </View>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        ))
      )}

      <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: "center", marginTop: 2 }}>
        {counts.all} shift{counts.all === 1 ? "" : "s"} · live
      </Text>
    </ScrollView>
  );
}
