/**
 * Polish mobile numbers → canonical E.164 (+48 + 9 digits).
 * Accepts common variants: 662…, 0662…, 48662…, +48…, spaces/dashes.
 */
export function normalizePlPhoneE164(input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  let national: string;

  if (digits.startsWith("48") && digits.length >= 11) {
    national = digits.slice(2, 11);
  } else if (digits.length === 9) {
    national = digits;
  } else if (digits.length === 10 && digits.startsWith("0")) {
    national = digits.slice(1);
  } else if (digits.length === 11 && digits.startsWith("48")) {
    national = digits.slice(2);
  } else {
    return null;
  }

  if (!/^\d{9}$/.test(national)) return null;
  return `+48${national}`;
}

export function phonesEqualPl(a: string, b: string): boolean {
  const na = normalizePlPhoneE164(a);
  const nb = normalizePlPhoneE164(b);
  if (na && nb) return na === nb;
  return a.trim() === b.trim();
}

/** Sum manual point adjustments across legacy keys that match the same normalized PL mobile. */
export function sumManualPointsForPhone(
  phone: string,
  totalsByStoredKey: Record<string, number>
): number {
  const canonical = normalizePlPhoneE164(phone);
  let sum = 0;
  for (const [storedKey, amount] of Object.entries(totalsByStoredKey)) {
    if (canonical ? phonesEqualPl(storedKey, canonical) : storedKey.trim() === phone.trim()) {
      sum += amount;
    }
  }
  return sum;
}
