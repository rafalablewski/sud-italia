import { NextRequest, NextResponse } from "next/server";
import {
  deletePushSubscription,
  savePushSubscription,
  type StoredPushSubscription,
} from "@/lib/store";
import { getCustomerSessionPhone } from "@/lib/customer-session";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { logger } from "@/lib/logger";

/**
 * Web Push subscription endpoint (m5_6). Customers opt in via a
 * client-side button → PushManager.subscribe() → POST here with the
 * resulting endpoint + keys. We tie it to their cookie identity so
 * "your order is ready" pushes go to the right device.
 *
 * Unsubscribe: client DELETE with the same endpoint.
 */

interface SubscribePayload {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  phone?: string;
}

async function resolvePhone(payloadPhone?: string): Promise<string | null> {
  if (payloadPhone) {
    const normalized = normalizePlPhoneE164(payloadPhone);
    if (normalized) return normalized;
  }
  return getCustomerSessionPhone();
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as SubscribePayload;
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "Missing endpoint or keys" }, { status: 400 });
  }
  const phone = await resolvePhone(body.phone);
  if (!phone) {
    return NextResponse.json(
      { error: "No customer session — order once before subscribing, or pass `phone`." },
      { status: 401 },
    );
  }

  const row: Omit<StoredPushSubscription, "createdAt"> = {
    phone,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
  };
  await savePushSubscription(row);
  logger.info("push.subscribe", { phone, endpoint: body.endpoint.slice(0, 80) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }
  await deletePushSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
