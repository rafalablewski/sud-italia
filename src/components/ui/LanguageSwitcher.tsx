"use client";

import { useEffect, useRef, useState } from "react";
import { getLocale, setLocale, ALL_LOCALES, LOCALE_META, Locale } from "@/lib/i18n";
import { Globe, Check } from "lucide-react";

interface PublicLocaleConfig {
  enabledLocales: Locale[];
  defaultLocale: Locale;
}

export function LanguageSwitcher() {
  const [locale, setLocaleState] = useState<Locale>("pl");
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<Locale[]>([...ALL_LOCALES]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocaleState(getLocale());
    // Fetch operator-configured enabled list; fall back to all locales if
    // the endpoint isn't yet returning it (zero-friction defaults).
    fetch("/api/settings/public")
      .then((r) => r.json())
      .then((data: { locale?: PublicLocaleConfig }) => {
        if (data.locale?.enabledLocales?.length) {
          setEnabled(data.locale.enabledLocales);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const pick = (next: Locale) => {
    setLocale(next);
    setLocaleState(next);
    setOpen(false);
    // Reload so SSR-rendered strings and the new locale agree — same
    // approach the i18n MVP has used since launch.
    window.location.reload();
  };

  const current = LOCALE_META[locale];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-italia-gray hover:bg-gray-100 transition-colors min-h-[44px]"
        title={`Language: ${current.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Globe className="h-4 w-4" />
        <span className="uppercase">{locale === "en-SG" ? "SG" : locale}</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-2 min-w-[12rem] bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
        >
          {enabled.map((code) => {
            const meta = LOCALE_META[code];
            const active = code === locale;
            return (
              <li key={code}>
                <button
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(code)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-gray-50 ${
                    active ? "text-italia-red font-semibold" : "text-italia-dark"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden>{meta.flag}</span>
                    <span>{meta.nativeLabel}</span>
                  </span>
                  {active && <Check className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
