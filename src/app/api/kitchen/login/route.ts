import { NextRequest, NextResponse } from "next/server";
import {
  createKitchenToken,
  verifyKitchenCredentials,
  KITCHEN_SESSION_COOKIE,
  KITCHEN_SESSION_MAX_AGE,
} from "@/lib/kitchen-auth";
import { getLocation } from "@/data/locations";

export async function POST(req: NextRequest) {
  try {
    const { slug, username, password } = await req.json();

    if (!slug || typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const location = getLocation(slug);
    if (!location?.isActive) {
      return NextResponse.json({ error: "Unknown or inactive location" }, { status: 404 });
    }

    if (!verifyKitchenCredentials(slug, username, password)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = createKitchenToken(slug);
    const response = NextResponse.json({ success: true });
    response.cookies.set(KITCHEN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: KITCHEN_SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
