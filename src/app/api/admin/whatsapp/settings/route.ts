import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, getWaSettings, updateWaSettings } from "@/lib/store";

export const GET = withAdmin({ roles: ["manager", "owner"] }, async () => {
  const settings = await getWaSettings();
  return NextResponse.json(settings);
});

export const PATCH = withAdmin({ roles: ["manager", "owner"] }, async (req, _ctx, { user }) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (typeof body.welcomeMessage === "string") {
    updates.welcomeMessage = body.welcomeMessage.slice(0, 500);
  }
  if (Array.isArray(body.optOutPhrases)) {
    updates.optOutPhrases = body.optOutPhrases
      .filter((p): p is string => typeof p === "string")
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  if (
    body.defaultLocation === "krakow" ||
    body.defaultLocation === "warszawa" ||
    body.defaultLocation === null
  ) {
    updates.defaultLocation = body.defaultLocation;
  }
  if (Number.isInteger(body.dailyMessageCap)) {
    updates.dailyMessageCap = Math.max(1, Math.min(10000, Number(body.dailyMessageCap)));
  }
  if (typeof body.reopenTemplate === "string") {
    updates.reopenTemplate = body.reopenTemplate.trim().slice(0, 100);
  }
  if (Number.isInteger(body.autoArchiveMinutes)) {
    updates.autoArchiveMinutes = Math.max(0, Math.min(1440, Number(body.autoArchiveMinutes)));
  }
  if (typeof body.aiEnabled === "boolean") updates.aiEnabled = body.aiEnabled;
  if (typeof body.aiInstructions === "string") {
    updates.aiInstructions = body.aiInstructions.slice(0, 4000);
  }
  if (typeof body.awayMessage === "string") {
    updates.awayMessage = body.awayMessage.slice(0, 1000);
  }
  if (Array.isArray(body.autoReplies)) {
    updates.autoReplies = body.autoReplies
      .filter(
        (r): r is { keyword: string; reply: string } =>
          !!r &&
          typeof (r as { keyword?: unknown }).keyword === "string" &&
          typeof (r as { reply?: unknown }).reply === "string",
      )
      .map((r) => ({ keyword: r.keyword.trim().slice(0, 80), reply: r.reply.trim().slice(0, 1000) }))
      .filter((r) => r.keyword && r.reply)
      .slice(0, 30);
  }

  const before = await getWaSettings();
  const next = await updateWaSettings(updates);
  await appendAuditLog({
    actor: user.email || user.id,
    action: "whatsapp.settings.update",
    entityType: "settings",
    entityId: "whatsapp",
    before,
    after: next,
  });
  return NextResponse.json(next);
});
