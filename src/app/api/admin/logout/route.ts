import { NextResponse } from "next/server";
import { clearSession, SESSION_COOKIE } from "@/lib/admin-auth";

export async function POST() {
  await clearSession();

  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE);

  return response;
}
