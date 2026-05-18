import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { hasLocationAccess, LOCATION_SCOPE_ALL } from "@/lib/admin-auth";
import {
  deleteBusinessCost,
  getBusinessCosts,
  saveBusinessCost,
  type BusinessCostFilters,
} from "@/lib/store";
import type {
  BusinessCostCategory,
  BusinessCostFrequency,
  BusinessCostPayrollRole,
  BusinessCostStatus,
} from "@/data/types";

const VALID_CATEGORIES: BusinessCostCategory[] = [
  "payroll",
  "rent",
  "utilities",
  "insurance",
  "fuel",
  "vehicle",
  "maintenance",
  "licenses",
  "marketing",
  "ingredients",
  "equipment",
  "software",
  "professional",
  "tax",
  "other",
];

const VALID_PAYROLL_ROLES: BusinessCostPayrollRole[] = [
  "pizzaiolo",
  "chef",
  "sous-chef",
  "kitchen-porter",
  "waiter",
  "barista",
  "driver",
  "manager",
  "cleaner",
  "other",
];

const VALID_FREQUENCIES: BusinessCostFrequency[] = [
  "one-off",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

const VALID_STATUS: BusinessCostStatus[] = ["active", "archived"];

export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const sp = req.nextUrl.searchParams;
    const filters: BusinessCostFilters = {};
    const loc = sp.get("location");
    if (loc) {
      if (!(await hasLocationAccess(loc))) {
        return NextResponse.json(
          { error: `Session is not authorized for location "${loc}"` },
          { status: 403 },
        );
      }
      filters.locationSlug = loc;
    } else if (!(await hasLocationAccess(LOCATION_SCOPE_ALL))) {
      // No slug = chain-wide query. Must hold unrestricted scope —
      // otherwise a location-scoped manager could read other locations'
      // costs simply by omitting ?location=.
      return NextResponse.json(
        { error: "Cross-location read requires unrestricted scope" },
        { status: 403 },
      );
    }
    const cat = sp.get("category");
    if (cat && VALID_CATEGORIES.includes(cat as BusinessCostCategory)) {
      filters.category = cat as BusinessCostCategory;
    }
    const status = sp.get("status");
    if (status && VALID_STATUS.includes(status as BusinessCostStatus)) {
      filters.status = status as BusinessCostStatus;
    }
    return NextResponse.json(await getBusinessCosts(filters));
  },
);

async function upsert(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    if (!VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (!VALID_FREQUENCIES.includes(body.frequency)) {
      return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });
    }
    if (!VALID_STATUS.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (
      body.payrollRole !== undefined &&
      body.payrollRole !== null &&
      body.payrollRole !== "" &&
      !VALID_PAYROLL_ROLES.includes(body.payrollRole)
    ) {
      return NextResponse.json({ error: "Invalid payroll role" }, { status: 400 });
    }
    const amount = Number(body.amountGrosze);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (body.locationSlug && !(await hasLocationAccess(body.locationSlug))) {
      return NextResponse.json(
        { error: `Session is not authorized for location "${body.locationSlug}"` },
        { status: 403 },
      );
    }
    const saved = await saveBusinessCost({
      id: body.id,
      name: body.name.trim(),
      category: body.category,
      payrollRole: body.payrollRole || undefined,
      vendor: body.vendor?.trim() || undefined,
      amountGrosze: amount,
      frequency: body.frequency,
      locationSlug: body.locationSlug || undefined,
      status: body.status,
      startDate: body.startDate || undefined,
      endDate: body.endDate || undefined,
      nextDueDate: body.nextDueDate || undefined,
      paymentMethod: body.paymentMethod || undefined,
      taxDeductible: typeof body.taxDeductible === "boolean" ? body.taxDeductible : undefined,
      notes: body.notes?.trim() || undefined,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => upsert(req),
);

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => upsert(req),
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ok = await deleteBusinessCost(id);
    return NextResponse.json({ ok });
  },
);
