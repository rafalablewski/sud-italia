"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Fingerprint,
  FlaskConical,
  History,
  KeyRound,
  LayoutGrid,
  MapPin,
  Palette,
  Phone,
  Save,
  ShieldCheck,
  Smartphone,
  Sprout,
  Truck,
} from "lucide-react";
import { useAdminPush } from "./v2/useAdminPush";
import { useToast } from "./v2/ui/Toast";

import { ThemesTab } from "./settings/ThemesTab";
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
  socialLinks?: {
    instagram: string;
    facebook: string;
    tiktok: string;
  };
  deliveryThresholds?: {
    firstTime?: number;
    growing?: number;
    regular?: number;
    vip?: number;
  };
  refundControls?: {
    singleMaxGrosze?: number;
    compDailyCapGrosze?: number;
  };
  simulationEnabled?: boolean;
  kdsSimulatorEnabled?: boolean;
  whatsappSimulatorEnabled?: boolean;
  cohortSimulationEnabled?: boolean;
  ltvCacSimulationEnabled?: boolean;
  menuEngineeringSimulationEnabled?: boolean;
  /** Storefront visibility toggles set in the Layout tab. */
  layout?: {
    showCurrencySwitcher: boolean;
    showLanguageSwitcher: boolean;
    showBundlesShowcase: boolean;
    showLoyaltySection: boolean;
    showSeasonalSpecials: boolean;
    showCartUpsell: boolean;
    showDeliveryProgress: boolean;
    showPushOptIn: boolean;
    showFeedbackSurvey: boolean;
    showNpsSurvey: boolean;
    showPostOrderUpsell: boolean;
    showChatWidget: boolean;
    showLiveTicker: boolean;
  };
}

type LayoutFlag = NonNullable<Settings["layout"]> extends infer L
  ? L extends Record<string, boolean>
    ? keyof L
    : never
  : never;

interface LayoutToggleSpec {
  key: LayoutFlag;
  group: "Header" | "Landing" | "Menu pages" | "Cart" | "Order confirmation" | "Site-wide";
  label: string;
  description: string;
  onCopy: string;
  offCopy: string;
}

