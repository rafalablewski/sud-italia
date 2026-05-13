import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getFeedback, updateFeedbackStatus } from "@/lib/store";

export const GET = withAdmin({}, async () => {
  const feedback = await getFeedback();
  feedback.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return NextResponse.json(feedback);
});

export const PUT = withAdmin(
  { roles: ["staff", "manager", "owner"] },
  async (req) => {
    try {
      const { id, status } = await req.json();
      if (!id || !status) {
        return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
      }
      const updated = await updateFeedbackStatus(id, status);
      if (!updated) {
        return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
      }
      return NextResponse.json(updated);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
      }
      console.error("PUT /api/admin/feedback error:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  },
);
