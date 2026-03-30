"use client";

import { useState, useEffect } from "react";
import { getLocale, setLocale, Locale } from "@/lib/i18n";
import { Globe } from "lucide-react";

export function LanguageSwitcher() {
  const [locale, setLocaleState] = useState<Locale>("pl");

  useEffect(() => {
    setLocaleState(getLocale());
  }, []);

  const toggle = () => {
    const next: Locale = locale === "pl" ? "en" : "pl";
    setLocale(next);
    setLocaleState(next);
    // Force re-render by reloading — lightweight approach for MVP
    window.location.reload();
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-italia-gray hover:bg-gray-100 transition-colors min-h-[44px]"
      title={locale === "pl" ? "Switch to English" : "Przełącz na Polski"}
    >
      <Globe className="h-4 w-4" />
      <span className="uppercase">{locale}</span>
    </button>
  );
}
