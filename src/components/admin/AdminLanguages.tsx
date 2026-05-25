"use client";

import { useCallback, useEffect, useState } from "react";
import { Languages, Save } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Select,
  useToast,
} from "./v2/ui";

type Locale = "pl" | "en" | "de" | "en-SG";

const ALL: Locale[] = ["pl", "en", "de", "en-SG"];

const META: Record<Locale, { label: string; native: string; flag: string }> = {
  pl: { label: "Polish", native: "Polski", flag: "🇵🇱" },
  en: { label: "English", native: "English", flag: "🇬🇧" },
  de: { label: "German", native: "Deutsch", flag: "🇩🇪" },
  "en-SG": { label: "Singapore English", native: "Singapore English", flag: "🇸🇬" },
};

interface LocaleConfig {
  defaultLocale: Locale;
  enabledLocales: Locale[];
}

export function AdminLanguages() {
  const toast = useToast();
  const [config, setConfig] = useState<LocaleConfig | null>(null);
  const [defaultLocale, setDefault] = useState<Locale>("pl");
  const [enabled, setEnabled] = useState<Record<Locale, boolean>>({
    pl: true,
    en: true,
    de: true,
    "en-SG": true,
  });
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    const res = await fetch("/api/admin/languages");
    if (!res.ok) return;
    const data: LocaleConfig = await res.json();
    setConfig(data);
    setDefault(data.defaultLocale);
    setEnabled({
      pl: data.enabledLocales.includes("pl"),
      en: data.enabledLocales.includes("en"),
      de: data.enabledLocales.includes("de"),
      "en-SG": data.enabledLocales.includes("en-SG"),
    });
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const persist = async (next: {
    defaultLocale: Locale;
    enabled: Record<Locale, boolean>;
  }) => {
    const enabledList = ALL.filter((l) => next.enabled[l]);
    if (enabledList.length === 0) {
      toast.error("At least one language must be enabled");
      return false;
    }
    const safeDefault = enabledList.includes(next.defaultLocale)
      ? next.defaultLocale
      : enabledList[0];
    setSaving(true);
    try {
      const res = await fetch("/api/admin/languages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultLocale: safeDefault,
          enabledLocales: enabledList,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Could not save", (err as { error?: string }).error);
        return false;
      }
      await fetchConfig();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (locale: Locale, next: boolean) => {
    const nextEnabled = { ...enabled, [locale]: next };
    setEnabled(nextEnabled);
    const ok = await persist({ defaultLocale, enabled: nextEnabled });
    if (ok) {
      toast.success(`${META[locale].label} ${next ? "enabled" : "disabled"}`);
    } else {
      setEnabled(enabled); // revert
    }
  };

  const saveDefault = async (next: Locale) => {
    setDefault(next);
    const ok = await persist({ defaultLocale: next, enabled });
    if (ok) {
      toast.success(`Default language set to ${META[next].label}`);
    }
  };

  if (!config) {
    return (
      <div className="v2-page">
        <header className="v2-page-header">
          <h1 className="v2-page-title">Languages</h1>
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
            <Languages className="h-6 w-6" /> Languages
          </h1>
          <p className="v2-page-subtitle">
            Pick which languages the customer site exposes in the
            header switcher and which loads by default. Supports Polish,
            English, German, and Singapore English — the first three power
            DACH expansion, the last pairs with the SGD currency for the
            Singapore market.
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:gap-6">
        <Card>
          <CardHeader
            title="Enabled languages"
            description="Toggle each language — saved immediately."
          />
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ALL.map((l) => {
                const meta = META[l];
                const on = enabled[l];
                return (
                  <label
                    key={l}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer transition ${
                      on
                        ? "border-emerald-400/40 bg-emerald-500/5"
                        : "border-[var(--border)] bg-[var(--surface-2)]"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="admin-text font-medium flex items-center gap-2">
                        <span aria-hidden>{meta.flag}</span>
                        <span>{meta.native}</span>
                        {l === defaultLocale && (
                          <Badge tone="info" variant="soft">default</Badge>
                        )}
                      </span>
                      <span className="admin-text-secondary text-xs">
                        Code: {l}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={on}
                      disabled={saving}
                      onChange={(e) => toggle(l, e.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Default language"
            description="Loads when a visitor has no saved preference."
          />
          <CardBody>
            <Select
              value={defaultLocale}
              onChange={(e) => saveDefault(e.target.value as Locale)}
              disabled={saving}
            >
              {ALL.filter((l) => enabled[l]).map((l) => (
                <option key={l} value={l}>
                  {META[l].flag} {META[l].native} ({l})
                </option>
              ))}
            </Select>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Translation coverage" description="Customer-site UI string count per locale." />
          <CardBody>
            <p className="admin-text-secondary text-sm">
              Translations live in <code>src/lib/i18n.ts</code>. Every UI
              string is present for all four locales — additions to the
              dictionary automatically flow through to the customer
              header, cart, order confirmation, and footer via the{" "}
              <code>t(key)</code> helper.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ALL.map((l) => (
                <Badge key={l} tone="success" variant="soft">
                  {META[l].flag} {l} · live
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
