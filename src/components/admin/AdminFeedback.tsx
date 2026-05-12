"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Frown,
  MapPin,
  MessageSquare,
  Search,
  Smile,
  Star,
} from "lucide-react";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Tabs,
  Table,
  type Column,
} from "./v2/ui";
import { BarChart, KpiCard, PieChart } from "./v2/charts";

interface FeedbackEntry {
  id: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  locationSlug: string;
  date: string;
  overallRating: number;
  categoryRatings: Record<string, number>;
  comment: string;
  status: "new" | "reviewed" | "responded";
}

type StatusFilter = "all" | FeedbackEntry["status"];
type RatingFilter = "all" | "1" | "2" | "3" | "4" | "5";

const STATUS_LABEL: Record<FeedbackEntry["status"], string> = {
  new: "New",
  reviewed: "Reviewed",
  responded: "Responded",
};

const STATUS_TONE: Record<FeedbackEntry["status"], "warning" | "info" | "success"> = {
  new: "warning",
  reviewed: "info",
  responded: "success",
};

function ratingTone(r: number): "success" | "info" | "warning" | "danger" {
  if (r >= 5) return "success";
  if (r >= 4) return "info";
  if (r >= 3) return "warning";
  return "danger";
}

function sentiment(r: number): "positive" | "neutral" | "negative" {
  if (r >= 4) return "positive";
  if (r >= 3) return "neutral";
  return "negative";
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AdminFeedback() {
  const { location } = useAdminLocation();
  const toast = useToast();
  const [list, setList] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/feedback");
      if (res.ok) {
        const data = await res.json();
        setList(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((f) => {
      if (location && f.locationSlug !== location) return false;
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (ratingFilter !== "all" && f.overallRating !== Number(ratingFilter)) return false;
      if (!q) return true;
      return (
        f.customerName.toLowerCase().includes(q) ||
        f.customerPhone.includes(q) ||
        f.orderId.toLowerCase().includes(q) ||
        f.comment.toLowerCase().includes(q)
      );
    });
  }, [list, query, statusFilter, ratingFilter, location]);

  const totals = useMemo(() => {
    const rated = list.filter((f) => f.overallRating > 0);
    const sum = rated.reduce((acc, f) => acc + f.overallRating, 0);
    const avg = rated.length > 0 ? sum / rated.length : 0;
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    for (const f of rated) sentimentCounts[sentiment(f.overallRating)]++;
    const ratingDist = [1, 2, 3, 4, 5].map((star) => ({
      rating: `${star}★`,
      count: rated.filter((f) => f.overallRating === star).length,
    }));
    const newCount = list.filter((f) => f.status === "new").length;
    return { avg, total: rated.length, sentimentCounts, ratingDist, newCount };
  }, [list]);

  const statusCounts = useMemo(() => {
    const c = { all: list.length, new: 0, reviewed: 0, responded: 0 };
    for (const f of list) c[f.status]++;
    return c;
  }, [list]);

  const updateStatus = async (id: string, status: FeedbackEntry["status"]) => {
    const res = await fetch("/api/admin/feedback", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setList((arr) => arr.map((f) => (f.id === id ? { ...f, status } : f)));
      toast.success(`Marked ${STATUS_LABEL[status].toLowerCase()}`);
    } else {
      toast.error("Could not update status");
    }
  };

  const cols: Column<FeedbackEntry>[] = [
    {
      key: "rating",
      header: "Rating",
      cell: (f) => (
        <Badge tone={ratingTone(f.overallRating)} variant="soft">
          <Star className="h-3 w-3" /> {f.overallRating}
        </Badge>
      ),
      sortValue: (f) => f.overallRating,
      width: "90px",
    },
    {
      key: "customer",
      header: "Customer",
      cell: (f) => (
        <Link href={`/admin/customers/${encodeURIComponent(f.customerPhone)}`} className="v2-link-cell">
          <div className="v2-cell-stack">
            <span>{f.customerName || "Guest"}</span>
            <span className="v2-cell-sub mono">{f.customerPhone}</span>
          </div>
        </Link>
      ),
      sortValue: (f) => f.customerName,
    },
    {
      key: "order",
      header: "Order",
      cell: (f) => (
        <Link href={`/admin/orders#${f.orderId}`} className="v2-link-cell mono">
          {f.orderId.slice(-6).toUpperCase()}
        </Link>
      ),
    },
    {
      key: "loc",
      header: "Location",
      cell: (f) => (
        <Badge tone="neutral" variant="outline" icon={<MapPin className="h-3 w-3" />}>
          {f.locationSlug}
        </Badge>
      ),
      sortValue: (f) => f.locationSlug,
    },
    {
      key: "comment",
      header: "Comment",
      cell: (f) => (
        <span className="v2-fb-comment">
          {f.comment ? `"${f.comment}"` : <span className="v2-muted">No comment</span>}
        </span>
      ),
    },
    {
      key: "date",
      header: "When",
      cell: (f) => <span className="v2-muted">{fmtDate(f.date)}</span>,
      sortValue: (f) => f.date,
    },
    {
      key: "status",
      header: "Status",
      cell: (f) => (
        <Badge tone={STATUS_TONE[f.status]} variant="soft" dot>
          {STATUS_LABEL[f.status]}
        </Badge>
      ),
      sortValue: (f) => f.status,
    },
    {
      key: "actions",
      header: "",
      cell: (f) => (
        <div className="v2-row-actions">
          {f.status !== "reviewed" && (
            <Button size="sm" variant="ghost" onClick={() => updateStatus(f.id, "reviewed")}>
              Mark reviewed
            </Button>
          )}
          {f.status !== "responded" && (
            <Button size="sm" variant="ghost" leadingIcon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => updateStatus(f.id, "responded")}>
              Mark responded
            </Button>
          )}
        </div>
      ),
    },
  ];

  const sentimentSlices = [
    { name: "Positive", value: totals.sentimentCounts.positive, color: "var(--success)" },
    { name: "Neutral", value: totals.sentimentCounts.neutral, color: "var(--warning)" },
    { name: "Negative", value: totals.sentimentCounts.negative, color: "var(--danger)" },
  ].filter((s) => s.value > 0);

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Customer feedback</h1>
          <p className="v2-page-subtitle">
            Per-order ratings + comments. Stay on top of negative scores — every "new" row is a customer to call back.
          </p>
        </div>
      </header>

      <section className="v2-kpi-grid">
        <KpiCard
          label="Avg rating"
          value={totals.avg}
          display={totals.avg ? `${totals.avg.toFixed(2)} ★` : "—"}
          icon={Star}
          tone={ratingTone(totals.avg)}
          hint={`${totals.total} responses`}
        />
        <KpiCard
          label="Positive (≥4★)"
          value={totals.sentimentCounts.positive}
          icon={Smile}
          tone="success"
        />
        <KpiCard
          label="Negative (≤2★)"
          value={totals.sentimentCounts.negative}
          icon={Frown}
          tone="danger"
          higherIsBetter={false}
        />
        <KpiCard
          label="Awaiting review"
          value={totals.newCount}
          icon={MessageSquare}
          tone="warning"
          higherIsBetter={false}
        />
      </section>

      <section className="v2-grid-2">
        <Card>
          <CardHeader title="Rating distribution" />
          <CardBody>
            {totals.ratingDist.every((r) => r.count === 0) ? (
              <EmptyState icon={Star} title="No ratings yet" compact />
            ) : (
              <BarChart
                data={totals.ratingDist}
                xKey="rating"
                series={[{ key: "count", label: "Responses" }]}
                height={220}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Sentiment mix" description="Positive ≥4★ · Neutral 3★ · Negative ≤2★" />
          <CardBody>
            {sentimentSlices.length === 0 ? (
              <EmptyState icon={Smile} title="No sentiment data" compact />
            ) : (
              <PieChart data={sentimentSlices} format={(n, name) => `${n} ${name.toLowerCase()}`} />
            )}
          </CardBody>
        </Card>
      </section>

      <div className="v2-filters">
        <div className="v2-filter-search">
          <Input
            placeholder="Search by name, phone, order id, or comment…"
            leadingAdornment={<Search className="h-3.5 w-3.5" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Tabs
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          tabs={[
            { value: "all", label: "All", count: statusCounts.all },
            { value: "new", label: "New", count: statusCounts.new },
            { value: "reviewed", label: "Reviewed", count: statusCounts.reviewed },
            { value: "responded", label: "Responded", count: statusCounts.responded },
          ]}
          variant="pill"
          ariaLabel="Status filter"
        />
        <Tabs
          value={ratingFilter}
          onChange={(v) => setRatingFilter(v as RatingFilter)}
          tabs={[
            { value: "all", label: "All ★" },
            { value: "5", label: "5" },
            { value: "4", label: "4" },
            { value: "3", label: "3" },
            { value: "2", label: "2" },
            { value: "1", label: "1" },
          ]}
          variant="pill"
          ariaLabel="Rating filter"
        />
      </div>

      {loading ? (
        <div className="v2-page-loading">Loading feedback…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={MessageSquare}
              title={list.length === 0 ? "No feedback yet" : "No matches"}
              description={
                list.length === 0
                  ? "Customers leave ratings after pickup or delivery via the post-order link."
                  : "Try widening the filters."
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card padding="none">
          <CardBody>
            <Table rows={filtered} columns={cols} rowKey={(f) => f.id} defaultSort={{ key: "date", dir: "desc" }} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
