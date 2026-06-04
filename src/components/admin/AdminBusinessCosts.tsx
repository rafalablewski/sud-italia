"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Banknote,
  Calculator,
  Calendar,
  ChefHat,
  Coins,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { getActiveLocations } from "@/data/locations";
import type {
  BusinessCost,
  BusinessCostCategory,
  BusinessCostFrequency,
  BusinessCostPayrollRole,
  BusinessCostStatus,
} from "@/data/types";
import { FREQUENCY_TO_MONTHS, monthlyGrosze } from "@/lib/business-costs-math";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Select,
  Table,
  Tabs,
  Textarea,
  type Column,
} from "./v2/ui";
import { KpiCard } from "./v2/charts";

const CATEGORY_LABEL: Record<BusinessCostCategory, string> = {
  payroll: "Payroll",
  rent: "Rent & lease",
  utilities: "Utilities",
  insurance: "Insurance",
  fuel: "Fuel",
  vehicle: "Vehicle",
  maintenance: "Maintenance",
  licenses: "Licenses & permits",
  marketing: "Marketing",
  ingredients: "Ingredients",
  equipment: "Equipment",
  software: "Software & SaaS",
  professional: "Professional services",
  tax: "Tax & fees",
  other: "Other",
};

const CATEGORY_TONE: Record<BusinessCostCategory, "info" | "warning" | "success" | "brand" | "neutral" | "danger"> = {
  payroll: "brand",
  rent: "info",
  utilities: "warning",
  insurance: "info",
  fuel: "warning",
  vehicle: "warning",
  maintenance: "warning",
  licenses: "info",
  marketing: "success",
  ingredients: "warning",
  equipment: "info",
  software: "info",
  professional: "neutral",
  tax: "danger",
  other: "neutral",
};

const PAYROLL_ROLE_LABEL: Record<BusinessCostPayrollRole, string> = {
  pizzaiolo: "Pizzaiolo",
  chef: "Chef",
  "sous-chef": "Sous-chef",
  "kitchen-porter": "Kitchen porter",
  waiter: "Waiter / front of house",
  barista: "Barista",
  driver: "Driver",
  manager: "Manager",
  cleaner: "Cleaner",
  other: "Other",
};

