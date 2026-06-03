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

interface ArmStats {
  arm: "ml" | "rules";
  orders: number;
  attachOrders: number;
  attachRate: number;
  avgOrderValueGrosze: number;
}

interface Comparison {
  ready: boolean;
  reason?: "no_model" | "rollout_off";
  rolloutPct: number;
  windowDays?: number;
  ml?: ArmStats;
  rules?: ArmStats;
  attach?: { relativeLift: number; pValue: number; significant: boolean };
  aov?: { relativeLift: number; pValue: number; significant: boolean };
  decision?: { kind: "collect_more" | "winner" | "loser" | "no_difference"; reason: string };
}

const zl = (g: number) => `zł ${(g / 100).toFixed(2)}`;
const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
const lift = (r: number) =>
  !Number.isFinite(r) ? "—" : `${r >= 0 ? "+" : ""}${(r * 100).toFixed(1)}%`;

const DECISION_BADGE: Record<
  NonNullable<Comparison["decision"]>["kind"],
  { label: string; cls: string }
> = {
  winner: { label: "ML winning", cls: "bg-[var(--success)]/15 text-[var(--success)]" },
  loser: { label: "ML worse", cls: "bg-[var(--danger)]/15 text-[var(--danger)]" },
  collect_more: { label: "Collecting", cls: "bg-[var(--warning)]/15 text-[var(--warning)]" },
  no_difference: { label: "No diff.", cls: "admin-text-secondary bg-[var(--surface-2)]" },
};

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
  const [comparison, setComparison] = useState<Comparison | null>(null);
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

  const loadComparison = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/ml-upsell/compare?location=${encodeURIComponent(locationSlug)}&days=30`);
      setComparison(r.ok ? await r.json() : null);
    } catch {
      setComparison(null);
    }
  }, [locationSlug]);

  useEffect(() => {
    loadStatus();
    loadComparison();
  }, [loadStatus, loadComparison]);

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
        await Promise.all([loadStatus(), loadComparison()]);
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

      {/* Live ML-vs-rules comparison (audit elite-qsr §1) — arms recomputed
          from each order's phone bucket; the significance engine calls it. */}
      <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[10px] uppercase tracking-wide admin-text-secondary">
            Live comparison · ML vs rules
          </p>
          {comparison?.ready && comparison.decision && (
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${DECISION_BADGE[comparison.decision.kind].cls}`}
            >
              {DECISION_BADGE[comparison.decision.kind].label}
            </span>
          )}
        </div>
        {!comparison ? (
          <p className="text-sm admin-text-secondary">Loading…</p>
        ) : !comparison.ready ? (
          <p className="text-sm admin-text-secondary">
            {comparison.reason === "no_model"
              ? "Train a model to start comparing."
              : "Set a rollout above 0% to split traffic and compare."}
          </p>
        ) : (
          <>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left admin-text-secondary">
                  <th className="py-1 pr-2">Arm</th>
                  <th className="py-1 pr-2 text-right">Orders</th>
                  <th className="py-1 pr-2 text-right">Attach rate</th>
                  <th className="py-1 pr-2 text-right">Avg order</th>
                </tr>
              </thead>
              <tbody>
                {[comparison.rules, comparison.ml].map(
                  (a) =>
                    a && (
                      <tr key={a.arm} className="border-t border-[var(--border)]">
                        <td className="py-1 pr-2 admin-text font-semibold">
                          {a.arm === "ml" ? "ML ranker" : "Rules (control)"}
                        </td>
                        <td className="py-1 pr-2 text-right admin-text">{a.orders}</td>
                        <td className="py-1 pr-2 text-right admin-text">{pct(a.attachRate)}</td>
                        <td className="py-1 pr-2 text-right admin-text">{zl(a.avgOrderValueGrosze)}</td>
                      </tr>
                    ),
                )}
              </tbody>
            </table>
            {comparison.attach && (
              <p className="text-[11px] admin-text-secondary mt-2">
                Attach lift:{" "}
                <span
                  className={
                    comparison.attach.relativeLift >= 0
                      ? "text-[var(--success)]"
                      : "text-[var(--danger)]"
                  }
                >
                  {lift(comparison.attach.relativeLift)}
                </span>{" "}
                (p={comparison.attach.pValue.toFixed(3)})
                {comparison.aov && (
                  <>
                    {" · "}AOV lift{" "}
                    <span
                      className={
                        comparison.aov.relativeLift >= 0
                          ? "text-[var(--success)]"
                          : "text-[var(--danger)]"
                      }
                    >
                      {lift(comparison.aov.relativeLift)}
                    </span>
                  </>
                )}
              </p>
            )}
            {comparison.decision && (
              <p className="text-[11px] admin-text-secondary mt-1">{comparison.decision.reason}</p>
            )}
            <p className="text-[10px] admin-text-secondary mt-1.5 opacity-80">
              Arms recomputed from each order&rsquo;s phone since the model was trained. Assumes the
              rollout % has been stable over the window.
            </p>
          </>
        )}
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
