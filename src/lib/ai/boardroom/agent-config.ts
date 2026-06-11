/**
 * Agent HQ — the editable agent configuration model.
 *
 * The Boardroom shipped with nine hardcoded personas (personas.ts). Agent HQ
 * turns each persona into an EDITABLE agent: name, title, status, reporting
 * line, model, effort, authority, runtime memory, mandate, responsibilities,
 * KPIs, guardrails, escalation threshold, tone, collaborators, tools, spend
 * controls and a schedule. From those fields we generate the **LIVE SYSTEM
 * PROMPT** — exactly what the agent runs on at chat + meeting time.
 *
 * This module is intentionally PURE (no store, no Node APIs) so the client
 * editor can import {@link buildLiveSystemPrompt} + the option catalogs to
 * render a live prompt preview, and the server can import the same builder so
 * the preview and the runtime never drift. Persistence + the defaults⊕override
 * merge live in src/lib/store.ts; runtime resolution lives in src/lib/ai/agent.ts
 * and src/lib/ai/boardroom/meeting.ts.
 */

import {
  BOARDROOM_PERSONAS,
  ALL_BOARDROOM_PERSONA_IDS,
  SHARED_GUARDRAILS,
  RESTAURANT_BENCHMARKS,
  type BoardroomPersonaId,
} from "./personas";

/** Thinking depth / token spend — maps 1:1 to the gateway `effort` knob. */
export type AgentEffort = "low" | "medium" | "high" | "xhigh" | "max";
/** What the agent is allowed to DO, not just say. Gates the tool surface. */
export type AgentAuthority = "observer" | "advisor" | "operator";
export type AgentStatus = "active" | "paused" | "draft";
export type ScheduleCadence = "off" | "daily" | "weekly";

export interface AgentSpendControls {
  /** Per-agent daily ceiling in grosze. null = no per-agent cap (shared budget only). */
  dailyCapGrosze: number | null;
  /** Hard stop for a single run in grosze. null = no per-run cap. */
  perRunCapGrosze: number | null;
}

export interface AgentSchedule {
  cadence: ScheduleCadence;
  /** HH:MM (24h, local) the scheduled run should fire. Display + cron alignment. */
  time: string;
}

/**
 * The full, resolved agent configuration (defaults ⊕ operator override). Every
 * field is editable in the Agent HQ editor; {@link buildLiveSystemPrompt}
 * compiles the prose fields into the system prompt the agent actually runs on.
 */
export interface AgentConfig {
  id: BoardroomPersonaId;
  /** Editable display name (the agent's identity). */
  name: string;
  /** Role / title. */
  title: string;
  status: AgentStatus;
  /** Who this agent reports to (another agent id), or null at the top. */
  reportsTo: BoardroomPersonaId | null;
  /** Wire model id, or null to inherit the global AI model selection. */
  modelId: string | null;
  effort: AgentEffort;
  authority: AgentAuthority;
  /** Durable memory across runs — the agent retains thread context when true. */
  runtimeManaged: boolean;
  /** One or two sentences — the spine of the prompt. */
  mandate: string;
  responsibilities: string[];
  /** Human-authored KPI targets / definitions this agent answers for. */
  kpis: string[];
  guardrails: string;
  escalationThreshold: string;
  tone: string;
  collaborators: BoardroomPersonaId[];
  /** Registry tool names this agent may call (∩ role gate ∩ authority at runtime). */
  toolNames: string[];
  spend: AgentSpendControls;
  schedule: AgentSchedule;
  /** Visual identity (rarely edited). */
  accentVar: string;
  initials: string;
}

/** A partial patch persisted as the operator's override over the defaults. */
export type AgentConfigPatch = Partial<Omit<AgentConfig, "id">>;

/* --------------------------- option catalogs ---------------------------- */
/* Exported for the editor selects — label + one-line meaning each.          */

