import { test } from "node:test";
import assert from "node:assert/strict";

import { scopeError, defaultLocation } from "@/lib/ai/tools/scope";
import { statusLowerBetter, statusHigherBetter } from "@/lib/ai/boardroom/kpis";
import { parseDecisions } from "@/lib/ai/boardroom/meeting";
import { BOARDROOM_PERSONAS, BOARDROOM_PERSONA_ORDER, isBoardroomPersonaId, getPersona } from "@/lib/ai/boardroom/personas";
import "@/lib/ai/tools/index"; // side-effect: register every tool
import { getTool, listToolsForRole } from "@/lib/ai/tools/registry";

// Run with:  npx tsx --test src/lib/boardroom-ai.test.ts

/* --------------------------- location scope ---------------------------- */

test("scopeError allows all-access + in-scope, blocks out-of-scope", () => {
  const all = { actor: { userId: "u", role: "manager" as const, locationScope: "*" }, dryRun: false };
  const krk = { actor: { userId: "u", role: "manager" as const, locationScope: "krakow" }, dryRun: false };
  const multi = { actor: { userId: "u", role: "manager" as const, locationScope: "krakow,warszawa" }, dryRun: false };

  assert.equal(scopeError(all, "warszawa"), null);
  assert.equal(scopeError(krk, "krakow"), null);
  assert.equal(scopeError(multi, "warszawa"), null);
  assert.equal(scopeError(krk, undefined), null); // no filter = allowed
  assert.match(scopeError(krk, "warszawa") ?? "", /not authorized/);
});

test("defaultLocation pins a single-location session, leaves chain/all open", () => {
  const krk = { actor: { userId: "u", role: "manager" as const, locationScope: "krakow" }, dryRun: false };
  const all = { actor: { userId: "u", role: "manager" as const, locationScope: "*" }, dryRun: false };
  const multi = { actor: { userId: "u", role: "manager" as const, locationScope: "krakow,warszawa" }, dryRun: false };

  assert.equal(defaultLocation(krk, undefined), "krakow");
  assert.equal(defaultLocation(krk, "warszawa"), "warszawa"); // explicit wins
  assert.equal(defaultLocation(all, undefined), undefined);
  assert.equal(defaultLocation(multi, undefined), undefined);
});

/* ---------------------------- KPI statuses ----------------------------- */

test("statusLowerBetter grades cost ratios against benchmarks", () => {
  // food cost: green <=0.32, yellow <=0.35, red above
  assert.equal(statusLowerBetter(0.3, 0.32, 0.35), "green");
  assert.equal(statusLowerBetter(0.34, 0.32, 0.35), "yellow");
  assert.equal(statusLowerBetter(0.4, 0.32, 0.35), "red");
  assert.equal(statusLowerBetter(0, 0.32, 0.35), "neutral"); // no data
  assert.equal(statusLowerBetter(NaN, 0.32, 0.35), "neutral");
});

test("statusHigherBetter grades ratings/growth against benchmarks", () => {
  // satisfaction: green >=4.3, yellow >=4.0, red below
  assert.equal(statusHigherBetter(4.5, 4.3, 4.0), "green");
  assert.equal(statusHigherBetter(4.1, 4.3, 4.0), "yellow");
  assert.equal(statusHigherBetter(3.5, 4.3, 4.0), "red");
  assert.equal(statusHigherBetter(NaN, 4.3, 4.0), "neutral");
  // growth uses a negative yellow floor
  assert.equal(statusHigherBetter(0.06, 0.05, -0.05), "green");
  assert.equal(statusHigherBetter(-0.02, 0.05, -0.05), "yellow");
  assert.equal(statusHigherBetter(-0.1, 0.05, -0.05), "red");
});

/* --------------------------- meeting parsing --------------------------- */

