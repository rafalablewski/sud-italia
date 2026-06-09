"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bitcoin, CreditCard, ShieldCheck, Wallet } from "lucide-react";
import type { PaymentMethodId, PaymentSettings } from "@/lib/store";
import { Badge, Card, CardBody, CardHead, InfoButton, Kpi, SkeletonPage, Switch } from "./ui";

interface MethodMeta {
  id: PaymentMethodId;
  label: string;
  desc: string;
  /** false = settles off-Stripe (Bitcoin). */
  stripe: boolean;
}

const METHODS: MethodMeta[] = [
  { id: "card", label: "Card — Visa / Mastercard", desc: "Settled through Stripe. The default everywhere.", stripe: true },
  { id: "apple_pay", label: "Apple Pay", desc: "Wallet sheet on the card rail — shows on Apple devices automatically.", stripe: true },
  { id: "google_pay", label: "Google Pay", desc: "Wallet sheet on the card rail — shows on Android / Chrome automatically.", stripe: true },
  { id: "blik", label: "BLIK", desc: "Polish one-tap bank payment (6-digit code). Settled through Stripe.", stripe: true },
  { id: "p24", label: "Przelewy24", desc: "Polish bank-transfer network. Settled through Stripe.", stripe: true },
  { id: "bitcoin", label: "Bitcoin", desc: "Off-Stripe. Guest pays to your address; confirm receipt in POS.", stripe: false },
];

export function PaymentsV3() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [btc, setBtc] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const d = await fetch("/api/admin/payments").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d) {
      setSettings({ methods: d.methods, bitcoinAddress: d.bitcoinAddress });
      setBtc(d.bitcoinAddress ?? "");
      setStripeConfigured(!!d.stripeConfigured);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Persist immediately on every toggle (Rule #7); the BTC address saves on blur.
  const persist = (next: Partial<PaymentSettings>) =>
    fetch("/api/admin/payments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setSettings({ methods: d.methods, bitcoinAddress: d.bitcoinAddress }); })
      .catch(() => {});

  const enabledOf = (id: PaymentMethodId) => settings?.methods.find((m) => m.id === id)?.enabled ?? false;

  const toggle = (id: PaymentMethodId) => {
    if (!settings) return;
    const methods = settings.methods.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m));
    setSettings({ ...settings, methods });
    persist({ methods });
  };

  const liveCount = useMemo(() => settings?.methods.filter((m) => m.enabled).length ?? 0, [settings]);
  const cryptoOn = enabledOf("bitcoin");

  if (loading || !settings) return <SkeletonPage />;

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Payments</h1>
          <div className="av3-pagehead-sub">Which payment methods guests can use at checkout &amp; QR ordering · changes save instantly</div>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Methods live" icon={Wallet} value={`${liveCount}/${METHODS.length}`} accentVar="--av3-c4" info={
          <InfoButton title="Payment methods live"
            description="How many tender methods a guest can choose from at web checkout and QR ordering."
            institutional="Conversion rises with the right local rails, not with more options for their own sake. In Poland the institutional baseline is card + BLIK (BLIK alone is ~60% of Polish e-commerce transactions); Apple/Google Pay lift mobile conversion a few points each at near-zero cost since they ride the card rail. The gate: never ship a checkout without at least one instant local method (BLIK) plus card — and don't enable a method you can't actually settle (Bitcoin needs someone watching the wallet)."
            plain="If a guest at the table opens the QR menu and only sees 'Card', a chunk will bounce to ask a waiter. Add BLIK and Apple Pay and that same guest pays in two taps without typing a card number — on a 85 zł check that friction is the difference between a paid table and a walked one."
            tips="Keep card + BLIK on as the floor. Turn on Apple Pay + Google Pay (free — they ride card). Only enable Przelewy24 if your guests ask for bank transfer. Leave Bitcoin off unless someone is actively reconciling the wallet, because those orders sit unpaid until you confirm them in POS."
            methodology="Count of methods with enabled=true in payment-settings.json (PUT /api/admin/payments). Card/Apple/Google/BLIK/P24 settle via Stripe (driven into the checkout session's payment_method_types); Bitcoin is off-Stripe pay-to-address." />
        } />
        <Kpi label="Processor" icon={ShieldCheck} value="Stripe" accentVar="--av3-c2" />
        <Kpi label="Card rail" icon={CreditCard} value={enabledOf("card") || enabledOf("apple_pay") || enabledOf("google_pay") ? "On" : "Off"} accentVar="--av3-c3" />
        <Kpi label="Crypto" icon={Bitcoin} value={cryptoOn ? (btc ? "On" : "Needs address") : "Off"} accentVar="--av3-c5" />
      </div>

      <Card>
        <CardHead title="Stripe processor" description="Card, Apple Pay, Google Pay, BLIK and Przelewy24 all settle through Stripe." actions={
          <Badge tone={stripeConfigured ? "ok" : "warn"} dot>{stripeConfigured ? "live · STRIPE_SECRET_KEY set" : "needs config · set STRIPE_SECRET_KEY"}</Badge>
        } />
        <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
          <div className="av3-cell-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
            Secret keys live in environment variables, never in this panel. When Stripe is unset the storefront falls back to
            demo mode (orders are created unpaid and settled in POS). Apple Pay &amp; Google Pay require your domain to be
            verified in the Stripe dashboard; once enabled here they appear automatically on supported devices.
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead title="Methods" description="Toggle what guests can pay with. Card + BLIK are the Polish baseline." />
        <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
          {METHODS.map((m) => (
            <div key={m.id} className="av3-cfgrow" style={{ gridTemplateColumns: "1fr 64px", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--av3-line)" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  {m.label}
                  {!m.stripe && <Badge tone="warn">off-Stripe</Badge>}
                </div>
                <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{m.desc}</div>
                {m.id === "bitcoin" && enabledOf("bitcoin") && (
                  <label className="av3-field" style={{ marginTop: 8, maxWidth: 460 }}>
                    <span className="av3-field-label">Receiving BTC address (shown to the guest)</span>
                    <input
                      className="av3-input"
                      value={btc}
                      placeholder="bc1q…"
                      onChange={(e) => setBtc(e.target.value)}
                      onBlur={() => persist({ bitcoinAddress: btc })}
                    />
                  </label>
                )}
              </div>
              <Switch aria-label={`Enable ${m.label}`} checked={enabledOf(m.id)} onChange={() => toggle(m.id)} />
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
