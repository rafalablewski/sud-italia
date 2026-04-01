import { NextRequest, NextResponse } from "next/server";
import {
  getOrders,
  getLoyaltyMember,
  addLoyaltyMember,
  resolveCustomerLoyalty,
} from "@/lib/store";
import { normalizePlPhoneE164, phonesEqualPl } from "@/lib/phone";

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
  const loyalty = await resolveCustomerLoyalty(phone, allOrders);

  const customerOrders = allOrders.filter(
    (o) =>
      o.customerPhone &&
      phonesEqualPl(o.customerPhone, phone) &&
      o.status !== "pending"
  );

  if (customerOrders.length > 0) {
    const latest = customerOrders.sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    )[0];

    await addLoyaltyMember({
      phone,
      name: latest.customerName,
      signedUpAt: new Date().toISOString(),
    });

    const member = await getLoyaltyMember(phone);

    return NextResponse.json({
      customer: {
        phone,
        name: member?.name || latest.customerName,
        lastName: member?.lastName || "",
        nickname: member?.nickname || "",
        ordersCount: loyalty.ordersCount,
        points: loyalty.points,
        spendablePoints: loyalty.spendablePoints,
        wallet: loyalty.wallet,
        isNew: false,
      },
    });
  }

  const existing = await getLoyaltyMember(phone);
  if (existing) {
    return NextResponse.json({
      customer: {
        phone: existing.phone,
        name: existing.name,
        lastName: existing.lastName || "",
        nickname: existing.nickname || "",
        ordersCount: loyalty.ordersCount,
        points: loyalty.points,
        spendablePoints: loyalty.spendablePoints,
        wallet: loyalty.wallet,
        isNew: false,
      },
    });
  }

  if (signup === "true") {
    await addLoyaltyMember({
      phone,
      name: "New Member",
      signedUpAt: new Date().toISOString(),
    });

    return NextResponse.json({
      customer: {
        phone,
        name: "New Member",
        lastName: "",
        nickname: "",
        ordersCount: 0,
        points: loyalty.points,
        spendablePoints: loyalty.spendablePoints,
        wallet: loyalty.wallet,
        isNew: true,
      },
    });
  }

  return NextResponse.json({ customer: null });
}
