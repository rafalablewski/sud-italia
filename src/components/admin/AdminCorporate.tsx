"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, RefreshCw, Save, Trash2, Link2 } from "lucide-react";
import { Button, PageHero } from "./v2/ui";

interface CorporatePayload {
  slug: string;
  name: string;
  billingEmail?: string;
  headBonusBps: number;
  minEmployees: number;
  autoPreorderDay?: number;
  autoPreorderTime?: string;
  locationSlug?: string;
  createdAt: string;
}

interface PublicRollup {
  slug: string;
  name: string;
  memberCount: number;
  minEmployees: number;
  poolEarnedThisMonth: number;
  headBonusPoints: number;
  headBonusBps: number;
}

interface CorporateSummary {
  walletId: string;
  headPhone: string;
  corporate: CorporatePayload | null;
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
 * /admin/corporate (audit §3.4) — promote a wallet to a Sud Italia
 * Corporate account, edit billing + head-bonus + min-employees config,
 * view live rollup.
 *
 * Lists every corporate-configured wallet at the top, with a "Promote a
 * wallet" row that lets the admin pick from the existing family wallets and
 * convert one into a corporate account. Conversion is reversible — clearing
 * the corporate config keeps the underlying family wallet intact.
 *
 * Corporate is intended for companies with more than 5 employees ordering
 * in bulk; the floor is enforced server-side at minEmployees ≥ 6.
 */
export function AdminCorporate() {
  const [corporates, setCorporates] = useState<CorporateSummary[]>([]);
  const [walletPool, setWalletPool] = useState<FamilyWalletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [corpRes, walletsRes] = await Promise.all([
        fetch("/api/admin/corporate"),
        fetch("/api/admin/wallets"),
      ]);
      if (!corpRes.ok) throw new Error("Failed to load corporate accounts");
      const corpData = await corpRes.json();
      const walletsData = walletsRes.ok ? await walletsRes.json() : { wallets: [] };
      setCorporates(corpData.corporates || []);
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

  const corpWalletIds = new Set(corporates.map((t) => t.walletId));
  const eligibleWallets = walletPool.filter((w) => !corpWalletIds.has(w.id));

  return (
    <div className="v2-page">
      <PageHero
        title="Corporate"
        subtitle={
          <>
            Sud Italia Corporate — productised bulk-ordering for companies
            with 6+ employees. Company head pays one card, employees earn
            personal points, head earns 20% of the corporate pool. Public
            landing at /corporate/[slug].
          </>
        }
        actions={
          <Button
            variant="secondary"
            onClick={refresh}
            disabled={loading}
            leadingIcon={<RefreshCw className="h-3.5 w-3.5" />}
            aria-label="Refresh"
            title={loading ? "Loading…" : "Refresh"}
          />
        }
      />

      {loading && <div className="v2-page-loading">Loading Corporate…</div>}

      {error && (
        <div className="v2-card p-3 mb-4 border-[color-mix(in_oklab,var(--danger)_30%,transparent)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </div>
      )}

      <section className="v2-card p-4 md:p-5 mb-5">
        <h2 className="admin-text text-base font-semibold mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Active corporate accounts ({corporates.length})
        </h2>
        {corporates.length === 0 ? (
          <p className="admin-text-secondary text-sm">
            No corporate accounts configured yet. Promote a family wallet
            with at least 6 active members below to get started.
          </p>
        ) : (
          <div className="grid gap-3">
            {corporates.map((c) => (
              <CorporateRow key={c.walletId} summary={c} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>

      <section className="v2-card p-4 md:p-5">
        <h2 className="admin-text text-base font-semibold mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4" /> Promote a wallet to a corporate account
        </h2>
        {eligibleWallets.length === 0 ? (
          <p className="admin-text-secondary text-sm">
            No family wallets available. Customers create wallets from /rewards;
            once one exists with 6+ members you can promote it here.
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

function CorporateRow({
  summary,
  onChanged,
}: {
  summary: CorporateSummary;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const corporate = summary.corporate;
  if (!corporate) return null;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="admin-text font-semibold text-sm">{corporate.name}</span>
            <a
              href={`/corporate/${corporate.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[var(--info)] hover:underline"
            >
              <Link2 className="h-3 w-3" /> /corporate/{corporate.slug}
            </a>
          </div>
          <p className="admin-text-secondary text-xs mt-1">
            {summary.memberCount} employee{summary.memberCount === 1 ? "" : "s"} ·
            {" "}min {corporate.minEmployees} ·
            {" "}{(corporate.headBonusBps / 100).toFixed(0)}% head bonus
            {corporate.billingEmail && <> · invoice → {corporate.billingEmail}</>}
          </p>
          {summary.rollup && (
            <p className="admin-text-secondary text-xs mt-1">
              This month: <span className="admin-text font-semibold">{summary.rollup.poolEarnedThisMonth} pts</span> pool
              · <span className="admin-text font-semibold">{summary.rollup.headBonusPoints} pts</span> head bonus accrued
            </p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Edit"}
        </Button>
      </div>
      {open && <CorporateEditor summary={summary} onSaved={onChanged} />}
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
  const eligible = wallet.memberCount >= 6;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="admin-text text-sm font-medium">
            Wallet · {wallet.headPhone}
          </p>
          <p className="admin-text-secondary text-xs mt-0.5">
            {wallet.memberCount} member{wallet.memberCount === 1 ? "" : "s"}
            {!eligible && (
              <span className="text-[var(--warning)] ml-1">
                · needs 6+ to promote
              </span>
            )}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          disabled={!eligible}
          title={eligible ? undefined : "Corporate accounts require at least 6 members"}
        >
          {open ? "Cancel" : "Promote"}
        </Button>
      </div>
      {open && (
        <CorporateEditor
          summary={{
            walletId: wallet.id,
            headPhone: wallet.headPhone,
            corporate: null,
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

function CorporateEditor({
  summary,
  onSaved,
}: {
  summary: CorporateSummary;
  onSaved: () => void;
}) {
  const seed = summary.corporate;
  const [slug, setSlug] = useState(seed?.slug ?? "");
  const [name, setName] = useState(seed?.name ?? "");
  const [billingEmail, setBillingEmail] = useState(seed?.billingEmail ?? "");
  const [headBonusBps, setHeadBonusBps] = useState(seed?.headBonusBps ?? 2000);
  const [minEmployees, setMinEmployees] = useState(seed?.minEmployees ?? 6);
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
      const res = await fetch("/api/admin/corporate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: summary.walletId,
          slug,
          name,
          billingEmail: billingEmail || undefined,
          headBonusBps,
          minEmployees,
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
    if (!confirm(`Remove ${seed.name} as a corporate account? The underlying family wallet stays intact.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/corporate", {
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
      <Field label="Company name">
        <input
          className="v2-input w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme"
        />
      </Field>
      <Field label="Public slug · /corporate/…">
        <input
          className="v2-input w-full"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="acme"
        />
      </Field>
      <Field label="Billing email (monthly invoice)">
        <input
          className="v2-input w-full"
          type="email"
          value={billingEmail}
          onChange={(e) => setBillingEmail(e.target.value)}
          placeholder="finance@acme.com"
        />
      </Field>
      <Field label={`Head bonus · ${(headBonusBps / 100).toFixed(0)}% of pool`}>
        <input
          className="v2-input w-full"
          type="range"
          min={0}
          max={5000}
          step={500}
          value={headBonusBps}
          onChange={(e) => setHeadBonusBps(Number(e.target.value))}
        />
      </Field>
      <Field label={`Minimum employees · ${minEmployees} (≥6 enforced)`}>
        <input
          className="v2-input w-full"
          type="number"
          min={6}
          max={500}
          value={minEmployees}
          onChange={(e) => setMinEmployees(Math.max(6, Number(e.target.value) || 6))}
        />
      </Field>
      <Field label="Pinned location (optional)">
        <select
          className="v2-input w-full"
          value={locationSlug}
          onChange={(e) => setLocationSlug(e.target.value)}
        >
          <option value="">— any —</option>
          <option value="krakow">Kraków</option>
          <option value="warszawa">Warszawa</option>
        </select>
      </Field>
      <Field label="Auto pre-order day (optional)">
        <select
          className="v2-input w-full"
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
          className="v2-input w-full"
          type="time"
          value={autoPreorderTime}
          onChange={(e) => setAutoPreorderTime(e.target.value)}
        />
      </Field>

      {error && (
        <p className="text-sm text-[var(--danger)] md:col-span-2">{error}</p>
      )}

      <div className="md:col-span-2 flex items-center gap-2">
        <Button
          variant="primary"
          onClick={save}
          disabled={saving || !name.trim() || !slug.trim()}
          leadingIcon={<Save className="h-4 w-4" />}
        >
          {saving ? "Saving…" : seed ? "Save changes" : "Create corporate account"}
        </Button>
        {seed && (
          <Button
            variant="danger"
            onClick={remove}
            disabled={saving}
            leadingIcon={<Trash2 className="h-4 w-4" />}
          >
            Remove corporate account
          </Button>
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