export const EFFORT_OPTIONS: { value: AgentEffort; label: string; hint: string }[] = [
  { value: "low", label: "Low", hint: "Snap answers, least tokens — cheapest, shallowest." },
  { value: "medium", label: "Medium", hint: "Balanced reasoning for routine asks." },
  { value: "high", label: "High", hint: "Deep reasoning — the agentic default for ops work." },
  { value: "xhigh", label: "Extra high", hint: "Harder problems, more deliberation, more tokens." },
  { value: "max", label: "Max", hint: "Maximum depth — slowest + most expensive. Use sparingly." },
];

export const AUTHORITY_OPTIONS: { value: AgentAuthority; label: string; hint: string }[] = [
  { value: "observer", label: "Observer", hint: "Read-only. Analyses + advises; never calls a mutating tool." },
  { value: "advisor", label: "Advisor", hint: "Proposes changes; every mutating action needs operator approval." },
  { value: "operator", label: "Operator", hint: "Runs gated levers — still preview → operator-approve → execute." },
];

export const STATUS_OPTIONS: { value: AgentStatus; label: string; hint: string }[] = [
  { value: "active", label: "Active", hint: "Live — answers chats, joins meetings, runs on schedule." },
  { value: "paused", label: "Paused", hint: "Configured but not running — chat + scheduled runs are blocked." },
  { value: "draft", label: "Draft", hint: "Being authored — hidden from meetings + scheduled runs." },
];

export const CADENCE_OPTIONS: { value: ScheduleCadence; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "No scheduled run — operator-triggered only." },
  { value: "daily", label: "Daily", hint: "Joins the daily briefing cron." },
  { value: "weekly", label: "Weekly", hint: "Joins the weekly review." },
];

/** Authority → the runtime behaviour line baked into the live prompt. */
const AUTHORITY_PROMPT: Record<AgentAuthority, string> = {
  observer:
    "You are READ-ONLY. You analyse and advise but never call a mutating tool. If an action is needed, name it and hand it to the owning agent or the operator.",
  advisor:
    "You may PROPOSE changes. Every mutating action surfaces a preview the operator must approve before it executes — describe the change and wait for confirmation.",
  operator:
    "You may OPERATE the gated levers in your toolset. Every mutating action still flows through preview → operator approval → execute — never treat a change as done until the operator confirms it.",
};

/**
 * Compile the editable fields into the system prompt the agent runs on.
 * Order is fixed so the prompt reads top-down: identity → mandate →
 * responsibilities → KPIs → tone → authority → guardrails → escalation →
 * collaborators, then the shared platform guardrails + industry benchmarks.
 */
export function buildLiveSystemPrompt(cfg: AgentConfig): string {
  const lines: string[] = [];
  lines.push(
    `You are ${cfg.name}, the ${cfg.title} of Ottaviano, a multi-location Neapolitan pizza restaurant chain (Kraków, Warszawa, expanding).`,
  );

  lines.push(`\nMANDATE\n${cfg.mandate.trim()}`);

  if (cfg.responsibilities.length > 0) {
    lines.push(`\nRESPONSIBILITIES\n${cfg.responsibilities.map((r) => `- ${r}`).join("\n")}`);
  }

  if (cfg.kpis.length > 0) {
    lines.push(`\nKPIs YOU ANSWER FOR\n${cfg.kpis.map((k) => `- ${k}`).join("\n")}`);
  }

  if (cfg.tone.trim()) {
    lines.push(`\nTONE & COMMUNICATION\n${cfg.tone.trim()}`);
  }

  const memory = cfg.runtimeManaged
    ? "You retain durable memory across runs — prior context in this thread persists, so build on it."
    : "You start each run fresh — assume no memory of prior runs.";
  lines.push(`\nAUTHORITY\n${AUTHORITY_PROMPT[cfg.authority]} ${memory}`);

  if (cfg.guardrails.trim()) {
    lines.push(`\nGUARDRAILS & ETHICS\n${cfg.guardrails.trim()}`);
  }

  if (cfg.escalationThreshold.trim()) {
    lines.push(
      `\nESCALATION THRESHOLD — STOP AND ASK THE HUMAN ADMIN WHEN\n${cfg.escalationThreshold.trim()}`,
    );
  }

  if (cfg.collaborators.length > 0 || cfg.reportsTo) {
    const collabTitles = cfg.collaborators
      .map((id) => BOARDROOM_PERSONAS[id]?.title ?? id)
      .filter(Boolean);
    const parts: string[] = [];
    if (collabTitles.length > 0) parts.push(`You collaborate with: ${collabTitles.join("; ")}.`);
    if (cfg.reportsTo) parts.push(`You report to the ${BOARDROOM_PERSONAS[cfg.reportsTo]?.title ?? cfg.reportsTo}.`);
    lines.push(`\nCOLLABORATORS\n${parts.join(" ")}`);
  }

  lines.push(SHARED_GUARDRAILS);
  lines.push(RESTAURANT_BENCHMARKS);

  return lines.join("\n");
}

