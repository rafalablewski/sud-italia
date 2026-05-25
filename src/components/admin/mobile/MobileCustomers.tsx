"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, User } from "lucide-react";
import { useAdminLocation } from "../v2/LocationContext";
import {
  Chip,
  ChipStrip,
  MobilePage,
  MobileList,
  PageHeader,
  PullToRefresh,
  type MobileListItem,
} from "../v2/mobile";
import { MobileListSkeleton } from "../v2/mobile/Skeleton";
import { useActionTiming } from "../v2/mobile/useActionTiming";

interface CustomerSummary {
  phone: string;
  name: string;
  email?: string;
  totalSpent: number;
  orderCount: number;
  lastOrderAt?: string;
  firstOrderAt?: string;
  avgOrderValue: number;
  status: "new" | "active" | "repeat" | "lapsed";
  lifetimePoints: number;
}

type Filter = "all" | "active" | "repeat" | "lapsed";

const FILTER_MATCH: Record<Filter, (c: CustomerSummary) => boolean> = {
  all: () => true,
  active: (c) => c.status === "active",
  repeat: (c) => c.status === "repeat",
  lapsed: (c) => c.status === "lapsed",
};

const STATUS_TONE: Record<CustomerSummary["status"], "brand" | "info" | "success" | "warning" | "danger" | "neutral"> = {
  new: "info",
  active: "success",
  repeat: "brand",
  lapsed: "warning",
};

const STATUS_LABEL: Record<CustomerSummary["status"], string> = {
  new: "New",
  active: "Active",
  repeat: "Repeat",
  lapsed: "Lapsed",
};

function fmtCurrency(grosze: number): string {
  return `${Math.round(grosze / 100).toLocaleString("pl-PL")} zł`;
}

function relTime(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const d = Math.round(diff / (1000 * 60 * 60 * 24));
  if (d < 1) return "today";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}

/**
 * Mobile customers ledger. Virtualized via MobileList (any > 100 rows
 * windows automatically). Tap a row → detail at `/admin/customers/[phone]`,
 * which falls through to the existing AdminCustomerDetail component on
 * the desktop side (~633 LOC — still functional on mobile, just dense).
 * A dedicated mobile detail screen is in next-steps.
 */
export function MobileCustomers() {
  const router = useRouter();
  const { location } = useAdminLocation();
  const timing = useActionTiming();
  const [rows, setRows] = useState<CustomerSummary[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  // Time-to-customer-lookup span — starts when the page mounts, ends
  // when the operator either taps into a row or types ≥ 2 chars into
  // the search box. Either signal counts as "found what I was looking for".
  useEffect(() => {
    timing.start("customers.lookup");
    return () => {
      timing.stop("customers.lookup", { committed: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (q.trim().length >= 2) {
      timing.stop("customers.lookup", { committed: true, via: "search" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/admin/customers${location ? `?location=${encodeURIComponent(location)}` : ""}`,
      );
      if (!r.ok) return;
      const data = (await r.json()) as CustomerSummary[];
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((c) => FILTER_MATCH[filter](c))
      .filter((c) => {
        if (!needle) return true;
        return (
          c.name.toLowerCase().includes(needle) ||
          c.phone.toLowerCase().includes(needle) ||
          (c.email ?? "").toLowerCase().includes(needle)
        );
      });
  }, [rows, filter, q]);

  const counts = useMemo(() => {
    const m: Record<Filter, number> = { all: rows.length, active: 0, repeat: 0, lapsed: 0 };
    for (const c of rows) {
      if (c.status === "active") m.active++;
      else if (c.status === "repeat") m.repeat++;
      else if (c.status === "lapsed") m.lapsed++;
    }
    return m;
  }, [rows]);

  const items: MobileListItem<CustomerSummary>[] = filtered.map((c) => ({
    id: c.phone,
    data: c,
    icon: User,
    iconTone: STATUS_TONE[c.status],
    title: c.name || c.phone,
    subtitle: `${c.orderCount} order${c.orderCount === 1 ? "" : "s"} · ${relTime(c.lastOrderAt)}`,
    trailing: fmtCurrency(c.totalSpent),
    status: { label: STATUS_LABEL[c.status], tone: STATUS_TONE[c.status] },
    onTap: (row) => {
      timing.stop("customers.lookup", { committed: true, via: "tap" });
      router.push(`/admin/customers/${encodeURIComponent(row.phone)}`);
    },
  }));

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ChipStrip ariaLabel="Customer filter">
              <Chip label="All" active={filter === "all"} count={counts.all} onClick={() => setFilter("all")} />
              <Chip label="Active" active={filter === "active"} count={counts.active} onClick={() => setFilter("active")} />
              <Chip label="Repeat" active={filter === "repeat"} count={counts.repeat} onClick={() => setFilter("repeat")} />
              <Chip label="Lapsed" active={filter === "lapsed"} count={counts.lapsed} onClick={() => setFilter("lapsed")} />
            </ChipStrip>
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
                placeholder="Search name, phone, email…"
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
          </div>
        }
      >
        <PageHeader
          title="Customers"
          subtitle={loading ? "Loading…" : `${filtered.length} of ${rows.length}`}
        />

        {loading && rows.length === 0 ? (
          <MobileListSkeleton rows={6} />
        ) : (
          <MobileList
            items={items}
            virtualizeAt={64}
            empty={
              <div className="v2-m-empty">
                <User className="h-6 w-6" aria-hidden />
                <div className="v2-m-empty-title">No customers</div>
                <div className="v2-m-empty-desc">
                  Nothing matches this filter.
                </div>
              </div>
            }
          />
        )}
      </MobilePage>
    </PullToRefresh>
  );
}
