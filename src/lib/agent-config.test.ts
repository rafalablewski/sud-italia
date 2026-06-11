import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_CONFIG_DEFAULTS,
  buildLiveSystemPrompt,
  mergeAgentConfig,
  normalizeKpis,
} from "./ai/boardroom/agent-config";

// Run with:  npx tsx --test src/lib/agent-config.test.ts

test("every seed agent resolves to a complete config", () => {
  for (const [id, cfg] of Object.entries(AGENT_CONFIG_DEFAULTS)) {
    assert.equal(cfg.id, id);
    assert.ok(cfg.name && cfg.title && cfg.mandate, `${id} has identity + mandate`);
    assert.ok(cfg.responsibilities.length > 0, `${id} has responsibilities`);
    assert.ok(cfg.toolNames.includes("escalate_to_admin"), `${id} can escalate`);
  }
});

test("live prompt includes the editable fields, in order", () => {
  const cfg = AGENT_CONFIG_DEFAULTS.cfo;
  const prompt = buildLiveSystemPrompt(cfg);
  assert.ok(prompt.includes(cfg.mandate), "mandate present");
  assert.ok(prompt.includes("RESPONSIBILITIES"), "responsibilities section");
  assert.ok(prompt.includes("GUARDRAILS & ETHICS"), "guardrails section");
  assert.ok(prompt.includes("ESCALATION THRESHOLD"), "escalation section");
  // mandate must come before guardrails (fixed order).
  assert.ok(prompt.indexOf("MANDATE") < prompt.indexOf("GUARDRAILS"), "order is stable");
});

test("merge applies a valid patch and ignores junk", () => {
  const merged = mergeAgentConfig("ceo", {
    name: "Chief",
    status: "paused",
    effort: "max",
    // @ts-expect-error — legacy string KPIs are normalized to {id,title,target}
    kpis: ["North-star revenue"],
    // @ts-expect-error — deliberately invalid value is ignored
    authority: "god-mode",
  });
  assert.equal(merged.name, "Chief");
  assert.equal(merged.status, "paused");
  assert.equal(merged.effort, "max");
  assert.equal(merged.kpis[0].title, "North-star revenue");
  assert.ok(merged.kpis[0].id, "normalized KPI has a stable id");
  // invalid authority falls back to the default ("operator")
  assert.equal(merged.authority, "operator");
});

test("observer authority is reflected in the generated prompt", () => {
  const observer = mergeAgentConfig("cfo", { authority: "observer" });
  assert.match(buildLiveSystemPrompt(observer), /READ-ONLY/);
  const operator = mergeAgentConfig("cfo", { authority: "operator" });
  assert.match(buildLiveSystemPrompt(operator), /OPERATE/);
});

test("runtime-managed toggle changes the memory line", () => {
  const managed = mergeAgentConfig("coo", { runtimeManaged: true });
  const stateless = mergeAgentConfig("coo", { runtimeManaged: false });
  assert.match(buildLiveSystemPrompt(managed), /durable memory/);
  assert.match(buildLiveSystemPrompt(stateless), /start each run fresh/);
});

test("nested spend + schedule patches merge field-by-field", () => {
  const merged = mergeAgentConfig("cmo", { spend: { dailyCapGrosze: 5000, perRunCapGrosze: null } });
  assert.equal(merged.spend.dailyCapGrosze, 5000);
  const sched = mergeAgentConfig("cmo", { schedule: { cadence: "weekly", time: "07:30" } });
  assert.equal(sched.schedule.cadence, "weekly");
  assert.equal(sched.schedule.time, "07:30");
});

test("normalizeKpis accepts strings + objects and keeps stable ids", () => {
  const fromStrings = normalizeKpis(["Food cost %", "Prime cost %"]);
  assert.equal(fromStrings.length, 2);
  assert.equal(fromStrings[0].id, "food-cost"); // deterministic slug → survives redeploy
  assert.equal(fromStrings[0].target, "");
  // an explicit id is preserved (so a title rename doesn't orphan its actuals)
  const kept = normalizeKpis([{ id: "x1", title: "Renamed", target: "≤ 30%" }]);
  assert.equal(kept[0].id, "x1");
  assert.equal(kept[0].target, "≤ 30%");
  // empty rows are dropped
  assert.equal(normalizeKpis([{ id: "z", title: "", target: "" }, "real"]).length, 1);
});

test("seed KPIs normalize to {id,title,target} and render in the prompt", () => {
  const cfg = AGENT_CONFIG_DEFAULTS.cfo;
  assert.ok(cfg.kpis.length > 0 && cfg.kpis[0].id && cfg.kpis[0].title, "seed KPIs are objects with ids");
  assert.ok(buildLiveSystemPrompt(cfg).includes(cfg.kpis[0].title), "KPI title appears in the live prompt");
});
