"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlaskConical,
  History,
  KeyRound,
  LayoutGrid,
  Phone,
  Save,
  ShieldCheck,
  Sprout,
  Truck,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useIsMobile } from "./v2/mobile";
import { useToast } from "./v2/ui/Toast";

const MobileSettings = dynamic(
  () => import("./mobile/MobileSettings").then((m) => m.MobileSettings),
  { ssr: false },
);
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

interface Settings {
  deliveryFee: number;
  minOrderAmount: number;
  businessPhone: string;
  businessEmail: string;
  deliveryThresholds?: {
    firstTime?: number;
    growing?: number;
    regular?: number;
    vip?: number;
  };
  simulationEnabled?: boolean;
  kdsSimulatorEnabled?: boolean;
  whatsappSimulatorEnabled?: boolean;
  /** Storefront visibility toggles set in the Layout tab. */
  layout?: {
    showCurrencySwitcher: boolean;
  };
}

interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  occurredAt: string;
}

type TabKey = "general" | "layout" | "security" | "audit" | "danger";

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AdminSettings() {
  const { isMobile, ready } = useIsMobile();
  if (ready && isMobile) {
    return <MobileSettings />;
  }
  return <AdminSettingsDesktop />;
}

function AdminSettingsDesktop() {
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>("general");

  const [settings, setSettings] = useState<Settings | null>(null);
  const [deliveryFeeStr, setDeliveryFeeStr] = useState("0.00");
  const [minOrderStr, setMinOrderStr] = useState("0.00");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // Audit §3 — per-segment free-delivery thresholds. Empty string = use
  // the SEGMENT_FREE_DELIVERY_THRESHOLD default for that band.
  const [thFirstTime, setThFirstTime] = useState("");
  const [thGrowing, setThGrowing] = useState("");
  const [thRegular, setThRegular] = useState("");
  const [thVip, setThVip] = useState("");
  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const [kdsSimulatorEnabled, setKdsSimulatorEnabled] = useState(false);
  const [whatsappSimulatorEnabled, setWhatsappSimulatorEnabled] = useState(false);
  const [showCurrencySwitcher, setShowCurrencySwitcher] = useState(true);
  const [currencyVisBusy, setCurrencyVisBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [simBusy, setSimBusy] = useState(false);
  const [kdsSimBusy, setKdsSimBusy] = useState(false);
  const [whatsappSimBusy, setWhatsappSimBusy] = useState(false);

  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  // Password change
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    if (!res.ok) return;
    const data: Settings = await res.json();
    setSettings(data);
    setDeliveryFeeStr((data.deliveryFee / 100).toFixed(2));
    setMinOrderStr((data.minOrderAmount / 100).toFixed(2));
    setPhone(data.businessPhone ?? "");
    setEmail(data.businessEmail ?? "");
    const t = data.deliveryThresholds;
    setThFirstTime(typeof t?.firstTime === "number" ? (t.firstTime / 100).toFixed(2) : "");
    setThGrowing(typeof t?.growing === "number" ? (t.growing / 100).toFixed(2) : "");
    setThRegular(typeof t?.regular === "number" ? (t.regular / 100).toFixed(2) : "");
    setThVip(typeof t?.vip === "number" ? (t.vip / 100).toFixed(2) : "");
    setSimulationEnabled(!!data.simulationEnabled);
    setKdsSimulatorEnabled(!!data.kdsSimulatorEnabled);
    setWhatsappSimulatorEnabled(!!data.whatsappSimulatorEnabled);
    // Layout tab — visibility toggles for storefront chrome. Default is
    // "show" so a freshly-deployed instance behaves the same as before
    // this tab existed.
    setShowCurrencySwitcher(data.layout?.showCurrencySwitcher ?? true);
  }, []);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch("/api/admin/audit-log?limit=200");
      if (res.ok) {
        const data = await res.json();
        setAudit(Array.isArray(data) ? data : []);
      }
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchAudit();
  }, [fetchSettings, fetchAudit]);

  const saveGeneral = async () => {
    setSaving(true);
    try {
      // Audit §3 — parse per-segment thresholds. Empty string = clear back
      // to the default (the field is omitted from the payload entirely),
      // any number ≥ 0 = stored override.
      const parseThreshold = (s: string): number | undefined => {
        const trimmed = s.trim();
        if (trimmed === "") return undefined;
        const value = Math.max(0, Math.round(parseFloat(trimmed) * 100));
        return Number.isFinite(value) ? value : undefined;
      };
      const thresholdsRaw = {
        firstTime: parseThreshold(thFirstTime),
        growing: parseThreshold(thGrowing),
        regular: parseThreshold(thRegular),
        vip: parseThreshold(thVip),
      };
      const thresholdsClean = Object.fromEntries(
        Object.entries(thresholdsRaw).filter(([, v]) => typeof v === "number"),
      );
      const deliveryThresholds =
        Object.keys(thresholdsClean).length > 0 ? thresholdsClean : null;

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryFee: Math.round(parseFloat(deliveryFeeStr || "0") * 100),
          minOrderAmount: Math.round(parseFloat(minOrderStr || "0") * 100),
          businessPhone: phone.trim(),
          businessEmail: email.trim(),
          deliveryThresholds,
        }),
      });
      if (res.ok) {
        toast.success("Settings saved");
        await Promise.all([fetchSettings(), fetchAudit()]);
      } else {
        toast.error("Could not save");
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleSimulation = async (next: boolean) => {
    setSimBusy(true);
    setSimulationEnabled(next); // optimistic
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulationEnabled: next }),
      });
      if (res.ok) {
        toast.success(next ? "Calculator enabled" : "Calculator disabled");
        window.dispatchEvent(new Event("sud-admin-settings-updated"));
        await Promise.all([fetchSettings(), fetchAudit()]);
      } else {
        setSimulationEnabled(!next); // revert
        toast.error("Could not update toggle");
      }
    } finally {
      setSimBusy(false);
    }
  };

  const toggleCurrencyVisibility = async (next: boolean) => {
    setCurrencyVisBusy(true);
    setShowCurrencySwitcher(next); // optimistic
    try {
      // Merge with the existing layout object so toggling one flag
      // doesn't clobber sibling flags added later.
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout: {
            ...(settings?.layout ?? {}),
            showCurrencySwitcher: next,
          },
        }),
      });
      if (res.ok) {
        toast.success(next ? "Currency switcher shown" : "Currency switcher hidden");
        window.dispatchEvent(new Event("sud-admin-settings-updated"));
        await Promise.all([fetchSettings(), fetchAudit()]);
      } else {
        setShowCurrencySwitcher(!next); // revert
        toast.error("Could not update toggle");
      }
    } finally {
      setCurrencyVisBusy(false);
    }
  };

  const toggleKdsSimulator = async (next: boolean) => {
    setKdsSimBusy(true);
    setKdsSimulatorEnabled(next); // optimistic
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kdsSimulatorEnabled: next }),
      });
      if (res.ok) {
        // Turning it off clears the synthetic tickets it left on the board
        // (purge stays allowed even with the toggle now off).
        if (!next) {
          await fetch("/api/admin/kds-simulator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "purge" }),
          }).catch(() => {});
        }
        toast.success(next ? "Order simulator on — Add / Purge controls now show on the Kitchen Display" : "Order simulator off — simulated tickets cleared");
        window.dispatchEvent(new Event("sud-admin-settings-updated"));
        await Promise.all([fetchSettings(), fetchAudit()]);
      } else {
        setKdsSimulatorEnabled(!next); // revert
        toast.error("Could not update toggle");
      }
    } finally {
      setKdsSimBusy(false);
    }
  };

  const toggleWhatsappSimulator = async (next: boolean) => {
    setWhatsappSimBusy(true);
    setWhatsappSimulatorEnabled(next); // optimistic
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappSimulatorEnabled: next }),
      });
      if (res.ok) {
        // Turning it off clears the sandbox conversations it staged (purge
        // stays allowed even with the toggle now off).
        if (!next) {
          await fetch("/api/admin/whatsapp-simulator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "purge" }),
          }).catch(() => {});
        }
        toast.success(next ? "Chat simulator on — Add / Purge controls now show in the WhatsApp console" : "Chat simulator off — sandbox conversations cleared");
        window.dispatchEvent(new Event("sud-admin-settings-updated"));
        await Promise.all([fetchSettings(), fetchAudit()]);
      } else {
        setWhatsappSimulatorEnabled(!next); // revert
        toast.error("Could not update toggle");
      }
    } finally {
      setWhatsappSimBusy(false);
    }
  };

  const changePassword = async () => {
    if (!oldPw || !newPw) {
      toast.warning("Provide both passwords");
      return;
    }
    if (newPw.length < 8) {
      toast.warning("New password must be 8+ characters");
      return;
    }
    setPwBusy(true);
    try {
      // Verify current password using the existing login endpoint
      const verify = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: oldPw }),
      });
      if (!verify.ok) {
        toast.error("Current password is incorrect");
        return;
      }
      // Persist new password via settings.adminPassword field
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: newPw }),
      });
      if (res.ok) {
        toast.success("Password updated", "You'll need to log in again on your next visit.");
        setOldPw("");
        setNewPw("");
        await fetchAudit();
      } else {
        toast.error("Could not update password");
      }
    } finally {
      setPwBusy(false);
    }
  };

  const seedDevData = async () => {
    if (!confirm("Seed development data? This is a no-op in production and only fills demo orders/slots in dev.")) return;
    const res = await fetch("/api/admin/seed", { method: "POST" });
    if (res.ok) {
      toast.success("Demo data seeded");
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error("Could not seed", (data as { error?: string }).error);
    }
  };

  const auditCols: Column<AuditEntry>[] = [
    {
      key: "when",
      header: "When",
      cell: (e) => <span className="v2-muted">{fmtTime(e.occurredAt)}</span>,
      sortValue: (e) => e.occurredAt,
      width: "180px",
    },
    {
      key: "actor",
      header: "Actor",
      cell: (e) => <Badge tone="neutral" variant="soft">{e.actor}</Badge>,
      sortValue: (e) => e.actor,
    },
    {
      key: "action",
      header: "Action",
      cell: (e) => <span className="mono">{e.action}</span>,
      sortValue: (e) => e.action,
    },
    {
      key: "entity",
      header: "Entity",
      cell: (e) =>
        e.entityType ? (
          <span className="v2-cell-stack">
            <span>{e.entityType}</span>
            {e.entityId && <span className="v2-cell-sub mono">{e.entityId}</span>}
          </span>
        ) : (
          <span className="v2-muted">—</span>
        ),
    },
    {
      key: "summary",
      header: "Change",
      cell: (e) => {
        if (e.action === "orders.status_change") {
          const next = (e.after as { status?: string } | undefined)?.status;
          return <span>→ {next ?? "—"}</span>;
        }
        if (e.action === "settings.update") {
          return <span className="v2-muted">settings updated</span>;
        }
        return <span className="v2-muted">—</span>;
      },
    },
  ];

  const summaryByAction = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of audit) m.set(e.action, (m.get(e.action) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [audit]);

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Settings</h1>
          <p className="v2-page-subtitle">Account, business config, and the audit trail of administrative changes.</p>
        </div>
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as TabKey)}
          tabs={[
            { value: "general", label: "General", icon: <Truck className="h-3.5 w-3.5" /> },
            { value: "layout", label: "Layout", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
            { value: "security", label: "Security", icon: <KeyRound className="h-3.5 w-3.5" /> },
            { value: "audit", label: "Audit log", icon: <History className="h-3.5 w-3.5" />, count: audit.length },
            { value: "danger", label: "Advanced", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
          ]}
          variant="pill"
          ariaLabel="Settings section"
        />
      </header>

      {tab === "general" && (
        <>
          <Card>
            <CardHeader title="Business & delivery" description="Customer-facing fees, contact details." />
            <CardBody>
              <div className="v2-stack-12">
                <div className="v2-form-row-2">
                  <Input
                    label="Delivery fee"
                    type="number"
                    step="0.01"
                    min="0"
                    value={deliveryFeeStr}
                    onChange={(e) => setDeliveryFeeStr(e.target.value)}
                    trailingAdornment={<span className="v2-muted">zł</span>}
                  />
                  <Input
                    label="Minimum order"
                    type="number"
                    step="0.01"
                    min="0"
                    value={minOrderStr}
                    onChange={(e) => setMinOrderStr(e.target.value)}
                    trailingAdornment={<span className="v2-muted">zł</span>}
                  />
                </div>
                <div className="v2-form-row-2">
                  <Input
                    label="Business phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    leadingAdornment={<Phone className="h-3.5 w-3.5" />}
                  />
                  <Input
                    label="Business email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Free-delivery thresholds by lifecycle (audit §3)"
              description="Below the threshold, the standard delivery fee applies. Leave a field blank to use the default (first-time 39 / growing 49 / regular 59 / VIP 35 PLN). Customers see the matching bar in the cart drawer; the checkout charge uses the same threshold so display and receipt agree."
            />
            <CardBody>
              <div className="v2-stack-12">
                <div className="v2-form-row-2">
                  <Input
                    label="First-time (orders < 2)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={thFirstTime}
                    onChange={(e) => setThFirstTime(e.target.value)}
                    trailingAdornment={<span className="v2-muted">zł</span>}
                    description="Default 39 PLN. Lower removes friction on visit 1 at the cost of unit economics — track repeat rate."
                  />
                  <Input
                    label="Growing (2–4 orders)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={thGrowing}
                    onChange={(e) => setThGrowing(e.target.value)}
                    trailingAdornment={<span className="v2-muted">zł</span>}
                    description="Default 49 PLN. Bridge tier as the customer builds confidence."
                  />
                </div>
                <div className="v2-form-row-2">
                  <Input
                    label="Regular (5+ orders)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={thRegular}
                    onChange={(e) => setThRegular(e.target.value)}
                    trailingAdornment={<span className="v2-muted">zł</span>}
                    description="Default 59 PLN. Higher — they'll hit it anyway."
                  />
                  <Input
                    label="VIP (Gold / Platinum)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={thVip}
                    onChange={(e) => setThVip(e.target.value)}
                    trailingAdornment={<span className="v2-muted">zł</span>}
                    description="Default 35 PLN. Floor protects courier economics — set to 0 only if you accept losses on tiny VIP orders."
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Simulator"
              description="Turn our sandbox simulators on or off. Both stay fully isolated from real data — nothing here touches live orders, reports, stock, CRM or your books."
              actions={<FlaskConical className="h-4 w-4 v2-muted" />}
            />
            <CardBody>
              <div className="v2-stack-12">
                <label className="v2-field">
                  <span className="v2-field-label">KDS</span>
                  <span className="v2-muted text-sm">
                    Demo / training tool. Adds Add 1 / Add 5 / Purge all controls to the Kitchen
                    Display banner so staff can drop synthetic orders (built only from your real
                    menu) onto the board and work them through with the normal ticket buttons. Each
                    ticket is clearly marked SIMULATION and never reaches the dashboard, Orders
                    list, reports, stock, CRM or comms. Turning it off clears every simulated
                    ticket.
                  </span>
                  <span className="inline-flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={kdsSimulatorEnabled}
                      onChange={(e) => toggleKdsSimulator(e.target.checked)}
                      disabled={kdsSimBusy}
                    />
                    <span className="v2-muted text-sm">
                      {kdsSimulatorEnabled
                        ? "On — the Kitchen Display shows Add 1 / Add 5 / Purge all controls for staging marked SIMULATION tickets."
                        : "Off — the Kitchen Display only ever shows real tickets."}
                    </span>
                  </span>
                </label>
                <label className="v2-field">
                  <span className="v2-field-label">WhatsApp</span>
                  <span className="v2-muted text-sm">
                    Demo / training tool. Adds Add 1 / Add 5 / Purge controls to the WhatsApp
                    console so staff can stage sandbox conversations (carts built only from your
                    real menu) at random funnel stages — browsing, cart, slot picked, awaiting
                    payment. Each chat is marked <b>sim</b>, kept on a reserved phone range, and
                    never sends a real WhatsApp message. Turning it off clears every sandbox
                    conversation.
                  </span>
                  <span className="inline-flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={whatsappSimulatorEnabled}
                      onChange={(e) => toggleWhatsappSimulator(e.target.checked)}
                      disabled={whatsappSimBusy}
                    />
                    <span className="v2-muted text-sm">
                      {whatsappSimulatorEnabled
                        ? "On — the WhatsApp console shows Add 1 / Add 5 / Purge controls for staging marked sandbox conversations."
                        : "Off — the WhatsApp console only ever shows real conversations."}
                    </span>
                  </span>
                </label>
                <label className="v2-field">
                  <span className="v2-field-label">Financials</span>
                  <span className="v2-muted text-sm">
                    Sandbox monthly P&amp;L: type orders/day, ticket size, labor mix and fixed costs
                    to see net profit, margin and break-even. Persists separately from the real
                    business-costs ledger — nothing here writes to your books.
                  </span>
                  <span className="inline-flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={simulationEnabled}
                      onChange={(e) => toggleSimulation(e.target.checked)}
                      disabled={simBusy}
                    />
                    <span className="v2-muted text-sm">
                      {simulationEnabled
                        ? "Visible at /admin/simulation as the Calculator tab."
                        : "Hidden from the sidebar and command palette. The page redirects to settings when off."}
                    </span>
                  </span>
                </label>
              </div>
            </CardBody>
          </Card>

          <div className="v2-form-actions">
            <Button
              variant="primary"
              leadingIcon={<Save className="h-3.5 w-3.5" />}
              onClick={saveGeneral}
              loading={saving}
              disabled={!settings}
            >
              Save settings
            </Button>
          </div>
        </>
      )}

      {tab === "layout" && (
        <Card>
          <CardHeader
            title="Storefront visibility"
            description="Toggle whole pieces of the public site on or off. Off = the component unmounts on the storefront (no DOM, no painted CSS, no nav entry). Toggle is the saved state — no separate Save button."
          />
          <CardBody>
            <div className="v2-stack-12">
              <label className="v2-field">
                <span className="v2-field-label">Currency switcher</span>
                <span className="v2-muted text-sm">
                  The currency picker in the public site header. When off, the
                  storefront falls back to the saved currency (PLN by default)
                  and the switcher button disappears entirely. Admin reports
                  stay PLN-pinned regardless via AdminCurrencyGuard.
                </span>
                <span className="inline-flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    checked={showCurrencySwitcher}
                    onChange={(e) => toggleCurrencyVisibility(e.target.checked)}
                    disabled={currencyVisBusy || !settings}
                  />
                  <span className="v2-muted text-sm">
                    {showCurrencySwitcher
                      ? "Visible in the public site header."
                      : "Hidden — storefront uses PLN everywhere."}
                  </span>
                </span>
              </label>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === "security" && (
        <Card>
          <CardHeader title="Admin password" description="Rotate the master password used by the legacy single-user login. Phase 24 introduces per-user accounts." />
          <CardBody>
            <div className="v2-stack-12">
              <Input
                label="Current password"
                type="password"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
                autoComplete="current-password"
              />
              <Input
                label="New password (8+ chars)"
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
              />
              <div className="v2-form-actions">
                <Button variant="primary" leadingIcon={<KeyRound className="h-3.5 w-3.5" />} onClick={changePassword} loading={pwBusy}>
                  Update password
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === "audit" && (
        <>
          <section className="v2-kpi-grid">
            {summaryByAction.slice(0, 4).map(([action, count]) => (
              <div key={action} className="v2-kpi">
                <div className="v2-kpi-top">
                  <div className="v2-kpi-label">{action}</div>
                </div>
                <div className="v2-kpi-value-row">
                  <span className="v2-kpi-value tabular">{count.toLocaleString()}</span>
                </div>
                <div className="v2-kpi-foot">
                  <span className="v2-kpi-hint">events in log</span>
                </div>
              </div>
            ))}
          </section>

          {auditLoading ? (
            <div className="v2-page-loading">Loading audit log…</div>
          ) : audit.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={History}
                  title="No audit entries yet"
                  description="Changes to settings, order statuses, deletions, and other sensitive actions appear here as they happen."
                />
              </CardBody>
            </Card>
          ) : (
            <Card padding="none">
              <CardBody>
                <Table rows={audit} columns={auditCols} rowKey={(e) => e.id} defaultSort={{ key: "when", dir: "desc" }} />
              </CardBody>
            </Card>
          )}
        </>
      )}

      {tab === "danger" && (
        <Card>
          <CardHeader title="Advanced" description="Operational utilities. Use with care." />
          <CardBody>
            <div className="v2-stack-12">
              <div>
                <h3 className="v2-section-h">Seed development data</h3>
                <p className="v2-muted">
                  In local dev (where DATABASE_URL is unset), this fills <code>orders.json</code> and{" "}
                  <code>slots.json</code> with realistic sample data so screens aren't empty. No-op in production.
                </p>
                <Button variant="secondary" leadingIcon={<Sprout className="h-3.5 w-3.5" />} onClick={seedDevData}>
                  Seed demo data
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
