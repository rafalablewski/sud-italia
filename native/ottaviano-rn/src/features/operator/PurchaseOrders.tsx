import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import { formatMoney } from "@/lib/format";
import { Card, Muted, Pill, StateBlock, StatTile } from "@/components/ui";

/**
 * Purchase orders — bespoke faithful mirror of the web `PurchaseOrdersV3`
 * (`src/admin-v3/PurchaseOrdersV3.tsx`), replacing the generic `DataSurface`
 * list. Same KPI rail (on-order value · awaiting · received), the same status
 * taxonomy (draft/sent/received/cancelled) with a filter-chip bar carrying live
 * counts, and the same badge tones. Every figure is a real field off
 * `GET /api/v1/admin/purchase-orders` (Rule #1) — the facade already resolves the
 * supplier name and the line count and returns POs newest-first, role-scoped.
 * Pull to refresh. (Status advance stays on the web / a later write wave — this
 * screen is the read/parity upgrade.)
 */

type POStatus = "draft" | "sent" | "received" | "cancelled";
type Filter = "all" | POStatus;

interface PORow {
  id: string;
  supplierId: string;
  supplierName: string;
  locationSlug: string;
  status: POStatus;
  lineCount: number;
  totalCents: number;
  expectedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
}

const SITE_LABEL: Record<string, string> = { krakow: "Kraków", warszawa: "Warszawa" };
const STATUS_LABEL: Record<POStatus, string> = { draft: "Draft", sent: "Sent", received: "Received", cancelled: "Cancelled" };
// Web STATUS_TONE: draft=warn, sent=info, received=ok, cancelled=neutral.
const STATUS_TONE: Record<POStatus, "warning" | "info" | "success" | "default"> = {
  draft: "warning",
  sent: "info",
  received: "success",
  cancelled: "default",
};
const FILTER_ORDER: Filter[] = ["all", "draft", "sent", "received", "cancelled"];
const FILTER_LABEL: Record<Filter, string> = { all: "All", draft: "Draft", sent: "Sent", received: "Received", cancelled: "Cancelled" };

function siteOf(slug: string): string {
  return SITE_LABEL[slug] ?? slug;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${day} ${mon}`;
}

export function PurchaseOrders() {
  const { c } = useTheme();
  const { authed } = useOperator();
  const [rows, setRows] = useState<PORow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      const res = await authed<PORow[]>("/admin/purchase-orders");
      setRows(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load purchase orders");
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

  // Chip counts + KPI stats mirror the web: on-order is the value of open POs
  // (draft or sent), awaiting is the sent count, received is the received count.
  const counts = useMemo<Record<Filter, number>>(() => {
    const list = rows ?? [];
    const base: Record<Filter, number> = { all: list.length, draft: 0, sent: 0, received: 0, cancelled: 0 };
    for (const o of list) base[o.status]++;
    return base;
  }, [rows]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const open = list.filter((o) => o.status === "draft" || o.status === "sent");
    return {
      onOrder: open.reduce((s, o) => s + o.totalCents, 0),
      awaiting: counts.sent,
      received: counts.received,
    };
  }, [rows, counts]);

  const filtered = useMemo(
    () => (filter === "all" ? rows ?? [] : (rows ?? []).filter((o) => o.status === filter)),
    [rows, filter],
  );

  if (error) return <StateBlock kind="error" message={error} />;
  if (!rows) return <StateBlock kind="loading" />;

  const showSite = new Set(rows.map((r) => r.locationSlug)).size > 1;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ padding: 14, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
    >
      {/* KPI rail — on-order value, awaiting, received (web parity). */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatTile label="On order" value={formatMoney(stats.onOrder)} />
        <StatTile label="Awaiting" value={stats.awaiting} tone={stats.awaiting > 0 ? "warn" : undefined} />
        <StatTile label="Received" value={stats.received} tone="ok" />
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
        <StateBlock kind="empty" message="No purchase orders in this filter." />
      ) : (
        filtered.map((o) => {
          const tone = STATUS_TONE[o.status];
          const color = tone === "success" ? c.success : tone === "warning" ? c.warning : tone === "info" ? c.accent : c.textSecondary;
          return (
            <Card key={o.id}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 15 }}>{o.supplierName}</Text>
                  <Muted style={{ marginTop: 2, fontSize: 12 }}>
                    {o.lineCount} line{o.lineCount === 1 ? "" : "s"}
                    {showSite ? `  ·  ${siteOf(o.locationSlug)}` : ""}
                  </Muted>
                </View>
                <StatusBadge label={STATUS_LABEL[o.status]} color={color} />
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 12 }}>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                  {o.status === "received" ? `Received ${fmtDate(o.receivedAt)}` : o.expectedAt ? `Expected ${fmtDate(o.expectedAt)}` : `Raised ${fmtDate(o.createdAt)}`}
                </Text>
                <Text style={{ color: c.textPrimary, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                  {formatMoney(o.totalCents)}
                </Text>
              </View>
            </Card>
          );
        })
      )}

      <Text style={{ color: c.textSecondary, fontSize: 12, textAlign: "center", marginTop: 2 }}>
        {filtered.length} of {rows.length} order{rows.length === 1 ? "" : "s"} · live
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