const LAYOUT_TOGGLES: LayoutToggleSpec[] = [
  {
    key: "showCurrencySwitcher",
    group: "Header",
    label: "Currency switcher",
    description:
      "The currency picker in the public site header. Off ⇒ storefront falls back to PLN. Admin reports stay PLN-pinned regardless via AdminCurrencyGuard.",
    onCopy: "Visible in the public site header.",
    offCopy: "Hidden — storefront uses PLN everywhere.",
  },
  {
    key: "showLanguageSwitcher",
    group: "Header",
    label: "Language switcher",
    description:
      "The locale picker in the public site header. Off ⇒ storefront serves the default locale only.",
    onCopy: "Visible in the public site header.",
    offCopy: "Hidden — default locale only.",
  },
  {
    key: "showBundlesShowcase",
    group: "Landing",
    label: "Bundles showcase",
    description:
      "The deal-bundles block on the public landing page (sourced from DEFAULT_BUNDLES + DEFAULT_COMBO_DEALS).",
    onCopy: "Showing on the landing page.",
    offCopy: "Hidden from the landing.",
  },
  {
    key: "showLoyaltySection",
    group: "Landing",
    label: "Loyalty pitch",
    description:
      "The points / tier ladder pitch on the landing and per-location pages. The dedicated /rewards page is unaffected.",
    onCopy: "Showing on the landing and location pages.",
    offCopy: "Hidden from landing + location pages.",
  },
  {
    key: "showSeasonalSpecials",
    group: "Menu pages",
    label: "Seasonal specials rail",
    description: "The per-location seasonal-items callout on the menu page.",
    onCopy: "Showing on location menu pages.",
    offCopy: "Hidden — seasonals only via the menu list.",
  },
  {
    key: "showCartUpsell",
    group: "Cart",
    label: "Cart cross-sell rail",
    description:
      "The espresso + dessert (and similar) suggestions inside the cart drawer (from getCartSuggestions).",
    onCopy: "Suggestions visible inside the cart drawer.",
    offCopy: "Hidden — no in-cart cross-sell.",
  },
  {
    key: "showDeliveryProgress",
    group: "Cart",
    label: "Free-delivery progress",
    description:
      "The shimmer / sweep / unlock progress bar that counts up to the free-delivery threshold inside the cart.",
    onCopy: "Progress bar visible in the cart drawer.",
    offCopy: "Hidden — operators charging flat delivery may prefer off.",
  },
  {
    key: "showPushOptIn",
    group: "Order confirmation",
    label: "Push opt-in button",
    description:
      "The web-push subscription button on the order-confirmation page.",
    onCopy: "Visible after a successful order.",
    offCopy: "Hidden — no in-page push prompt.",
  },
  {
    key: "showFeedbackSurvey",
    group: "Order confirmation",
    label: "Feedback survey",
    description:
      "The post-order 5-star survey on the confirmation + review pages. Surveys still arrive via admin Feedback when this is off, just not collected client-side.",
    onCopy: "Survey visible after pickup / delivery.",
    offCopy: "Hidden — no client-side survey.",
  },
  {
    key: "showNpsSurvey",
    group: "Site-wide",
    label: "Pulse micro-surveys (NPS)",
    description:
      "NPS-style 1–5★ micro-surveys that fire opportunistically across the storefront — after ordering, on prolonged browsing, on exit intent, for returning visitors. Master kill-switch for the global SurveyPrompt + trigger engine; per-survey activation lives in /admin/surveys. Frequency-capped to at most one prompt per session.",
    onCopy: "Pulse prompts active (per-survey toggles in Pulse surveys).",
    offCopy: "Hidden — no Pulse prompts, timers, or listeners.",
  },
  {
    key: "showPostOrderUpsell",
    group: "Order confirmation",
    label: "Post-order upsell",
    description:
      "The 'complete your meal' cross-sell on the confirmation page. Uses the same getCartSuggestions() engine as the cart, seeded with the just-placed order and filtered to additive items; adding one starts a quick follow-on order.",
    onCopy: "Complement suggestions shown after a successful order.",
    offCopy: "Hidden — no post-order cross-sell.",
  },
  {
    key: "showChatWidget",
    group: "Site-wide",
    label: "Chat widget",
    description: "The floating chat affordance in the public site footer.",
    onCopy: "Floating chat available across the public site.",
    offCopy: "Hidden — no in-page chat.",
  },
  {
    key: "showLiveTicker",
    group: "Header",
    label: "Live activity ticker",
    description:
      "V8 espresso strip below the top nav: orders in the last hour, currently preparing, trending item, average prep time. Same widget data as /locations/[slug] LiveActivityBar but rendered chain-wide on every storefront route.",
    onCopy: "Live ticker visible under the nav.",
    offCopy: "Hidden — nav sits directly above page content.",
  },
];

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

type TabKey = "general" | "layout" | "themes" | "security" | "audit" | "danger";

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AdminSettings() {
  return <AdminSettingsDesktop />;
}

