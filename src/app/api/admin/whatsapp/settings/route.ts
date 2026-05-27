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
  if (body.businessHours && typeof body.businessHours === "object") {
    const bh = body.businessHours as { enabled?: unknown; days?: unknown };
    const hhmm = (v: unknown, fallback: string) =>
      typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v.trim()) ? v.trim() : fallback;
    const rawDays = Array.isArray(bh.days) ? bh.days : [];
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = (rawDays[i] ?? {}) as { open?: unknown; close?: unknown; closed?: unknown };
      return {
        open: hhmm(d.open, "11:00"),
        close: hhmm(d.close, "22:00"),
        closed: d.closed === true,
      };
    });
    updates.businessHours = { enabled: bh.enabled === true, days };
  }
  if (body.abandonedCart && typeof body.abandonedCart === "object") {
    const ac = body.abandonedCart as { enabled?: unknown; delayHours?: unknown };
    const delayHours = Number.isFinite(Number(ac.delayHours))
      ? Math.max(0, Math.min(168, Number(ac.delayHours)))
      : 2;
    updates.abandonedCart = { enabled: ac.enabled === true, delayHours };
  }
  if (Array.isArray(body.flows)) {
    updates.flows = body.flows
      .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
      .map((f) => {
        const steps = Array.isArray(f.steps)
          ? f.steps
              .map((s) =>
                s && typeof (s as { prompt?: unknown }).prompt === "string"
                  ? { prompt: ((s as { prompt: string }).prompt).slice(0, 1000) }
                  : null,
              )
              .filter((s): s is { prompt: string } => !!s && !!s.prompt.trim())
              .slice(0, 10)
          : [];
        return {
          id: typeof f.id === "string" && f.id ? f.id : `flow_${Math.random().toString(36).slice(2, 9)}`,
          name: typeof f.name === "string" ? f.name.slice(0, 80) : "Flow",
          trigger: typeof f.trigger === "string" ? f.trigger.trim().slice(0, 80) : "",
          enabled: f.enabled === true,
          steps,
        };
      })
      // A flow with no trigger or no steps can never run — drop it so stored
      // config stays clean (the editor filters the same way).
      .filter((f) => f.trigger && f.steps.length > 0)
      .slice(0, 20);
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