const FREQUENCY_LABEL: Record<BusinessCostFrequency, string> = {
  "one-off": "One-off",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

// Monthly-normalization math is shared with the LTV/CAC report (CAC numerator)
// via src/lib/business-costs-math.ts so the two never drift.

const activeLocations = getActiveLocations();

type StatusFilter = "active" | "archived" | "all";
type DialogState = { open: boolean; cost: BusinessCost | null };

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function AdminBusinessCosts() {
  const { location } = useAdminLocation();
  const toast = useToast();

  const [list, setList] = useState<BusinessCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [categoryFilter, setCategoryFilter] = useState<"all" | BusinessCostCategory>("all");
  const [dialog, setDialog] = useState<DialogState>({ open: false, cost: null });
  const [pendingDelete, setPendingDelete] = useState<BusinessCost | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL("/api/admin/business-costs", window.location.origin);
      if (location) url.searchParams.set("location", location);
      const res = await fetch(url.pathname + url.search);
      if (res.ok) {
        const data = await res.json();
        setList(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.vendor?.toLowerCase().includes(q) ?? false) ||
        (c.payrollRole?.toLowerCase().includes(q) ?? false) ||
        (c.notes?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [list, query, statusFilter, categoryFilter]);

  const totals = useMemo(() => {
    const active = list.filter((c) => c.status === "active");
    const recurring = active.filter((c) => c.frequency !== "one-off");
    const monthly = recurring.reduce((sum, c) => sum + monthlyGrosze(c), 0);

    // One-off in last 30 days, using startDate (fallback createdAt).
    const cutoff = Date.now() - 30 * 86400_000;
    const oneOff30 = active
      .filter((c) => c.frequency === "one-off")
      .filter((c) => {
        const ref = c.startDate ?? c.createdAt;
        const t = new Date(ref).getTime();
        return Number.isFinite(t) && t >= cutoff;
      })
      .reduce((sum, c) => sum + c.amountGrosze, 0);

    const byCategory = new Map<BusinessCostCategory, number>();
    for (const c of recurring) {
      byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + monthlyGrosze(c));
    }
    const categoryRows = Array.from(byCategory.entries())
      .map(([category, grosze]) => ({ category, grosze }))
      .sort((a, b) => b.grosze - a.grosze);

    const payroll = recurring.filter((c) => c.category === "payroll");
    const payrollMonthly = payroll.reduce((sum, c) => sum + monthlyGrosze(c), 0);
    const byPayrollRole = new Map<BusinessCostPayrollRole | "unassigned", number>();
    for (const c of payroll) {
      const key = c.payrollRole ?? "unassigned";
      byPayrollRole.set(key, (byPayrollRole.get(key) ?? 0) + monthlyGrosze(c));
    }
    const payrollRows = Array.from(byPayrollRole.entries())
      .map(([role, grosze]) => ({ role, grosze }))
      .sort((a, b) => b.grosze - a.grosze);

    const dueSoon = active
      .filter((c) => !!c.nextDueDate)
      .filter((c) => {
        const t = new Date(c.nextDueDate as string).getTime();
        if (!Number.isFinite(t)) return false;
        return t - Date.now() < 14 * 86400_000;
      })
      .sort((a, b) => (a.nextDueDate ?? "").localeCompare(b.nextDueDate ?? ""));

    return {
      activeCount: active.length,
      recurringCount: recurring.length,
      monthly,
      annual: monthly * 12,
      oneOff30,
      payrollMonthly,
      payrollHeadcount: payroll.length,
      categoryRows,
      payrollRows,
      dueSoon,
    };
  }, [list]);

  const doDelete = async () => {
    if (!pendingDelete) return;
    const res = await fetch(`/api/admin/business-costs?id=${encodeURIComponent(pendingDelete.id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setList((arr) => arr.filter((c) => c.id !== pendingDelete.id));
      toast.success("Cost deleted", pendingDelete.name);
    } else {
      toast.error("Could not delete");
    }
    setPendingDelete(null);
  };

  const toggleArchive = async (c: BusinessCost) => {
    const next: BusinessCostStatus = c.status === "active" ? "archived" : "active";
    const res = await fetch("/api/admin/business-costs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...c,
        status: next,
        endDate: next === "archived" ? new Date().toISOString().slice(0, 10) : undefined,
      }),
    });
    if (res.ok) {
      toast.success(next === "archived" ? "Archived" : "Restored", c.name);
      await fetchAll();
    } else {
      toast.error("Could not update");
    }
  };

  const cols: Column<BusinessCost>[] = [
    {
      key: "name",
      header: "Cost",
      cell: (c) => (
        <div className="v2-cell-stack">
          <span>{c.name}</span>
          <span className="v2-cell-sub">
            {c.vendor ?? (c.category === "payroll" && c.payrollRole ? PAYROLL_ROLE_LABEL[c.payrollRole] : "—")}
          </span>
        </div>
      ),
      sortValue: (c) => c.name,
    },
    {
      key: "category",
      header: "Category",
      cell: (c) => (
        <Badge tone={CATEGORY_TONE[c.category]} variant="soft" dot>
          {CATEGORY_LABEL[c.category]}
        </Badge>
      ),
      sortValue: (c) => c.category,
    },
    {
      key: "location",
      header: "Location",
      cell: (c) => (
        <Badge tone="neutral" variant="outline">
          {c.locationSlug ?? "all"}
        </Badge>
      ),
      sortValue: (c) => c.locationSlug ?? "all",
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (c) => (
        <div className="v2-cell-stack" style={{ alignItems: "flex-end" }}>
          <span>{formatPrice(c.amountGrosze)}</span>
          <span className="v2-cell-sub">{FREQUENCY_LABEL[c.frequency]}</span>
        </div>
      ),
      sortValue: (c) => c.amountGrosze,
    },
    {
      key: "monthly",
      header: "Per month",
      align: "right",
      cell: (c) =>
        c.frequency === "one-off" ? <span className="v2-muted">—</span> : formatPrice(monthlyGrosze(c)),
      sortValue: (c) => monthlyGrosze(c),
    },
    {
      key: "nextDue",
      header: "Next due",
      cell: (c) => <span className="v2-muted">{fmtDate(c.nextDueDate)}</span>,
      sortValue: (c) => c.nextDueDate ?? "",
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => (
        <Badge tone={c.status === "active" ? "success" : "neutral"} variant="soft" dot>
          {c.status}
        </Badge>
      ),
      sortValue: (c) => c.status,
    },
    {
      key: "actions",
      header: "",
      cell: (c) => (
        <div className="v2-row-actions">
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Pencil className="h-3.5 w-3.5" />}
            onClick={() => setDialog({ open: true, cost: c })}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={
              c.status === "active" ? (
                <Archive className="h-3.5 w-3.5" />
              ) : (
                <ArchiveRestore className="h-3.5 w-3.5" />
              )
            }
            onClick={() => toggleArchive(c)}
          >
            {c.status === "active" ? "Archive" : "Restore"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(c)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Business costs</h1>
          <p className="v2-page-subtitle">
            Operating expense ledger — payroll (pizzaiolo, chefs, waiting staff), rent, utilities, fuel, insurance, licenses and one-off purchases. Recurring amounts normalize to per-month so totals stay comparable.
          </p>
        </div>
        <div className="v2-page-actions">
          <Button
            variant="primary"
            leadingIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setDialog({ open: true, cost: null })}
          >
            New cost
          </Button>
        </div>
      </header>

      <section className="v2-kpi-grid">
        <KpiCard
          label="Monthly recurring"
          value={totals.monthly / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone="brand"
          hint={`${totals.recurringCount} recurring item${totals.recurringCount === 1 ? "" : "s"}`}
        />
        <KpiCard
          label="Annualised"
          value={totals.annual / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Calculator}
          tone="info"
          hint="Monthly × 12"
        />
        <KpiCard
          label="Monthly payroll"
          value={totals.payrollMonthly / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={ChefHat}
          tone="warning"
          hint={`${totals.payrollHeadcount} payroll line${totals.payrollHeadcount === 1 ? "" : "s"}`}
        />
        <KpiCard
          label="One-off (last 30d)"
          value={totals.oneOff30 / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Banknote}
          tone="neutral"
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
        <Card>
          <CardHeader
            title="By category"
            description="Active recurring costs normalised to monthly."
            actions={<Coins className="h-4 w-4 v2-muted" />}
          />
          <CardBody>
            {totals.categoryRows.length === 0 ? (
              <EmptyState icon={Coins} title="No recurring costs yet" compact />
            ) : (
              <ul className="v2-mov-list">
                {totals.categoryRows.map((row) => {
                  const pct = totals.monthly > 0 ? Math.round((row.grosze / totals.monthly) * 100) : 0;
                  return (
                    <li key={row.category} className="v2-mov-row">
                      <span className={`v2-mov-icon v2-mov-tone-${CATEGORY_TONE[row.category]}`}>
                        <Coins className="h-3 w-3" />
                      </span>
                      <div className="v2-mov-text">
                        <div className="v2-mov-title">
                          <span>{CATEGORY_LABEL[row.category]}</span>
                          <span className="v2-muted">{pct}%</span>
                        </div>
                        <div className="v2-mov-sub">{formatPrice(row.grosze)} / month</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Payroll breakdown"
            description="Monthly cost per craft (pizzaiolo, chefs, waiting staff, etc)."
            actions={<Users className="h-4 w-4 v2-muted" />}
          />
          <CardBody>
            {totals.payrollRows.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No payroll lines yet"
                description="Add a payroll cost to track labor by role."
                compact
              />
            ) : (
              <ul className="v2-mov-list">
                {totals.payrollRows.map((row) => {
                  const pct =
                    totals.payrollMonthly > 0 ? Math.round((row.grosze / totals.payrollMonthly) * 100) : 0;
                  const label =
                    row.role === "unassigned" ? "Unassigned" : PAYROLL_ROLE_LABEL[row.role];
                  return (
                    <li key={String(row.role)} className="v2-mov-row">
                      <span className="v2-mov-icon v2-mov-tone-warning">
                        <ChefHat className="h-3 w-3" />
                      </span>
                      <div className="v2-mov-text">
                        <div className="v2-mov-title">
                          <span>{label}</span>
                          <span className="v2-muted">{pct}%</span>
                        </div>
                        <div className="v2-mov-sub">{formatPrice(row.grosze)} / month</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {totals.dueSoon.length > 0 && (
        <Card>
          <CardHeader
            title="Due in the next 14 days"
            description="Recurring bills with an upcoming next-due date — settle before lapse."
            actions={<Calendar className="h-4 w-4 v2-muted" />}
          />
          <CardBody>
            <ul className="v2-mov-list">
              {totals.dueSoon.slice(0, 8).map((c) => (
                <li key={c.id} className="v2-mov-row">
                  <span className={`v2-mov-icon v2-mov-tone-${CATEGORY_TONE[c.category]}`}>
                    <Calendar className="h-3 w-3" />
                  </span>
                  <div className="v2-mov-text">
                    <div className="v2-mov-title">
                      <span>{c.name}</span>
                      <span className="v2-muted">{CATEGORY_LABEL[c.category]}</span>
                    </div>
                    <div className="v2-mov-sub">
                      {formatPrice(c.amountGrosze)} · {FREQUENCY_LABEL[c.frequency]}
                    </div>
                  </div>
                  <span className="v2-mov-time">{fmtDate(c.nextDueDate)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="v2-filters">
        <div className="v2-filter-search">
          <Input
            placeholder="Search by name, vendor, category, role…"
            leadingAdornment={<Search className="h-3.5 w-3.5" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
          options={[
            { value: "all", label: "All categories" },
            ...(Object.keys(CATEGORY_LABEL) as BusinessCostCategory[]).map((k) => ({
              value: k,
              label: CATEGORY_LABEL[k],
            })),
          ]}
        />
        <Tabs
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          tabs={[
            { value: "active", label: "Active", count: list.filter((c) => c.status === "active").length },
            { value: "archived", label: "Archived", count: list.filter((c) => c.status === "archived").length },
            { value: "all", label: "All", count: list.length },
          ]}
          variant="pill"
          ariaLabel="Status filter"
        />
      </div>

      {loading ? (
        <div className="v2-page-loading">Loading Business costs…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Wallet}
              title={list.length === 0 ? "No costs logged yet" : "No matches"}
              description={
                list.length === 0
                  ? "Add your first running or operating cost — rent, payroll, utilities, insurance — to start tracking the business P&L."
                  : "Try clearing the filters."
              }
              action={
                list.length === 0 ? (
                  <Button
                    variant="primary"
                    leadingIcon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setDialog({ open: true, cost: null })}
                  >
                    Add a cost
                  </Button>
                ) : undefined
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card padding="none">
          <Table
            flush
            rows={filtered}
            columns={cols}
            rowKey={(c) => c.id}
            defaultSort={{ key: "monthly", dir: "desc" }}
          />
        </Card>
      )}

      <BusinessCostDialog
        state={dialog}
        onClose={() => setDialog({ open: false, cost: null })}
        onSaved={async () => {
          setDialog({ open: false, cost: null });
          await fetchAll();
          toast.success("Cost saved");
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={doDelete}
        title={`Delete ${pendingDelete?.name ?? ""}?`}
        description="This permanently removes the cost from the ledger. Use Archive if you want to keep history."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

interface DialogProps {
  state: DialogState;
  onClose: () => void;
  onSaved: () => void;
}

function BusinessCostDialog({ state, onClose, onSaved }: DialogProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<BusinessCostCategory>("payroll");
  const [payrollRole, setPayrollRole] = useState<BusinessCostPayrollRole | "">("pizzaiolo");
  const [vendor, setVendor] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [frequency, setFrequency] = useState<BusinessCostFrequency>("monthly");
  const [loc, setLoc] = useState<string>("");
  const [status, setStatus] = useState<BusinessCostStatus>("active");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<NonNullable<BusinessCost["paymentMethod"]> | "">("");
  const [taxDeductible, setTaxDeductible] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const c = state.cost;
    setName(c?.name ?? "");
    setCategory(c?.category ?? "payroll");
    setPayrollRole(c?.payrollRole ?? (c?.category === "payroll" || !c ? "pizzaiolo" : ""));
    setVendor(c?.vendor ?? "");
    setAmountStr(c ? (c.amountGrosze / 100).toFixed(2) : "");
    setFrequency(c?.frequency ?? "monthly");
    setLoc(c?.locationSlug ?? "");
    setStatus(c?.status ?? "active");
    setStartDate(c?.startDate ?? "");
    setEndDate(c?.endDate ?? "");
    setNextDueDate(c?.nextDueDate ?? "");
    setPaymentMethod(c?.paymentMethod ?? "");
    setTaxDeductible(!!c?.taxDeductible);
    setNotes(c?.notes ?? "");
    setBusy(false);
  }, [state]);

  if (!state.open) return <Dialog open={false} onClose={onClose} />;

  const submit = async () => {
    if (!name.trim()) {
      toast.warning("Name required");
      return;
    }
    const amountPln = parseFloat(amountStr || "0");
    if (!Number.isFinite(amountPln) || amountPln < 0) {
      toast.warning("Amount required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        id: state.cost?.id,
        name: name.trim(),
        category,
        payrollRole: category === "payroll" && payrollRole ? payrollRole : undefined,
        vendor: vendor.trim() || undefined,
        amountGrosze: Math.round(amountPln * 100),
        frequency,
        locationSlug: loc || undefined,
        status,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        nextDueDate: nextDueDate || undefined,
        paymentMethod: paymentMethod || undefined,
        taxDeductible,
        notes: notes.trim() || undefined,
      };
      const res = await fetch("/api/admin/business-costs", {
        method: state.cost ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) onSaved();
      else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Could not save");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={state.cost ? `Edit ${state.cost.name}` : "New business cost"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {state.cost ? "Save changes" : "Create cost"}
          </Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input
          label="Cost name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g. "Pizzaiolo Marco Rossi" or "Truck rent Kraków"'
        />
        <div className="v2-form-row-2">
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as BusinessCostCategory)}
            options={(Object.keys(CATEGORY_LABEL) as BusinessCostCategory[]).map((k) => ({
              value: k,
              label: CATEGORY_LABEL[k],
            }))}
          />
          {category === "payroll" ? (
            <Select
              label="Payroll role"
              value={payrollRole}
              onChange={(e) => setPayrollRole(e.target.value as BusinessCostPayrollRole)}
              options={(Object.keys(PAYROLL_ROLE_LABEL) as BusinessCostPayrollRole[]).map((k) => ({
                value: k,
                label: PAYROLL_ROLE_LABEL[k],
              }))}
            />
          ) : (
            <Input
              label="Vendor / supplier"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Optional"
            />
          )}
        </div>

        {category === "payroll" && (
          <Input
            label="Vendor / payroll provider"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Optional — agency, accountant, etc."
          />
        )}

        <div className="v2-form-row-2">
          <Input
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            trailingAdornment={<span className="v2-muted">zł</span>}
          />
          <Select
            label="Frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as BusinessCostFrequency)}
            options={(Object.keys(FREQUENCY_LABEL) as BusinessCostFrequency[]).map((k) => ({
              value: k,
              label: FREQUENCY_LABEL[k],
            }))}
            description={
              frequency !== "one-off" && amountStr
                ? `≈ ${formatPrice(
                    Math.round(parseFloat(amountStr || "0") * 100 * FREQUENCY_TO_MONTHS[frequency]),
                  )} / month`
                : undefined
            }
          />
        </div>

        <div className="v2-form-row-2">
          <Select
            label="Location"
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
            options={[
              { value: "", label: "All locations (chain-wide)" },
              ...activeLocations.map((l) => ({ value: l.slug, label: l.city })),
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as BusinessCostStatus)}
            options={[
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
            ]}
          />
        </div>

        <div className="v2-form-row-2">
          <Input
            label={frequency === "one-off" ? "Date paid" : "Start date"}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          {frequency === "one-off" ? (
            <Input
              label="End date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              description="Optional"
            />
          ) : (
            <Input
              label="Next due"
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              description="Surfaces in the 'due soon' list."
            />
          )}
        </div>

        <div className="v2-form-row-2">
          <Select
            label="Payment method"
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(e.target.value as NonNullable<BusinessCost["paymentMethod"]> | "")
            }
            options={[
              { value: "", label: "Unspecified" },
              { value: "card", label: "Card" },
              { value: "bank-transfer", label: "Bank transfer" },
              { value: "cash", label: "Cash" },
              { value: "direct-debit", label: "Direct debit" },
              { value: "other", label: "Other" },
            ]}
          />
          <label className="v2-field">
            <span className="v2-field-label">Tax deductible</span>
            <span className="inline-flex items-center gap-2 mt-1">
              <input
                type="checkbox"
                checked={taxDeductible}
                onChange={(e) => setTaxDeductible(e.target.checked)}
              />
              <span className="v2-muted text-sm">Mark this cost as deductible for VAT/CIT.</span>
            </span>
          </label>
        </div>

        <Textarea
          label="Notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Contract reference, payment terms, justifications…"
        />
      </div>
    </Dialog>
  );
}