test("parseDecisions reads valid JSON and stamps status", () => {
  const out = parseDecisions(
    JSON.stringify({
      decisions: [
        { title: "Reprice Diavola", owner: "cfo", rationale: "38% food cost", proposedTool: "update_item_price", proposedInput: { itemId: "krk-x", locationSlug: "krakow", newPriceGrosze: 3490 } },
        { title: "Trim Monday roster", owner: "coo", rationale: "over-covered" },
      ],
    }),
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].owner, "cfo");
  assert.equal(out[0].proposedTool, "update_item_price");
  assert.deepEqual(out[0].proposedInput, { itemId: "krk-x", locationSlug: "krakow", newPriceGrosze: 3490 });
  assert.equal(out[0].status, "proposed");
  assert.equal(out[1].proposedTool, undefined);
});

test("parseDecisions tolerates markdown fences + surrounding prose", () => {
  const out = parseDecisions('Here you go:\n```json\n{"decisions":[{"title":"Do X","owner":"ceo","rationale":"r"}]}\n```');
  assert.equal(out.length, 1);
  assert.equal(out[0].owner, "ceo");
});

test("parseDecisions drops bad owners, unknown tools, and empty titles; caps at 5", () => {
  const out = parseDecisions(
    JSON.stringify({
      decisions: [
        { title: "bad owner", owner: "cto", rationale: "r" }, // invalid owner -> dropped
        { title: "", owner: "ceo", rationale: "r" }, // empty title -> dropped
        { title: "hallucinated tool", owner: "cfo", proposedTool: "drop_database", proposedInput: { x: 1 } },
        { title: "a", owner: "ceo" }, { title: "b", owner: "coo" }, { title: "c", owner: "cfo" },
        { title: "d", owner: "cmo" }, { title: "e", owner: "ceo" }, { title: "f", owner: "coo" },
      ],
    }),
  );
  assert.ok(out.length <= 5, "caps at 5 decisions");
  assert.ok(out.every((d) => isBoardroomPersonaId(d.owner)));
  const tool = out.find((d) => d.title === "hallucinated tool");
  assert.equal(tool?.proposedTool, undefined, "unknown tool stripped");
  assert.equal(tool?.proposedInput, undefined, "input dropped with unknown tool");
});

test("parseDecisions returns [] for garbage", () => {
  assert.deepEqual(parseDecisions("not json at all"), []);
  assert.deepEqual(parseDecisions('{"decisions":"nope"}'), []);
  assert.deepEqual(parseDecisions(""), []);
});

/* ------------------------------ personas ------------------------------- */

test("isBoardroomPersonaId / getPersona", () => {
  for (const id of BOARDROOM_PERSONA_ORDER) assert.equal(isBoardroomPersonaId(id), true);
  assert.equal(isBoardroomPersonaId("cto"), false);
  assert.equal(isBoardroomPersonaId(undefined), false);
  assert.equal(getPersona("ceo")?.id, "ceo");
  assert.equal(getPersona("nope"), null);
});

test("every persona tool name maps to a registered tool (no typos)", () => {
  for (const persona of Object.values(BOARDROOM_PERSONAS)) {
    for (const name of persona.toolNames) {
      assert.ok(getTool(name), `persona ${persona.id} references unregistered tool '${name}'`);
    }
  }
});

test("persona tools are a subset of what a manager may run", () => {
  const managerToolNames = new Set(listToolsForRole("manager").map((t) => t.name));
  for (const persona of Object.values(BOARDROOM_PERSONAS)) {
    const available = persona.toolNames.filter((n) => managerToolNames.has(n));
    assert.ok(available.length > 0, `persona ${persona.id} has no manager-runnable tools`);
  }
});

test("each persona owns a coherent toolset (spot checks)", () => {
  assert.ok(BOARDROOM_PERSONAS.cfo.toolNames.includes("get_pnl_snapshot"));
  assert.ok(BOARDROOM_PERSONAS.cfo.toolNames.includes("update_item_price"));
  assert.ok(BOARDROOM_PERSONAS.coo.toolNames.includes("get_inventory_status"));
  assert.ok(BOARDROOM_PERSONAS.cmo.toolNames.includes("get_feedback_summary"));
  // CMO shouldn't be repricing the menu; CFO shouldn't be texting customers.
  assert.ok(!BOARDROOM_PERSONAS.cmo.toolNames.includes("update_item_price"));
  assert.ok(!BOARDROOM_PERSONAS.cfo.toolNames.includes("send_sms"));
});
