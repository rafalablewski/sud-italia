import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getAiModelSettings, updateAiModelSettings } from "@/lib/store";
import {
  AI_MODELS,
  DEFAULT_AI_MODEL_ID,
  PROVIDER_LABEL,
  isValidModelId,
  providerConfigured,
  resolveModel,
} from "@/lib/ai/models";

/**
 * Active AI model selection. GET returns the catalog (with per-model
 * "configured" introspected from the provider key) + the active id; POST
 * switches the model and persists immediately (toggle = saved, CLAUDE.md
 * Rule #7). Manager+ — same gate as the rest of the AI OS surfaces.
 */
function catalog() {
  return AI_MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    hint: m.hint,
    provider: m.provider,
    providerLabel: PROVIDER_LABEL[m.provider],
    envVar: m.envVar,
    configured: providerConfigured(m.provider),
  }));
}

export const GET = withAdmin({ roles: ["manager"] }, async () => {
  const { modelId } = await getAiModelSettings();
  const active = resolveModel(modelId);
  return NextResponse.json({
    activeId: active.id,
    defaultId: DEFAULT_AI_MODEL_ID,
    models: catalog(),
  });
});

export const POST = withAdmin({ roles: ["manager"] }, async (req) => {
  const body = (await req.json().catch(() => null)) as { modelId?: unknown } | null;
  const modelId = typeof body?.modelId === "string" ? body.modelId : "";
  if (!isValidModelId(modelId)) {
    return NextResponse.json({ error: "Unknown model id." }, { status: 400 });
  }
  await updateAiModelSettings(modelId);
  const active = resolveModel(modelId);
  return NextResponse.json({
    activeId: active.id,
    defaultId: DEFAULT_AI_MODEL_ID,
    models: catalog(),
  });
});
