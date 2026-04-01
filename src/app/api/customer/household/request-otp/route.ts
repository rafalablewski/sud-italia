import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { storeHouseholdOtp } from "@/lib/store";
import { normalizePlPhoneE164, phonesEqualPl } from "@/lib/phone";

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Sends a 6-digit code for number-owner verification.
 * In production, wire this to SMS; dev returns devCode for testing.
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("sud-italia-customer")?.value;
  if (!raw) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const sessionPhone =
    normalizePlPhoneE164(decodeURIComponent(raw)) ??
    decodeURIComponent(raw).trim();

  let bodyPhone: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.phone === "string") {
      bodyPhone = normalizePlPhoneE164(body.phone);
    }
  } catch {
    /* empty */
  }

  const target = bodyPhone || sessionPhone;
  if (!target || !phonesEqualPl(target, sessionPhone)) {
    return NextResponse.json(
      { error: "Phone must match your signed-in number" },
      { status: 403 }
    );
  }

  const code = genCode();
  await storeHouseholdOtp(target, code);

  if (process.env.NODE_ENV === "development") {
    console.info(`[household-otp] ${target}: ${code}`);
  }

  const payload: { ok: boolean; devCode?: string } = { ok: true };
  if (process.env.NODE_ENV === "development") {
    payload.devCode = code;
  }

  return NextResponse.json(payload);
}
