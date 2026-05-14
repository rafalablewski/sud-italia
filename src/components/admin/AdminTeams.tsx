"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Plus, Save, Trash2, Link2 } from "lucide-react";

interface TeamPayload {
  slug: string;
  name: string;
  billingEmail?: string;
  headBonusBps: number;
  autoPreorderDay?: number;
  autoPreorderTime?: string;
  locationSlug?: string;
  createdAt: string;
}

interface PublicRollup {
  slug: string;
  name: string;
  memberCount: number;
  poolEarnedThisMonth: number;
  headBonusPoints: number;
  headBonusBps: number;
}

interface TeamSummary {
  walletId: string;
  headPhone: string;
  team: TeamPayload | null;
  memberCount: number;
  rollup: PublicRollup | null;
}

interface FamilyWalletSummary {
  id: string;
  headPhone: string;
  memberCount: number;
}

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

/**
 * /admin/teams (audit §3.4) — promote a wallet to a Sud Italia for Teams
 * account, edit billing + head-bonus config, view live rollup.
 *
 * Lists every team-configured wallet at the top, with an "Add a team"
 * row that lets the admin pick from the existing family wallets and
 * convert one into a team. Conversion is reversible — clearing the team
 * config keeps the underlying family wallet intact.
 */
export function AdminTeams() {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [walletPool, setWalletPool] = useState<FamilyWalletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamsRes, walletsRes] = await Promise.all([
        fetch("/api/admin/teams"),
        fetch("/api/admin/wallets"),
      ]);
      if (!teamsRes.ok) throw new Error("Failed to load teams");
      const teamsData = await teamsRes.json();
      const walletsData = walletsRes.ok ? await walletsRes.json() : { wallets: [] };
      setTeams(teamsData.teams || []);
      setWalletPool(
        (walletsData.wallets || []).map(
          (w: { id: string; headPhone: string; memberCount: number }) => ({
            id: w.id,
            headPhone: w.headPhone,
            memberCount: w.memberCount,
          }),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const teamWalletIds = new Set(teams.map((t) => t.walletId));
  const eligibleWallets = walletPool.filter((w) => !teamWalletIds.has(w.id));

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Teams</h1>
          <p className="v2-page-subtitle">
            Sud Italia for Teams — productised office-lunch wallets. Head pays one
            card, members earn personal points, head earns 20% of the team pool.
            Public landing at /team/[slug].
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="glass-btn"
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="glass-card p-3 mb-4 border-italia-red/30">
          <p className="text-sm admin-text">{error}</p>
        </div>
      )}

      <section className="glass-card p-4 md:p-5 mb-5">
        <h2 className="admin-text text-base font-semibold mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" /> Active teams ({teams.length})
        </h2>
        {teams.length === 0 ? (
          <p className="admin-text-secondary text-sm">
            No teams configured yet. Promote a family wallet below to get started.
          </p>
        ) : (
          <div className="grid gap-3">
            {teams.map((t) => (
              <TeamRow key={t.walletId} summary={t} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>

      <section className="glass-card p-4 md:p-5">
        <h2 className="admin-text text-base font-semibold mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4" /> Promote a wallet to a team
        </h2>
        {eligibleWallets.length === 0 ? (
          <p className="admin-text-secondary text-sm">
            No family wallets available. Customers create wallets from /rewards;
            once one exists you can promote it here.
          </p>
        ) : (
          <div className="grid gap-2">
            {eligibleWallets.map((w) => (
              <PromoteRow key={w.id} wallet={w} onPromoted={refresh} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function TeamRow({
  summary,
  onChanged,
}: {
  summary: TeamSummary;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const team = summary.team;
  if (!team) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="admin-text font-semibold text-sm">{team.name}</span>
            <a
              href={`/team/${team.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-300 hover:underline"
            >
              <Link2 className="h-3 w-3" /> /team/{team.slug}
            </a>
          </div>
          <p className="admin-text-secondary text-xs mt-1">
            {summary.memberCount} member{summary.memberCount === 1 ? "" : "s"} ·
            {" "}{(team.headBonusBps / 100).toFixed(0)}% head bonus
            {team.billingEmail && <> · invoice → {team.billingEmail}</>}
          </p>
          {summary.rollup && (
            <p className="admin-text-secondary text-xs mt-1">
              This month: <span className="admin-text font-semibold">{summary.rollup.poolEarnedThisMonth} pts</span> pool
              · <span className="admin-text font-semibold">{summary.rollup.headBonusPoints} pts</span> head bonus accrued
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="glass-btn text-xs"
        >
          {open ? "Close" : "Edit"}
        </button>
      </div>
      {open && <TeamEditor summary={summary} onSaved={onChanged} />}
    </div>
  );
}

function PromoteRow({
  wallet,
  onPromoted,
}: {
  wallet: FamilyWalletSummary;
  onPromoted: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="admin-text text-sm font-medium">
            Wallet · {wallet.headPhone}
          </p>
          <p className="admin-text-secondary text-xs mt-0.5">
            {wallet.memberCount} member{wallet.memberCount === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="glass-btn text-xs"
        >
          {open ? "Cancel" : "Promote"}
        </button>
      </div>
      {open && (
        <TeamEditor
          summary={{
            walletId: wallet.id,
            headPhone: wallet.headPhone,
            team: null,
            memberCount: wallet.memberCount,
            rollup: null,
          }}
          onSaved={() => {
            setOpen(false);
            onPromoted();
          }}
        />
      )}
    </div>
  );
}

function TeamEditor({
  summary,
  onSaved,
}: {
  summary: TeamSummary;
  onSaved: () => void;
}) {
  const seed = summary.team;
  const [slug, setSlug] = useState(seed?.slug ?? "");
  const [name, setName] = useState(seed?.name ?? "");
  const [billingEmail, setBillingEmail] = useState(seed?.billingEmail ?? "");
  const [headBonusBps, setHeadBonusBps] = useState(seed?.headBonusBps ?? 2000);
  const [autoPreorderDay, setAutoPreorderDay] = useState<number | "">(
    typeof seed?.autoPreorderDay === "number" ? seed.autoPreorderDay : "",
  );
  const [autoPreorderTime, setAutoPreorderTime] = useState(
    seed?.autoPreorderTime ?? "",
  );
  const [locationSlug, setLocationSlug] = useState(seed?.locationSlug ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: summary.walletId,
          slug,
          name,
          billingEmail: billingEmail || undefined,
          headBonusBps,
          autoPreorderDay: autoPreorderDay === "" ? undefined : autoPreorderDay,
          autoPreorderTime: autoPreorderTime || undefined,
          locationSlug: locationSlug || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Save failed");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!seed) return;
    if (!confirm(`Remove ${seed.name} as a team? The underlying family wallet stays intact.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId: summary.walletId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Remove failed");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <Field label="Team name">
        <input
          className="glass-input w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme"
        />
      </Field>
      <Field label="Public slug · /team/…">
        <input
          className="glass-input w-full"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="acme"
        />
      </Field>
      <Field label="Billing email (monthly invoice)">
        <input
          className="glass-input w-full"
          type="email"
          value={billingEmail}
          onChange={(e) => setBillingEmail(e.target.value)}
          placeholder="finance@acme.com"
        />
      </Field>
      <Field label={`Head bonus · ${(headBonusBps / 100).toFixed(0)}% of pool`}>
        <input
          className="glass-input w-full"
          type="range"
          min={0}
          max={5000}
          step={500}
          value={headBonusBps}
          onChange={(e) => setHeadBonusBps(Number(e.target.value))}
        />
      </Field>
      <Field label="Auto pre-order day (optional)">
        <select
          className="glass-input w-full"
          value={autoPreorderDay}
          onChange={(e) =>
            setAutoPreorderDay(e.target.value === "" ? "" : Number(e.target.value))
          }
        >
          <option value="">— none —</option>
          {DAYS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Auto pre-order time (HH:MM)">
        <input
          className="glass-input w-full"
          type="time"
          value={autoPreorderTime}
          onChange={(e) => setAutoPreorderTime(e.target.value)}
        />
      </Field>
      <Field label="Pinned location (optional)">
        <select
          className="glass-input w-full"
          value={locationSlug}
          onChange={(e) => setLocationSlug(e.target.value)}
        >
          <option value="">— any —</option>
          <option value="krakow">Kraków</option>
          <option value="warszawa">Warszawa</option>
        </select>
      </Field>

      {error && (
        <p className="text-sm text-italia-red md:col-span-2">{error}</p>
      )}

      <div className="md:col-span-2 flex items-center gap-2">
        <button
          type="button"
          className="glass-btn flex items-center gap-1.5"
          onClick={save}
          disabled={saving || !name.trim() || !slug.trim()}
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : seed ? "Save changes" : "Create team"}
        </button>
        {seed && (
          <button
            type="button"
            className="glass-btn flex items-center gap-1.5 text-italia-red"
            onClick={remove}
            disabled={saving}
          >
            <Trash2 className="h-4 w-4" />
            Remove team
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold admin-text-secondary uppercase tracking-wide mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
