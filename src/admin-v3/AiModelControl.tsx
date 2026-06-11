"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { Badge, Card, CardBody, CardHead } from "./ui";

interface ModelRow {
  id: string;
  label: string;
  hint: string;
  provider: string;
  providerLabel: string;
  envVar: string;
  configured: boolean;
}

/**
 * Active AI model selector. One global choice — which model the whole AI OS
 * (Ops Agent, Boardroom chats + meetings, forecasting) talks to. Claude or
 * Gemini, persisted immediately on change (toggle = saved, CLAUDE.md Rule #7).
 * Reads/writes the real setting via /api/admin/ai/model — no mock state.
 */
export function AiModelControl() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/ai/model")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (res) {
      setModels(Array.isArray(res.models) ? res.models : []);
      setActiveId(typeof res.activeId === "string" ? res.activeId : "");
    }
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const choose = async (id: string) => {
    if (id === activeId || saving) return;
    const prev = activeId;
    setActiveId(id); // optimistic
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ai/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: id }),
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json) {
          setModels(Array.isArray(json.models) ? json.models : models);
          setActiveId(typeof json.activeId === "string" ? json.activeId : id);
        }
      } else {
        setActiveId(prev); // revert so the control can't lie
      }
    } catch {
      setActiveId(prev);
    } finally {
      setSaving(false);
    }
  };

  const active = models.find((m) => m.id === activeId);
  // Group by provider for the optgroups, preserving catalog order.
  const providers = Array.from(new Map(models.map((m) => [m.provider, m.providerLabel])).entries());

  return (
    <Card>
      <CardHead
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Cpu style={{ width: 15, height: 15, color: "var(--av3-info)" }} /> AI model
          </span>
        }
        description="The model every AI surface uses — Ops Agent, Boardroom chats &amp; meetings, forecasting. Switching takes effect on the next message."
        actions={
          active ? (
            <Badge tone={active.configured ? "ok" : "warn"} dot>
              {active.configured ? active.providerLabel : "needs key"}
            </Badge>
          ) : undefined
        }
      />
      <CardBody>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <div className="av3-field" style={{ maxWidth: 320, flex: "1 1 240px" }}>
            <label className="av3-field-label">Active model</label>
            <select
              className="av3-select"
              value={activeId}
              disabled={!loaded || saving}
              onChange={(e) => choose(e.target.value)}
            >
              {providers.map(([prov, label]) => (
                <optgroup key={prov} label={label}>
                  {models
                    .filter((m) => m.provider === prov)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                        {m.configured ? "" : ` — set ${m.envVar}`}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          {active && (
            <div style={{ fontSize: 12, color: "var(--av3-muted)", flex: "1 1 220px", minWidth: 0 }}>
              {active.hint}
              {!active.configured && (
                <span style={{ display: "block", marginTop: 4, color: "var(--av3-warn)" }}>
                  This provider has no key yet — set{" "}
                  <span style={{ fontFamily: "var(--av3-mono)" }}>{active.envVar}</span> to use it.
                </span>
              )}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
