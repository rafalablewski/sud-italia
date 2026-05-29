import { getOrders, getSettings, resolveLocationCompliance } from "@/lib/store";
import type { ComplianceConfig } from "@/lib/store";

/**
 * Build a JPK_V7M (monthly) XML envelope for orders in a date window.
 *
 * Polish tax law (Ordynacja podatkowa + Ministerstwo Finansów regulations)
 * requires every VAT-registered taxpayer to submit JPK_V7 monthly. The
 * canonical schema is `https://crd.gov.pl/wzor/2022/01/05/11148/` for V7M.
 *
 * Scope of this generator: emits a syntactically valid `<JPK>` document
 * with the `<Naglowek>`, `<Podmiot1>`, `<SprzedazWiersz>` rows for every
 * non-cancelled, non-pending order in the window, plus the aggregate
 * `<SprzedazCtrl>` block. The recipient is treated as anonymous (B2C) which
 * matches the food-service reality — pizza orders almost never collect a
 * NIP. Per Polish rules these B2C sales can be reported as a single daily
 * `WEW` (internal) document, but we emit one row per order for full
 * traceability so reconciliation against `orders.json` is line-perfect.
 *
 * VAT rate: prepared food in PL defaults to 8% (ustawa o VAT, załącznik
 * 10, poz. 3) but is resolved per location via
 * `resolveLocationCompliance(...).vatRateBps`, so a truck on a
 * different rate can override it from /admin/regulatory-compliance
 * without a deploy. Refunds (full or partial) reduce the gross/net/VAT
 * components proportionally. Tips are excluded from the taxable base —
 * gratuities are not VATable under PL practice.
 *
 * Caveats (documented inline so the accountant can spot them):
 *   - Header `KodFormularza` is V7M, not V7K (quarterly).
 *   - The schema requires NIP, full name, address etc. of the taxpayer —
 *     we read these from env vars (JPK_NIP, JPK_NAME, JPK_REGON,
 *     JPK_ADDRESS) and fall back to placeholders so the file validates
 *     syntactically; correct values must be set before submission.
 *   - No reverse-charge / OSS / split-payment markers are emitted —
 *     food trucks don't use them.
 */

const DEFAULT_VAT_BPS = 800; // 8% — Polish prepared food, ustawa o VAT zał. 10 poz. 3.

