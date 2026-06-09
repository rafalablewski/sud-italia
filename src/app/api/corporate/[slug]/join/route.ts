import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import {
  findCorporateBySlug,
  inviteFamilyWalletMember,
  storeWalletInviteOtp,
} from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { getSmsProvider } from "@/lib/providers/sms";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Corporate join intake (audit §3.4). Public endpoint; rate-limited per IP
 * so a join URL shared in a company Slack can't be abused as an SMS
 * pumping attack.
 *
 * Flow:
 *   1. POST { phone } → server normalises to PL E.164, queues an invite on
 *      the underlying FamilyWallet, generates a 6-digit OTP, and sends it
 *      via SMS (no-op when Twilio isn't configured).
 *   2. The invitee enters the OTP through the existing wallet-confirm UI;
 *      that promotes them to `active` and they start ordering on the
 *      corporate billing card.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const rl = await enforceRateLimit({
    key: "corporate-join",
    id: getClientIp(req),
    limit: 5,
    windowSec: 60,
  });
  if (rl) return rl;

  const { slug } = await params;
  const wallet = await findCorporateBySlug(slug);
  if (!wallet || !wallet.corporate) {
    return NextResponse.json({ error: "Corporate account not found" }, { status: 404 });
  }

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const phone = normalizePlPhoneE164(body.phone || "");
  if (!phone) {
    return NextResponse.json({ error: "Invalid Polish phone number" }, { status: 400 });
  }

  const result = await inviteFamilyWalletMember(wallet.id, wallet.headPhone, phone);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Generate + send a 6-digit confirmation code. The OTP is stored under
  // the invitee's phone; the existing /api/customer/wallet/confirm flow
  // consumes it and flips the membership to `active`.
  // crypto.randomInt is used (not Math.random) so the code can't be
  // predicted by an attacker who knows the rough enrolment timestamp.
  const code = randomInt(100_000, 1_000_000).toString();
  await storeWalletInviteOtp(phone, wallet.id, code);
  await getSmsProvider().send(
    phone,
    `Ottaviano Corporate — your code to join ${wallet.corporate.name}: ${code}. Expires in 10 minutes.`,
  );

  return NextResponse.json({ ok: true, resent: result.resent });
}
