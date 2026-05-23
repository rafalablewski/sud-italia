"use client";

import { useEffect, useState } from "react";
import { FlaskConical, History, Lock, Settings as SettingsIcon, ShieldAlert, Zap } from "lucide-react";
import { useToast } from "../v2/ui/Toast";
import {
  MobilePage,
  PageHeader,
  PullToRefresh,
  SegmentControl,
  Section,
} from "../v2/mobile";

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
}

type Tab = "general" | "security" | "audit";

interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entityType?: string;
  entityId?: string;
  occurredAt: string;
}

/**
 * Mobile settings hub. Three tabs (general / security / audit) — the
 * desktop "danger" tab is hidden on mobile because nuke-data should not
 * happen on a phone (audit doc agrees).
 */
export function MobileSettings() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("general");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [simBusy, setSimBusy] = useState(false);
  const [kdsSimBusy, setKdsSimBusy] = useState(false);
  const [audits, setAudits] = useState<AuditEntry[]>([]);

  const refresh = async () => {
    const r = await fetch("/api/admin/settings");
    if (!r.ok) return;
    setSettings(await r.json());
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (tab !== "audit") return;
    fetch("/api/admin/audit-log?limit=80")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAudits(Array.isArray(data) ? data : []));
  }, [tab]);

  const toggleSimulation = async (next: boolean) => {
    if (!settings) return;
    setSimBusy(true);
    setSettings({ ...settings, simulationEnabled: next }); // optimistic
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulationEnabled: next }),
      });
      if (!r.ok) {
        setSettings({ ...settings, simulationEnabled: !next });
        toast.error("Could not update toggle");
        return;
      }
      toast.success(next ? "Simulation enabled" : "Simulation disabled");
      window.dispatchEvent(new Event("sud-admin-settings-updated"));
    } finally {
      setSimBusy(false);
    }
  };

  const toggleKdsSimulator = async (next: boolean) => {
    if (!settings) return;
    setKdsSimBusy(true);
    setSettings({ ...settings, kdsSimulatorEnabled: next }); // optimistic
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kdsSimulatorEnabled: next }),
      });
      if (!r.ok) {
        setSettings({ ...settings, kdsSimulatorEnabled: !next });
        toast.error("Could not update toggle");
        return;
      }
      toast.success(next ? "KDS simulator enabled" : "KDS simulator disabled");
      window.dispatchEvent(new Event("sud-admin-settings-updated"));
    } finally {
      setKdsSimBusy(false);
    }
  };

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!r.ok) {
        toast.error("Could not save");
        return;
      }
      toast.success("Settings saved");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <SegmentControl<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "general", label: "General" },
              { value: "security", label: "Security" },
              { value: "audit", label: "Audit" },
            ]}
            ariaLabel="Settings tab"
          />
        }
      >
        <PageHeader title="Settings" />

        {tab === "general" && settings && (
          <>
            <Section title="Ordering">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <NumField
                  label="Delivery fee"
                  suffix="zł"
                  value={settings.deliveryFee / 100}
                  step={0.5}
                  onChange={(v) => setSettings({ ...settings, deliveryFee: Math.round(v * 100) })}
                />
                <NumField
                  label="Minimum order"
                  suffix="zł"
                  value={settings.minOrderAmount / 100}
                  step={1}
                  onChange={(v) => setSettings({ ...settings, minOrderAmount: Math.round(v * 100) })}
                />
              </div>
            </Section>

            <Section title="Contact">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <TextField
                  label="Business phone"
                  value={settings.businessPhone}
                  onChange={(v) => setSettings({ ...settings, businessPhone: v })}
                />
                <TextField
                  label="Business email"
                  type="email"
                  value={settings.businessEmail}
                  onChange={(v) => setSettings({ ...settings, businessEmail: v })}
                />
              </div>
            </Section>

            <Section title="Finance simulation (sandbox)">
              <ToggleField
                label="Show Simulation in the Finance nav"
                description="Sandbox monthly P&L modeller. Nothing here writes to your real business-costs ledger."
                checked={!!settings.simulationEnabled}
                disabled={simBusy}
                onChange={toggleSimulation}
                icon={<FlaskConical className="h-4 w-4" aria-hidden />}
              />
            </Section>

            <Section title="KDS live-order simulator">
              <ToggleField
                label="Run the order simulator"
                description="Streams synthetic orders (real menu items only) onto the live Kitchen Display, each clearly marked SIMULATION, for demos. They never reach the dashboard or any report; never touch stock, CRM or comms. Off clears them."
                checked={!!settings.kdsSimulatorEnabled}
                disabled={kdsSimBusy}
                onChange={toggleKdsSimulator}
                icon={<Zap className="h-4 w-4" aria-hidden />}
              />
            </Section>

            <button
              type="button"
              className="v2-m-btn v2-m-btn-primary"
              onClick={save}
              disabled={busy}
              style={{ alignSelf: "stretch" }}
            >
              <SettingsIcon className="h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Save changes"}
            </button>
          </>
        )}

        {tab === "security" && <SecurityTab />}

        {tab === "audit" && (
          <Section title={`Recent activity (${audits.length})`}>
            {audits.length === 0 ? (
              <div className="v2-m-empty">
                <History className="h-6 w-6" aria-hidden />
                <div className="v2-m-empty-title">Nothing logged yet</div>
              </div>
            ) : (
              <ul role="list" className="v2-m-list">
                {audits.slice(0, 50).map((a) => (
                  <li key={a.id}>
                    <div className="v2-m-list-row">
                      <span className="v2-m-list-icon v2-m-tone-neutral">
                        <History className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="v2-m-list-stack">
                        <span className="v2-m-list-title">{a.action}</span>
                        <span className="v2-m-list-sub">
                          {a.actor} · {a.entityType ?? "—"}{a.entityId ? ` #${a.entityId.slice(-6)}` : ""}
                        </span>
                      </span>
                      <span style={{ fontSize: 11, color: "var(--fg-subtle)" }} className="tabular">
                        {new Date(a.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
      </MobilePage>
    </PullToRefresh>
  );
}

function SecurityTab() {
  const toast = useToast();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!oldPw || !newPw || newPw.length < 8) {
      toast.error("Password must be ≥ 8 characters");
      return;
    }
    setBusy(true);
    try {
      const verify = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: oldPw, dryRun: true }),
      });
      if (!verify.ok) {
        toast.error("Old password is wrong");
        return;
      }
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newAdminPassword: newPw }),
      });
      if (!r.ok) {
        toast.error("Could not change password");
        return;
      }
      toast.success("Password updated");
      setOldPw("");
      setNewPw("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Change password">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <TextField label="Current password" type="password" value={oldPw} onChange={setOldPw} />
        <TextField label="New password" type="password" value={newPw} onChange={setNewPw} />
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: 10,
            borderRadius: 10,
            background: "var(--warning-soft)",
            color: "var(--warning)",
            fontSize: 12,
          }}
        >
          <ShieldAlert className="h-4 w-4" aria-hidden /> ≥ 8 characters. Will log out other sessions.
        </div>
        <button
          type="button"
          className="v2-m-btn v2-m-btn-primary"
          disabled={busy}
          onClick={save}
        >
          <Lock className="h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Update password"}
        </button>
      </div>
    </Section>
  );
}

function NumField({
  label,
  suffix,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  suffix?: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      <span style={{ flex: 1, fontSize: 13, color: "var(--fg-muted)" }}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: 90,
          background: "transparent",
          border: 0,
          outline: 0,
          color: "var(--fg)",
          fontSize: 16,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      />
      {suffix && <span style={{ color: "var(--fg-subtle)", fontSize: 12 }}>{suffix}</span>}
    </label>
  );
}

function ToggleField({
  label,
  description,
  checked,
  disabled,
  onChange,
  icon,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon && <span style={{ color: "var(--fg-muted)" }}>{icon}</span>}
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 14, color: "var(--fg)" }}>{label}</span>
        {description && (
          <span style={{ fontSize: 12, color: "var(--fg-subtle)", lineHeight: 1.4 }}>
            {description}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 22, height: 22, accentColor: "var(--brand)" }}
      />
    </label>
  );
}

function TextField({
  label,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  type?: "text" | "password" | "email";
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: 0.04 }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={type === "password" ? "new-password" : "off"}
        style={{
          padding: "10px 12px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          color: "var(--fg)",
          fontSize: 16,
          fontFamily: "var(--font-ui)",
          outline: 0,
        }}
      />
    </label>
  );
}
