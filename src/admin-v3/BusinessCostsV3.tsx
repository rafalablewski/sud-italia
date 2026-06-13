"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Receipt, Wallet } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { monthlyGrosze } from "@/lib/business-costs-math";
import type { BusinessCost, BusinessCostCategory, BusinessCostFrequency, BusinessCostPayrollRole } from "@/data/types";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, type BadgeTone, Button, type ColumnV3, Dialog, Kpi, KpiRail, SkeletonRows, Switch, Table } from "./ui";

const CATEGORY_LABEL: Record<BusinessCostCategory, string> = {
  payroll: "Payroll", rent: "Rent & lease", utilities: "Utilities", insurance: "Insurance", fuel: "Fuel",
  vehicle: "Vehicle", maintenance: "Maintenance", licenses: "Licenses", marketing: "Marketing",
  ingredients: "Ingredients", equipment: "Equipment", software: "Software", professional: "Professional",
  tax: "Tax & fees", other: "Other",
};
const FREQUENCY_LABEL: Record<BusinessCostFrequency, string> = {
  "one-off": "One-off", daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly",
};
const PAYROLL_ROLE_LABEL: Record<BusinessCostPayrollRole, string> = {
  pizzaiolo: "Pizzaiolo", chef: "Chef", "sous-chef": "Sous-chef", "kitchen-porter": "Kitchen porter",
  waiter: "Waiter / FOH", barista: "Barista", driver: "Driver", manager: "Manager", cleaner: "Cleaner", other: "Other",
};
const CATEGORIES = Object.keys(CATEGORY_LABEL) as BusinessCostCategory[];
const FREQUENCIES = Object.keys(FREQUENCY_LABEL) as BusinessCostFrequency[];
const PAYROLL_ROLES = Object.keys(PAYROLL_ROLE_LABEL) as BusinessCostPayrollRole[];

function catTone(c: BusinessCostCategory): BadgeTone {
  if (c === "payroll") return "brand";
  if (c === "marketing") return "ok";
  if (c === "tax") return "bad";
  if (["utilities", "fuel", "vehicle", "maintenance", "ingredients"].includes(c)) return "warn";
  return "info";
}

export function BusinessCostsV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const [costs, setCosts] = useState<BusinessCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<"all" | BusinessCostCategory>("all");
  const [edit, setEdit] = useState<BusinessCost | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const url = location ? `/api/admin/business-costs?location=${location}` : "/api/admin/business-costs";
    const res = await fetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setCosts(Array.isArray(res) ? res : Array.isArray(res?.costs) ? res.costs : []);
    setLoading(false);
  }, [location]);
  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => costs.filter((c) => c.status !== "archived"), [costs]);
  const recurring = active.filter((c) => c.frequency !== "one-off");
  const monthly = recurring.reduce((s, c) => s + monthlyGrosze(c), 0);
  const payrollMonthly = recurring.filter((c) => c.category === "payroll").reduce((s, c) => s + monthlyGrosze(c), 0);
  const oneOff = active.filter((c) => c.frequency === "one-off").reduce((s, c) => s + c.amountGrosze, 0);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: active.length };
    for (const x of active) c[x.category] = (c[x.category] ?? 0) + 1;
    return c;
  }, [active]);
  const rows = useMemo(() => (cat === "all" ? active : active.filter((c) => c.category === cat)).sort((a, b) => monthlyGrosze(b) - monthlyGrosze(a)), [active, cat]);

  const cols: ColumnV3<BusinessCost>[] = [
    { key: "name", header: "Cost", render: (c) => <span style={{ fontWeight: 600 }}>{c.name}</span> },
    { key: "cat", header: "Category", render: (c) => <Badge tone={catTone(c.category)}>{CATEGORY_LABEL[c.category]}</Badge> },
    { key: "who", header: "Vendor / role", render: (c) => <span className="av3-cell-muted">{c.vendor ?? (c.category === "payroll" && c.payrollRole ? PAYROLL_ROLE_LABEL[c.payrollRole] : "—")}</span> },
    { key: "amt", header: "Amount", num: true, render: (c) => <span>{formatPrice(c.amountGrosze)} <span className="av3-cell-muted" style={{ fontSize: 11 }}>/ {FREQUENCY_LABEL[c.frequency].toLowerCase()}</span></span> },
    { key: "mo", header: "Per month", num: true, render: (c) => (c.frequency === "one-off" ? <span className="av3-cell-muted">—</span> : formatPrice(monthlyGrosze(c))) },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Business costs</h1>
          <div className="av3-pagehead-sub">Operating expense register · {location ? all.find((l) => l.slug === location)?.city : "chain-wide"}</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus className="av3-btn-ico" /> Add cost</Button>
        </div>
      </div>

      <KpiRail loading={loading} empty={costs.length === 0}>
        <Kpi label="Monthly recurring" icon={Wallet} value={formatPrice(monthly)} accentVar="--av3-c1" />
        <Kpi label="Annualised" icon={Wallet} value={formatPrice(monthly * 12)} accentVar="--av3-c2" />
        <Kpi label="Payroll / mo" icon={Receipt} value={formatPrice(payrollMonthly)} accentVar="--av3-c5" />
        <Kpi label="One-off (active)" icon={Receipt} value={formatPrice(oneOff)} accentVar="--av3-c3" />
      </KpiRail>

      <div className="av3-filterchips">
        <button type="button" className={`av3-fchip ${cat === "all" ? "is-active" : ""}`} onClick={() => setCat("all")}>All<span className="av3-fchip-count">{counts.all ?? 0}</span></button>
        {CATEGORIES.filter((c) => counts[c]).map((c) => (
          <button key={c} type="button" className={`av3-fchip ${cat === c ? "is-active" : ""}`} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}<span className="av3-fchip-count">{counts[c]}</span></button>
        ))}
      </div>

      {loading && costs.length === 0 ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No costs</div><div className="av3-empty-text">Add rent, payroll, utilities and more to track your operating expenses.</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(c) => c.id} onRowClick={(c) => setEdit(c)} />
          )}
        </div>
      )}

      {(edit || adding) && <CostDialog cost={edit} locations={all} onClose={() => { setEdit(null); setAdding(false); }} onSaved={async () => { await load(); setEdit(null); setAdding(false); }} />}
    </>
  );
}

