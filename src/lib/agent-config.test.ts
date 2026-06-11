import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_CONFIG_DEFAULTS,
  buildLiveSystemPrompt,
  mergeAgentConfig,
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
    kpis: ["North-star revenue"],
    // @ts-expect-error — deliberately invalid value is ignored
    authority: "god-mode",
  });
  assert.equal(merged.name, "Chief");
  assert.equal(merged.status, "paused");
  assert.equal(merged.effort, "max");
  assert.deepEqual(merged.kpis, ["North-star revenue"]);
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
