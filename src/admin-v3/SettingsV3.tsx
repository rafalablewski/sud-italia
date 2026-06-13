"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, FlaskConical, History, KeyRound, LayoutGrid, Palette, ShieldCheck, Smartphone, Sprout, Truck } from "lucide-react";
import designSystem from "@/generated/design-system.json";
import { Badge, Button, Card, CardBody, CardHead, SkeletonPage, Switch } from "./ui";

interface Layout {
  showCurrencySwitcher: boolean; showLanguageSwitcher: boolean; showBundlesShowcase: boolean; showLoyaltySection: boolean;
  showSeasonalSpecials: boolean; showCartUpsell: boolean; showDeliveryProgress: boolean; showPushOptIn: boolean;
  showFeedbackSurvey: boolean; showNpsSurvey: boolean; showPostOrderUpsell: boolean; showChatWidget: boolean;
}
interface Settings {
  deliveryFee?: number; minOrderAmount?: number; businessName?: string; tipPresets?: number[]; processorFee?: { pct: number; fixedGrosze: number }; businessPhone?: string; businessEmail?: string;
  operations?: { labor?: { coversPerStaffHour?: number; splhLowGrosze?: number; splhHighGrosze?: number }; kitchen?: { minPrepMinutes?: number; expoBufferMinutes?: number }; inventory?: { fallbackLeadDays?: number; usageWindowDays?: number } };
  legalEntity?: { nip?: string; name?: string; regon?: string; email?: string };
  marketing?: { vipSpendGrosze?: number; vipMinOrders?: number };
  socialLinks?: { instagram: string; facebook: string; tiktok: string };
  refundControls?: { singleMaxGrosze?: number; compDailyCapGrosze?: number };
  deliveryThresholds?: { firstTime?: number; growing?: number; regular?: number; vip?: number };
  simulationEnabled?: boolean;
  simulationModeEnabled?: boolean;
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
];
// Every simulation in the app, declared in one place. The toggle gates the
// real feature behind it (the key gates /admin/simulation — not cosmetic).
// Toggles save instantly. The Calculator is the only simulation in the app;
// the former KDS / WhatsApp simulators and report what-if sandboxes were
// removed.
const SIMULATIONS: { key: keyof Settings; label: string; href?: string; desc: string }[] = [
  { key: "simulationEnabled", label: "Calculator", href: "/admin/simulation", desc: "The financial what-if modeller — P&L scenarios, tornado sensitivity, ROI/payback, fleet & channel economics — all computed on your real numbers." },
];
const THRESHOLD_KEYS: { key: keyof NonNullable<Settings["deliveryThresholds"]>; label: string }[] = [
  { key: "firstTime", label: "First-time" }, { key: "growing", label: "Growing" }, { key: "regular", label: "Regular" }, { key: "vip", label: "VIP" },
];
type Tab = "general" | "storefront" | "simulations" | "security" | "themes" | "advanced";
const zl = (g?: number) => (typeof g === "number" ? (g / 100).toFixed(2) : "");

