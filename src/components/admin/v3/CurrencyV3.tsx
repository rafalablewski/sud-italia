"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHead } from "./ui";

type Currency = "PLN" | "USD" | "SGD" | "EUR";
const ALL: Currency[] = ["PLN", "USD", "SGD", "EUR"];
const META: Record<Currency, { label: string; symbol: string }> = {
  PLN: { label: "Polish Złoty", symbol: "zł" }, USD: { label: "US Dollar", symbol: "$" },
  SGD: { label: "Singapore Dollar", symbol: "S$" }, EUR: { label: "Euro", symbol: "€" },
};

export function CurrencyV3() {
  const [enabled, setEnabled] = useState<Record<Currency, boolean>>({ PLN: true, USD: false, SGD: false, EUR: false });
  const [rates, setRates] = useState<Record<Currency, string>>({ PLN: "1", USD: "", SGD: "", EUR: "" });
  const [def, setDef] = useState<Currency>("PLN");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/admin/currency").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (d) {
      setDef(d.defaultCurrency ?? "PLN");
      setEnabled({ PLN: true, USD: d.enabledCurrencies?.includes("USD"), SGD: d.enabledCurrencies?.includes("SGD"), EUR: d.enabledCurrencies?.includes("EUR") });
      setRates({ PLN: "1", USD: String(d.rates?.USD ?? ""), SGD: String(d.rates?.SGD ?? ""), EUR: String(d.rates?.EUR ?? "") });
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const enabledList = ALL.filter((c) => enabled[c]);
      const rateNums = Object.fromEntries(ALL.map((c) => [c, Number(rates[c]) || (c === "PLN" ? 1 : 0)])) as Record<Currency, number>;
      const res = await fetch("/api/admin/currency", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultCurrency: def, enabledCurrencies: enabledList, rates: rateNums }) });
      if (res.ok) await load();
    } finally { setSaving(false); }
  };

  if (loading) return <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading currency…</div>;

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Currency</h1>
          <div className="av3-pagehead-sub">Display currencies &amp; FX rates (operator surfaces stay in PLN)</div>
        </div>
        <div className="av3-pagehead-actions"><Button variant="primary" size="sm" loading={saving} onClick={save}>Save</Button></div>
      </div>
      <Card>
        <CardHead title="Currencies" description="Toggle which currencies guests can display, set the rate vs PLN" actions={<Badge tone="brand"><Coins style={{ width: 11, height: 11 }} /> default {def}</Badge>} />
        <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
          {ALL.map((c) => (
            <div key={c} style={{ display: "grid", gridTemplateColumns: "1fr 140px 90px 90px", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--av3-line)" }}>
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>{META[c].label}</div><div className="av3-cell-muted" style={{ fontSize: 11 }}>{c} · {META[c].symbol}</div></div>
              <label className="av3-field"><span className="av3-field-label">Rate / PLN</span><input className="av3-input" type="number" step="any" value={rates[c]} disabled={c === "PLN"} onChange={(e) => setRates((r) => ({ ...r, [c]: e.target.value }))} /></label>
              <button type="button" className="av3-toggle" data-on={enabled[c]} disabled={c === "PLN"} onClick={() => setEnabled((e) => ({ ...e, [c]: !e[c] }))} style={{ height: 32 }}>{enabled[c] ? "On" : "Off"}</button>
              <button type="button" className="av3-toggle" data-on={def === c} disabled={!enabled[c]} onClick={() => setDef(c)} style={{ height: 32 }}>{def === c ? "Default" : "Set"}</button>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}
