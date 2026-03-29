import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getLoyaltyMembers, addLoyaltyMember } from "@/lib/store";
import { readFile, writeFile, access, mkdir } from "fs/promises";
import { join } from "path";

interface PointAdjustment {
  phone: string;
  amount: number;
  reason: string;
  adjustedBy: string;
  adjustedAt: string;
}

const FILE_PATH = join(process.cwd(), ".data", "point-adjustments.json");

async function getAdjustments(): Promise<PointAdjustment[]> {
  try {
    await access(join(process.cwd(), ".data"));
  } catch {
    await mkdir(join(process.cwd(), ".data"), { recursive: true });
  }
  try {
    const data = await readFile(FILE_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { phone, amount, reason } = body;

  if (!phone || typeof amount !== "number" || amount === 0) {
    return NextResponse.json({ error: "Phone and non-zero amount required" }, { status: 400 });
  }

  try {
    // Read existing adjustments
    const list = await getAdjustments();

    // Add new adjustment
    list.push({
      phone,
      amount,
      reason: reason || (amount > 0 ? "Manual points added" : "Manual points removed"),
      adjustedBy: "admin",
      adjustedAt: new Date().toISOString(),
    });

    // Write back
    await writeFile(FILE_PATH, JSON.stringify(list, null, 2));

    // Ensure the member exists
    const members = await getLoyaltyMembers();
    if (!members.some((m) => m.phone === phone)) {
      await addLoyaltyMember({
        phone,
        name: "Member",
        signedUpAt: new Date().toISOString(),
      });
    }

    // Calculate new total
    const total = list
      .filter((a) => a.phone === phone)
      .reduce((sum, a) => sum + a.amount, 0);

    return NextResponse.json({ phone, manualPoints: total, success: true });
  } catch (error) {
    console.error("Points adjustment error:", error);
    return NextResponse.json(
      { error: `Failed to save: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 500 }
    );
  }
}
