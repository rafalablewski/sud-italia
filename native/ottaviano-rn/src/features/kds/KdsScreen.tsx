import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { useOperator } from "@/auth/OperatorSession";
import type { OrderDTO } from "@/api/types";
import { fmtClock } from "@/lib/format";
import { Pill, StatTile, StateBlock } from "@/components/ui";
import { TicketCard } from "./TicketCard";
import { Fleet } from "./Fleet";
import { EightySixSheet } from "./EightySixSheet";
import { useOrdersStream } from "./useOrdersStream";
import { KDS_COLUMNS, MENU_CATEGORY_LABELS, groupByColumn, isAtRisk, isLate, nextStatus, paidAtMs } from "./kdsLogic";

type KdsView = "fleet" | "floor" | "chef";

/**
 * Core · Kitchen Display — the always-dark kitchen wall, wired to the live order
 * stream. Floor (New → Firing → Ready·Expo lanes) + Chef (station make-queue) run
 * off the same engine as the web `/core/kds`: useOrdersStream → groupByColumn,
 * bump via `PATCH /api/v1/orders/:id`, recall via `…/recall`, 86 via
 * `PATCH /api/v1/admin/menu`. Fleet (owner) pulls `/api/v1/admin/kds/fleet`.
 * 1:1 with src/core/kds/CoreKds.tsx.
 */
