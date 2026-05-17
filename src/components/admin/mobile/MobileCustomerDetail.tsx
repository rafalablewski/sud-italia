"use client";

import { useEffect, useState } from "react";
import {
  Cake,
  Mail,
  MessageSquare,
  Phone,
  Sparkles,
  Star,
  StickyNote,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import {
  MobilePage,
  PageHeader,
  PullToRefresh,
  Section,
  type StatItem,
  StatRow,
} from "../v2/mobile";

interface CustomerDetail {
  phone: string;
  member?: {
    name?: string;
    email?: string;
    birthday?: string;
    smsOptout?: boolean;
    emailOptout?: boolean;
  };
  orders: {
    id: string;
    createdAt: string;
    status: string;
    totalAmount: number;
    itemCount: number;
    locationSlug: string;
    fulfillmentType: string;
  }[];
  totals: {
    totalSpent: number;
    orderCount: number;
    avgOrderValue: number;
    lastOrderAt?: string;
    firstOrderAt?: string;
    channels: string[];
    locations: string[];
    earnedPoints: number;
    manualPoints: number;
    redeemedPoints: number;
    spendablePoints: number;
    lifetimePoints: number;
  };
  adjustments: { amount: number; reason: string; createdAt: string }[];
  redemptions: { points: number; rewardName: string; createdAt: string }[];
  notes?: string;
}

interface Props {
  phone: string;
}

function relTime(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const d = Math.round(diff / (1000 * 60 * 60 * 24));
  if (d < 1) return "today";
  if (d < 30) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Mobile customer detail. Replaces the dense desktop AdminCustomerDetail
 * (~633 LOC) with a single-column glance: identity card with quick comms,
 * lifecycle stats pager, and order history list. Adjustments, redemptions,
 * and notes are surfaced inline at the bottom — not buried in tabs.
 */
export function MobileCustomerDetail({ phone }: Props) {
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/customers/${encodeURIComponent(phone)}`);
      if (!r.ok) return;
      setData((await r.json()) as CustomerDetail);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  if (!data) {
    return (
      <MobilePage>
        <PageHeader title={loading ? "Loading…" : "Not found"} subtitle={phone} />
      </MobilePage>
    );
  }

  const name = data.member?.name || phone;
  const stats: StatItem[] = [
    {
      label: "Lifetime spend",
      value: formatPrice(data.totals.totalSpent),
      icon: Sparkles,
      tone: "brand",
      hint: `${data.totals.orderCount} order${data.totals.orderCount === 1 ? "" : "s"}`,
    },
    {
      label: "Avg order",
      value: formatPrice(data.totals.avgOrderValue),
      icon: Star,
      tone: "success",
      hint: `Last ${relTime(data.totals.lastOrderAt)}`,
    },
    {
      label: "Points",
      value: data.totals.spendablePoints.toLocaleString("pl-PL"),
      icon: Star,
      tone: "info",
      hint: `${data.totals.lifetimePoints} earned · ${data.totals.redeemedPoints} redeemed`,
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage>
        <PageHeader title={name} subtitle={phone} />

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <a
            href={`tel:${data.phone}`}
            className="v2-m-btn v2-m-btn-ghost"
            style={{ flex: "1 1 0" }}
          >
            <Phone className="h-4 w-4" aria-hidden /> Call
          </a>
          <a
            href={`sms:${data.phone}`}
            className="v2-m-btn v2-m-btn-ghost"
            style={{ flex: "1 1 0" }}
          >
            <MessageSquare className="h-4 w-4" aria-hidden /> Text
          </a>
          {data.member?.email && (
            <a
              href={`mailto:${data.member.email}`}
              className="v2-m-btn v2-m-btn-ghost"
              style={{ flex: "1 1 0" }}
            >
              <Mail className="h-4 w-4" aria-hidden /> Email
            </a>
          )}
        </div>

        <StatRow items={stats} />

        {(data.member?.birthday || data.totals.firstOrderAt) && (
          <Section title="Milestones">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 12,
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--m-card-radius)",
                fontSize: 13,
              }}
            >
              {data.member?.birthday && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Cake className="h-3.5 w-3.5" aria-hidden style={{ color: "var(--brand)" }} />
                  <span>Birthday</span>
                  <span style={{ marginLeft: "auto", color: "var(--fg-subtle)" }} className="tabular">
                    {fmtDate(data.member.birthday)}
                  </span>
                </div>
              )}
              {data.totals.firstOrderAt && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden style={{ color: "var(--info)" }} />
                  <span>First order</span>
                  <span style={{ marginLeft: "auto", color: "var(--fg-subtle)" }} className="tabular">
                    {fmtDate(data.totals.firstOrderAt)}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ width: 14 }} aria-hidden />
                <span>Locations</span>
                <span style={{ marginLeft: "auto", color: "var(--fg-subtle)" }}>
                  {data.totals.locations.join(", ") || "—"}
                </span>
              </div>
            </div>
          </Section>
        )}

        <Section title={`Orders (${data.orders.length})`}>
          {data.orders.length === 0 ? (
            <div className="v2-m-empty">
              <div className="v2-m-empty-title">No orders yet</div>
            </div>
          ) : (
            <ul role="list" className="v2-m-list">
              {data.orders.slice(0, 30).map((o) => (
                <li key={o.id}>
                  <a
                    className="v2-m-list-row"
                    href={`/admin/orders#${o.id}`}
                  >
                    <span className="v2-m-list-icon v2-m-tone-neutral">
                      <Sparkles className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="v2-m-list-stack">
                      <span className="v2-m-list-title">{formatPrice(o.totalAmount)}</span>
                      <span className="v2-m-list-sub">
                        {fmtDate(o.createdAt)} · {o.itemCount} items · {o.fulfillmentType}
                      </span>
                    </span>
                    <span className={`v2-m-pill v2-m-pill-${o.status === "completed" || o.status === "delivered" ? "success" : o.status === "cancelled" ? "danger" : "info"}`}>
                      {o.status}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {data.adjustments.length > 0 && (
          <Section title={`Manual point adjustments (${data.adjustments.length})`}>
            <ul role="list" className="v2-m-list">
              {data.adjustments.slice(0, 10).map((a, i) => (
                <li key={`${a.createdAt}-${i}`}>
                  <div className="v2-m-list-row">
                    <span className="v2-m-list-icon v2-m-tone-info">
                      <Star className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="v2-m-list-stack">
                      <span className="v2-m-list-title">
                        {a.amount > 0 ? "+" : ""}{a.amount} pts
                      </span>
                      <span className="v2-m-list-sub">{a.reason}</span>
                    </span>
                    <span style={{ fontSize: 11, color: "var(--fg-subtle)" }} className="tabular">
                      {fmtDate(a.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.notes && (
          <Section title="Notes">
            <div
              style={{
                padding: 12,
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--m-card-radius)",
                fontSize: 13,
                color: "var(--fg-muted)",
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <StickyNote className="h-4 w-4" aria-hidden style={{ flexShrink: 0, color: "var(--fg-subtle)" }} />
              <div>{data.notes}</div>
            </div>
          </Section>
        )}
      </MobilePage>
    </PullToRefresh>
  );
}
