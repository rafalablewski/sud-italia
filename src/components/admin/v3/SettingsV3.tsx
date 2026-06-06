"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint, History, KeyRound, LayoutGrid, Palette, ShieldCheck, Smartphone, Sprout, Truck } from "lucide-react";
import designSystem from "@/generated/design-system.json";
import { Badge, Button, Card, CardBody, CardHead, Switch } from "./ui";

interface Layout {
  showCurrencySwitcher: boolean; showLanguageSwitcher: boolean; showBundlesShowcase: boolean; showLoyaltySection: boolean;
  showSeasonalSpecials: boolean; showCartUpsell: boolean; showDeliveryProgress: boolean; showPushOptIn: boolean;
  showFeedbackSurvey: boolean; showNpsSurvey: boolean; showPostOrderUpsell: boolean; showChatWidget: boolean; showLiveTicker: boolean;
}
interface Settings {
  deliveryFee?: number; minOrderAmount?: number; businessPhone?: string; businessEmail?: string;
  socialLinks?: { instagram: string; facebook: string; tiktok: string };
  refundControls?: { singleMaxGrosze?: number; compDailyCapGrosze?: number };
  deliveryThresholds?: { firstTime?: number; growing?: number; regular?: number; vip?: number };
  simulationEnabled?: boolean; kdsSimulatorEnabled?: boolean; whatsappSimulatorEnabled?: boolean;
  cohortSimulationEnabled?: boolean; ltvCacSimulationEnabled?: boolean; menuEngineeringSimulationEnabled?: boolean;
  layout?: Layout;
}
interface Me {
  name?: string; email?: string; role?: string; locationScope?: string[];
  signIn?: { door: string; landing: string; shared?: boolean; hasPin: boolean; passkeys: number; mfa: boolean };
}
interface ThemeFile { path: string; description: string; lines: number }
interface ThemeInfo { label: string; blurb: string; files: ThemeFile[] }
const THEMES = (designSystem as unknown as { themes: Record<string, ThemeInfo> }).themes;

const LAYOUT_KEYS: { key: keyof Layout; label: string }[] = [
  { key: "showCurrencySwitcher", label: "Currency switcher" },
  { key: "showLanguageSwitcher", label: "Language switcher" },
  { key: "showBundlesShowcase", label: "Bundles showcase" },
  { key: "showLoyaltySection", label: "Loyalty section" },
  { key: "showSeasonalSpecials", label: "Seasonal specials" },
  { key: "showCartUpsell", label: "Cart upsell rail" },
  { key: "showDeliveryProgress", label: "Delivery progress" },
  { key: "showPushOptIn", label: "Push opt-in" },
  { key: "showFeedbackSurvey", label: "Feedback survey" },
  { key: "showNpsSurvey", label: "Pulse / NPS survey" },
  { key: "showPostOrderUpsell", label: "Post-order upsell" },
  { key: "showChatWidget", label: "Chat widget" },
  { key: "showLiveTicker", label: "Live ticker" },
];
const FLAG_KEYS: { key: keyof Settings; label: string }[] = [
  { key: "simulationEnabled", label: "Calculator / simulation" },
  { key: "kdsSimulatorEnabled", label: "KDS simulator" },
  { key: "whatsappSimulatorEnabled", label: "WhatsApp simulator" },
  { key: "cohortSimulationEnabled", label: "Cohort sandbox" },
  { key: "ltvCacSimulationEnabled", label: "LTV/CAC sandbox" },
  { key: "menuEngineeringSimulationEnabled", label: "Menu-engineering sandbox" },
];
const THRESHOLD_KEYS: { key: keyof NonNullable<Settings["deliveryThresholds"]>; label: string }[] = [
  { key: "firstTime", label: "First-time" }, { key: "growing", label: "Growing" }, { key: "regular", label: "Regular" }, { key: "vip", label: "VIP" },
];
type Tab = "general" | "storefront" | "security" | "themes" | "advanced";
const zl = (g?: number) => (typeof g === "number" ? (g / 100).toFixed(2) : "");

