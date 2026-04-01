import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("sud-italia-customer", "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
  return res;
}
