"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardBody, CardHead } from "./ui";

interface Layout {
  showCurrencySwitcher: boolean; showLanguageSwitcher: boolean; showBundlesShowcase: boolean; showLoyaltySection: boolean;
  showSeasonalSpecials: boolean; showCartUpsell: boolean; showDeliveryProgress: boolean; showPushOptIn: boolean;
  showFeedbackSurvey: boolean; showNpsSurvey: boolean; showPostOrderUpsell: boolean; showChatWidget: boolean; showLiveTicker: boolean;
}
interface Settings {
  deliveryFee?: number; minOrderAmount?: number; businessPhone?: string; businessEmail?: string;
  socialLinks?: { instagram: string; facebook: string; tiktok: string };
  refundControls?: { singleMaxGrosze?: number; compDailyCapGrosze?: number };
  simulationEnabled?: boolean; kdsSimulatorEnabled?: boolean; whatsappSimulatorEnabled?: boolean;
  cohortSimulationEnabled?: boolean; ltvCacSimulationEnabled?: boolean; menuEngineeringSimulationEnabled?: boolean;
  layout?: Layout;
}

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

export function SettingsV3() {
  const [s, setS] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [savingBiz, setSavingBiz] = useState(false);

  const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [fee, setFee] = useState(""); const [minOrder, setMinOrder] = useState("");
  const [ig, setIg] = useState(""); const [fb, setFb] = useState(""); const [tt, setTt] = useState("");

  const load = useCallback(async () => {
    const d: Settings = await fetch("/api/admin/settings").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    setS(d);
    setPhone(d.businessPhone ?? ""); setEmail(d.businessEmail ?? "");
    setFee(d.deliveryFee != null ? String(d.deliveryFee / 100) : ""); setMinOrder(d.minOrderAmount != null ? String(d.minOrderAmount / 100) : "");
    setIg(d.socialLinks?.instagram ?? ""); setFb(d.socialLinks?.facebook ?? ""); setTt(d.socialLinks?.tiktok ?? "");
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

  const layout: Layout = { showCurrencySwitcher: true, showLanguageSwitcher: true, showBundlesShowcase: true, showLoyaltySection: true, showSeasonalSpecials: true, showCartUpsell: true, showDeliveryProgress: true, showPushOptIn: true, showFeedbackSurvey: true, showNpsSurvey: true, showPostOrderUpsell: true, showChatWidget: true, showLiveTicker: true, ...(s.layout ?? {}) };
  const toggleLayout = (k: keyof Layout) => put({ layout: { ...layout, [k]: !layout[k] } });

  if (loading) return <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading settings…</div>;

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Settings</h1>
          <div className="av3-pagehead-sub">Business · storefront · feature flags — toggles save instantly</div>
        </div>
      </div>

      <Card>
        <CardHead title="Business" actions={<Button variant="primary" size="sm" loading={savingBiz} onClick={saveBiz}>Save</Button>} />
        <CardBody>
          <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr", marginBottom: 12 }}>
            <label className="av3-field"><span className="av3-field-label">Phone</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <label className="av3-field"><span className="av3-field-label">Email</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="av3-field"><span className="av3-field-label">Delivery fee (zł)</span><input className="av3-input" type="number" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} /></label>
            <label className="av3-field"><span className="av3-field-label">Min order (zł)</span><input className="av3-input" type="number" step="0.01" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} /></label>
          </div>
          <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <label className="av3-field"><span className="av3-field-label">Instagram</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={ig} onChange={(e) => setIg(e.target.value)} /></label>
            <label className="av3-field"><span className="av3-field-label">Facebook</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={fb} onChange={(e) => setFb(e.target.value)} /></label>
            <label className="av3-field"><span className="av3-field-label">TikTok</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={tt} onChange={(e) => setTt(e.target.value)} /></label>
          </div>
        </CardBody>
      </Card>

      <div className="av3-grid-2">
        <Card>
          <CardHead title="Storefront layout" description="Show / hide blocks on the guest site" actions={<Badge tone="neutral">{LAYOUT_KEYS.filter((k) => layout[k.key]).length}/{LAYOUT_KEYS.length} on</Badge>} />
          <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
            {LAYOUT_KEYS.map((k) => (
              <div key={k.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--av3-line)" }}>
                <span style={{ flex: 1, fontSize: 12.5 }}>{k.label}</span>
                <button type="button" className="av3-toggle" data-on={layout[k.key]} onClick={() => toggleLayout(k.key)} style={{ padding: "0 12px" }}>{layout[k.key] ? "On" : "Off"}</button>
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
                <button type="button" className="av3-toggle" data-on={!!s[f.key]} onClick={() => put({ [f.key]: !s[f.key] } as Partial<Settings>)} style={{ padding: "0 12px" }}>{s[f.key] ? "On" : "Off"}</button>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
