import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getLoyaltyMembers, addLoyaltyMember } from "@/lib/store";
import { readFile, writeFile, access, mkdir } from "fs/promises";
import { join } from "path";

const DATA_DIR = join(process.cwd(), ".data");

interface PointAdjustment {
  phone: string;
  amount: number;
  reason: string;
  adjustedBy: string;
  adjustedAt: string;
}

async function ensureDir() {
  try { await access(DATA_DIR); } catch { await mkdir(DATA_DIR, { recursive: true }); }
}

async function getAdjustments(): Promise<PointAdjustment[]> {
  await ensureDir();
  try {
    const data = await readFile(join(DATA_DIR, "point-adjustments.json"), "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function addAdjustment(adj: PointAdjustment): Promise<void> {
  await ensureDir();
  const list = await getAdjustments();
  list.push(adj);
  await writeFile(join(DATA_DIR, "point-adjustments.json"), JSON.stringify(list, null, 2));
}

export async function POST(req: NextRequest) {
  try {
    const authed = await isAuthenticated();
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { phone, amount, reason } = body;

    if (!phone || typeof amount !== "number" || amount === 0) {
      return NextResponse.json({ error: "Phone and non-zero amount required" }, { status: 400 });
    }

    await addAdjustment({
      phone,
      amount,
      reason: reason || (amount > 0 ? "Manual points added" : "Manual points removed"),
      adjustedBy: "admin",
      adjustedAt: new Date().toISOString(),
    });

    // Ensure the member exists in the members list
    const members = await getLoyaltyMembers();
    if (!members.some((m) => m.phone === phone)) {
      await addLoyaltyMember({
        phone,
        name: "Member",
        signedUpAt: new Date().toISOString(),
      });
    }

    const all = await getAdjustments();
    const total = all
      .filter((a) => a.phone === phone)
      .reduce((sum, a) => sum + a.amount, 0);

    return NextResponse.json({ phone, manualPoints: total, success: true });
  } catch (error) {
    console.error("Points adjustment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