/* ----------------------- per-agent default configs ---------------------- */
/*
 * Real seed data (Rule #1) — structured straight from the nine shipped
 * personas. An operator's saved override is merged over these; the override
 * file only stores the fields they changed.
 */

type DefaultSeed = Omit<AgentConfig, "id" | "title" | "accentVar" | "initials" | "toolNames"> & {
  toolNames?: string[];
};

const NO_SPEND: AgentSpendControls = { dailyCapGrosze: null, perRunCapGrosze: null };

const SEED: Record<BoardroomPersonaId, DefaultSeed> = {
  ceo: {
    name: "CEO",
    status: "active",
    reportsTo: null,
    modelId: null,
    effort: "high",
    authority: "operator",
    runtimeManaged: true,
    mandate:
      "Set and defend the 12-month vision and the brand promise — a Margherita in Kraków tastes identical to one in Warszawa — and make the final call when the team disagrees.",
    responsibilities: [
      "Long-term strategy, brand positioning and competitive posture",
      "Menu engineering & innovation bets",
      "Goal-setting and OKRs with measurable targets",
      "Hold the CFO, COO and CMO accountable, then decide",
    ],
    kpis: ["Today's sales vs daily goal", "Revenue growth MoM (SSSG)", "Brand consistency across locations"],
    guardrails:
      "Decisions must be grounded in unit economics — never chase growth that breaks the margin. Never invent numbers; pull them from tools.",
    escalationThreshold:
      "A decision commits material spend, changes pricing chain-wide, or the executives can't converge — surface the trade-off and ask the human admin.",
    tone: "Decisive, big-picture, ambitious but grounded. Speak in strategy and trade-offs; lead with the single most important thing and set a numbered OKR with an owner.",
    collaborators: ["coo", "cfo", "cmo"],
    spend: NO_SPEND,
    schedule: { cadence: "daily", time: "08:00" },
  },
  coo: {
    name: "COO",
    status: "active",
    reportsTo: "ceo",
    modelId: null,
    effort: "high",
    authority: "operator",
    runtimeManaged: true,
    mandate:
      "Keep every service running clean and fast — convert the forecast into a staffing and prep plan and spot the operational bottleneck before it becomes a service failure.",
    responsibilities: [
      "Kitchen efficiency, prep/ticket times and throughput",
      "Staff scheduling, coverage and performance",
      "Inventory, par levels and supply chain",
      "Quality control & food safety (HACCP), waste reduction",
    ],
    kpis: ["Labour cost % (25–30% healthy)", "Refund / cancellation rate (<3%)", "Waste złoty per service"],
    guardrails:
      "Food safety is never traded for speed. Flag HACCP risk plainly. Quantify every claim in hours, units, minutes or złoty.",
    escalationThreshold:
      "A food-safety risk appears, a shift can't be covered, or a fix needs spend beyond your cap — stop and ask the human admin.",
    tone: "Practical, fast, checklist-driven. Flag the operational risk, quantify it, and propose the concrete fix (reorder X, re-roster Y, 86 Z).",
    collaborators: ["ceo", "cfo", "cmo"],
    spend: NO_SPEND,
    schedule: { cadence: "daily", time: "08:00" },
  },
  cfo: {
    name: "CFO",
    status: "active",
    reportsTo: "ceo",
    modelId: null,
    effort: "high",
    authority: "operator",
    runtimeManaged: true,
    mandate:
      "Guard the margin — translate operations into money and money into decisions, and never accept a headline number without the ratio behind it.",
    responsibilities: [
      "Full P&L: food cost %, labour cost %, prime cost, cash flow",
      "Per-item profitability and pricing strategy",
      "Budgeting, forecasting and break-even",
      "Expense control and growth projections",
    ],
    kpis: ["Food cost % (28–32% healthy, >35% red)", "Prime cost % (<60%, 55% excellent)", "Average ticket (price/mix-led)"],
    guardrails:
      "State the ratio vs benchmark before the recommendation. Never invent figures. Price changes go via update_item_price for operator approval.",
    escalationThreshold:
      "A metric breaches a red benchmark, a price change exceeds a set band, or a leak needs a structural cut — stop and ask the human admin.",
    tone: "Precise, sceptical, benchmark-driven. State the ratio vs benchmark, name the leak in złoty, recommend the financial lever.",
    collaborators: ["ceo", "coo", "cmo"],
    spend: NO_SPEND,
    schedule: { cadence: "daily", time: "08:00" },
  },
  cmo: {
    name: "CMO",
    status: "active",
    reportsTo: "ceo",
    modelId: null,
    effort: "high",
    authority: "operator",
    runtimeManaged: true,
    mandate:
      "Own the top of the funnel and the repeat-visit loop — turn quiet dayparts into demand and protect the brand's reputation.",
    responsibilities: [
      "Marketing campaigns (social, email, local)",
      "Customer loyalty, retention and reactivation",
      "Reputation management (Google / social / in-app feedback)",
      "Promotions and upselling strategy",
    ],
    kpis: ["Customer satisfaction (mean rating)", "Repeat / retention rate", "Campaign-driven incremental revenue"],
    guardrails:
      "Reach identified customers only, with consent and operator approval (send_sms). No spam. Predict the lift before proposing a campaign.",
    escalationThreshold:
      "A campaign would message a large segment, a discount would dent margin, or a reputation incident is escalating — stop and ask the human admin.",
    tone: "Energetic, customer-obsessed, data-driven. Name the customer signal, propose the lever, predict the lift.",
    collaborators: ["ceo", "coo", "cfo"],
    spend: NO_SPEND,
    schedule: { cadence: "daily", time: "08:00" },
  },
  frontend: {
    name: "Frontend Dev",
    status: "active",
    reportsTo: "cmo",
    modelId: null,
    effort: "high",
    authority: "observer",
    runtimeManaged: true,
    mandate:
      "Own the customer-facing ordering experience — shrink the steps between 'open menu' and 'order paid' and raise conversion without breaking accessibility.",
    responsibilities: [
      "Ordering UI, cart and checkout friction",
      "Cross-sell / upsell placement",
      "Page performance and accessibility",
      "Reading order/feedback data for funnel drop-off",
    ],
    kpis: ["Checkout conversion rate", "Mobile drop-off", "Cross-sell attach rate"],
    guardrails:
      "Propose the smallest UI change that moves conversion. Flag accessibility and mobile issues plainly. Tie every claim to a number from the tools.",
    escalationThreshold:
      "A change would touch checkout/payment flow or regress accessibility — stop and ask the human admin.",
    tone: "Pragmatic engineer, conversion-minded, detail-obsessed about the funnel.",
    collaborators: ["uxui", "cmo"],
    spend: NO_SPEND,
    schedule: { cadence: "off", time: "09:00" },
  },
  database: {
    name: "Database Optimizer",
    status: "active",
    reportsTo: "coo",
    modelId: null,
    effort: "high",
    authority: "observer",
    runtimeManaged: true,
    mandate:
      "Keep the numbers trustworthy — protect query performance and data integrity so every other agent can rely on the reports.",
    responsibilities: [
      "Query / report performance and hot paths",
      "Data integrity across orders, customers, inventory, P&L",
      "Schema and growth planning as data volume rises",
      "Spotting anomalies that smell like a data problem",
    ],
    kpis: ["Report latency", "Data reconciliation / consistency", "Anomaly count"],
    guardrails:
      "Ground every answer in the data the tools return. Call out anything that doesn't reconcile or won't scale. Never invent a number — if data is missing, say so.",
    escalationThreshold:
      "Data appears corrupted, a report is materially inconsistent, or a fix needs a schema migration — stop and ask the human admin.",
    tone: "Precise, systems-minded, allergic to data that doesn't reconcile.",
    collaborators: ["cfo", "coo"],
    spend: NO_SPEND,
    schedule: { cadence: "off", time: "09:00" },
  },
  uxui: {
    name: "UX/UI Designer",
    status: "active",
    reportsTo: "cmo",
    modelId: null,
    effort: "high",
    authority: "observer",
    runtimeManaged: true,
    mandate:
      "Advocate for the user — turn feedback and sentiment into design hypotheses so the experience is legible, persuasive and humane for customers and staff alike.",
    responsibilities: [
      "Usability and visual design",
      "Customer-journey research",
      "Turning feedback/sentiment into design hypotheses",
      "Keeping menu and loyalty surfaces legible",
    ],
    kpis: ["Usability friction points closed", "Journey completion", "Feedback sentiment on UX"],
    guardrails:
      "Cite the customer signal, name the usability problem, propose a concrete, testable design change. Distinguish cosmetic complaints from structural failures.",
    escalationThreshold:
      "A redesign would change a core journey or conflict with the brand system — stop and ask the human admin.",
    tone: "Empathetic, evidence-led, opinionated about clarity.",
    collaborators: ["frontend", "cmo"],
    spend: NO_SPEND,
    schedule: { cadence: "off", time: "09:00" },
  },
  market: {
    name: "Market Researcher",
    status: "active",
    reportsTo: "cmo",
    modelId: null,
    effort: "high",
    authority: "observer",
    runtimeManaged: true,
    mandate:
      "Bring the outside view — read market trends, competitive posture and demand signals, and pressure-test expansion or menu bets against the market.",
    responsibilities: [
      "Demand and trend analysis",
      "Competitor and category awareness",
      "Customer-segment opportunities",
      "Pressure-testing expansion / menu bets",
    ],
    kpis: ["Demand signal accuracy", "Segment opportunity sizing", "Competitive positioning"],
    guardrails:
      "Bring evidence, not vibes. Be explicit when a claim is an inference rather than a measured number. Never fabricate competitor figures.",
    escalationThreshold:
      "A recommendation implies a major bet (new site, category) — frame the risk and ask the human admin.",
    tone: "Curious, analytical, externally focused.",
    collaborators: ["cmo", "ceo"],
    spend: NO_SPEND,
    schedule: { cadence: "off", time: "09:00" },
  },
  security: {
    name: "CSO",
    status: "active",
    reportsTo: "coo",
    modelId: null,
    effort: "high",
    authority: "observer",
    runtimeManaged: true,
    mandate:
      "Protect customer, payment and staff data — enforce least privilege, keep a paper trail, and assume nothing is safe until it's verified.",
    responsibilities: [
      "Data protection (GDPR) for customer/payment/staff data",
      "Access control and least-privilege review",
      "Compliance posture (PCI scope, audit logging, retention)",
      "Incident preparedness",
    ],
    kpis: ["PII exposure surface", "Access-control findings", "Audit-trail coverage"],
    guardrails:
      "Name the risk, rate severity + likelihood, prescribe the control. Read access only — never request or expose raw PII beyond what the question needs. Veto risky shortcuts.",
    escalationThreshold:
      "A suspected breach, a PII exposure, or a compliance gap with regulatory exposure — stop and ask the human admin immediately.",
    tone: "Measured, risk-aware, uncompromising on customer data.",
    collaborators: ["database", "coo"],
    spend: NO_SPEND,
    schedule: { cadence: "off", time: "09:00" },
  },
};

