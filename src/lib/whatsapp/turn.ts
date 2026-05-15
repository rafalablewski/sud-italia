import type Anthropic from "@anthropic-ai/sdk";
import { callGateway, fenceUserContent, gatewayConfigured } from "@/lib/ai/gateway";
import { getDailyBudgetGrosze } from "@/lib/ai/cost";
import { getWhatsAppProvider } from "@/lib/providers/whatsapp";
import { mutateWaSession, getWaSettings } from "@/lib/store";
import { WHATSAPP_SYSTEM_PROMPT } from "@/lib/whatsapp/prompt";
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "@/lib/whatsapp/tools";
import type { InboundMessage } from "@/lib/whatsapp/inbound";
import { logger } from "@/lib/logger";
import { incrCounter } from "@/lib/metrics";

/**
 * One inbound message → one LLM turn → zero or more tool calls → one
 * (or zero) outbound WhatsApp message. The loop is bounded to 6 tool
 * hops so a model that gets confused can't burn budget endlessly.
 *
 * Conversation continuity: we trim history to the last MAX_HISTORY
 * user/assistant pairs so the prompt-cache prefix stays cheap. Tools
 * already keep their own state in the per-phone WhatsApp session
 * (cart, slot, address) so the model doesn't need long history to
 * remember what's been agreed.
 */

const MAX_TOOL_HOPS = 6;
const MAX_HISTORY = 16;

export interface HandleTurnInput {
  message: InboundMessage;
  /** Already E.164-normalized in the route handler. */
  phone: string;
}

export async function handleInboundTurn(input: HandleTurnInput): Promise<void> {
  const { phone, message } = input;
  const provider = getWhatsAppProvider();
  const settings = await getWaSettings();

  if (!settings.enabled) {
    await provider.sendText(
      phone,
      "Cześć! Zamówienia przez WhatsApp są tymczasowo wyłączone. Zapraszamy na https://sudita.lia 🍕",
    );
    return;
  }

  // Budget guardrail: bail before calling Anthropic if the daily ceiling is
  // exhausted. The gateway's per-feature counter is best-effort — until a
  // proper spend rollup exists we just use the ceiling as a hard cutoff.
  if (!gatewayConfigured()) {
    await provider.sendText(
      phone,
      "Bot jest w trakcie konfiguracji. Zamów online: https://sudita.lia 🍕",
    );
    return;
  }
  const dailyBudget = getDailyBudgetGrosze();
  if (dailyBudget <= 0) {
    await provider.sendText(
      phone,
      "Bot zamówień śpi. Zamów online: https://sudita.lia 🍕",
    );
    return;
  }

  const userText = describeInbound(message);
  const fenced = fenceUserContent("whatsapp_customer_message", userText);

  let history: { role: "user" | "assistant"; content: string }[] = [];
  await mutateWaSession(phone, (s) => {
    const turn: { role: "user" | "assistant"; content: string } = {
      role: "user",
      content: fenced,
    };
    history = [...s.llmMessageHistory, turn].slice(-MAX_HISTORY);
    return { ...s, llmMessageHistory: history };
  });

  // Mark the inbound as read so the customer sees the double tick.
  if (message.id) {
    void provider.markRead(message.id);
  }

  const messages: Anthropic.MessageParam[] = history.map((h) => ({
    role: h.role,
    content: h.content,
  }));

  const ctx: ToolContext = { phone, uiSent: { value: false } };
  let assistantFinalText = "";

  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    let result;
    try {
      result = await callGateway({
        feature: "whatsapp",
        system: WHATSAPP_SYSTEM_PROMPT,
        messages,
        tools: TOOL_DEFINITIONS,
        effort: "medium",
        thinking: "off",
        maxTokens: 1024,
      });
    } catch (err) {
      logger.error("whatsapp.gateway.error", { phone, hop, layer: "whatsapp.turn" }, err);
      incrCounter("whatsapp.gateway.error");
      await provider.sendText(
        phone,
        "Mam problem techniczny. Spróbuj jeszcze raz za chwilę albo zamów na https://sudita.lia 🍕",
      );
      return;
    }
    const msg = result.message;
    messages.push({ role: "assistant", content: msg.content });

    const toolUses = msg.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const textParts = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (toolUses.length === 0) {
      assistantFinalText = textParts;
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      incrCounter(`whatsapp.tool.${use.name}`);
      const out = await executeTool(use.name, use.input, ctx);
      toolResults.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: out.text,
        is_error: !out.ok,
      });
    }
    messages.push({ role: "user", content: toolResults });

    if (msg.stop_reason !== "tool_use") {
      assistantFinalText = textParts;
      break;
    }
  }

  // Persist the assistant's textual reply into history so the next turn
  // has continuity. We store an unfenced summary — only inbound user
  // text needs the prompt-injection fence.
  if (assistantFinalText) {
    await mutateWaSession(phone, (s) => {
      const turn: { role: "user" | "assistant"; content: string } = {
        role: "assistant",
        content: assistantFinalText,
      };
      return {
        ...s,
        llmMessageHistory: [...s.llmMessageHistory, turn].slice(-MAX_HISTORY),
      };
    });
  }

  // Only send the LLM's final text if no tool already pushed a UI message;
  // otherwise we'd duplicate the cart/slot/CTA we just rendered.
  if (assistantFinalText && !ctx.uiSent.value) {
    await provider.sendText(phone, assistantFinalText);
  } else if (!ctx.uiSent.value && !assistantFinalText) {
    // Safety net — model returned nothing and no tool spoke for us.
    await provider.sendText(phone, "🍕");
  }
}

/**
 * Render the inbound payload as a single line the LLM can reason about.
 * Selections (list/button replies) get prefixed so the model knows the
 * customer tapped a UI element rather than typing freely.
 */
function describeInbound(m: InboundMessage): string {
  switch (m.kind) {
    case "text":
      return m.value;
    case "selection":
      return `[selection:${m.value}]`;
    case "location":
      return `[location:${m.value}]`;
    case "unsupported":
      return `[unsupported_message_type:${m.rawType}]`;
  }
}
