"use client";

import { getOrCreateCartVisitorId } from "@/lib/cart-visitor-id";

/** Fire-and-forget cart presence snapshot (keepalive so it survives full-page navigation). */
export async function postCartPresenceToServer(
  locationSlug: string,
  items: { id: string; quantity: number }[],
  totalCents: number
): Promise<void> {
  const visitorId = getOrCreateCartVisitorId();
  if (!visitorId) return;

  const body = JSON.stringify({
    visitorId,
    locationSlug,
    items,
    totalCents,
  });

  const send = () =>
    fetch("/api/cart/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });

  try {
    let res = await send();
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1200));
      res = await send();
    }
  } catch {
    // ignore network errors
  }
}
