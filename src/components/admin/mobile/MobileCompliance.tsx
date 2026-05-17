"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, ShieldCheck } from "lucide-react";
import { COMPLIANCE_KIND_LABELS, type ComplianceItem } from "@/data/types";
import { useAdminLocation } from "../v2/LocationContext";
import {
  Chip,
  ChipStrip,
  MobileList,
  MobilePage,
  PageHeader,
  PullToRefresh,
  type MobileListItem,
} from "../v2/mobile";

function daysUntil(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
}

type Filter = "all" | "soon" | "expired" | "ok";

/** Mobile compliance checklist. Tap → opens existing renewal form on desktop later. */
export function MobileCompliance() {
  const { location } = useAdminLocation();
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = async () => {
    const qs = location ? `?location=${encodeURIComponent(location)}` : "";
    const r = await fetch(`/api/admin/compliance${qs}`);
    if (!r.ok) return;
    const data = await r.json();
    setItems(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const d = daysUntil(it.expiresAt);
      if (filter === "expired") return d < 0;
      if (filter === "soon") return d >= 0 && d <= 30;
      if (filter === "ok") return d > 30;
      return true;
    }).sort((a, b) => daysUntil(a.expiresAt) - daysUntil(b.expiresAt));
  }, [items, filter]);

  const counts = useMemo(() => {
    const m = { all: items.length, expired: 0, soon: 0, ok: 0 };
    for (const it of items) {
      const d = daysUntil(it.expiresAt);
      if (d < 0) m.expired++;
      else if (d <= 30) m.soon++;
      else m.ok++;
    }
    return m;
  }, [items]);

  const rows: MobileListItem<ComplianceItem>[] = filtered.map((it) => {
    const d = daysUntil(it.expiresAt);
    const tone: "success" | "warning" | "danger" =
      d < 0 ? "danger" : d <= 30 ? "warning" : "success";
    return {
      id: it.id,
      data: it,
      icon: d < 0 ? CalendarCheck2 : ShieldCheck,
      iconTone: tone,
      title: it.title,
      subtitle: `${COMPLIANCE_KIND_LABELS[it.kind] ?? it.kind} · ${it.locationSlug}`,
      trailing: new Date(it.expiresAt).toLocaleDateString([], { month: "short", day: "numeric" }),
      status: {
        label: d < 0 ? `Expired ${Math.abs(d)}d` : `${d}d`,
        tone,
      },
    };
  });

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <ChipStrip ariaLabel="Filter">
            <Chip label="All" count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
            <Chip label="Expired" count={counts.expired} active={filter === "expired"} onClick={() => setFilter("expired")} />
            <Chip label="Soon (≤30d)" count={counts.soon} active={filter === "soon"} onClick={() => setFilter("soon")} />
            <Chip label="OK" count={counts.ok} active={filter === "ok"} onClick={() => setFilter("ok")} />
          </ChipStrip>
        }
      >
        <PageHeader title="Compliance" subtitle={`${filtered.length} item${filtered.length === 1 ? "" : "s"}`} />
        <MobileList items={rows} />
      </MobilePage>
    </PullToRefresh>
  );
}