function AdminSettingsDesktop() {
  const toast = useToast();
  const push = useAdminPush();
  const [tab, setTab] = useState<TabKey>("general");

  const [settings, setSettings] = useState<Settings | null>(null);
  const [deliveryFeeStr, setDeliveryFeeStr] = useState("0.00");
  const [minOrderStr, setMinOrderStr] = useState("0.00");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [igUrl, setIgUrl] = useState("");
  const [fbUrl, setFbUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  // Audit §3 — per-segment free-delivery thresholds. Empty string = use
  // the SEGMENT_FREE_DELIVERY_THRESHOLD default for that band.
  const [thFirstTime, setThFirstTime] = useState("");
  const [thGrowing, setThGrowing] = useState("");
  const [thRegular, setThRegular] = useState("");
  const [thVip, setThVip] = useState("");
  // Refund/comp caps (audit §11.2). 0 zł = that cap is off.
  const [refundSingleMaxStr, setRefundSingleMaxStr] = useState("");
  const [refundCompCapStr, setRefundCompCapStr] = useState("");
  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const [kdsSimulatorEnabled, setKdsSimulatorEnabled] = useState(false);
  const [whatsappSimulatorEnabled, setWhatsappSimulatorEnabled] = useState(false);
  const [cohortSimulationEnabled, setCohortSimulationEnabled] = useState(false);
  const [ltvCacSimulationEnabled, setLtvCacSimulationEnabled] = useState(false);
  const [menuEngineeringSimulationEnabled, setMenuEngineeringSimulationEnabled] = useState(false);
  const [layoutFlags, setLayoutFlags] = useState<Record<LayoutFlag, boolean>>(
    () =>
      LAYOUT_TOGGLES.reduce((acc, spec) => {
        acc[spec.key] = true;
        return acc;
      }, {} as Record<LayoutFlag, boolean>),
  );
  const [layoutBusy, setLayoutBusy] = useState<Set<LayoutFlag>>(new Set());
  const [saving, setSaving] = useState(false);
  const [simBusy, setSimBusy] = useState(false);
  const [kdsSimBusy, setKdsSimBusy] = useState(false);
  const [whatsappSimBusy, setWhatsappSimBusy] = useState(false);
  const [cohortSimBusy, setCohortSimBusy] = useState(false);
  const [ltvCacSimBusy, setLtvCacSimBusy] = useState(false);
  const [menuEngSimBusy, setMenuEngSimBusy] = useState(false);

  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  // Password change
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  // The current operator's own sign-in facts (for the "How you sign in" panel).
  const [me, setMe] = useState<{
    name: string;
    email?: string;
    role: string;
    locationScope?: string[] | null;
    signIn?: {
      door: string;
      landing: string;
      hasPassword: boolean;
      hasPin: boolean;
      passkeys: number;
      mfa: boolean;
      shared: boolean;
    };
  } | null>(null);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    if (!res.ok) return;
    const data: Settings = await res.json();
    setSettings(data);
    setDeliveryFeeStr((data.deliveryFee / 100).toFixed(2));
    setMinOrderStr((data.minOrderAmount / 100).toFixed(2));
    setPhone(data.businessPhone ?? "");
    setEmail(data.businessEmail ?? "");
    setIgUrl(data.socialLinks?.instagram ?? "");
    setFbUrl(data.socialLinks?.facebook ?? "");
    setTiktokUrl(data.socialLinks?.tiktok ?? "");
    const t = data.deliveryThresholds;
    setThFirstTime(typeof t?.firstTime === "number" ? (t.firstTime / 100).toFixed(2) : "");
    setThGrowing(typeof t?.growing === "number" ? (t.growing / 100).toFixed(2) : "");
    setThRegular(typeof t?.regular === "number" ? (t.regular / 100).toFixed(2) : "");
    setThVip(typeof t?.vip === "number" ? (t.vip / 100).toFixed(2) : "");
    const rc = data.refundControls;
    setRefundSingleMaxStr(typeof rc?.singleMaxGrosze === "number" ? (rc.singleMaxGrosze / 100).toFixed(2) : "200.00");
    setRefundCompCapStr(typeof rc?.compDailyCapGrosze === "number" ? (rc.compDailyCapGrosze / 100).toFixed(2) : "500.00");
    setSimulationEnabled(!!data.simulationEnabled);
    setKdsSimulatorEnabled(!!data.kdsSimulatorEnabled);
    setWhatsappSimulatorEnabled(!!data.whatsappSimulatorEnabled);
    setCohortSimulationEnabled(!!data.cohortSimulationEnabled);
    setLtvCacSimulationEnabled(!!data.ltvCacSimulationEnabled);
    setMenuEngineeringSimulationEnabled(!!data.menuEngineeringSimulationEnabled);
    // Layout tab — visibility toggles for storefront chrome. Default to
    // "show" so a freshly-deployed instance behaves the same as before
    // this tab existed. Any unset flag stays `true`.
    setLayoutFlags(
      LAYOUT_TOGGLES.reduce((acc, spec) => {
        acc[spec.key] = data.layout?.[spec.key] ?? true;
        return acc;
      }, {} as Record<LayoutFlag, boolean>),
    );
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
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMe(d))
      .catch(() => {});
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

      // Refund/comp caps — always sent as a complete object (both fields) so a
      // partial PUT can't drop one field on the shallow settings merge. Blank or
      // 0 = that cap is disabled.
      const parseGroszeOrZero = (s: string): number => {
        const v = Math.max(0, Math.round(parseFloat(s.trim() || "0") * 100));
        return Number.isFinite(v) ? v : 0;
      };
      const refundControls = {
        singleMaxGrosze: parseGroszeOrZero(refundSingleMaxStr),
        compDailyCapGrosze: parseGroszeOrZero(refundCompCapStr),
      };

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryFee: Math.round(parseFloat(deliveryFeeStr || "0") * 100),
          minOrderAmount: Math.round(parseFloat(minOrderStr || "0") * 100),
          businessPhone: phone.trim(),
          businessEmail: email.trim(),
          socialLinks: {
            instagram: igUrl.trim(),
            facebook: fbUrl.trim(),
            tiktok: tiktokUrl.trim(),
          },
          deliveryThresholds,
          refundControls,
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

  // Generic helper for the three what-if simulator toggles — each gates a
  // nav link + a server-side page redirect, exactly like toggleSimulation.
  const toggleAnalyticsSim = async (
    key: "cohortSimulationEnabled" | "ltvCacSimulationEnabled" | "menuEngineeringSimulationEnabled",
    next: boolean,
    setEnabled: (v: boolean) => void,
    setBusy: (v: boolean) => void,
    label: string,
  ) => {
    setBusy(true);
    setEnabled(next); // optimistic
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      if (res.ok) {
        toast.success(next ? `${label} enabled` : `${label} disabled`);
        window.dispatchEvent(new Event("sud-admin-settings-updated"));
        await Promise.all([fetchSettings(), fetchAudit()]);
      } else {
        setEnabled(!next); // revert
        toast.error("Could not update toggle");
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleLayoutFlag = async (spec: LayoutToggleSpec, next: boolean) => {
    setLayoutBusy((s) => new Set(s).add(spec.key));
    setLayoutFlags((s) => ({ ...s, [spec.key]: next })); // optimistic
    try {
      // Merge with the existing layout object so toggling one flag
      // doesn't clobber sibling flags. Also merge in the *current* full
      // map of in-memory flags so any flags that were defaulted-true on
      // mount get explicitly persisted on the first toggle.
      const mergedLayout = {
        ...layoutFlags,
        ...(settings?.layout ?? {}),
        [spec.key]: next,
      };
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: mergedLayout }),
      });
      if (res.ok) {
        toast.success(next ? `${spec.label} shown` : `${spec.label} hidden`);
        window.dispatchEvent(new Event("sud-admin-settings-updated"));
        await Promise.all([fetchSettings(), fetchAudit()]);
      } else {
        setLayoutFlags((s) => ({ ...s, [spec.key]: !next })); // revert
        toast.error("Could not update toggle");
      }
    } finally {
      setLayoutBusy((s) => {
        const next = new Set(s);
        next.delete(spec.key);
        return next;
      });
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
            { value: "themes", label: "Themes", icon: <Palette className="h-3.5 w-3.5" /> },
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
                <div className="v2-form-section">
                  <h3 className="v2-form-section-h">Social links</h3>
                  <p className="v2-form-section-sub">
                    Rendered in the public footer. Leave a field blank to hide that link.
                  </p>
                  <div className="v2-form-row-3">
                    <Input
                      label="Instagram URL"
                      type="url"
                      placeholder="https://instagram.com/your-handle"
                      value={igUrl}
                      onChange={(e) => setIgUrl(e.target.value)}
                    />
                    <Input
                      label="Facebook URL"
                      type="url"
                      placeholder="https://facebook.com/your-page"
                      value={fbUrl}
                      onChange={(e) => setFbUrl(e.target.value)}
                    />
                    <Input
                      label="TikTok URL"
                      type="url"
                      placeholder="https://tiktok.com/@your-handle"
                      value={tiktokUrl}
                      onChange={(e) => setTiktokUrl(e.target.value)}
                    />
                  </div>
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
              title="Refund & comp controls (audit §11.2)"
              description="Caps that stop one person from comping the whole shift. Refunds are already manager/owner-only; these add a ceiling. Owners always bypass — a blocked refund just needs an owner to sign in and process it. Set a field to 0 to disable that cap."
            />
            <CardBody>
              <div className="v2-form-row-2">
                <Input
                  label="Per-refund limit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={refundSingleMaxStr}
                  onChange={(e) => setRefundSingleMaxStr(e.target.value)}
                  trailingAdornment={<span className="v2-muted">zł</span>}
                  description="Any single refund or comp above this needs an owner. Default 200 PLN."
                />
                <Input
                  label="Daily comp cap (per person · per truck)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={refundCompCapStr}
                  onChange={(e) => setRefundCompCapStr(e.target.value)}
                  trailingAdornment={<span className="v2-muted">zł</span>}
                  description="Total 'manager comp' (on-the-house) one person can give away per day at one location before an owner is required. Customer-request / quality refunds don't count. Default 500 PLN."
                />
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
                <label className="v2-field">
                  <span className="v2-field-label">Cohort &amp; CLTV simulator</span>
                  <span className="v2-muted text-sm">
                    What-if on top of the real cohort report. Seeds the blended retention
                    curve, repeat rate and CLTV from live paid orders, then projects them
                    forward under operator-set retention uplift, AOV growth and order-frequency
                    levers. Read-only on the data — nothing here writes to orders, CRM or reports.
                  </span>
                  <span className="inline-flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={cohortSimulationEnabled}
                      onChange={(e) =>
                        toggleAnalyticsSim(
                          "cohortSimulationEnabled",
                          e.target.checked,
                          setCohortSimulationEnabled,
                          setCohortSimBusy,
                          "Cohort & CLTV simulator",
                        )
                      }
                      disabled={cohortSimBusy}
                    />
                    <span className="v2-muted text-sm">
                      {cohortSimulationEnabled
                        ? "On — a what-if sandbox shows at the bottom of the Cohort & CLTV report (/admin/reports/cohort)."
                        : "Off — the sandbox section is hidden on the Cohort & CLTV report."}
                    </span>
                  </span>
                </label>
                <label className="v2-field">
                  <span className="v2-field-label">LTV / CAC simulator</span>
                  <span className="v2-muted text-sm">
                    What-if on top of the real LTV/CAC report. Seeds blended LTV, CAC, margin
                    and the LTV:CAC ratio from live orders + your marketing-cost ledger, then
                    lets you flex CAC, retention, AOV, gross margin and frequency to watch the
                    ratio, payback and profit-per-customer move against the 3× gate.
                  </span>
                  <span className="inline-flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={ltvCacSimulationEnabled}
                      onChange={(e) =>
                        toggleAnalyticsSim(
                          "ltvCacSimulationEnabled",
                          e.target.checked,
                          setLtvCacSimulationEnabled,
                          setLtvCacSimBusy,
                          "LTV / CAC simulator",
                        )
                      }
                      disabled={ltvCacSimBusy}
                    />
                    <span className="v2-muted text-sm">
                      {ltvCacSimulationEnabled
                        ? "On — a what-if sandbox shows at the bottom of the LTV/CAC report (/admin/reports/ltv-cac)."
                        : "Off — the sandbox section is hidden on the LTV/CAC report."}
                    </span>
                  </span>
                </label>
                <label className="v2-field">
                  <span className="v2-field-label">Menu engineering simulator</span>
                  <span className="v2-muted text-sm">
                    What-if on top of the real Kasavana-Smith matrix. Seeds each dish&apos;s
                    velocity and margin from live order history, then re-prices (with a demand
                    elasticity), re-promotes puzzles or removes dogs to project total contribution
                    margin and the quadrant reshuffle before you touch the live menu.
                  </span>
                  <span className="inline-flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={menuEngineeringSimulationEnabled}
                      onChange={(e) =>
                        toggleAnalyticsSim(
                          "menuEngineeringSimulationEnabled",
                          e.target.checked,
                          setMenuEngineeringSimulationEnabled,
                          setMenuEngSimBusy,
                          "Menu engineering simulator",
                        )
                      }
                      disabled={menuEngSimBusy}
                    />
                    <span className="v2-muted text-sm">
                      {menuEngineeringSimulationEnabled
                        ? "On — a what-if sandbox shows at the bottom of the Menu engineering report (/admin/menu-engineering)."
                        : "Off — the sandbox section is hidden on the Menu engineering report."}
                    </span>
                  </span>
                </label>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Push notifications"
              description="Subscribe this device to admin push alerts — new orders, slot pressure, low stock, cash variance and refunds. Per-device; subscribe on each phone or desktop you want pinged."
              actions={<Bell className="h-4 w-4 v2-muted" />}
            />
            <CardBody>
              {!push.supported ? (
                <p className="v2-muted text-sm">
                  This browser doesn&apos;t support web push (notifications, service workers or the
                  Push API are unavailable). Try a recent Chrome, Edge, Firefox or Safari.
                </p>
              ) : !push.configured ? (
                <p className="v2-muted text-sm">
                  Web push isn&apos;t configured on the server yet. Set{" "}
                  <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> and <code>VAPID_PRIVATE_KEY</code> to
                  enable it, then this control will let operators subscribe.
                </p>
              ) : (
                <div className="inline-flex items-center gap-3">
                  <Button
                    variant={push.subscribed ? "secondary" : "primary"}
                    leadingIcon={<Bell className="h-3.5 w-3.5" />}
                    loading={push.busy}
                    onClick={() => (push.subscribed ? push.unsubscribe() : push.subscribe())}
                  >
                    {push.subscribed ? "Unsubscribe this device" : "Enable push on this device"}
                  </Button>
                  <span className="v2-muted text-sm">
                    {push.subscribed
                      ? "On — this device receives admin push alerts."
                      : push.permission === "denied"
                        ? "Notifications are blocked in your browser settings — allow them for this site first."
                        : "Off — this device won't receive push alerts."}
                  </span>
                </div>
              )}
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
        <>
          {(["Header", "Landing", "Menu pages", "Cart", "Order confirmation", "Site-wide"] as const).map((group) => {
            const items = LAYOUT_TOGGLES.filter((t) => t.group === group);
            if (items.length === 0) return null;
            return (
              <Card key={group}>
                <CardHeader
                  title={group}
                  description={
                    group === "Header"
                      ? "Switchers that live in the top bar across every public route."
                      : group === "Landing"
                      ? "Sections rendered by the public landing page."
                      : group === "Menu pages"
                      ? "Surfaces specific to /locations/[slug]."
                      : group === "Cart"
                      ? "Blocks inside the cart drawer (slides over the menu page)."
                      : group === "Order confirmation"
                      ? "Post-checkout prompts on /order-confirmation."
                      : "Anything global to the public site."
                  }
                />
                <CardBody>
                  <div className="v2-stack-12">
                    {items.map((spec) => {
                      const value = layoutFlags[spec.key];
                      const busy = layoutBusy.has(spec.key);
                      return (
                        <label key={spec.key} className="v2-field">
                          <span className="v2-field-label">{spec.label}</span>
                          <span className="v2-muted text-sm">{spec.description}</span>
                          <span className="inline-flex items-center gap-2 mt-1">
                            <input
                              type="checkbox"
                              checked={value}
                              onChange={(e) => toggleLayoutFlag(spec, e.target.checked)}
                              disabled={busy || !settings}
                            />
                            <span className="v2-muted text-sm">
                              {value ? spec.onCopy : spec.offCopy}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </>
      )}

      {tab === "themes" && <ThemesTab />}

      {tab === "security" && (
        <div className="v2-stack-12">
        {me?.signIn && (
          <Card>
            <CardHeader
              title="How you sign in"
              description="Your own account, the doors open to you, and where you land."
            />
            <CardBody>
              <div className="v2-stack-12">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <strong>{me.name}</strong>
                  {me.email && <span className="v2-muted">{me.email}</span>}
                  <Badge tone="brand" variant="soft">{me.role}</Badge>
                </div>

                <div className="v2-note">
                  <ShieldCheck className="h-4 w-4" />
                  <span>
                    You sign in at <span className="mono">{me.signIn.door}</span>
                    {me.role === "owner"
                      ? " — the owner / admin door."
                      : " — the universal team door."}{" "}
                    After sign-in you land on{" "}
                    <strong>
                      {me.signIn.landing === "/core/kds"
                        ? "the Kitchen Display (KDS)"
                        : me.signIn.landing === "/core/pos"
                          ? "the POS till"
                          : "the admin dashboard"}
                    </strong>
                    {Array.isArray(me.locationScope) && !me.locationScope.includes("*")
                      ? `, scoped to ${me.locationScope.join(", ")}.`
                      : ", across all locations."}
                  </span>
                </div>

                <div>
                  <div className="v2-field-label" style={{ marginBottom: 6 }}>Your active sign-in methods</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <Badge tone={me.signIn.shared ? "warning" : "success"} variant="soft" dot>
                      <KeyRound className="h-3 w-3" />{" "}
                      {me.signIn.shared ? "Shared password" : "Personal password"}
                    </Badge>
                    {me.signIn.hasPin && (
                      <Badge tone="info" variant="soft" dot><Smartphone className="h-3 w-3" /> Terminal PIN</Badge>
                    )}
                    {me.signIn.passkeys > 0 && (
                      <Badge tone="brand" variant="soft" dot>
                        <Fingerprint className="h-3 w-3" /> {me.signIn.passkeys} passkey{me.signIn.passkeys > 1 ? "s" : ""}
                      </Badge>
                    )}
                    <Badge tone={me.signIn.mfa ? "success" : "neutral"} variant={me.signIn.mfa ? "soft" : "outline"} dot>
                      MFA {me.signIn.mfa ? "on" : "off"}
                    </Badge>
                  </div>
                </div>

                {(me.signIn.shared || !me.signIn.mfa) && (
                  <div className="v2-note">
                    <ShieldCheck className="h-4 w-4" />
                    <span>
                      {me.signIn.shared && (
                        <>You&rsquo;re using the <strong>shared password</strong> — set a personal password in <a className="underline" href="/admin/users">Users &amp; roles</a> (your row → Login). </>
                      )}
                      {!me.signIn.mfa && (
                        <>Add <strong>MFA</strong> or a <strong>passkey</strong> (your row → MFA / Keys) for phishing-resistant sign-in.</>
                      )}
                    </span>
                  </div>
                )}

                <p className="v2-muted" style={{ fontSize: "0.8rem" }}>
                  Manage every account&rsquo;s credentials, passkeys, MFA and the full picture in{" "}
                  <a className="underline" href="/admin/users">Users &amp; roles</a>.
                </p>
              </div>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Shared admin password" description="Rotate the master password used by the legacy shared owner session (no-email login). Per-user passwords are set per account in Users & roles." />
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
        </div>
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
              <Table flush rows={audit} columns={auditCols} rowKey={(e) => e.id} defaultSort={{ key: "when", dir: "desc" }} />
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
