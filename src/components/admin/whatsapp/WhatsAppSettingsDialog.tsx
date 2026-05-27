"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Dialog, Input, Select, Switch, Textarea } from "../v2/ui";
import { useToast } from "../v2/ui/Toast";

/**
 * Advanced WhatsApp channel configuration. This is the hub for everything that
 * shapes the bot's behaviour — channel state, customer-facing messages,
 * conversation lifecycle, the AI concierge, and keyword auto-replies. Every
 * control is wired end-to-end (see store WaSettings + the webhook / turn loop);
 * nothing here is cosmetic.
 */

interface AutoReply {
  keyword: string;
  reply: string;
}

interface BusinessDay {
  open: string;
  close: string;
  closed: boolean;
}
interface BusinessHours {
  enabled: boolean;
  days: BusinessDay[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface WaSettings {
  enabled: boolean;
  welcomeMessage: string;
  optOutPhrases: string[];
  defaultLocation: "krakow" | "warszawa" | null;
  dailyMessageCap: number;
  reopenTemplate: string;
  autoArchiveMinutes: number;
  aiEnabled: boolean;
  aiInstructions: string;
  awayMessage: string;
  autoReplies: AutoReply[];
  businessHours: BusinessHours;
  abandonedCart: { enabled: boolean; delayHours: number };
  flows: WaFlow[];
}

interface WaFlow {
  id: string;
  name: string;
  trigger: string;
  enabled: boolean;
  steps: { prompt: string }[];
}

export function WhatsAppSettingsDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<WaSettings | null>(null);
  const [optOutText, setOptOutText] = useState("");
  const [capText, setCapText] = useState("60");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/whatsapp/settings");
      if (res.ok) {
        const s = (await res.json()) as WaSettings;
        setDraft(s);
        setOptOutText(s.optOutPhrases.join(", "));
        setCapText(String(s.dailyMessageCap));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Persist a partial change immediately — used for the on/off switches so a
  // toggle is saved the moment it flips (no separate Save needed), per the
  // platform's "toggle = saved" rule.
  const patchNow = useCallback(
    async (updates: Partial<WaSettings>) => {
      const res = await fetch("/api/admin/whatsapp/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setDraft((await res.json()) as WaSettings);
        onSaved();
        return true;
      }
      const data = await res.json().catch(() => ({}));
      toast.error("Could not save", data?.error || "Try again.");
      return false;
    },
    [toast, onSaved],
  );

  const toggleEnabled = async () => {
    if (!draft) return;
    const ok = await patchNow({ enabled: !draft.enabled });
    if (ok) toast.success(`Channel ${draft.enabled ? "disabled" : "enabled"}`);
  };
  const toggleAi = async () => {
    if (!draft) return;
    const ok = await patchNow({ aiEnabled: !draft.aiEnabled });
    if (ok) toast.success(`AI concierge ${draft.aiEnabled ? "disabled" : "enabled"}`);
  };
  const toggleAbandoned = async () => {
    if (!draft) return;
    const ok = await patchNow({
      abandonedCart: { ...draft.abandonedCart, enabled: !draft.abandonedCart.enabled },
    });
    if (ok) toast.success(`Abandoned-cart recovery ${draft.abandonedCart.enabled ? "off" : "on"}`);
  };
  const setDelayHours = (h: number) =>
    setDraft((d) => (d ? { ...d, abandonedCart: { ...d.abandonedCart, delayHours: h } } : d));

  const editFlow = (i: number, patch: Partial<WaFlow>) =>
    setDraft((d) => (d ? { ...d, flows: d.flows.map((f, j) => (j === i ? { ...f, ...patch } : f)) } : d));
  const addFlow = () =>
    setDraft((d) =>
      d
        ? {
            ...d,
            flows: [
              ...d.flows,
              {
                id: `flow_${Math.random().toString(36).slice(2, 9)}`,
                name: "New flow",
                trigger: "",
                enabled: true,
                steps: [{ prompt: "" }],
              },
            ],
          }
        : d,
    );
  const removeFlow = (i: number) =>
    setDraft((d) => (d ? { ...d, flows: d.flows.filter((_, j) => j !== i) } : d));
  const editStep = (fi: number, si: number, prompt: string) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            flows: d.flows.map((f, j) =>
              j === fi ? { ...f, steps: f.steps.map((s, k) => (k === si ? { prompt } : s)) } : f,
            ),
          }
        : d,
    );
  const addStep = (fi: number) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            flows: d.flows.map((f, j) => (j === fi ? { ...f, steps: [...f.steps, { prompt: "" }] } : f)),
          }
        : d,
    );
  const removeStep = (fi: number, si: number) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            flows: d.flows.map((f, j) =>
              j === fi ? { ...f, steps: f.steps.filter((_, k) => k !== si) } : f,
            ),
          }
        : d,
    );

  const set = <K extends keyof WaSettings>(key: K, value: WaSettings[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const setReply = (i: number, patch: Partial<AutoReply>) =>
    setDraft((d) =>
      d ? { ...d, autoReplies: d.autoReplies.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : d,
    );
  const addReply = () =>
    setDraft((d) => (d ? { ...d, autoReplies: [...d.autoReplies, { keyword: "", reply: "" }] } : d));
  const removeReply = (i: number) =>
    setDraft((d) => (d ? { ...d, autoReplies: d.autoReplies.filter((_, j) => j !== i) } : d));

  const setHoursEnabled = (enabled: boolean) =>
    setDraft((d) => (d ? { ...d, businessHours: { ...d.businessHours, enabled } } : d));
  const setDay = (i: number, patch: Partial<BusinessDay>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            businessHours: {
              ...d.businessHours,
              days: d.businessHours.days.map((day, j) => (j === i ? { ...day, ...patch } : day)),
            },
          }
        : d,
    );

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const optOutPhrases = optOutText
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const dailyMessageCap = Math.max(1, Math.min(10000, Number.parseInt(capText, 10) || 60));
      const autoArchiveMinutes = Math.max(0, Math.min(1440, Math.round(draft.autoArchiveMinutes) || 0));
      const autoReplies = draft.autoReplies
        .map((r) => ({ keyword: r.keyword.trim(), reply: r.reply.trim() }))
        .filter((r) => r.keyword && r.reply);
      const res = await fetch("/api/admin/whatsapp/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          welcomeMessage: draft.welcomeMessage,
          optOutPhrases,
          defaultLocation: draft.defaultLocation,
          dailyMessageCap,
          reopenTemplate: draft.reopenTemplate,
          autoArchiveMinutes,
          aiInstructions: draft.aiInstructions,
          awayMessage: draft.awayMessage,
          autoReplies,
          businessHours: draft.businessHours,
          abandonedCart: draft.abandonedCart,
          flows: draft.flows
            .map((f) => ({
              ...f,
              name: f.name.trim() || "Flow",
              trigger: f.trigger.trim(),
              steps: f.steps.filter((s) => s.prompt.trim()),
            }))
            .filter((f) => f.trigger && f.steps.length > 0),
        }),
      });
      if (res.ok) {
        setDraft((await res.json()) as WaSettings);
        toast.success("WhatsApp settings saved");
        onSaved();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not save", data?.error || "Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="WhatsApp configuration"
      description="Channel state, messages, conversation lifecycle, the AI concierge and keyword auto-replies. Switches save immediately; everything else saves with the button below."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!draft || saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </>
      }
    >
      {loading || !draft ? (
        <p className="admin-text-secondary text-sm">Loading…</p>
      ) : (
        <div className="wa-cfg">
          {/* Channel */}
          <Section title="Channel" desc="Master switch for WhatsApp ordering. The signed webhook keeps verifying even when off; the bot just replies that ordering is paused.">
            <div className="wa-cfg-switch">
              <Switch checked={draft.enabled} onChange={toggleEnabled} label="Channel enabled" />
              <span className="admin-text text-sm">{draft.enabled ? "Live — taking orders" : "Off — ordering paused"}</span>
            </div>
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              <Field label="Default location (fallback)">
                <Select
                  value={draft.defaultLocation ?? ""}
                  onChange={(e) =>
                    set(
                      "defaultLocation",
                      (e.target.value || null) as WaSettings["defaultLocation"],
                    )
                  }
                  options={[
                    { value: "", label: "Ask the customer" },
                    { value: "krakow", label: "Kraków" },
                    { value: "warszawa", label: "Warszawa" },
                  ]}
                />
              </Field>
              <Field label="Daily inbound cap / phone">
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={capText}
                  onChange={(e) => setCapText(e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* Messages */}
          <Section title="Messages" desc="Customer-facing copy the channel sends directly (outside the AI).">
            <Field label="Welcome message (first inbound)">
              <Textarea
                value={draft.welcomeMessage}
                onChange={(e) => set("welcomeMessage", e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Cześć! Tu Sud Italia 🍕 Napisz, na co masz ochotę…"
              />
            </Field>
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              <Field label="Opt-out keywords (comma-separated)">
                <Input
                  value={optOutText}
                  onChange={(e) => setOptOutText(e.target.value)}
                  placeholder="STOP, NIE, UNSUBSCRIBE"
                />
              </Field>
              <Field label="Re-open template (Meta-approved)">
                <Input
                  value={draft.reopenTemplate}
                  onChange={(e) => set("reopenTemplate", e.target.value)}
                  placeholder="sud_italia_order_update"
                />
              </Field>
            </div>
          </Section>

          {/* Conversation lifecycle */}
          <Section title="Conversation lifecycle" desc="Keeps the operator inbox tidy. Archiving is console-side only — the customer's cart still lives for the full 90-minute session, so a new message brings the chat straight back to the inbox.">
            <Field label="Auto-archive after inactivity (minutes)">
              <Input
                type="number"
                min={0}
                max={1440}
                value={String(draft.autoArchiveMinutes)}
                onChange={(e) => set("autoArchiveMinutes", Number.parseInt(e.target.value, 10) || 0)}
              />
              <p className="admin-text-secondary text-xs mt-1">
                A conversation with no new message for this long moves to the Archived filter. 0 = never archive.
              </p>
            </Field>
          </Section>

          {/* Business hours */}
          <Section title="Business hours" desc="Times are Europe/Warsaw. Outside the open→close window the channel sends the away message instead of taking orders (auto-replies still answer 24/7). A close time at or before open means it runs past midnight.">
            <div className="wa-cfg-switch">
              <Switch
                checked={draft.businessHours.enabled}
                onChange={setHoursEnabled}
                label="Enforce business hours"
              />
              <span className="admin-text text-sm">
                {draft.businessHours.enabled ? "On — closed outside hours" : "Off — open 24/7"}
              </span>
            </div>
            {draft.businessHours.enabled && (
              <div className="wa-cfg-hours">
                {draft.businessHours.days.map((day, i) => (
                  <div key={i} className={`wa-cfg-hour-row${day.closed ? " is-closed" : ""}`}>
                    <span className="wa-cfg-hour-day">{DAY_LABELS[i]}</span>
                    <Input
                      type="time"
                      value={day.open}
                      onChange={(e) => setDay(i, { open: e.target.value })}
                      disabled={day.closed}
                    />
                    <span className="wa-cfg-hour-sep">–</span>
                    <Input
                      type="time"
                      value={day.close}
                      onChange={(e) => setDay(i, { close: e.target.value })}
                      disabled={day.closed}
                    />
                    <label className="wa-cfg-hour-closed">
                      <input
                        type="checkbox"
                        checked={day.closed}
                        onChange={(e) => setDay(i, { closed: e.target.checked })}
                      />
                      <span>Closed</span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* AI concierge */}
          <Section title="AI concierge" desc="The LLM that walks customers from “what's good?” to a paid order.">
            <div className="wa-cfg-switch">
              <Switch checked={draft.aiEnabled} onChange={toggleAi} label="AI concierge enabled" />
              <span className="admin-text text-sm">
                {draft.aiEnabled ? "On — the bot takes orders" : "Off — sends the away message instead"}
              </span>
            </div>
            <Field label="Extra AI instructions (persona, policies, promos)" className="mt-3">
              <Textarea
                value={draft.aiInstructions}
                onChange={(e) => set("aiInstructions", e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="e.g. Mention the autumn truffle special when someone orders pizza. Keep replies under 2 lines. Address regulars by first name."
              />
              <p className="admin-text-secondary text-xs mt-1">
                Appended to the base prompt. The hard ordering rules (real prices, confirmed slot before pay) always take priority.
              </p>
            </Field>
            <Field label="Away message (sent when AI is off)" className="mt-3">
              <Textarea
                value={draft.awayMessage}
                onChange={(e) => set("awayMessage", e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Dziękujemy! Nasz asystent jest teraz offline — zamów online: https://sudita.lia 🍕"
              />
            </Field>
          </Section>

          {/* Auto-replies */}
          <Section title="Auto-replies (scripts)" desc="Instant canned replies that run before the AI. The first keyword found in an incoming message wins and ends the turn — handy for FAQs like hours or address.">
            <div className="wa-cfg-replies">
              {draft.autoReplies.length === 0 && (
                <p className="admin-text-secondary text-sm">No auto-replies yet. Add one below.</p>
              )}
              {draft.autoReplies.map((r, i) => (
                <div key={i} className="wa-cfg-reply">
                  <Input
                    value={r.keyword}
                    onChange={(e) => setReply(i, { keyword: e.target.value })}
                    placeholder="keyword (e.g. godziny)"
                  />
                  <Input
                    value={r.reply}
                    onChange={(e) => setReply(i, { reply: e.target.value })}
                    placeholder="reply to send"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeReply(i)}
                    leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
                    aria-label="Remove auto-reply"
                  />
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={addReply}
                leadingIcon={<Plus className="h-3.5 w-3.5" />}
                disabled={draft.autoReplies.length >= 30}
              >
                Add auto-reply
              </Button>
            </div>
          </Section>

          {/* Abandoned-cart recovery */}
          <Section title="Abandoned-cart recovery" desc="When a customer builds a cart but doesn't pay, the daily job sends them the Meta re-open template once to win the order back. Needs a re-open template configured under Messages.">
            <div className="wa-cfg-switch">
              <Switch
                checked={draft.abandonedCart.enabled}
                onChange={toggleAbandoned}
                label="Abandoned-cart recovery enabled"
              />
              <span className="admin-text text-sm">
                {draft.abandonedCart.enabled
                  ? draft.reopenTemplate.trim()
                    ? "On — re-engages unpaid carts daily"
                    : "On, but set a re-open template under Messages first"
                  : "Off"}
              </span>
            </div>
            <Field label="Wait before re-engaging (hours)" className="mt-3">
              <Input
                type="number"
                min={0}
                max={168}
                value={String(draft.abandonedCart.delayHours)}
                onChange={(e) => setDelayHours(Number.parseInt(e.target.value, 10) || 0)}
              />
              <p className="admin-text-secondary text-xs mt-1">
                Only carts idle at least this long (and under 4 days old) are nudged — once each.
              </p>
            </Field>
          </Section>

          {/* Scripted flows */}
          <Section title="Scripted flows" desc="Deterministic guided sequences. When a customer message contains the trigger word, the bot sends step 1; each reply advances to the next step. Runs ahead of the AI — great for feedback or info sequences.">
            <div className="wa-cfg-flows">
              {draft.flows.length === 0 && (
                <p className="admin-text-secondary text-sm">No flows yet. Add one below.</p>
              )}
              {draft.flows.map((flow, fi) => (
                <div key={flow.id} className="wa-cfg-flow">
                  <div className="wa-cfg-flow-head">
                    <Switch
                      checked={flow.enabled}
                      onChange={(v) => editFlow(fi, { enabled: v })}
                      label="Flow enabled"
                    />
                    <Input
                      value={flow.name}
                      onChange={(e) => editFlow(fi, { name: e.target.value })}
                      placeholder="Flow name"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFlow(fi)}
                      leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
                      aria-label="Remove flow"
                    />
                  </div>
                  <Field label="Trigger keyword" className="mt-2">
                    <Input
                      value={flow.trigger}
                      onChange={(e) => editFlow(fi, { trigger: e.target.value })}
                      placeholder="e.g. opinia"
                    />
                  </Field>
                  <div className="wa-cfg-steps">
                    {flow.steps.map((s, si) => (
                      <div key={si} className="wa-cfg-step">
                        <span className="wa-cfg-step-n">{si + 1}</span>
                        <Input
                          value={s.prompt}
                          onChange={(e) => editStep(fi, si, e.target.value)}
                          placeholder={`Step ${si + 1} message`}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeStep(fi, si)}
                          leadingIcon={<Trash2 className="h-3.5 w-3.5" />}
                          aria-label="Remove step"
                          disabled={flow.steps.length <= 1}
                        />
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addStep(fi)}
                      leadingIcon={<Plus className="h-3.5 w-3.5" />}
                      disabled={flow.steps.length >= 10}
                    >
                      Add step
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={addFlow}
                leadingIcon={<Plus className="h-3.5 w-3.5" />}
                disabled={draft.flows.length >= 20}
              >
                Add flow
              </Button>
            </div>
          </Section>
        </div>
      )}
    </Dialog>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="wa-cfg-sec">
      <h3 className="wa-cfg-sec-title">{title}</h3>
      {desc && <p className="wa-cfg-sec-desc">{desc}</p>}
      <div className="wa-cfg-sec-body">{children}</div>
    </section>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="admin-text text-xs uppercase tracking-wide block mb-1">{label}</span>
      {children}
    </label>
  );
}
