import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { Card, Muted, Pill, StateBlock, StatTile } from "@/components/ui";

/**
 * Campaigns — bespoke faithful mirror of the web WhatsApp broadcast campaigns
 * (the `/admin/growth` operator surface, wired to `/api/v1/admin/campaigns`),
 * replacing the generic `DataSurface` list. KPI rail (campaigns · sent · failed ·
 * delivery rate) + a status filter (sending/done/cancelled), each row showing the
 * template, audience, a send-progress bar (sent / failed / pending of the target)
 * and the outcome counts. Every figure is real off `GET /api/v1/admin/campaigns`
 * (Rule #1) — the facade returns sent/failed/total per broadcast. Pull to refresh.
 */

type CampaignStatus = "sending" | "done" | "cancelled";
type Filter = "all" | CampaignStatus;

interface CampaignRow {
  id: string;
  template: string;
  audienceLabel: string;
  sentCount: number;
  failedCount: number;
  total: number;
  status: CampaignStatus;
  createdAt: string;
}

const STATUS_LABEL: Record<CampaignStatus, string> = { sending: "Sending", done: "Done", cancelled: "Cancelled" };
const STATUS_TONE: Record<CampaignStatus, "info" | "success" | "default"> = { sending: "info", done: "success", cancelled: "default" };
const FILTER_ORDER: Filter[] = ["all", "sending", "done", "cancelled"];
const FILTER_LABEL: Record<Filter, string> = { all: "All", sending: "Sending", done: "Done", cancelled: "Cancelled" };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]}`;
}

export function Campaigns() {
  const { c } = useTheme();
  const { authed } = useOperator();
  const [rows, setRows] = useState<CampaignRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      const res = await authed<CampaignRow[]>("/admin/campaigns");
      setRows(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load campaigns");
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
    const base: Record<Filter, number> = { all: list.length, sending: 0, done: 0, cancelled: 0 };
    for (const r of list) base[r.status]++;
    return base;
  }, [rows]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const sent = list.reduce((s, r) => s + r.sentCount, 0);
    const failed = list.reduce((s, r) => s + r.failedCount, 0);
    const attempted = sent + failed;
    return { sent, failed, delivery: attempted > 0 ? Math.round((sent / attempted) * 100) : null };
  }, [rows]);

  const filtered = useMemo(
    () =>
      (filter === "all" ? rows ?? [] : (rows ?? []).filter((r) => r.status === filter))
        .slice()
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [rows, filter],
  );

  if (error) return <StateBlock kind="error" message={error} />;
  if (!rows) return <StateBlock kind="loading" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ padding: 14, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
    >
      {/* KPI rail — cumulative sent / failed / delivery rate. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <StatTile label="Campaigns" value={counts.all} />
        <StatTile label="Sent" value={stats.sent} tone={stats.sent > 0 ? "ok" : undefined} />
        <StatTile label="Failed" value={stats.failed} tone={stats.failed > 0 ? "bad" : undefined} />
        <StatTile label="Delivery" value={stats.delivery != null ? `${stats.delivery}%` : "—"} />
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

      {filtered.length === 0 ? (
        <StateBlock kind="empty" message="No campaigns in this filter." />
      ) : (
        filtered.map((r) => {
          const tone = STATUS_TONE[r.status];
          const color = tone === "success" ? c.success : tone === "info" ? c.accent : c.textSecondary;
          const total = Math.max(1, r.total);
          const sentPct = Math.min(1, r.sentCount / total);
          const failPct = Math.min(1 - sentPct, r.failedCount / total);
          return (
            <Card key={r.id}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>{r.template}</Text>
                  <Muted style={{ marginTop: 2, fontSize: 12 }}>
                    {r.audienceLabel}  ·  {fmtDate(r.createdAt)}
                  </Muted>
                </View>
                <StatusBadge label={STATUS_LABEL[r.status]} color={color} />
              </View>

              {/* Send-progress bar: green sent, red failed, remainder pending. */}
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line, marginTop: 12, overflow: "hidden", flexDirection: "row" }}>
                <View style={{ width: `${sentPct * 100}%`, height: "100%", backgroundColor: c.success }} />
                <View style={{ width: `${failPct * 100}%`, height: "100%", backgroundColor: c.danger }} />
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                  <Text style={{ color: c.success, fontWeight: "700" }}>{r.sentCount}</Text> sent
                  {r.failedCount > 0 ? (
                    <>
                      {"  ·  "}
                      <Text style={{ color: c.danger, fontWeight: "700" }}>{r.failedCount}</Text> failed
                    </>
                  ) : null}
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 12, fontVariant: ["tabular-nums"] }}>of {r.total}</Text>
              </View>
            </Card>
          );
        })
      )}

      <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: "center", marginTop: 2 }}>
        {counts.all} campaign{counts.all === 1 ? "" : "s"} · live
      </Text>
    </ScrollView>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: c.surface,
        borderColor: color,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 999,
        paddingVertical: 4,
        paddingHorizontal: 10,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