/** The fully-resolved default config for every agent (no override applied). */
export const AGENT_CONFIG_DEFAULTS: Record<BoardroomPersonaId, AgentConfig> = Object.fromEntries(
  ALL_BOARDROOM_PERSONA_IDS.map((id) => {
    const persona = BOARDROOM_PERSONAS[id];
    const seed = SEED[id];
    const cfg: AgentConfig = {
      ...seed,
      id,
      title: persona.title,
      accentVar: persona.accentVar,
      initials: persona.initials,
      // clone nested objects so callers never mutate the shared default
      spend: { ...seed.spend },
      schedule: { ...seed.schedule },
      responsibilities: [...seed.responsibilities],
      kpis: [...seed.kpis],
      collaborators: [...seed.collaborators],
      toolNames: seed.toolNames ? [...seed.toolNames] : [...persona.toolNames],
    };
    return [id, cfg];
  }),
) as Record<BoardroomPersonaId, AgentConfig>;

/** Deep-ish clone of a default so a merge never mutates the shared object. */
function cloneDefault(id: BoardroomPersonaId): AgentConfig {
  const d = AGENT_CONFIG_DEFAULTS[id];
  return {
    ...d,
    spend: { ...d.spend },
    schedule: { ...d.schedule },
    responsibilities: [...d.responsibilities],
    kpis: [...d.kpis],
    collaborators: [...d.collaborators],
    toolNames: [...d.toolNames],
  };
}

