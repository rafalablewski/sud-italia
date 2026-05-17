"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, UserCog } from "lucide-react";
import type { AdminRole, AdminUser } from "@/data/types";
import {
  Chip,
  ChipStrip,
  MobileList,
  MobilePage,
  PageHeader,
  PullToRefresh,
  type MobileListItem,
} from "../v2/mobile";

const ROLE_TONE: Record<AdminRole, "brand" | "info" | "success" | "warning" | "neutral"> = {
  owner: "brand",
  franchisee: "warning",
  manager: "info",
  staff: "success",
  kitchen: "neutral",
};

type Filter = "all" | AdminRole;

/** Mobile users & roles directory — read only on phone; edit on desktop. */
export function MobileUsers() {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = async () => {
    const r = await fetch("/api/admin/users");
    if (!r.ok) return;
    const data = await r.json();
    setRows(Array.isArray(data) ? data : []);
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((u) => u.role === filter)),
    [rows, filter],
  );

  const items: MobileListItem<AdminUser>[] = filtered.map((u) => ({
    id: u.id,
    data: u,
    icon: u.role === "owner" ? ShieldCheck : UserCog,
    iconTone: ROLE_TONE[u.role],
    title: u.name,
    subtitle: `${u.email ?? "—"}${u.locationSlug ? ` · ${u.locationSlug}` : ""}`,
    status: { label: u.role, tone: ROLE_TONE[u.role] },
  }));

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <ChipStrip ariaLabel="Filter by role">
            <Chip label="All" count={rows.length} active={filter === "all"} onClick={() => setFilter("all")} />
            {(["owner", "franchisee", "manager", "staff", "kitchen"] as AdminRole[]).map((r) => {
              const c = rows.filter((u) => u.role === r).length;
              if (c === 0) return null;
              return <Chip key={r} label={r} count={c} active={filter === r} onClick={() => setFilter(r)} />;
            })}
          </ChipStrip>
        }
      >
        <PageHeader title="Users & roles" subtitle={`${filtered.length} of ${rows.length}`} />
        <MobileList items={items} />
      </MobilePage>
    </PullToRefresh>
  );
}