function CostDialog({ cost, locations, onClose, onSaved }: { cost: BusinessCost | null; locations: ReturnType<typeof getActiveLocations>; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(cost?.name ?? "");
  const [category, setCategory] = useState<BusinessCostCategory>(cost?.category ?? "other");
  const [amount, setAmount] = useState(cost ? String(cost.amountGrosze / 100) : "");
  const [frequency, setFrequency] = useState<BusinessCostFrequency>(cost?.frequency ?? "monthly");
  const [payrollRole, setPayrollRole] = useState<BusinessCostPayrollRole>(cost?.payrollRole ?? "other");
  const [vendor, setVendor] = useState(cost?.vendor ?? "");
  const [locationSlug, setLocationSlug] = useState(cost?.locationSlug ?? "");
  const [taxDeductible, setTaxDeductible] = useState(cost?.taxDeductible ?? false);
  const [notes, setNotes] = useState(cost?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...(cost ? { id: cost.id } : {}),
        name: name.trim(), category, amountGrosze: Math.max(0, Math.round((Number(amount) || 0) * 100)), frequency,
        payrollRole: category === "payroll" ? payrollRole : undefined,
        vendor: vendor.trim() || undefined, locationSlug: locationSlug || undefined,
        taxDeductible, notes: notes.trim() || undefined,
      };
      const res = await fetch("/api/admin/business-costs", { method: cost ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!cost) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/business-costs?id=${encodeURIComponent(cost.id)}`, { method: "DELETE" });
      if (res.ok) await onSaved();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open onClose={onClose}
      title={cost ? cost.name : "New business cost"}
      width={560}
      footer={<>{cost && <Button variant="danger" size="sm" loading={deleting} onClick={remove} style={{ marginRight: "auto" }}>Delete</Button>}<Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!name.trim()} onClick={save}>Save</Button></>}
    >
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 110px 1fr", marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Category</span>
          <select className="av3-select" value={category} onChange={(e) => setCategory(e.target.value as BusinessCostCategory)}>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select>
        </label>
        <label className="av3-field"><span className="av3-field-label">Amount (zł)</span><input className="av3-input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Frequency</span>
          <select className="av3-select" value={frequency} onChange={(e) => setFrequency(e.target.value as BusinessCostFrequency)}>{FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}</select>
        </label>
      </div>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
        {category === "payroll" ? (
          <label className="av3-field"><span className="av3-field-label">Payroll role</span>
            <select className="av3-select" value={payrollRole} onChange={(e) => setPayrollRole(e.target.value as BusinessCostPayrollRole)}>{PAYROLL_ROLES.map((r) => <option key={r} value={r}>{PAYROLL_ROLE_LABEL[r]}</option>)}</select>
          </label>
        ) : (
          <label className="av3-field"><span className="av3-field-label">Vendor</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={vendor} onChange={(e) => setVendor(e.target.value)} /></label>
        )}
        <label className="av3-field"><span className="av3-field-label">Site</span>
          <select className="av3-select" value={locationSlug} onChange={(e) => setLocationSlug(e.target.value)}><option value="">Chain-wide</option>{locations.map((l) => <option key={l.slug} value={l.slug}>{l.city}</option>)}</select>
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Switch checked={taxDeductible} label="Tax-deductible" onChange={setTaxDeductible} />
        <input className="av3-input" style={{ fontFamily: "var(--av3-ui)", flex: 1 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
      </div>
    </Dialog>
  );
}