export function SettingsV3() {
  const [s, setS] = useState<Settings>({});
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("general");
  const [savingBiz, setSavingBiz] = useState(false);
  const [savingCtl, setSavingCtl] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);

  const [bizName, setBizName] = useState("");
  const [tips, setTips] = useState("");
  const [feePct, setFeePct] = useState(""); const [feeFixed, setFeeFixed] = useState("");
  const [legal, setLegal] = useState({ nip: "", name: "", regon: "", email: "" });
  const [savingOps, setSavingOps] = useState(false);
  const [ops, setOps] = useState({ coversHr: "", splhLow: "", splhHigh: "", minPrep: "", expoBuf: "", leadDays: "", usageDays: "", vipSpend: "", vipOrders: "" });
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
    setBizName(d.businessName ?? "");
    setTips((d.tipPresets ?? [0.1, 0.15, 0.2]).map((p) => Math.round(p * 100)).join(", "));
    setFeePct(String((d.processorFee?.pct ?? 0.014) * 100)); setFeeFixed(zl(d.processorFee?.fixedGrosze ?? 40));
    setLegal({ nip: d.legalEntity?.nip ?? "", name: d.legalEntity?.name ?? "", regon: d.legalEntity?.regon ?? "", email: d.legalEntity?.email ?? "" });
    const op = d.operations;
    setOps({
      coversHr: String(op?.labor?.coversPerStaffHour ?? 3),
      splhLow: zl(op?.labor?.splhLowGrosze ?? 7000),
      splhHigh: zl(op?.labor?.splhHighGrosze ?? 15000),
      minPrep: String(op?.kitchen?.minPrepMinutes ?? 10),
      expoBuf: String(op?.kitchen?.expoBufferMinutes ?? 3),
      leadDays: String(op?.inventory?.fallbackLeadDays ?? 3),
      usageDays: String(op?.inventory?.usageWindowDays ?? 14),
      vipSpend: zl(d.marketing?.vipSpendGrosze ?? 20000),
      vipOrders: String(d.marketing?.vipMinOrders ?? 6),
    });
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

  // Simulation mode flips the WHOLE app onto an isolated `sim:` namespace
  // (seeded with a realistic CORE picture on first enable) — so after a change
  // we hard-reload to refresh the banner + every data surface at once.
  const [simBusy, setSimBusy] = useState<null | "toggle" | "reset" | "wipe">(null);
  // Live seed console: the route streams NDJSON progress ({t,pct,msg}); we render
  // each line into the terminal below and drive the bar off the latest pct.
  const [simLog, setSimLog] = useState<{ pct: number; msg: string; tone?: "ok" | "err" }[]>([]);
  const [simPct, setSimPct] = useState(0);
  const [simDone, setSimDone] = useState(false);
  const simCall = async (kind: "toggle" | "reset" | "wipe", body: Record<string, unknown>) => {
    setSimBusy(kind);
    setSimLog([]);
    setSimPct(0);
    setSimDone(false);
    let lastPct = 0;
    const push = (msg: string, pct: number, tone?: "ok" | "err") => {
      lastPct = pct;
      setSimPct(pct);
      setSimLog((l) => [...l, { pct, msg, tone }]);
    };
    try {
      const res = await fetch("/api/admin/simulation-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        push(`Request failed (${res.status})`, lastPct, "err");
        setSimBusy(null);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let ok = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let evt: { t?: string; pct?: number; msg?: string };
          try { evt = JSON.parse(line); } catch { continue; }
          if (evt.t === "log") push(evt.msg ?? "", typeof evt.pct === "number" ? evt.pct : lastPct);
          else if (evt.t === "done") { ok = true; push("Complete — refreshing every screen…", 100, "ok"); }
          else if (evt.t === "error") push(evt.msg ?? "Operation failed", lastPct, "err");
        }
      }
      if (ok) {
        setSimDone(true);
        // Hold the finished console on screen a beat so the operator reads the
        // last line, then hard-reload to refresh the banner + every data surface.
        setTimeout(() => window.location.reload(), 1400);
      } else {
        push("Stream ended unexpectedly.", lastPct, "err");
        setSimBusy(null);
      }
    } catch {
      push("Connection lost.", lastPct, "err");
      setSimBusy(null);
    }
  };
  // Keep the terminal pinned to its newest line as the seed streams in.
  const termRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [simLog]);

  const saveBiz = async () => {
    setSavingBiz(true);
    try {
      const tipPresets = tips
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => n / 100);
      await put({
        businessName: bizName.trim(), businessPhone: phone.trim(), businessEmail: email.trim(),
        deliveryFee: Math.round((Number(fee) || 0) * 100), minOrderAmount: Math.round((Number(minOrder) || 0) * 100),
        tipPresets,
        processorFee: { pct: (Number(feePct) || 0) / 100, fixedGrosze: Math.round((Number(feeFixed) || 0) * 100) },
        legalEntity: { nip: legal.nip.trim(), name: legal.name.trim(), regon: legal.regon.trim(), email: legal.email.trim() },
        socialLinks: { instagram: ig.trim(), facebook: fb.trim(), tiktok: tt.trim() },
      });
    } finally { setSavingBiz(false); }
  };
  const saveOps = async () => {
    setSavingOps(true);
    try {
      const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v.trim() !== "" ? Number(v) : fallback);
      await put({
        operations: {
          labor: {
            coversPerStaffHour: Math.max(0.1, num(ops.coversHr, 3)),
            splhLowGrosze: Math.round(num(ops.splhLow, 70) * 100),
            splhHighGrosze: Math.round(num(ops.splhHigh, 150) * 100),
          },
          kitchen: {
            minPrepMinutes: Math.max(0, Math.round(num(ops.minPrep, 10))),
            expoBufferMinutes: Math.max(0, Math.round(num(ops.expoBuf, 3))),
          },
          inventory: {
            fallbackLeadDays: Math.max(0, Math.round(num(ops.leadDays, 3))),
            usageWindowDays: Math.max(1, Math.round(num(ops.usageDays, 14))),
          },
        },
        marketing: {
          vipSpendGrosze: Math.round(num(ops.vipSpend, 200) * 100),
          vipMinOrders: Math.max(1, Math.round(num(ops.vipOrders, 6))),
        },
      });
    } finally { setSavingOps(false); }
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

  const layout: Layout = { showCurrencySwitcher: true, showLanguageSwitcher: true, showBundlesShowcase: true, showLoyaltySection: true, showSeasonalSpecials: true, showCartUpsell: true, showDeliveryProgress: true, showPushOptIn: true, showFeedbackSurvey: true, showNpsSurvey: true, showPostOrderUpsell: true, showChatWidget: true, ...(s.layout ?? {}) };
  const toggleLayout = (k: keyof Layout) => put({ layout: { ...layout, [k]: !layout[k] } });

  if (loading) return <SkeletonPage />;

  const tabs: { id: Tab; label: string; icon: typeof Truck }[] = [
    { id: "general", label: "General", icon: Truck },
    { id: "storefront", label: "Storefront", icon: LayoutGrid },
    { id: "simulations", label: "Simulations", icon: FlaskConical },
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
        <>
        <Card>
          <CardHead title="Business" actions={<Button variant="primary" size="sm" loading={savingBiz} onClick={saveBiz}>Save</Button>} />
          <CardBody>
            <div className="av3-formrow" style={{ marginBottom: 12 }}>
              <label className="av3-field"><span className="av3-field-label">Business name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Shown in SMS, receipts & chat" /></label>
              <label className="av3-field"><span className="av3-field-label">Tip presets (%)</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={tips} onChange={(e) => setTips(e.target.value)} placeholder="10, 15, 20" /></label>
              <label className="av3-field"><span className="av3-field-label">Card fee (%)</span><input className="av3-input" type="number" step="0.01" value={feePct} onChange={(e) => setFeePct(e.target.value)} placeholder="1.4" /></label>
              <label className="av3-field"><span className="av3-field-label">Card fee fixed (zł)</span><input className="av3-input" type="number" step="0.01" value={feeFixed} onChange={(e) => setFeeFixed(e.target.value)} placeholder="0.40" /></label>
            </div>
            <div className="av3-formrow av3-formrow-4" style={{ marginBottom: 12 }}>
              <label className="av3-field"><span className="av3-field-label">Phone</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
              <label className="av3-field"><span className="av3-field-label">Email</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="av3-field"><span className="av3-field-label">Delivery fee (zł)</span><input className="av3-input" type="number" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} /></label>
              <label className="av3-field"><span className="av3-field-label">Min order (zł)</span><input className="av3-input" type="number" step="0.01" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} /></label>
            </div>
            <div className="av3-formrow" style={{ marginBottom: 12 }}>
              <label className="av3-field"><span className="av3-field-label">Instagram</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={ig} onChange={(e) => setIg(e.target.value)} /></label>
              <label className="av3-field"><span className="av3-field-label">Facebook</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={fb} onChange={(e) => setFb(e.target.value)} /></label>
              <label className="av3-field"><span className="av3-field-label">TikTok</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={tt} onChange={(e) => setTt(e.target.value)} /></label>
            </div>
            <div className="av3-cell-muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Legal entity — used on JPK_V7M tax filings (leave blank to use the JPK_* env vars)</div>
            <div className="av3-formrow av3-formrow-4">
              <label className="av3-field"><span className="av3-field-label">Legal name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={legal.name} onChange={(e) => setLegal((l) => ({ ...l, name: e.target.value }))} placeholder="Ottaviano Sp. z o.o." /></label>
              <label className="av3-field"><span className="av3-field-label">NIP</span><input className="av3-input" style={{ fontFamily: "var(--av3-mono)" }} value={legal.nip} onChange={(e) => setLegal((l) => ({ ...l, nip: e.target.value }))} placeholder="1234567890" /></label>
              <label className="av3-field"><span className="av3-field-label">REGON</span><input className="av3-input" style={{ fontFamily: "var(--av3-mono)" }} value={legal.regon} onChange={(e) => setLegal((l) => ({ ...l, regon: e.target.value }))} /></label>
              <label className="av3-field"><span className="av3-field-label">Tax email</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={legal.email} onChange={(e) => setLegal((l) => ({ ...l, email: e.target.value }))} /></label>
            </div>
          </CardBody>
        </Card>
        <Card style={{ marginTop: 16 }}>
          <CardHead title="Operations" description="Labor, kitchen SLA & reorder policy — the targets the dashboards and ETA quotes use" actions={<Button variant="primary" size="sm" loading={savingOps} onClick={saveOps}>Save</Button>} />
          <CardBody>
            <div className="av3-cell-muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Labor productivity</div>
            <div className="av3-formrow av3-formrow-4" style={{ marginBottom: 12 }}>
              <label className="av3-field"><span className="av3-field-label">Covers / staff / hr</span><input className="av3-input" type="number" step="0.5" value={ops.coversHr} onChange={(e) => setOps((o) => ({ ...o, coversHr: e.target.value }))} /></label>
              <label className="av3-field"><span className="av3-field-label">SPLH low (zł/hr)</span><input className="av3-input" type="number" step="1" value={ops.splhLow} onChange={(e) => setOps((o) => ({ ...o, splhLow: e.target.value }))} /></label>
              <label className="av3-field"><span className="av3-field-label">SPLH high (zł/hr)</span><input className="av3-input" type="number" step="1" value={ops.splhHigh} onChange={(e) => setOps((o) => ({ ...o, splhHigh: e.target.value }))} /></label>
            </div>
            <div className="av3-cell-muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Kitchen prep SLA (customer ready-time quote)</div>
            <div className="av3-formrow av3-formrow-4" style={{ marginBottom: 12 }}>
              <label className="av3-field"><span className="av3-field-label">Min prep (min)</span><input className="av3-input" type="number" step="1" value={ops.minPrep} onChange={(e) => setOps((o) => ({ ...o, minPrep: e.target.value }))} /></label>
              <label className="av3-field"><span className="av3-field-label">Expo buffer (min)</span><input className="av3-input" type="number" step="1" value={ops.expoBuf} onChange={(e) => setOps((o) => ({ ...o, expoBuf: e.target.value }))} /></label>
            </div>
            <div className="av3-cell-muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Inventory reorder policy</div>
            <div className="av3-formrow av3-formrow-4" style={{ marginBottom: 12 }}>
              <label className="av3-field"><span className="av3-field-label">Fallback lead (days)</span><input className="av3-input" type="number" step="1" value={ops.leadDays} onChange={(e) => setOps((o) => ({ ...o, leadDays: e.target.value }))} /></label>
              <label className="av3-field"><span className="av3-field-label">Usage window (days)</span><input className="av3-input" type="number" step="1" value={ops.usageDays} onChange={(e) => setOps((o) => ({ ...o, usageDays: e.target.value }))} /></label>
            </div>
            <div className="av3-cell-muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Marketing — VIP broadcast audience</div>
            <div className="av3-formrow av3-formrow-4">
              <label className="av3-field"><span className="av3-field-label">VIP min spend (zł)</span><input className="av3-input" type="number" step="1" value={ops.vipSpend} onChange={(e) => setOps((o) => ({ ...o, vipSpend: e.target.value }))} /></label>
              <label className="av3-field"><span className="av3-field-label">VIP min orders</span><input className="av3-input" type="number" step="1" value={ops.vipOrders} onChange={(e) => setOps((o) => ({ ...o, vipOrders: e.target.value }))} /></label>
            </div>
          </CardBody>
        </Card>
        </>
      )}

      {tab === "storefront" && (
        <Card>
          <CardHead title="Storefront layout" description="Show / hide blocks on the guest site" actions={<Badge tone="neutral">{LAYOUT_KEYS.filter((k) => layout[k.key]).length}/{LAYOUT_KEYS.length} on</Badge>} />
          <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
            {LAYOUT_KEYS.map((k) => (
              <div key={k.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--av3-line)" }}>
                <span style={{ flex: 1, fontSize: 12.5 }}>{k.label}</span>
                <Switch aria-label={k.label} checked={layout[k.key]} onChange={() => toggleLayout(k.key)} />
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {tab === "simulations" && (
        <Card>
          <CardHead
            title="Simulations"
            description="Every simulator in the app, in one place — what-if models, sandboxes and test harnesses. Toggles save instantly."
            actions={<Badge tone="neutral">{SIMULATIONS.filter((f) => !!s[f.key]).length}/{SIMULATIONS.length} on</Badge>}
          />
          <CardBody style={{ paddingTop: 4 }}>
            {SIMULATIONS.map((f) => (
              <div key={f.key} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--av3-line)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</span>
                    {f.href && <a href={f.href} className="av3-cell-muted" style={{ fontSize: 11, fontFamily: "var(--av3-mono)", textDecoration: "none" }}>{f.href} →</a>}
                  </div>
                  <div className="av3-cell-muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>{f.desc}</div>
                </div>
                <Switch aria-label={f.label} checked={!!s[f.key]} onChange={() => put({ [f.key]: !s[f.key] } as Partial<Settings>)} />
              </div>
            ))}
            <div className="av3-cell-muted" style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 10 }}>
              The Floor Twin and Demand Exchange are always-on operational models computed live from real tables, slots and orders — not toggled sandboxes, so they aren&apos;t listed here.
            </div>
          </CardBody>

          {me?.role === "owner" && (
            <CardBody style={{ borderTop: "2px solid var(--av3-line)", paddingTop: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>Simulation mode</span>
                    {s.simulationModeEnabled && <Badge tone="info" dot>ON · your test data</Badge>}
                  </div>
                  <div className="av3-cell-muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 4 }}>
                    A pre-launch <strong>dry-run</strong>. Flips the <strong>whole business</strong> — admin and storefront — onto an isolated dataset, real data untouched. First enable <strong>seeds a realistic, deep CORE picture</strong> — ~10 months of trading (orders, KDS, tables, slots, staff, schedule, cash, bookings, loyalty) with lunch/dinner peaks and a real customer base, so Reports, Cohorts, Dayparts, Hourly and Menu engineering all show genuine signal and every operational screen is testable straight away; from there you push your own test orders, waste and costs by hand to rehearse the flow before go-live. Your <strong>AI agents keep working</strong> — they analyse this data (daily briefings, customer segments, summaries) so they learn and you can check their output. No real payments, SMS, WhatsApp, billing or backups fire. Switch it off and every test row disappears instantly (it&apos;s kept, so you can switch back on and continue).
                  </div>
                </div>
                <Switch
                  aria-label="Simulation mode"
                  checked={!!s.simulationModeEnabled}
                  disabled={simBusy != null}
                  onChange={() => simCall("toggle", { enabled: !s.simulationModeEnabled })}
                />
              </div>
              {s.simulationModeEnabled && (
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  <Button variant="secondary" size="sm" loading={simBusy === "reset"} disabled={simBusy != null} onClick={() => simCall("reset", { action: "reset" })}>
                    Reset &amp; re-seed
                  </Button>
                  <span className="av3-cell-muted" style={{ fontSize: 11.5 }}>Wipe the test dataset and re-seed a clean dry-run.</span>
                  <Button variant="secondary" size="sm" loading={simBusy === "wipe"} disabled={simBusy != null} onClick={() => simCall("wipe", { action: "wipe" })}>
                    Wipe to empty
                  </Button>
                  <span className="av3-cell-muted" style={{ fontSize: 11.5 }}>Clear every test row for hand-entry from scratch.</span>
                </div>
              )}

              {/* Live seed console — streams what the deep dry-run is doing right
                  now (NDJSON from the route) so the heavy reseed isn't a blind
                  wait. Intentionally a fixed dark terminal regardless of the
                  admin light/dark theme — see design-system admin/v3 doc. */}
              {(simBusy != null || simLog.length > 0) && (
                <div style={{ marginTop: 14 }} aria-busy={simBusy != null && !simDone}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--av3-line)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${simPct}%`, borderRadius: 999, background: simLog.some((l) => l.tone === "err") ? "#e5534b" : "var(--av3-brand)", transition: "width .3s ease" }} />
                    </div>
                    <span style={{ fontFamily: "var(--av3-mono)", fontSize: 12, fontWeight: 700, minWidth: 40, textAlign: "right", color: "var(--av3-fg)" }}>{simPct}%</span>
                  </div>
                  <div style={{ background: "#0b0f17", border: "1px solid var(--av3-line)", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 11px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: "#ff5f56", display: "inline-block" }} />
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: "#ffbd2e", display: "inline-block" }} />
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: "#27c93f", display: "inline-block" }} />
                      <span style={{ marginLeft: 6, fontFamily: "var(--av3-mono)", fontSize: 11, color: "#7b8ca0" }}>
                        simulation seed{simBusy ? ` · ${simBusy}` : ""}
                      </span>
                    </div>
                    <div ref={termRef} style={{ maxHeight: 220, overflowY: "auto", padding: "9px 12px", fontFamily: "var(--av3-mono)", fontSize: 11.5, lineHeight: 1.7 }}>
                      {simLog.length === 0 ? (
                        <div style={{ color: "#8aa0b6" }}>Starting…</div>
                      ) : (
                        simLog.map((l, i) => (
                          <div key={i} style={{ display: "flex", gap: 10, whiteSpace: "pre-wrap", color: l.tone === "err" ? "#ff9b9b" : l.tone === "ok" ? "#6ee7a8" : "#c7d4e3" }}>
                            <span style={{ color: "#5f7891", minWidth: 34, textAlign: "right", flexShrink: 0 }}>{l.pct}%</span>
                            <span>{l.tone === "err" ? "✗ " : l.tone === "ok" ? "✓ " : "› "}{l.msg}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          )}
        </Card>
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
