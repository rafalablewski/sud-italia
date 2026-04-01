import { cookies } from "next/headers";
import { normalizePlPhoneE164 } from "@/lib/phone";

/** Customer phone from `sud-italia-customer` cookie (Rewards / checkout session). */
export async function getCustomerSessionPhone(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("sud-italia-customer")?.value;
  if (!raw) return null;
  return (
    normalizePlPhoneE164(decodeURIComponent(raw)) ??
    decodeURIComponent(raw).trim()
  );
}

export function genWalletInviteOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
