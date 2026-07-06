"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CheckCircle2, Coins, Percent } from "lucide-react";
import { Badge, Card, CardBody, CardHead, Kpi, SkeletonPage, Switch } from "./ui";

type Currency = "PLN" | "USD" | "SGD" | "EUR" | "AED";
const ALL: Currency[] = ["PLN", "USD", "SGD", "EUR", "AED"];
const META: Record<Currency, { label: string; symbol: string }> = {
  PLN: { label: "Polish Złoty", symbol: "zł" }, USD: { label: "US Dollar", symbol: "$" },
  SGD: { label: "Singapore Dollar", symbol: "S$" }, EUR: { label: "Euro", symbol: "€" },
  AED: { label: "UAE Dirham", symbol: "د.إ" },
};

export function CurrencyV3() {
  const [enabled, setEnabled] = useState<Record<Currency, boolean>>({ PLN: true, USD: false, SGD: false, EUR: false, AED: false });
  const [rates, setRates] = useState<Record<Currency, string>>({ PLN: "1", USD: "", SGD: "", EUR: "", AED: "" });
  const [def, setDef] = useState<Currency>("PLN");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const d = await fetch("/api/admin/currency").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d) {
      setDef(d.defaultCurrency ?? "PLN");
      setEnabled({ PLN: true, USD: d.enabledCurrencies?.includes("USD"), SGD: d.enabledCurrencies?.includes("SGD"), EUR: d.enabledCurrencies?.includes("EUR"), AED: d.enabledCurrencies?.includes("AED") });
      setRates({ PLN: "1", USD: String(d.rates?.USD ?? ""), SGD: String(d.rates?.SGD ?? ""), EUR: String(d.rates?.EUR ?? ""), AED: String(d.rates?.AED ?? "") });
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Persist immediately on every toggle (rule #7); rates persist on blur. The
  // caller passes the next values so we don't read stale state.
  const persist = (next: { enabled?: Record<Currency, boolean>; def?: Currency; rates?: Record<Currency, string> }) => {
    const en = next.enabled ?? enabled, df = next.def ?? def, rt = next.rates ?? rates;
    const rateNums = Object.fromEntries(ALL.map((c) => [c, Number(rt[c]) || (c === "PLN" ? 1 : 0)])) as Record<Currency, number>;
    return fetch("/api/admin/currency", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultCurrency: df, enabledCurrencies: ALL.filter((c) => en[c]), rates: rateNums }) });
  };
  const toggleEnabled = (c: Currency) => {
    const en = { ...enabled, [c]: !enabled[c] };
    const df = en[def] ? def : "PLN"; // can't keep a disabled currency as default
    setEnabled(en); setDef(df); persist({ enabled: en, def: df });
  };
  const setDefault = (c: Currency) => { setDef(c); persist({ def: c }); };

  const enabledCount = useMemo(() => ALL.filter((c) => enabled[c]).length, [enabled]);
  const ratesSet = useMemo(() => ALL.filter((c) => c !== "PLN" && enabled[c] && Number(rates[c]) > 0).length, [enabled, rates]);

  if (loading) return <SkeletonPage />;

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Currency</h1>
          <div className="av3-pagehead-sub">Display currencies &amp; FX rates (operator surfaces stay in PLN) · changes save instantly</div>
        </div>
      </div>
      <div className="av3-kpi-rail">
        <Kpi label="Default" icon={Coins} value={def} accentVar="--av3-c2" />
        <Kpi label="Enabled" icon={CheckCircle2} value={`${enabledCount}/${ALL.length}`} accentVar="--av3-c4" />
        <Kpi label="FX rates set" icon={Percent} value={`${ratesSet}`} accentVar="--av3-c3" />
        <Kpi label="Charges in" icon={Banknote} value="PLN" accentVar="--av3-c1" />
      </div>
      <Card>
        <CardHead title="Currencies" description="Toggle which currencies guests can display, set the rate vs PLN" actions={<Badge tone="brand"><Coins style={{ width: 11, height: 11 }} /> default {def}</Badge>} />
        <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
          {ALL.map((c) => (
            <div key={c} className="av3-cfgrow" style={{ gridTemplateColumns: "1fr 140px 90px 90px", padding: "9px 0", borderBottom: "1px solid var(--av3-line)" }}>
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>{META[c].label}</div><div className="av3-cell-muted" style={{ fontSize: 11 }}>{c} · {META[c].symbol}</div></div>
              <label className="av3-field"><span className="av3-field-label">Rate / PLN</span><input className="av3-input" type="number" step="any" value={rates[c]} disabled={c === "PLN"} onChange={(e) => setRates((r) => ({ ...r, [c]: e.target.value }))} onBlur={() => persist({ rates })} /></label>
              <Switch aria-label={`Enable ${META[c].label}`} checked={enabled[c]} disabled={c === "PLN"} onChange={() => toggleEnabled(c)} />
              <button type="button" className="av3-toggle" data-on={def === c} disabled={!enabled[c]} onClick={() => setDefault(c)} style={{ height: 32 }}>{def === c ? "Default" : "Set"}</button>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
