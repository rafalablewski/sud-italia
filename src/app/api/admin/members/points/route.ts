import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getLoyaltyMembers, addLoyaltyMember } from "@/lib/store";

// Stores manual point adjustments made by admin
// In production this would be a proper table; here we use the same JSON pattern

import { readFile, writeFile, access, mkdir } from "fs/promises";
import { join } from "path";

const DATA_DIR = join(process.cwd(), ".data");

async function ensureDir() {
  try { await access(DATA_DIR); } catch { await mkdir(DATA_DIR, { recursive: true }); }
}

interface PointAdjustment {
  phone: string;
  amount: number; // positive = add, negative = remove
  reason: string;
  adjustedBy: string;
  adjustedAt: string;
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

// GET: get total manual adjustments for a phone
export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) {
    // Return all adjustments grouped by phone
    const all = await getAdjustments();
    const byPhone: Record<string, number> = {};
    for (const adj of all) {
      byPhone[adj.phone] = (byPhone[adj.phone] || 0) + adj.amount;
    }
    return NextResponse.json({ adjustments: byPhone });
  }

  const all = await getAdjustments();
  const total = all
    .filter((a) => a.phone === phone)
    .reduce((sum, a) => sum + a.amount, 0);

  return NextResponse.json({ phone, manualPoints: total });
}

// POST: add or remove points
export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
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

  // Return new total
  const all = await getAdjustments();
  const total = all
    .filter((a) => a.phone === phone)
    .reduce((sum, a) => sum + a.amount, 0);

  return NextResponse.json({ phone, manualPoints: total, success: true });
}
