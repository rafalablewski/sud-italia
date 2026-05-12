import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getLoyaltyMembers, getOrders } from "@/lib/store";

interface TriggerRow {
  phone: string;
  name: string;
  email?: string;
  trigger: "birthday" | "anniversary";
  /** For anniversary: years since first order. For birthday: years old today. */
  years: number;
}

/**
 * Returns the list of customers to greet today: birthdays match the
 * current calendar day (month + day), anniversaries match the date of the
 * customer's first paid order. Lifetime events are the cheapest, highest-
 * lift CRM trigger — 3–5% revenue lift is the industry baseline.
 *
 * Out of scope (separate audit row): actually firing the email/SMS. This
 * endpoint just enumerates who's eligible so the admin UI can present
 * them, plus a future cron can pick them up.
 */
export async function GET(_req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const todayMm = today.getUTCMonth();
  const todayDd = today.getUTCDate();
  const todayYear = today.getUTCFullYear();

  const [members, orders] = await Promise.all([getLoyaltyMembers(), getOrders()]);

  // Build first-paid-order date per phone — anniversary lookup. We treat any
  // non-pending status as "paid" to match the analytics convention.
  const firstOrderByPhone = new Map<string, Date>();
  for (const o of orders) {
    if (o.status === "pending" || o.status === "cancelled") continue;
    const t = new Date(o.paidAt || o.createdAt);
    if (!Number.isFinite(t.getTime())) continue;
    const prev = firstOrderByPhone.get(o.customerPhone);
    if (!prev || t < prev) firstOrderByPhone.set(o.customerPhone, t);
  }

  const triggers: TriggerRow[] = [];

  for (const m of members) {
    const fullName = [m.name, m.lastName].filter(Boolean).join(" ").trim();

    if (m.dob) {
      const dob = new Date(m.dob);
      if (
        Number.isFinite(dob.getTime()) &&
        dob.getUTCMonth() === todayMm &&
        dob.getUTCDate() === todayDd
      ) {
        triggers.push({
          phone: m.phone,
          name: fullName || "Customer",
          email: m.email,
          trigger: "birthday",
          years: Math.max(0, todayYear - dob.getUTCFullYear()),
        });
      }
    }

    const first = firstOrderByPhone.get(m.phone);
    if (first && first.getUTCMonth() === todayMm && first.getUTCDate() === todayDd) {
      const years = todayYear - first.getUTCFullYear();
      if (years >= 1) {
        triggers.push({
          phone: m.phone,
          name: fullName || "Customer",
          email: m.email,
          trigger: "anniversary",
          years,
        });
      }
    }
  }

  return NextResponse.json({ date: today.toISOString().slice(0, 10), triggers });
}