export function KdsScreen() {
  const { c } = useTheme();
  const { role, authed } = useOperator();
  const isOwner = role === "owner";
  const { width } = useWindowDimensions();
  const wideLanes = width >= 720; // iPad → 3 lanes side by side; phone → stacked

  const [view, setView] = useState<KdsView>(isOwner ? "fleet" : "floor");
  const [station, setStation] = useState<string>("all");
  const [lane, setLane] = useState<string>("all");
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showAllDay, setShowAllDay] = useState(false);
  const [eightySixOpen, setEightySixOpen] = useState(false);
  const [recalls, setRecalls] = useState<{ orderId: string; label: string; at: number }[]>([]);

  const { orders, connected, error, refresh, patchOrder } = useOrdersStream({ paused });

  // Shared 1 s kitchen clock for the card countdowns + age KPIs.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const byColumn = useMemo(() => groupByColumn(orders, station), [orders, station]);
  const allTickets = useMemo(() => KDS_COLUMNS.flatMap((col) => byColumn.get(col.id) ?? []), [byColumn]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: allTickets.length };
    for (const col of KDS_COLUMNS) out[col.id] = (byColumn.get(col.id) ?? []).length;
    out.risk = allTickets.filter(isAtRisk).length;
    out.late = allTickets.filter((t) => isLate(t, now)).length;
    return out;
  }, [byColumn, allTickets, now]);

  const ageStats = useMemo(() => {
    const ages = allTickets.filter((t) => t.status !== "ready").map((t) => Math.max(0, (now - paidAtMs(t)) / 1000));
    if (ages.length === 0) return { oldest: 0, avg: 0 };
    return { oldest: Math.max(...ages), avg: ages.reduce((a, b) => a + b, 0) / ages.length };
  }, [allTickets, now]);

  const allDay = useMemo(() => {
    const agg = new Map<string, { name: string; qty: number; tickets: number }>();
    for (const t of allTickets) {
      if (t.status === "ready") continue;
      for (const it of t.items) {
        const cur = agg.get(it.name) ?? { name: it.name, qty: 0, tickets: 0 };
        cur.qty += it.quantity;
        cur.tickets += 1;
        agg.set(it.name, cur);
      }
    }
    return [...agg.values()].sort((a, b) => b.qty - a.qty);
  }, [allTickets]);

  const stationsPresent = useMemo(() => {
    const present = new Set<string>();
    for (const t of allTickets) for (const it of t.items) present.add(it.category);
    return ["all", ...["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"].filter((s) => present.has(s))];
  }, [allTickets]);

  const advance = useCallback(
    async (t: OrderDTO) => {
      const next = nextStatus(t.status);
      if (!next || updatingId) return;
      setUpdatingId(t.id);
      patchOrder(t.id, { status: next }); // optimistic + pinned
      try {
        await authed(`/orders/${encodeURIComponent(t.id)}`, { method: "PATCH", body: { status: next }, idempotencyKey: `bump-${t.id}-${next}` });
        if (next === "completed") {
          setRecalls((r) => [{ orderId: t.id, label: `#${t.shortId}`, at: Date.now() }, ...r].slice(0, 5));
        }
        await refresh();
      } catch {
        patchOrder(t.id, { status: t.status }); // roll back
      } finally {
        setUpdatingId(null);
      }
    },
    [updatingId, authed, refresh, patchOrder],
  );

  const recall = useCallback(
    async (orderId: string) => {
      try {
        await authed(`/orders/${encodeURIComponent(orderId)}/recall`, { method: "POST" });
        patchOrder(orderId, { status: "ready" });
        setRecalls((r) => r.filter((x) => x.orderId !== orderId));
        await refresh();
      } catch {
        /* recall window may have elapsed — non-fatal */
      }
    },
    [authed, refresh, patchOrder],
  );
  useEffect(() => {
    if (recalls.length === 0) return;
    const id = setInterval(() => setRecalls((r) => r.filter((x) => Date.now() - x.at < 10 * 60 * 1000)), 30000);
    return () => clearInterval(id);
  }, [recalls.length]);

  const kdsLocation = orders[0]?.locationSlug ?? "krakow";

  const renderTicket = (t: OrderDTO) => (
    <TicketCard key={t.id} t={t} station={station} now={now} updating={updatingId === t.id} onAdvance={advance} />
  );

  if (view === "fleet") {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface }}>
        <Header view={view} setView={setView} isOwner={isOwner} connected={connected} />
        <Fleet />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <Header view={view} setView={setView} isOwner={isOwner} connected={connected} />

      {/* control row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
        <Pill label={`All ${counts.all}`} active={lane === "all"} onPress={() => setLane("all")} />
        {KDS_COLUMNS.map((col) => (
          <Pill key={col.id} label={`${col.label.split(" ")[0]} ${counts[col.id]}`} active={lane === col.id} onPress={() => setLane(col.id)} />
        ))}
        <View style={{ width: 8 }} />
        {recalls.length > 0 && (
          <Pill label={`↩ Undo${recalls.length > 1 ? ` ·${recalls.length}` : ""}`} tone="warning" onPress={() => recall(recalls[0].orderId)} />
        )}
        <Pill label="Σ All-day" active={showAllDay} onPress={() => setShowAllDay((v) => !v)} />
        <Pill label="86" onPress={() => setEightySixOpen(true)} />
        <Pill label="⟳" onPress={() => refresh()} />
        <Pill label={paused ? "▶ Resume" : "❚❚ Pause"} active={paused} onPress={() => setPaused((p) => !p)} />
      </ScrollView>

      {error && orders.length === 0 ? (
        <StateBlock kind="error" message={error} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 40 }}>
          {/* KPI band */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <StatTile label="Open" value={counts.all} />
            <StatTile label="New" value={counts.confirmed} />
            <StatTile label="Firing" value={counts.preparing} tone="ok" />
            <StatTile label="Ready" value={counts.ready} tone="ok" />
            <StatTile label="At risk" value={counts.risk} tone={counts.risk ? "warn" : undefined} />
            <StatTile label="Late" value={counts.late} tone={counts.late ? "bad" : undefined} />
            <StatTile label="Oldest" value={ageStats.oldest ? fmtClock(ageStats.oldest) : "—"} tone={ageStats.oldest >= 600 ? "bad" : undefined} />
            <StatTile label="Avg age" value={ageStats.avg ? fmtClock(ageStats.avg) : "—"} />
          </View>

          {/* station strip */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {stationsPresent.map((s) => (
              <Pill key={s} label={s === "all" ? "All stations" : MENU_CATEGORY_LABELS[s]} active={station === s} onPress={() => setStation(s)} />
            ))}
          </ScrollView>

          {/* all-day batch rail */}
          {showAllDay && (
            <View style={{ backgroundColor: c.surface2, borderRadius: 12, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, padding: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Text style={{ color: c.textSecondary, fontWeight: "800", textTransform: "uppercase", fontSize: 11 }}>All-day</Text>
              {allDay.length === 0 ? (
                <Text style={{ color: c.textSecondary }}>Nothing on the line.</Text>
              ) : (
                allDay.map((d) => (
                  <Text key={d.name} style={{ color: c.textPrimary, fontSize: 13 }}>
                    <Text style={{ fontWeight: "800", color: c.accent }}>{d.qty} </Text>
                    {d.name} <Text style={{ color: c.textSecondary }}>·{d.tickets}</Text>
                  </Text>
                ))
              )}
            </View>
          )}

          {/* board */}
          {view === "chef" || lane !== "all" ? (
            <View style={{ gap: 12 }}>
              {(lane === "all" ? allTickets : byColumn.get(lane as OrderDTO["status"]) ?? []).length === 0 ? (
                <StateBlock kind="empty" message="No active tickets." />
              ) : (
                (lane === "all" ? allTickets : byColumn.get(lane as OrderDTO["status"]) ?? []).map(renderTicket)
              )}
            </View>
          ) : wideLanes ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              {KDS_COLUMNS.map((col) => {
                const ts = byColumn.get(col.id) ?? [];
                return (
                  <View key={col.id} style={{ flex: 1, gap: 10 }}>
                    <LaneHeader label={col.label} count={ts.length} />
                    {ts.length === 0 ? <Text style={{ color: c.textSecondary, textAlign: "center" }}>—</Text> : ts.map(renderTicket)}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={{ gap: 16 }}>
              {KDS_COLUMNS.map((col) => {
                const ts = byColumn.get(col.id) ?? [];
                return (
                  <View key={col.id} style={{ gap: 10 }}>
                    <LaneHeader label={col.label} count={ts.length} />
                    {ts.length === 0 ? <Text style={{ color: c.textSecondary, textAlign: "center" }}>—</Text> : ts.map(renderTicket)}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      <EightySixSheet location={kdsLocation} open={eightySixOpen} onClose={() => setEightySixOpen(false)} />
    </View>
  );

  function LaneHeader({ label, count }: { label: string; count: number }) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: c.accent, paddingBottom: 4 }}>
        <Text style={{ color: c.textPrimary, fontWeight: "800", fontSize: 14 }}>{label}</Text>
        <Text style={{ color: c.textSecondary, fontWeight: "700" }}>{count}</Text>
      </View>
    );
  }
}

function Header({
  view,
  setView,
  isOwner,
  connected,
}: {
  view: KdsView;
  setView: (v: KdsView) => void;
  isOwner: boolean;
  connected: boolean;
}) {
  const { c } = useTheme();
  const tabs: { key: KdsView; label: string }[] = [
    ...(isOwner ? [{ key: "fleet" as View, label: "Fleet" }] : []),
    { key: "floor" as KdsView, label: "Floor" },
    { key: "chef", label: "Chef" },
  ];
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 8, flex: 1 }}>
        {tabs.map((t) => (
          <Pressable key={t.key} onPress={() => setView(t.key)}>
            <Text style={{ color: view === t.key ? c.accent : c.textSecondary, fontWeight: "800", fontSize: 16 }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: connected ? c.success : c.textSecondary }} />
        <Text style={{ color: c.textSecondary, fontSize: 11 }}>{connected ? "Live" : "…"}</Text>
      </View>
    </View>
  );
}
