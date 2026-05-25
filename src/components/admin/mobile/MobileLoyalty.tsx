"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, Gift, Star, Users } from "lucide-react";
import type { LoyaltyTier } from "@/lib/loyalty";
import { formatPrice } from "@/lib/utils";
import {
  Chip,
  ChipStrip,
  MobileList,
  MobilePage,
  PageHeader,
  PullToRefresh,
  SegmentControl,
  type MobileListItem,
} from "../v2/mobile";

interface MemberRow {
  phone: string;
  name: string;
  points: number;
  tier: LoyaltyTier;
  orders: number;
  totalSpent: number;
  lastOrder: string;
}

interface WalletMember {
  phone: string;
  name?: string;
  status: "pending" | "active";
}

interface WalletSummary {
  id: string;
  headPhone: string;
  createdAt: string;
  members: WalletMember[];
  pointsTotal?: number;
}

interface Redemption {
  id: string;
  phone: string;
  points: number;
  rewardId: string;
  createdAt: string;
}

type Tab = "members" | "wallets" | "redemptions";
type TierFilter = "all" | LoyaltyTier;

const TIER_TONE: Record<LoyaltyTier, "neutral" | "info" | "warning" | "brand"> = {
  bronze: "neutral",
  silver: "info",
  gold: "warning",
  platinum: "brand",
};

const TIERS: LoyaltyTier[] = ["bronze", "silver", "gold", "platinum"];

function relTime(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const d = Math.round(diff / (1000 * 60 * 60 * 24));
  if (d < 1) return "today";
  if (d < 30) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}

/**
 * Mobile loyalty admin. Three tabs (members / wallets / redemptions),
 * virtualized member list (households can grow large), tier chip filter.
 * Editing tier thresholds & rewards stays desktop-only per the audit's
 * "long forms in modals" guidance — mobile can read but not edit those.
 */
export function MobileLoyalty() {
  const [tab, setTab] = useState<Tab>("members");
  const [tier, setTier] = useState<TierFilter>("all");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);

  const refresh = async () => {
    const [m, w, r] = await Promise.all([
      fetch("/api/admin/members").then((res) => (res.ok ? res.json() : { members: [] })),
      fetch("/api/admin/wallets").then((res) => (res.ok ? res.json() : { wallets: [] })),
      fetch("/api/admin/wallet-redemptions").then((res) => (res.ok ? res.json() : { redemptions: [] })),
    ]);
    setMembers(Array.isArray(m.members) ? m.members : []);
    setWallets(Array.isArray(w.wallets) ? w.wallets : []);
    setRedemptions(Array.isArray(r.redemptions) ? r.redemptions : []);
  };

  useEffect(() => { refresh(); }, []);

  const memberItems: MobileListItem<MemberRow>[] = useMemo(() => {
    const filtered = tier === "all" ? members : members.filter((m) => m.tier === tier);
    return filtered.map((m) => ({
      id: m.phone,
      data: m,
      icon: Award,
      iconTone: TIER_TONE[m.tier],
      title: m.name || m.phone,
      subtitle: `${m.orders} order${m.orders === 1 ? "" : "s"} · ${formatPrice(m.totalSpent)}`,
      trailing: `${m.points.toLocaleString("pl-PL")} pts`,
      status: { label: m.tier, tone: TIER_TONE[m.tier] },
      onTap: () => {
        window.location.href = `/admin/customers/${encodeURIComponent(m.phone)}`;
      },
    }));
  }, [members, tier]);

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SegmentControl<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: "members", label: `Members (${members.length})` },
                { value: "wallets", label: `Wallets (${wallets.length})` },
                { value: "redemptions", label: "Redemptions" },
              ]}
              ariaLabel="Loyalty tab"
            />
            {tab === "members" && (
              <ChipStrip ariaLabel="Tier filter">
                <Chip label="All tiers" active={tier === "all"} onClick={() => setTier("all")} />
                {TIERS.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    active={tier === t}
                    count={members.filter((m) => m.tier === t).length}
                    onClick={() => setTier(t)}
                  />
                ))}
              </ChipStrip>
            )}
          </div>
        }
      >
        <PageHeader title="Loyalty" />

        {tab === "members" && (
          <MobileList
            items={memberItems}
            virtualizeAt={64}
            empty={
              <div className="v2-m-empty">
                <Star className="h-6 w-6" aria-hidden />
                <div className="v2-m-empty-title">No members</div>
              </div>
            }
          />
        )}

        {tab === "wallets" && (
          <ul role="list" className="v2-m-list">
            {wallets.length === 0 ? (
              <li><div className="v2-m-list-empty">No wallet households yet.</div></li>
            ) : (
              wallets.map((w) => (
                <li key={w.id}>
                  <a
                    href={`/admin/customers/${encodeURIComponent(w.headPhone)}`}
                    className="v2-m-list-row"
                  >
                    <span className="v2-m-list-icon v2-m-tone-info">
                      <Users className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="v2-m-list-stack">
                      <span className="v2-m-list-title">
                        {w.members.find((m) => m.phone === w.headPhone)?.name || w.headPhone}
                      </span>
                      <span className="v2-m-list-sub">
                        {w.members.length} member{w.members.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="v2-m-list-metric tabular">
                      {(w.pointsTotal ?? 0).toLocaleString("pl-PL")} pts
                    </span>
                  </a>
                </li>
              ))
            )}
          </ul>
        )}

        {tab === "redemptions" && (
          <ul role="list" className="v2-m-list">
            {redemptions.length === 0 ? (
              <li><div className="v2-m-list-empty">No redemptions yet.</div></li>
            ) : (
              redemptions.slice(0, 60).map((r) => (
                <li key={r.id}>
                  <div className="v2-m-list-row">
                    <span className="v2-m-list-icon v2-m-tone-brand">
                      <Gift className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="v2-m-list-stack">
                      <span className="v2-m-list-title">{r.rewardId}</span>
                      <span className="v2-m-list-sub">
                        {r.phone} · {relTime(r.createdAt)}
                      </span>
                    </span>
                    <span className="v2-m-list-metric tabular">
                      −{r.points.toLocaleString("pl-PL")} pts
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>
        )}
      </MobilePage>
    </PullToRefresh>
  );
}
