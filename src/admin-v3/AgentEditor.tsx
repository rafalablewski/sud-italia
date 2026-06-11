"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge, Button, Dialog, Switch } from "./ui";
import {
  AUTHORITY_OPTIONS,
  CADENCE_OPTIONS,
  EFFORT_OPTIONS,
  STATUS_OPTIONS,
  buildLiveSystemPrompt,
  type AgentConfig,
} from "@/lib/ai/boardroom/agent-config";
import { AI_MODELS } from "@/lib/ai/models";

/**
 * AgentEditor — edit every field of one agent and see the LIVE SYSTEM PROMPT
 * generated from those fields (exactly what the agent runs on at chat + meeting
 * time). Three tabs: Configure (all the levers), Live prompt (the generated
 * spine, read-only), Timeline (history + logs). Saving PATCHes the agent's
 * override and the change takes effect on the next turn (Rule #8).
 */

interface AgentEvent {
  id: string;
  type: string;
  summary: string;
  detail?: string;
  costGrosze?: number;
  actor: string;
  at: string;
}

type EditorTab = "configure" | "prompt" | "timeline";

const groszeToPln = (g: number | null): string => (g == null ? "" : (g / 100).toString());
const plnToGrosze = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

/* --------------------------- field primitives --------------------------- */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--av3-subtle)", fontWeight: 600, marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: "var(--av3-subtle)", marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="av3-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%" }} />;
}

function TextArea({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea className="av3-input" value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} style={{ width: "100%", resize: "vertical" }} />;
}