export function SettingsV3() {
  const [s, setS] = useState<Settings>({});
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("general");
  const [savingBiz, setSavingBiz] = useState(false);
  const [savingCtl, setSavingCtl] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);

  const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [fee, setFee] = useState(""); const [minOrder, setMinOrder] = useState("");
  const [ig, setIg] = useState(""); const [fb, setFb] = useState(""); const [tt, setTt] = useState("");
  const [refSingle, setRefSingle] = useState(""); const [refComp, setRefComp] = useState("");
  const [th, setTh] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [d, m] = await Promise.all([
      fetch("/api/admin/settings").then((r) => (r.ok ? r.json() : {})).catch(() => ({})) as Promise<Settings>,
      fetch("/api/admin/me").then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<Me | null>,
    ]);
    setS(d); setMe(m);
    setPhone(d.businessPhone ?? ""); setEmail(d.businessEmail ?? "");
    setFee(zl(d.deliveryFee)); setMinOrder(zl(d.minOrderAmount));
    setIg(d.socialLinks?.instagram ?? ""); setFb(d.socialLinks?.facebook ?? ""); setTt(d.socialLinks?.tiktok ?? "");
    setRefSingle(d.refundControls?.singleMaxGrosze != null ? zl(d.refundControls.singleMaxGrosze) : "200.00");
    setRefComp(d.refundControls?.compDailyCapGrosze != null ? zl(d.refundControls.compDailyCapGrosze) : "500.00");
    setTh(Object.fromEntries(THRESHOLD_KEYS.map((k) => [k.key, zl(d.deliveryThresholds?.[k.key])])));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const put = async (updates: Partial<Settings>) => {
    setS((cur) => ({ ...cur, ...updates }));
    await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
  };

  const saveBiz = async () => {
    setSavingBiz(true);
    try {
      await put({
        businessPhone: phone.trim(), businessEmail: email.trim(),
        deliveryFee: Math.round((Number(fee) || 0) * 100), minOrderAmount: Math.round((Number(minOrder) || 0) * 100),
        socialLinks: { instagram: ig.trim(), facebook: fb.trim(), tiktok: tt.trim() },
      });
    } finally { setSavingBiz(false); }
  };
  const saveControls = async () => {
    setSavingCtl(true);
    try {
      const mk = (v?: string) => (!v || v.trim() === "" ? undefined : Math.round((Number(v) || 0) * 100));
      await put({
        refundControls: { singleMaxGrosze: Math.round((Number(refSingle) || 0) * 100), compDailyCapGrosze: Math.round((Number(refComp) || 0) * 100) },
        deliveryThresholds: { firstTime: mk(th.firstTime), growing: mk(th.growing), regular: mk(th.regular), vip: mk(th.vip) },
      });
    } finally { setSavingCtl(false); }
  };
  const seed = async () => {
    const res = await fetch("/api/admin/seed", { method: "POST" });
    setSeeded(res.ok ? "Demo data seeded." : "Could not seed (no-op in production).");
  };

  const layout: Layout = { showCurrencySwitcher: true, showLanguageSwitcher: true, showBundlesShowcase: true, showLoyaltySection: true, showSeasonalSpecials: true, showCartUpsell: true, showDeliveryProgress: true, showPushOptIn: true, showFeedbackSurvey: true, showNpsSurvey: true, showPostOrderUpsell: true, showChatWidget: true, showLiveTicker: true, ...(s.layout ?? {}) };
  const toggleLayout = (k: keyof Layout) => put({ layout: { ...layout, [k]: !layout[k] } });

  if (loading) return <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading settings…</div>;

  const tabs: { id: Tab; label: string; icon: typeof Truck }[] = [
    { id: "general", label: "General", icon: Truck },
    { id: "storefront", label: "Storefront", icon: LayoutGrid },
    { id: "security", label: "Security", icon: ShieldCheck },
    { id: "themes", label: "Themes", icon: Palette },
    { id: "advanced", label: "Advanced", icon: Sprout },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Settings</h1>
          <div className="av3-pagehead-sub">Business · storefront · controls · themes — toggles save instantly</div>
        </div>
      </div>

      <div className="av3-filterchips">
        {tabs.map((t) => (
          <button key={t.id} type="button" className={`av3-fchip ${tab === t.id ? "is-active" : ""}`} onClick={() => setTab(t.id)}>
            <t.icon style={{ width: 13, height: 13 }} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <Card>
          <CardHead title="Business" actions={<Button variant="primary" size="sm" loading={savingBiz} onClick={saveBiz}>Save</Button>} />
          <CardBody>
            <div className="av3-formrow av3-formrow-4" style={{ marginBottom: 12 }}>
              <label className="av3-field"><span className="av3-field-label">Phone</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
              <label className="av3-field"><span className="av3-field-label">Email</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="av3-field"><span className="av3-field-label">Delivery fee (zł)</span><input className="av3-input" type="number" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} /></label>
              <label className="av3-field"><span className="av3-field-label">Min order (zł)</span><input className="av3-input" type="number" step="0.01" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} /></label>
            </div>
            <div className="av3-formrow">
              <label className="av3-field"><span className="av3-field-label">Instagram</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={ig} onChange={(e) => setIg(e.target.value)} /></label>
              <label className="av3-field"><span className="av3-field-label">Facebook</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={fb} onChange={(e) => setFb(e.target.value)} /></label>
              <label className="av3-field"><span className="av3-field-label">TikTok</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={tt} onChange={(e) => setTt(e.target.value)} /></label>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === "storefront" && (
        <div className="av3-grid-2">
          <Card>
            <CardHead title="Storefront layout" description="Show / hide blocks on the guest site" actions={<Badge tone="neutral">{LAYOUT_KEYS.filter((k) => layout[k.key]).length}/{LAYOUT_KEYS.length} on</Badge>} />
            <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
              {LAYOUT_KEYS.map((k) => (
                <div key={k.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--av3-line)" }}>
                  <span style={{ flex: 1, fontSize: 12.5 }}>{k.label}</span>
                  <Switch checked={layout[k.key]} onChange={() => toggleLayout(k.key)} />
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHead title="Feature flags" description="Enable optional admin tools" />
            <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
              {FLAG_KEYS.map((f) => (
                <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--av3-line)" }}>
                  <span style={{ flex: 1, fontSize: 12.5 }}>{f.label}</span>
                  <Switch checked={!!s[f.key]} onChange={() => put({ [f.key]: !s[f.key] } as Partial<Settings>)} />
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "security" && (
        <>
          {me && (
            <Card>
              <CardHead title="How you sign in" description="Your account, the door open to you, and your active methods" />
              <CardBody>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <strong style={{ fontSize: 14 }}>{me.name}</strong>
                  {me.email && <span className="av3-cell-muted">{me.email}</span>}
                  {me.role && <Badge tone="brand">{me.role}</Badge>}
                </div>
                {me.signIn && (
                  <>
                    <div className="av3-cell-muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                      Door <span style={{ fontFamily: "var(--av3-mono)", color: "var(--av3-fg)" }}>{me.signIn.door}</span> · land on <span style={{ fontFamily: "var(--av3-mono)", color: "var(--av3-fg)" }}>{me.signIn.landing}</span>
                      {Array.isArray(me.locationScope) && !me.locationScope.includes("*") ? ` · scoped to ${me.locationScope.join(", ")}` : " · all locations"}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <Badge tone={me.signIn.shared ? "warn" : "ok"} dot><KeyRound style={{ width: 11, height: 11 }} /> {me.signIn.shared ? "Shared password" : "Personal password"}</Badge>
                      {me.signIn.hasPin && <Badge tone="info" dot><Smartphone style={{ width: 11, height: 11 }} /> Terminal PIN</Badge>}
                      {me.signIn.passkeys > 0 && <Badge tone="brand" dot><Fingerprint style={{ width: 11, height: 11 }} /> {me.signIn.passkeys} passkey{me.signIn.passkeys > 1 ? "s" : ""}</Badge>}
                      <Badge tone={me.signIn.mfa ? "ok" : "neutral"} dot>MFA {me.signIn.mfa ? "on" : "off"}</Badge>
                    </div>
                    <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 10 }}>Enrol passkeys / MFA and manage every team account in <strong>Users &amp; roles</strong>.</div>
                  </>
                )}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHead title="Refund &amp; comp controls" description="The caps that gate a refund before owner approval" actions={<Button variant="primary" size="sm" loading={savingCtl} onClick={saveControls}>Save controls</Button>} />
            <CardBody>
              <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
                <label className="av3-field"><span className="av3-field-label">Per-refund cap (zł)</span><input className="av3-input" type="number" step="0.01" value={refSingle} onChange={(e) => setRefSingle(e.target.value)} /></label>
                <label className="av3-field"><span className="av3-field-label">Daily comp cap / person (zł)</span><input className="av3-input" type="number" step="0.01" value={refComp} onChange={(e) => setRefComp(e.target.value)} /></label>
              </div>
              <div className="av3-subhead" style={{ marginTop: 0 }}>Free-delivery thresholds (zł)</div>
              <div className="av3-formrow av3-formrow-4">
                {THRESHOLD_KEYS.map((k) => (
                  <label key={k.key} className="av3-field"><span className="av3-field-label">{k.label}</span><input className="av3-input" type="number" step="0.01" value={th[k.key] ?? ""} onChange={(e) => setTh((d) => ({ ...d, [k.key]: e.target.value }))} placeholder="—" /></label>
                ))}
              </div>
              <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 8 }}>Per customer-segment spend at which delivery is free. Blank = no free-delivery offer for that segment.</div>
            </CardBody>
          </Card>
        </>
      )}

      {tab === "themes" && (
        <>
          <div className="av3-cell-muted" style={{ fontSize: 12, marginBottom: 4 }}>Read-only inspector for the three-theme architecture (the live source of truth is the code; this mirrors <span style={{ fontFamily: "var(--av3-mono)" }}>design-system.json</span>).</div>
          {Object.entries(THEMES).map(([key, t]) => (
            <Card key={key}>
              <CardHead title={t.label} description={t.blurb} actions={<Badge tone="neutral">{t.files.length} files</Badge>} />
              <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
                {t.files.map((f) => (
                  <div key={f.path} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--av3-line)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--av3-mono)", fontSize: 12 }}>{f.path}</div>
                      <div className="av3-cell-muted" style={{ fontSize: 11.5 }}>{f.description}</div>
                    </div>
                    <span className="av3-cell-muted" style={{ fontFamily: "var(--av3-mono)", fontSize: 11.5, whiteSpace: "nowrap" }}>{f.lines.toLocaleString("pl-PL")} ln</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          ))}
        </>
      )}

      {tab === "advanced" && (
        <Card>
          <CardHead title="Advanced" description="Operational utilities — use with care" />
          <CardBody>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Seed development data</div>
            <div className="av3-cell-muted" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>In local dev (no <span style={{ fontFamily: "var(--av3-mono)" }}>DATABASE_URL</span>) this fills orders + slots with realistic sample data so screens aren't empty. No-op in production.</div>
            <Button variant="secondary" size="sm" onClick={seed}><Sprout className="av3-btn-ico" /> Seed demo data</Button>
            {seeded && <span style={{ marginLeft: 10, fontSize: 12, color: "var(--av3-muted)" }}><History style={{ width: 12, height: 12, display: "inline", verticalAlign: "-1px" }} /> {seeded}</span>}
          </CardBody>
        </Card>
      )}
    </>
  );
}
