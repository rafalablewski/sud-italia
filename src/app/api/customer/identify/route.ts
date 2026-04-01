import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getOrders,
  getLoyaltyMember,
  addLoyaltyMember,
  getManualPointsTotal,
  type LoyaltyMember,
} from "@/lib/store";
import { normalizePlPhoneE164, phonesEqualPl } from "@/lib/phone";

async function withHouseholdFlags<T extends Record<string, unknown>>(
  phone: string,
  customer: T,
  memberHint?: LoyaltyMember | null
) {
  const cookieStore = await cookies();
  const ownerRaw = cookieStore.get("sud-italia-number-owner")?.value;
  const ownerDecoded = ownerRaw
    ? normalizePlPhoneE164(decodeURIComponent(ownerRaw)) ??
      decodeURIComponent(ownerRaw).trim()
    : null;
  const isNumberOwner = !!(
    ownerDecoded && phonesEqualPl(ownerDecoded, phone)
  );
  const member = memberHint ?? (await getLoyaltyMember(phone));
  return {
    ...customer,
    isNumberOwner,
    householdLabels: member?.householdLabels ?? [],
  };
}

export async function GET(req: NextRequest) {
  const phoneRaw = req.nextUrl.searchParams.get("phone");
  const signup = req.nextUrl.searchParams.get("signup");

  if (!phoneRaw) {
    return NextResponse.json({ customer: null });
  }

  const phone = normalizePlPhoneE164(phoneRaw);
  if (!phone) {
    return NextResponse.json({ customer: null });
  }

  const allOrders = await getOrders();
  const customerOrders = allOrders.filter(
    (o) => phonesEqualPl(o.customerPhone, phone) && o.status !== "pending"
  );

  if (customerOrders.length > 0) {
    const latest = customerOrders.sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    )[0];

    const totalSpent = customerOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const manualPoints = await getManualPointsTotal(phone);
    const points = Math.floor(totalSpent / 100) + manualPoints;

    await addLoyaltyMember({
      phone,
      name: latest.customerName,
      signedUpAt: new Date().toISOString(),
    });

    const member = await getLoyaltyMember(phone);

    return NextResponse.json({
      customer: await withHouseholdFlags(phone, {
        phone,
        name: member?.name || latest.customerName,
        lastName: member?.lastName || "",
        nickname: member?.nickname || "",
        ordersCount: customerOrders.length,
        points,
        isNew: false,
      }, member),
    });
  }

  const existing = await getLoyaltyMember(phone);
  if (existing) {
    const manualPoints = await getManualPointsTotal(phone);
    return NextResponse.json({
      customer: await withHouseholdFlags(phone, {
        phone: existing.phone,
        name: existing.name,
        lastName: existing.lastName || "",
        nickname: existing.nickname || "",
        ordersCount: 0,
        points: manualPoints,
        isNew: false,
      }, existing),
    });
  }

  if (signup === "true") {
    await addLoyaltyMember({
      phone,
      name: "New Member",
      signedUpAt: new Date().toISOString(),
    });
    const member = await getLoyaltyMember(phone);

    return NextResponse.json({
      customer: await withHouseholdFlags(phone, {
        phone,
        name: "New Member",
        lastName: "",
        nickname: "",
        ordersCount: 0,
        points: 0,
        isNew: true,
      }, member),
    });
  }

  return NextResponse.json({ customer: null });
}