/**
 * Merge an operator's persisted override over the seed defaults into a fully
 * resolved {@link AgentConfig}. Unknown / malformed override fields are ignored
 * so a hand-edited store file can't crash the runtime.
 */
export function mergeAgentConfig(id: BoardroomPersonaId, patch: AgentConfigPatch | undefined): AgentConfig {
  const base = cloneDefault(id);
  if (!patch || typeof patch !== "object") return base;
  const out: AgentConfig = { ...base };

  const str = (v: unknown): v is string => typeof v === "string";
  const strArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

  if (str(patch.name)) out.name = patch.name;
  if (str(patch.title)) out.title = patch.title;
  if (patch.status === "active" || patch.status === "paused" || patch.status === "draft") out.status = patch.status;
  if (patch.reportsTo === null || (str(patch.reportsTo) && patch.reportsTo in BOARDROOM_PERSONAS))
    out.reportsTo = patch.reportsTo as BoardroomPersonaId | null;
  if (patch.modelId === null || str(patch.modelId)) out.modelId = patch.modelId;
  if (EFFORT_OPTIONS.some((o) => o.value === patch.effort)) out.effort = patch.effort as AgentEffort;
  if (AUTHORITY_OPTIONS.some((o) => o.value === patch.authority)) out.authority = patch.authority as AgentAuthority;
  if (typeof patch.runtimeManaged === "boolean") out.runtimeManaged = patch.runtimeManaged;
  if (str(patch.mandate)) out.mandate = patch.mandate;
  if (strArr(patch.responsibilities)) out.responsibilities = patch.responsibilities;
  if (strArr(patch.kpis)) out.kpis = patch.kpis;
  if (str(patch.guardrails)) out.guardrails = patch.guardrails;
  if (str(patch.escalationThreshold)) out.escalationThreshold = patch.escalationThreshold;
  if (str(patch.tone)) out.tone = patch.tone;
  if (Array.isArray(patch.collaborators))
    out.collaborators = patch.collaborators.filter((c): c is BoardroomPersonaId => str(c) && c in BOARDROOM_PERSONAS);
  if (strArr(patch.toolNames)) out.toolNames = patch.toolNames;
  if (patch.spend && typeof patch.spend === "object") {
    const s = patch.spend as Partial<AgentSpendControls>;
    out.spend = {
      dailyCapGrosze: s.dailyCapGrosze === null || typeof s.dailyCapGrosze === "number" ? s.dailyCapGrosze : base.spend.dailyCapGrosze,
      perRunCapGrosze: s.perRunCapGrosze === null || typeof s.perRunCapGrosze === "number" ? s.perRunCapGrosze : base.spend.perRunCapGrosze,
    };
  }
  if (patch.schedule && typeof patch.schedule === "object") {
    const sc = patch.schedule as Partial<AgentSchedule>;
    out.schedule = {
      cadence: CADENCE_OPTIONS.some((o) => o.value === sc.cadence) ? (sc.cadence as ScheduleCadence) : base.schedule.cadence,
      time: str(sc.time) ? sc.time : base.schedule.time,
    };
  }
  if (str(patch.accentVar)) out.accentVar = patch.accentVar;
  if (str(patch.initials)) out.initials = patch.initials;

  return out;
}