function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[] }) {
  return (
    <select className="av3-select" value={value} onChange={(e) => onChange(e.target.value as T)} style={{ width: "100%" }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Add/remove list editor for responsibilities + KPIs. */
function StringList({ items, onChange, placeholder }: { items: string[]; onChange: (next: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => { const t = draft.trim(); if (t) { onChange([...items, t]); setDraft(""); } };
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <input className="av3-input" value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} style={{ flex: 1 }} />
          <button type="button" className="av3-icon-btn" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove"><X className="av3-btn-ico" /></button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6 }}>
        <input className="av3-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} style={{ flex: 1 }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button variant="secondary" size="sm" onClick={add}><Plus className="av3-btn-ico" /> Add</Button>
      </div>
    </div>
  );
}

/** Multi-select chip toggles for collaborators + tools. */
function ChipToggle({ options, selected, onChange }: { options: { value: string; label: string }[]; selected: string[]; onChange: (next: string[]) => void }) {
  const set = new Set(selected);
  const toggle = (v: string) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); onChange([...n]); };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => (
        <button key={o.value} type="button" className={`av3-fchip ${set.has(o.value) ? "is-active" : ""}`} onClick={() => toggle(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------- editor -------------------------------- */

export function AgentEditor({ agentId, configs, toolCatalog, onClose, onSaved }: {
  agentId: string;
  configs: AgentConfig[];
  toolCatalog: string[];
  onClose: () => void;
  onSaved: (updated: AgentConfig) => void;
}) {
  const initial = useMemo(() => configs.find((c) => c.id === agentId) ?? null, [configs, agentId]);
  const [form, setForm] = useState<AgentConfig | null>(initial);
  const [tab, setTab] = useState<EditorTab>("configure");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentEvent[] | null>(null);

  // Refresh canonical config from the server on open (override may be newer).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/ai/boardroom/agents/${agentId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((res) => {
      if (!cancelled && res?.agent) setForm(res.agent as AgentConfig);
    });
    return () => { cancelled = true; };
  }, [agentId]);

  const loadTimeline = useCallback(() => {
    fetch(`/api/admin/ai/boardroom/agents/${agentId}/timeline`).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((res) => setEvents(res?.events ?? []));
  }, [agentId]);
  useEffect(() => { if (tab === "timeline" && events === null) loadTimeline(); }, [tab, events, loadTimeline]);

  const patch = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  };

  const livePrompt = form ? buildLiveSystemPrompt(form) : "";

  const save = useCallback(async () => {
    if (!form) return;
    setSaving(true); setError(null);
    try {
      const body = {
        name: form.name, title: form.title, status: form.status, reportsTo: form.reportsTo,
        modelId: form.modelId, effort: form.effort, authority: form.authority, runtimeManaged: form.runtimeManaged,
        mandate: form.mandate, responsibilities: form.responsibilities, kpis: form.kpis,
        guardrails: form.guardrails, escalationThreshold: form.escalationThreshold, tone: form.tone,
        collaborators: form.collaborators, toolNames: form.toolNames, spend: form.spend, schedule: form.schedule,
        initials: form.initials,
      };
      const res = await fetch(`/api/admin/ai/boardroom/agents/${agentId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Save failed (${res.status})`); return;
      }
      const j = (await res.json()) as { agent: AgentConfig };
      onSaved(j.agent);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setSaving(false);
    }
  }, [form, agentId, onSaved, onClose]);

  if (!form) return null;

  const otherAgents = configs.filter((c) => c.id !== agentId);
  const reportsToOptions = [{ value: "", label: "— Top of org (no manager)" }, ...otherAgents.map((c) => ({ value: c.id, label: c.title }))];
  const modelOptions = [{ value: "", label: "Inherit global model" }, ...AI_MODELS.map((m) => ({ value: m.id, label: m.label }))];

  return (
    <Dialog
      open
      onClose={onClose}
      width={760}
      title={`Edit · ${form.name}`}
      subtitle={form.title}
      headerExtra={<Badge tone={form.status === "active" ? "ok" : form.status === "paused" ? "warn" : "neutral"}>{form.status}</Badge>}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%", alignItems: "center" }}>
          {error && <span className="av3-chat-error" style={{ marginRight: "auto" }}>{error}</span>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={save}>Save agent</Button>
        </div>
      }
    >
      <div className="av3-filterchips" style={{ marginBottom: 14 }}>
        {(["configure", "prompt", "timeline"] as EditorTab[]).map((t) => (
          <button key={t} type="button" className={`av3-fchip ${tab === t ? "is-active" : ""}`} onClick={() => setTab(t)}>
            {t === "configure" ? "Configure" : t === "prompt" ? "Live system prompt" : "Timeline"}
          </button>
        ))}
      </div>

      {tab === "configure" && (
        <div>
          <SectionTitle>Identity</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Name"><TextInput value={form.name} onChange={(v) => patch("name", v)} /></Field>
            <Field label="Initials" hint="Two or three letters for the avatar."><TextInput value={form.initials} onChange={(v) => patch("initials", v.slice(0, 3).toUpperCase())} /></Field>
          </div>
          <Field label="Role / title"><TextInput value={form.title} onChange={(v) => patch("title", v)} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Status" hint={STATUS_OPTIONS.find((o) => o.value === form.status)?.hint}>
              <Select value={form.status} onChange={(v) => patch("status", v)} options={STATUS_OPTIONS} />
            </Field>
            <Field label="Reports to">
              <Select value={form.reportsTo ?? ""} onChange={(v) => patch("reportsTo", (v || null) as AgentConfig["reportsTo"])} options={reportsToOptions} />
            </Field>
          </div>

          <SectionTitle>Runtime</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Model"><Select value={form.modelId ?? ""} onChange={(v) => patch("modelId", (v || null))} options={modelOptions} /></Field>
            <Field label="Effort · thinking depth / token spend" hint={EFFORT_OPTIONS.find((o) => o.value === form.effort)?.hint}>
              <Select value={form.effort} onChange={(v) => patch("effort", v)} options={EFFORT_OPTIONS} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Authority level" hint={AUTHORITY_OPTIONS.find((o) => o.value === form.authority)?.hint}>
              <Select value={form.authority} onChange={(v) => patch("authority", v)} options={AUTHORITY_OPTIONS} />
            </Field>
            <Field label="Runtime · managed memory" hint="Durable memory across runs.">
              <div style={{ paddingTop: 4 }}>
                <Switch checked={form.runtimeManaged} onChange={(v) => patch("runtimeManaged", v)} label={form.runtimeManaged ? "Managed — retains memory" : "Stateless — fresh each run"} />
              </div>
            </Field>
          </div>

          <SectionTitle>Prompt spine</SectionTitle>
          <Field label="Mandate" hint="One or two sentences — the spine of the prompt.">
            <TextArea value={form.mandate} onChange={(v) => patch("mandate", v)} rows={3} />
          </Field>
          <Field label="Responsibilities"><StringList items={form.responsibilities} onChange={(v) => patch("responsibilities", v)} placeholder="Add a responsibility…" /></Field>
          <Field label="KPIs it answers for"><StringList items={form.kpis} onChange={(v) => patch("kpis", v)} placeholder="Add a KPI / target…" /></Field>
          <Field label="Tone & communication"><TextArea value={form.tone} onChange={(v) => patch("tone", v)} rows={2} /></Field>
          <Field label="Guardrails & ethics"><TextArea value={form.guardrails} onChange={(v) => patch("guardrails", v)} rows={3} /></Field>
          <Field label="Escalation threshold · when to stop and ask the human admin"><TextArea value={form.escalationThreshold} onChange={(v) => patch("escalationThreshold", v)} rows={3} /></Field>

          <SectionTitle>Collaborators</SectionTitle>
          <Field label="Works with">
            <ChipToggle options={otherAgents.map((c) => ({ value: c.id, label: c.name }))} selected={form.collaborators} onChange={(v) => patch("collaborators", v as AgentConfig["collaborators"])} />
          </Field>

          <SectionTitle>Tools</SectionTitle>
          <Field label="Tool allowlist" hint="Intersected with the operator's role gate + authority at runtime. Observer authority strips mutating tools.">
            <ChipToggle options={toolCatalog.map((t) => ({ value: t, label: t }))} selected={form.toolNames} onChange={(v) => patch("toolNames", v)} />
          </Field>

          <SectionTitle>Spend controls</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Daily cap (PLN)" hint="Blank = no per-agent cap (shared budget only).">
              <TextInput value={groszeToPln(form.spend.dailyCapGrosze)} onChange={(v) => patch("spend", { ...form.spend, dailyCapGrosze: plnToGrosze(v) })} placeholder="e.g. 50" />
            </Field>
            <Field label="Per-run cap (PLN)" hint="Blank = no per-run cap.">
              <TextInput value={groszeToPln(form.spend.perRunCapGrosze)} onChange={(v) => patch("spend", { ...form.spend, perRunCapGrosze: plnToGrosze(v) })} placeholder="e.g. 5" />
            </Field>
          </div>

          <SectionTitle>Schedule</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Cadence" hint={CADENCE_OPTIONS.find((o) => o.value === form.schedule.cadence)?.hint}>
              <Select value={form.schedule.cadence} onChange={(v) => patch("schedule", { ...form.schedule, cadence: v })} options={CADENCE_OPTIONS} />
            </Field>
            <Field label="Time (HH:MM)">
              <input type="time" className="av3-input" value={form.schedule.time} onChange={(e) => patch("schedule", { ...form.schedule, time: e.target.value })} style={{ width: "100%" }} />
            </Field>
          </div>
        </div>
      )}

      {tab === "prompt" && (
        <div>
          <div style={{ fontSize: 12, color: "var(--av3-muted)", marginBottom: 10 }}>
            Generated from the fields on the left — this is <strong>exactly what {form.name} runs on</strong> at chat + meeting time. It updates live as you edit.
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.6, fontFamily: "var(--av3-mono)", background: "var(--av3-s1)", border: "1px solid var(--av3-line)", borderRadius: "var(--av3-r-lg)", padding: 14, maxHeight: 460, overflow: "auto" }}>
            {livePrompt}
          </pre>
        </div>
      )}

      {tab === "timeline" && (
        <div>
          {events === null ? (
            <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>Loading…</div>
          ) : events.length === 0 ? (
            <div className="av3-cell-muted" style={{ fontSize: 12.5 }}>No history yet. Runs, edits, escalations and approvals appear here.</div>
          ) : (
            events.map((e, i) => (
              <div key={e.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < events.length - 1 ? "1px solid var(--av3-line)" : "none", alignItems: "flex-start" }}>
                <Badge tone={e.type === "escalation" ? "bad" : e.type === "run" ? "info" : e.type === "approval" ? "warn" : "neutral"}>{e.type}</Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}>{e.summary}</div>
                  {e.detail && <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{e.detail}</div>}
                  <div style={{ fontSize: 11, color: "var(--av3-subtle)", marginTop: 3, fontFamily: "var(--av3-mono)" }}>{new Date(e.at).toLocaleString("pl-PL")} · {e.actor}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Dialog>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: "var(--av3-fg)", margin: "18px 0 10px", paddingBottom: 6, borderBottom: "1px solid var(--av3-line)" }}>{children}</div>;
}
