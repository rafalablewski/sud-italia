import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { getChatbotFaqs, saveChatbotFaq, deleteChatbotFaq } from "@/lib/store";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  const faqs = await getChatbotFaqs();
  return NextResponse.json(faqs);
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

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
}

export async function DELETE(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

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
}
