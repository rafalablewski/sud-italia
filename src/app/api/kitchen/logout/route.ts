import { NextResponse } from "next/server";
import { KITCHEN_SESSION_COOKIE } from "@/lib/kitchen-auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(KITCHEN_SESSION_COOKIE);
  return response;
}
