import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifyAndConsumeHouseholdOtp,
  markLoyaltyMemberOwnerVerified,
} from "@/lib/store";
import { normalizePlPhoneE164, phonesEqualPl } from "@/lib/phone";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("sud-italia-customer")?.value;
  if (!raw) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const sessionPhone =
    normalizePlPhoneE164(decodeURIComponent(raw)) ??
    decodeURIComponent(raw).trim();

  let phone: string | null = null;
  let code = "";
  try {
    const body = await req.json();
    if (typeof body?.phone === "string") {
      phone = normalizePlPhoneE164(body.phone);
    }
    if (typeof body?.code === "string") {
      code = body.code;
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const target = phone || sessionPhone;
  if (!target || !phonesEqualPl(target, sessionPhone)) {
    return NextResponse.json(
      { error: "Phone must match your signed-in number" },
      { status: 403 }
    );
  }

  const ok = await verifyAndConsumeHouseholdOtp(target, code);
  if (!ok) {
    return NextResponse.json(
      { error: "Invalid or expired code" },
      { status: 400 }
    );
  }

  await markLoyaltyMemberOwnerVerified(target);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    "sud-italia-number-owner",
    encodeURIComponent(target),
    {
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    }
  );
  return res;
}
