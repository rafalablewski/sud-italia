"use client";

import { useEffect, useState } from "react";
import { getLocale, setLocale, ALL_LOCALES, LOCALE_META, Locale } from "@/lib/i18n";
import { fetchPublicSettings } from "@/lib/public-settings";
import { NavDropdown } from "./NavDropdown";

// V8 Trattoria language switcher — collapsible disclosure on a
// terracotta-tinted pill. Trigger shows the active 2-letter code
// (EN / PL / DE / SG); clicking expands a small panel listing every
// enabled locale by code + native name (Polski, English, Deutsch,
// Singapore English). Replaces the previous always-expanded segmented
// row that ate too much width on a busy header. Honours
// `enabledLocales` from public settings.
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

  // Preserve the ALL_LOCALES order so the panel reads predictably.
  const visible = ALL_LOCALES.filter((l) => enabled.includes(l));

  return (
    <NavDropdown label={SHORT_CODE[locale]} ariaLabel="Language" tone="terracotta">
      {(close) =>
        visible.map((code) => {
          const meta = LOCALE_META[code];
          const active = code === locale;
          return (
            <button
              key={code}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => {
                close();
                pick(code);
              }}
              className="v8-switcher-opt"
            >
              <span className="v8-switcher-opt-code">{SHORT_CODE[code]}</span>
              <span className="v8-switcher-opt-label">{meta.nativeLabel}</span>
            </button>
          );
        })
      }
    </NavDropdown>
  );
}
