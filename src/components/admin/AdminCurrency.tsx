"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Save } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  useToast,
} from "./v2/ui";

type Currency = "PLN" | "USD" | "SGD" | "EUR";

const ALL: Currency[] = ["PLN", "USD", "SGD", "EUR"];

const META: Record<Currency, { label: string; symbol: string }> = {
  PLN: { label: "Polish Złoty", symbol: "zł" },
  USD: { label: "US Dollar", symbol: "$" },
  SGD: { label: "Singapore Dollar", symbol: "S$" },
  EUR: { label: "Euro", symbol: "€" },
};

interface CurrencyConfig {
  defaultCurrency: Currency;
  enabledCurrencies: Currency[];
  rates: Record<Currency, number>;
}

export function AdminCurrency() {
  const toast = useToast();
  const [config, setConfig] = useState<CurrencyConfig | null>(null);
  const [defaultCurrency, setDefault] = useState<Currency>("PLN");
  const [enabled, setEnabled] = useState<Record<Currency, boolean>>({
    PLN: true,
    USD: true,
    SGD: true,
    EUR: true,
  });
  const [rateStrings, setRateStrings] = useState<Record<Currency, string>>({
    PLN: "1",
    USD: "0.25",
    SGD: "0.34",
    EUR: "0.23",
  });
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    const res = await fetch("/api/admin/currency");
    if (!res.ok) return;
    const data: CurrencyConfig = await res.json();
    setConfig(data);
    setDefault(data.defaultCurrency);
    setEnabled({
      PLN: true,
      USD: data.enabledCurrencies.includes("USD"),
      SGD: data.enabledCurrencies.includes("SGD"),
      EUR: data.enabledCurrencies.includes("EUR"),
    });
    setRateStrings({
      PLN: "1",
      USD: String(data.rates.USD),
      SGD: String(data.rates.SGD),
      EUR: String(data.rates.EUR),
    });
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const save = async () => {
    const rates = parseRates();
    if (!rates) return; // toast already fired
    const enabledList = ALL.filter((c) => enabled[c] || c === "PLN");
    if (!enabledList.includes(defaultCurrency)) {
      toast.error("Default currency must be enabled");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/currency", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultCurrency,
          enabledCurrencies: enabledList,
          rates,
        }),
      });
      if (res.ok) {
        toast.success("Currency settings saved");
        await fetchConfig();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error("Could not save", (err as { error?: string }).error);
      }
    } finally {
      setSaving(false);
    }
  };

  // Parse `rateStrings` into the numeric payload the API expects. Returns
  // null + flags the first offending field via toast when any rate isn't
  // a positive finite number — prevents the toggle path from POSTing a
  // payload Zod will reject server-side (which would round-trip a 400
  // for nothing).
  const parseRates = (): Record<Currency, number> | null => {
    const rates: Record<Currency, number> = {
      PLN: 1,
      USD: Number(rateStrings.USD),
      SGD: Number(rateStrings.SGD),
      EUR: Number(rateStrings.EUR),
    };
    for (const c of ALL) {
      if (!Number.isFinite(rates[c]) || rates[c] <= 0) {
        toast.error(
          `Rate for ${c} must be a positive number before changing the enabled list`,
        );
        return null;
      }
    }
    return rates;
  };

  const toggle = async (currency: Currency, next: boolean) => {
    if (currency === "PLN") return; // PLN is always on
    const rates = parseRates();
    if (!rates) return; // toast already fired
    const nextEnabled = { ...enabled, [currency]: next };
    setEnabled(nextEnabled);
    // Persist immediately so toggle = saved (Rule 7).
    const enabledList = ALL.filter((c) => nextEnabled[c] || c === "PLN");
    const safeDefault = enabledList.includes(defaultCurrency)
      ? defaultCurrency
      : "PLN";
    if (safeDefault !== defaultCurrency) setDefault(safeDefault);
    const res = await fetch("/api/admin/currency", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultCurrency: safeDefault,
        enabledCurrencies: enabledList,
        rates,
      }),
    });
    if (!res.ok) {
      setEnabled(enabled); // revert
      toast.error(`Could not ${next ? "enable" : "disable"} ${currency}`);
    } else {
      toast.success(`${currency} ${next ? "enabled" : "disabled"}`);
      await fetchConfig();
    }
  };

  if (!config) {
    return (
      <div className="v2-page">
        <header className="v2-page-header">
          <h1 className="v2-page-title">Currency</h1>
        </header>
        <p className="admin-text-secondary">Loading…</p>
      </div>
    );
  }

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title flex items-center gap-2">
            <Coins className="h-6 w-6" /> Currency
          </h1>
          <p className="v2-page-subtitle">
            Configure which currencies the customer-facing switcher exposes
            on the homepage, set per-currency display rates against PLN,
            and choose the default the site loads with. Orders are always
            charged in PLN — non-PLN selections are a reference display.
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:gap-6">
        <Card>
          <CardHeader title="Enabled currencies" description="PLN cannot be disabled — it's the charge currency." />
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ALL.map((c) => {
                const meta = META[c];
                const on = enabled[c];
                const locked = c === "PLN";
                return (
                  <label
                    key={c}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer transition ${
                      on
                        ? "border-emerald-400/40 bg-emerald-500/5"
                        : "border-[var(--border)] bg-[var(--surface-2)]"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="admin-text font-medium flex items-center gap-2">
                        <span className="font-mono text-xs">{c}</span>
                        <span>{meta.symbol}</span>
                        {locked && <Badge tone="neutral" variant="soft">required</Badge>}
                      </span>
                      <span className="admin-text-secondary text-xs">{meta.label}</span>
                    </div>
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={on}
                      disabled={locked}
                      onChange={(e) => toggle(c, e.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Default currency"
            description="What customers see before they pick from the switcher."
          />
          <CardBody>
            <Select
              value={defaultCurrency}
              onChange={(e) => setDefault(e.target.value as Currency)}
            >
              {ALL.filter((c) => enabled[c] || c === "PLN").map((c) => (
                <option key={c} value={c}>
                  {c} — {META[c].label}
                </option>
              ))}
            </Select>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Exchange rates"
            description="Multiplier applied to a PLN-złoty amount. Example: 100 PLN × 0.25 = 25 USD."
          />
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ALL.map((c) => (
                <div key={c}>
                  <label className="block admin-text-secondary text-xs mb-1">
                    1 PLN → {c}
                  </label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={rateStrings[c]}
                    disabled={c === "PLN"}
                    onChange={(e) =>
                      setRateStrings((prev) => ({ ...prev, [c]: e.target.value }))
                    }
                  />
                  <p className="admin-text-secondary text-[11px] mt-1">
                    Preview: 100 PLN = {META[c].symbol}
                    {(100 * Number(rateStrings[c] || 0)).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={save} disabled={saving} variant="primary">
                <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save rates"}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
