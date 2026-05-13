import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getInsights } from "@/lib/store";

// Insights are chain-wide aggregations — require unrestricted scope.
export const GET = withAdmin({ locationParam: "location" }, async (req) => {
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;
  const insights = await getInsights(from, to);
  return NextResponse.json(insights);
});
