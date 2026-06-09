export const SITE_NAME = "Ottaviano";
export const SITE_DESCRIPTION =
  "Neapolitan pizza & fresh pasta from our restaurants in Kraków and Warsaw. Order online, ready in 15 minutes.";
export const COMPANY_NAME = "Ottaviano Sp. z o.o.";
export const DEFAULT_CURRENCY = "PLN";

// Operator-managed contact + social handles live on AppSettings
// (businessPhone, businessEmail, socialLinks) — edit them from
// /admin/settings → General. The Footer reads them through
// getSettings() / /api/settings/public; no constants live here.

/** Max distinct phone numbers in one family wallet (shared pool). */
export const WALLET_MAX_PHONES = 4;
