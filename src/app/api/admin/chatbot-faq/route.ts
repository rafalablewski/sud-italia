import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getChatbotFaqs, saveChatbotFaq, deleteChatbotFaq } from "@/lib/store";

export const GET = withAdmin({}, async () => {
  const faqs = await getChatbotFaqs();
  return NextResponse.json(faqs);
});

export const POST = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    try {
      const faq = await req.json();
      const saved = await saveChatbotFaq(faq);
      return NextResponse.json(saved);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json({ error: "Invalid data" }, { status: 400 });
      }
      console.error("POST /api/admin/chatbot-faq error:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  },
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    try {
      const { id } = await req.json();
      const deleted = await deleteChatbotFaq(id);
      if (!deleted) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json({ error: "Invalid data" }, { status: 400 });
      }
      console.error("DELETE /api/admin/chatbot-faq error:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  },
);
