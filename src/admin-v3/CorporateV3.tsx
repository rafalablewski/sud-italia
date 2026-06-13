"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Users } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { Badge, Button, type ColumnV3, Dialog, Kpi, SkeletonKpiRail, SkeletonRows, Table } from "./ui";

interface CorporatePayload {
  slug: string;
  name: string;
  billingEmail?: string;
  headBonusBps: number;
  minEmployees: number;
  autoPreorderDay?: number;
  autoPreorderTime?: string;
  locationSlug?: string;
}
interface Rollup { poolEarnedThisMonth: number; headBonusPoints: number }
interface CorporateSummary {
  walletId: string;
  headPhone: string;
  corporate: CorporatePayload | null;
  memberCount: number;
  rollup: Rollup | null;
}

const DAYS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 0, label: "Sun" },
];

export function CorporateV3() {
  const all = useMemo(() => getActiveLocations(), []);
  const [accounts, setAccounts] = useState<CorporateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<CorporateSummary | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/corporate").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const arr: CorporateSummary[] = Array.isArray(res) ? res : Array.isArray(res?.corporates) ? res.corporates : [];
    setAccounts(arr.filter((a) => a.corporate));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const totalMembers = accounts.reduce((s, a) => s + a.memberCount, 0);
  const poolThisMonth = accounts.reduce((s, a) => s + (a.rollup?.poolEarnedThisMonth ?? 0), 0);

  const cols: ColumnV3<CorporateSummary>[] = [
    { key: "name", header: "Account", render: (a) => <span style={{ fontWeight: 600 }}>{a.corporate?.name}</span> },
    { key: "loc", header: "Site", render: (a) => <span className="av3-cell-muted">{a.corporate?.locationSlug ? all.find((l) => l.slug === a.corporate?.locationSlug)?.city ?? a.corporate.locationSlug : "All sites"}</span> },
    { key: "members", header: "Members", num: true, render: (a) => `${a.memberCount}` },
    { key: "min", header: "Min staff", num: true, render: (a) => `${a.corporate?.minEmployees ?? 0}` },
    { key: "bonus", header: "Head bonus", num: true, render: (a) => `${((a.corporate?.headBonusBps ?? 0) / 100).toFixed(1)}%` },
    { key: "pool", header: "Pool / mo", num: true, render: (a) => `${(a.rollup?.poolEarnedThisMonth ?? 0).toLocaleString("pl-PL")} pts` },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Corporate</h1>
          <div className="av3-pagehead-sub">B2B accounts on shared family wallets · loyalty pooling</div>
        </div>
      </div>

      {loading && accounts.length === 0 ? <SkeletonKpiRail count={3} /> : (
      <div className="av3-kpi-rail">
        <Kpi label="Accounts" icon={Building2} value={`${accounts.length}`} accentVar="--av3-c3" />
        <Kpi label="Members" icon={Users} value={`${totalMembers}`} accentVar="--av3-c4" />
        <Kpi label="Pool earned · month" icon={Building2} value={`${poolThisMonth.toLocaleString("pl-PL")} pts`} accentVar="--av3-c2" />
      </div>
      )}

      {loading && accounts.length === 0 ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {accounts.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No corporate accounts</div><div className="av3-empty-text">Promote a family wallet to a corporate account from the loyalty tools, then manage it here.</div></div>
          ) : (
            <Table columns={cols} rows={accounts} rowKey={(a) => a.walletId} onRowClick={(a) => setEdit(a)} />
          )}
        </div>
      )}

      {edit && edit.corporate && <CorporateDialog account={edit} locations={all} onClose={() => setEdit(null)} onSaved={async () => { await load(); setEdit(null); }} />}
    </>
  );
}

function CorporateDialog({ account, locations, onClose, onSaved }: { account: CorporateSummary; locations: ReturnType<typeof getActiveLocations>; onClose: () => void; onSaved: () => Promise<void> }) {
  const c = account.corporate!;
  const [name, setName] = useState(c.name);
  const [billingEmail, setBillingEmail] = useState(c.billingEmail ?? "");
  const [bonusPct, setBonusPct] = useState(String((c.headBonusBps ?? 0) / 100));
  const [minEmployees, setMinEmployees] = useState(String(c.minEmployees ?? 0));
  const [locationSlug, setLocationSlug] = useState(c.locationSlug ?? "");
  const [preorderDay, setPreorderDay] = useState<string>(c.autoPreorderDay != null ? String(c.autoPreorderDay) : "");
  const [preorderTime, setPreorderTime] = useState(c.autoPreorderTime ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/corporate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: account.walletId,
          slug: c.slug,
          name: name.trim(),
          billingEmail: billingEmail.trim() || undefined,
          headBonusBps: Math.max(0, Math.round((Number(bonusPct) || 0) * 100)),
          minEmployees: Math.max(0, Math.round(Number(minEmployees) || 0)),
          autoPreorderDay: preorderDay === "" ? undefined : Number(preorderDay),
          autoPreorderTime: preorderTime || undefined,
          locationSlug: locationSlug || undefined,
        }),
      });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open onClose={onClose}
      title={c.name}
      subtitle={`${account.memberCount} members · wallet ${account.walletId.slice(-6)}`}
      headerExtra={<Badge tone="neutral"><Building2 style={{ width: 11, height: 11 }} /> corporate</Badge>}
      width={520}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!name.trim()} onClick={save}>Save</Button></>}
    >
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Account name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Billing email</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} /></div>
      <div className="av3-formrow" style={{ marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Head bonus %</span><input className="av3-input" type="number" step="0.1" value={bonusPct} onChange={(e) => setBonusPct(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Min employees</span><input className="av3-input" type="number" value={minEmployees} onChange={(e) => setMinEmployees(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Home site</span>
          <select className="av3-select" value={locationSlug} onChange={(e) => setLocationSlug(e.target.value)}><option value="">All sites</option>{locations.map((l) => <option key={l.slug} value={l.slug}>{l.city}</option>)}</select>
        </label>
      </div>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="av3-field"><span className="av3-field-label">Auto-preorder day</span>
          <select className="av3-select" value={preorderDay} onChange={(e) => setPreorderDay(e.target.value)}><option value="">Off</option>{DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
        </label>
        <label className="av3-field"><span className="av3-field-label">Auto-preorder time</span><input className="av3-input" type="time" style={{ fontFamily: "var(--av3-ui)" }} value={preorderTime} onChange={(e) => setPreorderTime(e.target.value)} /></label>
      </div>
    </Dialog>
  );
}
