"use client";

import Link from "next/link";
import { useAdminBase } from "./v2/useAdminBase";
import { withAdminBase } from "@/lib/admin-base";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  Cake,
  Coffee,
  Frown,
  PartyPopper,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { useAdminLocation } from "./v2/LocationContext";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  PageHero,
  Tabs,
  Table,
  type Column,
} from "./v2/ui";
import { KpiCard } from "./v2/charts";

interface TriggerRow {
  phone: string;
  name: string;
  email?: string;
  trigger: "birthday" | "anniversary";
  years: number;
}

interface CustomerSummary {
  phone: string;
  name: string;
  email?: string;
  totalSpent: number;
  orderCount: number;
  lastOrderAt?: string;
  firstOrderAt?: string;
  avgOrderValue: number;
  locations: string[];
  channels: string[];
  status: "new" | "active" | "repeat" | "lapsed";
  lifetimePoints: number;
}

type StatusFilter = "all" | CustomerSummary["status"];

const STATUS_TONE: Record<CustomerSummary["status"], "warning" | "info" | "success" | "danger"> = {
  new: "warning",
  active: "info",
  repeat: "success",
  lapsed: "danger",
};

const STATUS_LABEL: Record<CustomerSummary["status"], string> = {
  new: "New",
  active: "Active",
  repeat: "Repeat",
  lapsed: "Lapsed",
};

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function AdminCustomers() {
  return <AdminCustomersDesktop />;
}

function AdminCustomersDesktop() {
  const base = useAdminBase();
  const { location } = useAdminLocation();
  const [list, setList] = useState<CustomerSummary[]>([]);
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [members, trig] = await Promise.all([
        fetch("/api/admin/customers").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/campaigns/triggers").then((r) => (r.ok ? r.json() : null)),
      ]);
      if (Array.isArray(members)) setList(members);
      if (trig && Array.isArray(trig.triggers)) setTriggers(trig.triggers);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((c) => {
      if (location && !c.locations.includes(location) && c.locations.length > 0) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [list, query, statusFilter, location]);

  const counts = useMemo(() => {
    const c = { all: list.length, new: 0, active: 0, repeat: 0, lapsed: 0 };
    for (const x of list) c[x.status]++;
    return c;
  }, [list]);

  const totals = useMemo(() => {
    const spent = list.reduce((acc, c) => acc + c.totalSpent, 0);
    const orders = list.reduce((acc, c) => acc + c.orderCount, 0);
    const aov = orders > 0 ? Math.round(spent / orders) : 0;
    return { spent, orders, aov };
  }, [list]);

  const cols: Column<CustomerSummary>[] = [
    {
      key: "name",
      header: "Customer",
      cell: (c) => (
        <Link href={`${withAdminBase(base, "/admin/customers")}/${encodeURIComponent(c.phone)}`} className="v2-link-cell">
          <div className="v2-cell-stack">
            <span>{c.name}</span>
            <span className="v2-cell-sub mono">{c.phone}</span>
          </div>
        </Link>
      ),
      sortValue: (c) => c.name,
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => (
        <Badge tone={STATUS_TONE[c.status]} variant="soft" dot>
          {STATUS_LABEL[c.status]}
        </Badge>
      ),
      sortValue: (c) => c.status,
    },
    {
      key: "orders",
      header: "Orders",
      align: "right",
      cell: (c) => c.orderCount.toLocaleString(),
      sortValue: (c) => c.orderCount,
    },
    {
      key: "spent",
      header: "Lifetime spend",
      align: "right",
      cell: (c) => formatPrice(c.totalSpent),
      sortValue: (c) => c.totalSpent,
    },
    {
      key: "aov",
      header: "AOV",
      align: "right",
      cell: (c) => formatPrice(c.avgOrderValue),
      sortValue: (c) => c.avgOrderValue,
    },
    {
      key: "points",
      header: "Points",
      align: "right",
      cell: (c) => c.lifetimePoints.toLocaleString(),
      sortValue: (c) => c.lifetimePoints,
    },
    {
      key: "last",
      header: "Last order",
      cell: (c) => <span className="v2-muted">{fmtDate(c.lastOrderAt)}</span>,
      sortValue: (c) => c.lastOrderAt ?? "",
    },
    {
      key: "locations",
      header: "Locations",
      cell: (c) =>
        c.locations.length === 0 ? (
          <span className="v2-muted">—</span>
        ) : (
          <span className="v2-inline">
            {c.locations.map((l) => (
              <Badge key={l} tone="neutral" variant="outline">
                {l}
              </Badge>
            ))}
          </span>
        ),
    },
  ];

  return (
    <div className="v2-page">
      <PageHero
        title="Customers"
        subtitle="Every customer who paid, ranked by lifetime spend. RFM-style status calculated from order recency + frequency."
      />

      <section className="v2-kpi-grid">
        <KpiCard
          label="Customers"
          value={list.length}
          icon={Users}
          tone="info"
          hint={`${counts.repeat} repeat`}
        />
        <KpiCard
          label="Active (30d)"
          value={counts.active + counts.repeat}
          icon={Sparkles}
          tone="success"
        />
        <KpiCard
          label="Lapsed (>90d)"
          value={counts.lapsed}
          icon={Frown}
          tone="danger"
          higherIsBetter={false}
        />
        <KpiCard
          label="Lifetime revenue"
          value={totals.spent / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Award}
          tone="brand"
          hint={`${totals.orders} orders · ${formatPrice(totals.aov)} AOV`}
        />
      </section>

      {triggers.length > 0 && (
        <Card>
          <CardHeader
            title="Send today"
            description="Customers with a birthday or first-order anniversary today. Tap to call them on the spot."
          />
          <CardBody>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              {triggers.map((t) => (
                <li
                  key={`${t.phone}-${t.trigger}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", fontSize: "0.875rem" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {t.trigger === "birthday" ? (
                      <Cake className="h-3.5 w-3.5" style={{ color: "var(--brand)" }} />
                    ) : (
                      <PartyPopper className="h-3.5 w-3.5" style={{ color: "var(--warning)" }} />
                    )}
                    <Link href={`${withAdminBase(base, "/admin/customers")}/${encodeURIComponent(t.phone)}`} className="v2-link-cell">
                      {t.name || "Customer"}
                    </Link>
                    <span className="v2-muted mono">{t.phone}</span>
                  </span>
                  <span className="v2-muted">
                    {t.trigger === "birthday" ? `birthday · turning ${t.years}` : `${t.years}-yr anniversary`}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="v2-filters">
        <div className="v2-filter-search">
          <Input
            placeholder="Search by name, phone, or email…"
            leadingAdornment={<Search className="h-3.5 w-3.5" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Tabs
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          tabs={[
            { value: "all", label: "All", count: counts.all },
            { value: "active", label: "Active", count: counts.active },
            { value: "repeat", label: "Repeat", count: counts.repeat },
            { value: "new", label: "New", count: counts.new },
            { value: "lapsed", label: "Lapsed", count: counts.lapsed },
          ]}
          variant="pill"
          ariaLabel="Customer status"
        />
      </div>

      {loading ? (
        <div className="v2-page-loading">Loading Customers…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Coffee}
              title={list.length === 0 ? "No customers yet" : "No matches"}
              description={
                list.length === 0
                  ? "Customer profiles populate as orders are placed."
                  : "Try clearing the filters."
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card padding="none">
          <Table flush rows={filtered} columns={cols} rowKey={(c) => c.phone} defaultSort={{ key: "spent", dir: "desc" }} />
        </Card>
      )}

    </div>
  );
}
