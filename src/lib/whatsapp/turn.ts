import type Anthropic from "@anthropic-ai/sdk";
import { callGateway, fenceUserContent, gatewayConfigured } from "@/lib/ai/gateway";
import { getDailyBudgetGrosze } from "@/lib/ai/cost";
import { getWhatsAppProvider } from "@/lib/providers/whatsapp";
import {
  clearWaSession,
  getWaSettings,
  loadOrCreateWaSession,
  setWaSession,
} from "@/lib/store";
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
 * Persistence model: load the session once at the top, mutate it in
 * memory across tool calls, save it once at the end. Each turn does
 * one read + one write of whatsapp-sessions.json instead of N — even
 * a 6-hop turn used to take 8+ round-trips through the locked file
 * before this refactor.
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

  // AI concierge can be switched off independently of the channel: the channel
  // still logs inbound + runs auto-replies, but instead of calling the model we
  // send the configured away message. Default aiEnabled=true → no change.
  if (settings.aiEnabled === false) {
    await provider.sendText(
      phone,
      settings.awayMessage?.trim() ||
        "Dziękujemy za wiadomość! Nasz asystent jest teraz offline. Zamów online: https://sudita.lia 🍕",
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

  const session = await loadOrCreateWaSession(phone);
  if (!session) return;

  const userText = describeInbound(message);
  const fenced = fenceUserContent("whatsapp_customer_message", userText);

  const userTurn: { role: "user" | "assistant"; content: string } = {
    role: "user",
    content: fenced,
  };
  session.llmMessageHistory = [...session.llmMessageHistory, userTurn].slice(-MAX_HISTORY);

  // Mark the inbound as read so the customer sees the double tick.
  if (message.id) {
    void provider.markRead(message.id);
  }

  const messages: Anthropic.MessageParam[] = session.llmMessageHistory.map((h) => ({
    role: h.role,
    content: h.content,
  }));

  const ctx: ToolContext = {
    phone,
    session,
    uiSent: { value: false },
    clearOnExit: { value: false },
  };
  let assistantFinalText = "";

  // Append any operator-configured persona/policy to the base prompt. Kept
  // additive so the non-negotiable ordering guardrails always survive; empty
  // instructions leave the prompt byte-identical to the default.
  const extra = settings.aiInstructions?.trim();
  const systemPrompt = extra
    ? `${WHATSAPP_SYSTEM_PROMPT}\n\n# Additional operator instructions\n\nThese are set by the Sud Italia operator. Follow them unless they conflict with the Hard rules above (the Hard rules always win).\n\n${extra}`
    : WHATSAPP_SYSTEM_PROMPT;

  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    let result;
    try {
      result = await callGateway({
        feature: "whatsapp",
        system: systemPrompt,
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
      // Even when the gateway errors, persist whatever progress the
      // customer made so the next turn picks up where they left off.
      await persistSessionOnExit(ctx);
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

  // Append the model's textual reply into history so the next turn
  // has continuity. We store the unfenced summary — only inbound user
  // text needs the prompt-injection fence.
  if (assistantFinalText) {
    const assistantTurn: { role: "user" | "assistant"; content: string } = {
      role: "assistant",
      content: assistantFinalText,
    };
    session.llmMessageHistory = [...session.llmMessageHistory, assistantTurn].slice(-MAX_HISTORY);
  }

  // Single persist at the end of the turn (or single delete on escalation).
  await persistSessionOnExit(ctx);

  // Only send the LLM's final text if no tool already pushed a UI message;
  // otherwise we'd duplicate the cart/slot/CTA we just rendered.
  if (assistantFinalText && !ctx.uiSent.value) {
    await provider.sendText(phone, assistantFinalText);
  } else if (!ctx.uiSent.value && !assistantFinalText) {
    // Safety net — model returned nothing and no tool spoke for us.
    await provider.sendText(phone, "🍕");
  }
}

async function persistSessionOnExit(ctx: ToolContext): Promise<void> {
  if (ctx.clearOnExit.value) {
    await clearWaSession(ctx.phone);
    return;
  }
  await setWaSession(ctx.session);
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