function vatRateFor(locationSlug: string, compliance: ComplianceConfig | undefined): number {
  const loc = resolveLocationCompliance(compliance, locationSlug);
  return (loc.vatRateBps ?? DEFAULT_VAT_BPS) / 10000;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmtGrosze(grosze: number): string {
  // Polish format requires fixed 2 decimals.
  return (grosze / 100).toFixed(2);
}

function netFromGross(grossGrosze: number, rate: number): number {
  // Net = gross / (1 + rate). Round to grosze.
  return Math.round(grossGrosze / (1 + rate));
}

interface JpkSettings {
  nip: string;
  name: string;
  regon?: string;
  email?: string;
}

function loadSettings(): JpkSettings {
  return {
    nip: process.env.JPK_NIP || "0000000000",
    name: process.env.JPK_NAME || "SUD ITALIA SP. Z O.O. (placeholder)",
    regon: process.env.JPK_REGON,
    email: process.env.JPK_EMAIL,
  };
}

/**
 * Returns the JPK_V7M XML string for the inclusive month window
 * `[fromIso, toIso]`. Both should normally span exactly one calendar month;
 * the caller is responsible for picking the right boundaries.
 */
export async function buildJpkV7m(
  fromIso: string,
  toIso: string,
  locationSlug?: string,
): Promise<string> {
  const settings = loadSettings();
  const compliance = (await getSettings()).compliance;
  const orders = (await getOrders(locationSlug)).filter(
    (o) => o.status !== "pending" && o.status !== "cancelled",
  );

  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const fromDay = fromIso.slice(0, 10);
  const toDay = toIso.slice(0, 10);

  const rows: string[] = [];
  let totalVatGrosze = 0;
  let rowIndex = 0;

  for (const o of orders) {
    const occurred = new Date(o.paidAt || o.createdAt).getTime();
    if (!Number.isFinite(occurred) || occurred < fromMs || occurred > toMs) continue;

    // Tips are not VATable; only the goods portion of totalAmount counts.
    const tippable = o.totalAmount - (o.tipAmount ?? 0);
    // Refunds reduce the taxable base. Treat any refund record as a credit
    // — full and partial alike — by subtracting refund.amount.
    const refundDelta = o.refund?.amount ?? 0;
    const grossGrosze = Math.max(0, tippable - refundDelta);
    if (grossGrosze === 0) continue;

    const rate = vatRateFor(o.locationSlug, compliance);
    const netGrosze = netFromGross(grossGrosze, rate);
    const vatGrosze = grossGrosze - netGrosze;
    totalVatGrosze += vatGrosze;
    rowIndex++;

    const issueDate = (o.paidAt || o.createdAt).slice(0, 10);
    rows.push(
      `    <SprzedazWiersz>\n` +
        `      <LpSprzedazy>${rowIndex}</LpSprzedazy>\n` +
        `      <KodKrajuNadaniaTIN>PL</KodKrajuNadaniaTIN>\n` +
        `      <NrKontrahenta>brak</NrKontrahenta>\n` +
        `      <NazwaKontrahenta>${escapeXml(o.customerName || "Klient anonimowy")}</NazwaKontrahenta>\n` +
        `      <DowodSprzedazy>${escapeXml(o.id)}</DowodSprzedazy>\n` +
        `      <DataWystawienia>${issueDate}</DataWystawienia>\n` +
        `      <DataSprzedazy>${issueDate}</DataSprzedazy>\n` +
        `      <K_19>${fmtGrosze(netGrosze)}</K_19>\n` +
        `      <K_20>${fmtGrosze(vatGrosze)}</K_20>\n` +
        `    </SprzedazWiersz>`,
    );
  }

  const settings_block =
    `  <Podmiot1>\n` +
    `    <OsobaNiefizyczna>\n` +
    `      <NIP>${escapeXml(settings.nip)}</NIP>\n` +
    `      <PelnaNazwa>${escapeXml(settings.name)}</PelnaNazwa>\n` +
    (settings.regon ? `      <REGON>${escapeXml(settings.regon)}</REGON>\n` : "") +
    (settings.email ? `      <Email>${escapeXml(settings.email)}</Email>\n` : "") +
    `    </OsobaNiefizyczna>\n` +
    `  </Podmiot1>`;

  const header =
    `  <Naglowek>\n` +
    `    <KodFormularza kodSystemowy="JPK_V7M (2)" wersjaSchemy="1-0E">JPK_VAT</KodFormularza>\n` +
    `    <WariantFormularza>2</WariantFormularza>\n` +
    `    <DataWytworzeniaJPK>${new Date().toISOString()}</DataWytworzeniaJPK>\n` +
    `    <DataOd>${fromDay}</DataOd>\n` +
    `    <DataDo>${toDay}</DataDo>\n` +
    `    <NazwaSystemu>Sud Italia Admin</NazwaSystemu>\n` +
    `    <CelZlozenia>1</CelZlozenia>\n` +
    `    <KodUrzedu>${escapeXml(process.env.JPK_OFFICE_CODE || "0000")}</KodUrzedu>\n` +
    `  </Naglowek>`;

  const sprzedazCtrl =
    `  <SprzedazCtrl>\n` +
    `    <LiczbaWierszySprzedazy>${rowIndex}</LiczbaWierszySprzedazy>\n` +
    `    <PodatekNalezny>${fmtGrosze(totalVatGrosze)}</PodatekNalezny>\n` +
    `  </SprzedazCtrl>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<JPK xmlns="http://crd.gov.pl/wzor/2022/01/05/11148/">\n` +
    header +
    `\n` +
    settings_block +
    `\n` +
    `  <Sprzedaz>\n${rows.join("\n")}\n  </Sprzedaz>\n` +
    sprzedazCtrl +
    `\n</JPK>\n`
  );
}

export interface JpkSummary {
  rowCount: number;
  totalNetGrosze: number;
  totalVatGrosze: number;
  totalGrossGrosze: number;
}

/** Summary for a UI preview without building the full XML twice. */
export async function summarizeJpk(
  fromIso: string,
  toIso: string,
  locationSlug?: string,
): Promise<JpkSummary> {
  const compliance = (await getSettings()).compliance;
  const orders = (await getOrders(locationSlug)).filter(
    (o) => o.status !== "pending" && o.status !== "cancelled",
  );
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  let net = 0;
  let vat = 0;
  let gross = 0;
  let rows = 0;
  for (const o of orders) {
    const t = new Date(o.paidAt || o.createdAt).getTime();
    if (!Number.isFinite(t) || t < fromMs || t > toMs) continue;
    const tippable = o.totalAmount - (o.tipAmount ?? 0);
    const refundDelta = o.refund?.amount ?? 0;
    const g = Math.max(0, tippable - refundDelta);
    if (g === 0) continue;
    rows++;
    gross += g;
    const rate = vatRateFor(o.locationSlug, compliance);
    const n = netFromGross(g, rate);
    net += n;
    vat += g - n;
  }
  return { rowCount: rows, totalNetGrosze: net, totalVatGrosze: vat, totalGrossGrosze: gross };
}
