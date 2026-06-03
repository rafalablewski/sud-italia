"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, RefreshCw, AlertCircle, Check } from "lucide-react";

/**
 * Admin control for the per-customer ML cross-sell ranker (audit
 * elite-qsr §1). Shows the trained-model status for the active location,
 * a one-tap retrain, and the A/B rollout % (deterministic phone-bucketed
 * share served the ML ranker instead of the rules ranker).
 *
 * The rollout % is part of LocationUpsellConfig and persists on the
 * page's "Save changes"; training is a direct POST that writes the model
 * server-side immediately (no save needed).
 */

interface ModelStatus {
  locationSlug: string;
  trainedAt: string;
  sampleCount: number;
  positiveRate: number;
  logLoss: number;
}

export function MLUpsellPanel({
  locationSlug,
  rolloutPct,
  onRolloutChange,
}: {
  locationSlug: string;
  rolloutPct: number;
  onRolloutChange: (pct: number) => void;
}) {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/ml-upsell");
      const d = await r.json();
      const mine = (d.models as ModelStatus[] | undefined)?.find((m) => m.locationSlug === locationSlug);
      setStatus(mine ?? null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [locationSlug]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const train = async () => {
    setTraining(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/ml-upsell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: locationSlug }),
      });
      const d = await r.json();
      const res = (d.results as { trained: boolean; reason?: string; sampleCount?: number }[] | undefined)?.[0];
      if (res?.trained) {
        setMsg(`Trained on ${res.sampleCount} examples.`);
        await loadStatus();
      } else {
        setMsg(res?.reason ?? "Not enough data to train yet.");
      }
    } catch {
      setMsg("Training failed — try again.");
    } finally {
      setTraining(false);
    }
  };

  return (
    <section className="glass-card p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="admin-text font-semibold mb-1 flex items-center gap-2">
            <Brain className="h-4 w-4 text-[var(--accent)]" />
            Cross-sell intelligence (ML ranker)
          </h2>
          <p className="admin-text-secondary text-sm">
            A per-customer model trained on this truck&rsquo;s real orders ranks the cart
            cross-sell by predicted attach × margin. Roll it out to a slice of customers and
            compare against the rules ranker; cold-start customers always fall back to rules.
          </p>
        </div>
        <button
          type="button"
          onClick={train}
          disabled={training}
          className="v2-btn v2-btn-secondary v2-btn-sm shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${training ? "animate-spin" : ""}`} />
          {training ? "Training…" : "Train now"}
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
          <p className="text-[10px] uppercase tracking-wide admin-text-secondary mb-1">Model status</p>
          {loading ? (
            <p className="text-sm admin-text-secondary">Loading…</p>
          ) : status ? (
            <ul className="text-sm admin-text space-y-0.5">
              <li>Trained: {new Date(status.trainedAt).toLocaleString()}</li>
              <li>Training examples: {status.sampleCount.toLocaleString()}</li>
              <li>Base attach rate: {(status.positiveRate * 100).toFixed(1)}%</li>
              <li>Log loss: {status.logLoss.toFixed(4)} <span className="admin-text-secondary">(lower = sharper)</span></li>
            </ul>
          ) : (
            <p className="text-sm admin-text-secondary flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              No model yet — press <strong>Train now</strong> once this truck has order history.
            </p>
          )}
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide admin-text-secondary">
              Rollout to {rolloutPct}% of customers
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={rolloutPct}
              onChange={(e) => onRolloutChange(Number(e.target.value))}
              className="w-full mt-2 accent-[var(--accent)]"
              aria-label="ML ranker rollout percentage"
            />
          </label>
          <p className="text-[11px] admin-text-secondary mt-1">
            Deterministic by phone — a customer always sees the same ranker. Saved with{" "}
            <strong>Save changes</strong>. 0% = rules ranker for everyone.
            {!status && rolloutPct > 0 && (
              <span className="block text-[var(--warning)] mt-1">
                No trained model yet — everyone still gets the rules ranker until you train.
              </span>
            )}
          </p>
        </div>
      </div>

      {msg && (
        <p className="text-sm admin-text-secondary mt-3 flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 text-[var(--success)]" />
          {msg}
        </p>
      )}
    </section>
  );
}
