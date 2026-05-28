"use client";

import { useEffect, useState } from "react";
import { getLocale, setLocale, ALL_LOCALES, LOCALE_META, Locale } from "@/lib/i18n";
import { fetchPublicSettings } from "@/lib/public-settings";

// V8 Trattoria language pill — inline segmented control of one-letter
// codes (EN / PL / DE / SG) inside a terracotta-tinted pill. The
// previously-shipped dropdown is gone; V8's nav budget calls for the row
// to read at a glance. Honours the enabledLocales from public settings
// just like the old dropdown — disabled locales drop out of the row.
const SHORT_CODE: Record<Locale, string> = {
  pl: "PL",
  en: "EN",
  de: "DE",
  "en-SG": "SG",
};

export function LanguageSwitcher() {
  const [locale, setLocaleState] = useState<Locale>("pl");
  const [enabled, setEnabled] = useState<Locale[]>([...ALL_LOCALES]);

  useEffect(() => {
    setLocaleState(getLocale());
    fetchPublicSettings().then((data) => {
      if (data?.locale?.enabledLocales?.length) {
        setEnabled(data.locale.enabledLocales);
      }
    });
  }, []);

  const pick = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    setLocaleState(next);
    // Reload so SSR strings re-render with the new locale — same approach
    // the i18n MVP has used since launch.
    window.location.reload();
  };

  // Preserve the ALL_LOCALES order so the pill reads predictably.
  const visible = ALL_LOCALES.filter((l) => enabled.includes(l));

  return (
    <div className="v8-lang-picker inline-flex items-center rounded-full p-[2px] gap-[2px]" role="radiogroup" aria-label="Primary language">
      {visible.map((code) => {
        const meta = LOCALE_META[code];
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => pick(code)}
            role="radio"
            aria-checked={active}
            title={meta.label}
            className={`v8-lang-opt appearance-none border-0 bg-transparent font-body text-[11px] font-semibold tracking-[0.12em] px-[10px] py-[5px] rounded-full leading-none cursor-pointer transition-colors ${
              active ? "v8-lang-opt-active" : ""
            }`}
          >
            {SHORT_CODE[code]}
          </button>
        );
      })}
    </div>
  );
}
