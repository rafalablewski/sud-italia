"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Phone, Search } from "lucide-react";
import {
  MobileList,
  MobilePage,
  PageHeader,
  PullToRefresh,
  type MobileListItem,
} from "../v2/mobile";

interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  leadTimeDays?: number;
}

/** Mobile suppliers — read-mostly directory; tap → call/email. */
export function MobileSuppliers() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [q, setQ] = useState("");

  const refresh = async () => {
    const r = await fetch("/api/admin/suppliers");
    if (!r.ok) return;
    const data = await r.json();
    setRows(Array.isArray(data) ? data : []);
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.contactName ?? "").toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const items: MobileListItem<Supplier>[] = filtered.map((s) => ({
    id: s.id,
    data: s,
    icon: Building2,
    iconTone: "info",
    title: s.name,
    subtitle:
      [s.contactName, s.phone, s.leadTimeDays ? `${s.leadTimeDays}d lead` : ""]
        .filter(Boolean)
        .join(" · ") || "—",
    trailing: s.phone ? <Phone className="h-4 w-4" aria-hidden /> : undefined,
    onTap: (row) => {
      if (row.phone) window.location.href = `tel:${row.phone}`;
    },
  }));

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              color: "var(--fg-subtle)",
            }}
          >
            <Search className="h-4 w-4" aria-hidden />
            <input
              type="search"
              inputMode="search"
              placeholder="Search suppliers…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{
                flex: 1,
                background: "transparent",
                border: 0,
                outline: 0,
                color: "var(--fg)",
                fontSize: 16,
                fontFamily: "var(--font-ui)",
              }}
            />
          </label>
        }
      >
        <PageHeader title="Suppliers" subtitle={`${filtered.length} total`} />
        <MobileList items={items} />
      </MobilePage>
    </PullToRefresh>
  );
}
