import type { WaSession, WaSettings } from "@/lib/store";
import type { WhatsAppProvider } from "@/lib/providers/whatsapp";

/**
 * Deterministic scripted-flow runner. A flow is a linear list of messages: the
 * trigger keyword starts it (sends step 0), and each subsequent customer reply
 * advances one step until the steps run out. Runs ahead of the LLM and mutates
 * the session in place (the caller persists). Customer replies are captured in
 * the normal transcript, so an operator can read what people answered.
 *
 * Returns true when the inbound was consumed by a flow (caller skips the LLM).
 */
export async function runWaFlow(opts: {
  session: WaSession;
  settings: WaSettings;
  inboundText: string;
  provider: WhatsAppProvider;
  phone: string;
}): Promise<boolean> {
  const { session, settings, inboundText, provider, phone } = opts;
  const flows = settings.flows ?? [];

  // Continue an in-progress flow: send the next step, advance, clear when done.
  if (session.activeFlow) {
    const flow = flows.find((f) => f.id === session.activeFlow!.flowId && f.enabled);
    if (!flow) {
      // Flow was deleted or disabled mid-sequence — drop the customer to the LLM.
      session.activeFlow = undefined;
      return false;
    }
    const step = session.activeFlow.step;
    if (step >= flow.steps.length) {
      session.activeFlow = undefined;
      return false;
    }
    await provider.sendText(phone, flow.steps[step].prompt);
    const next = step + 1;
    session.activeFlow = next >= flow.steps.length ? undefined : { flowId: flow.id, step: next };
    return true;
  }

  // Start a flow when an inbound text contains an enabled flow's trigger.
  const text = inboundText.trim().toLowerCase();
  if (!text) return false;
  const match = flows.find(
    (f) => f.enabled && f.trigger.trim() && f.steps.length > 0 && text.includes(f.trigger.toLowerCase()),
  );
  if (!match) return false;

  await provider.sendText(phone, match.steps[0].prompt);
  session.activeFlow = match.steps.length > 1 ? { flowId: match.id, step: 1 } : undefined;
  return true;
}
