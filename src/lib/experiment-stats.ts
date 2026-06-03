/**
 * Frequentist significance testing for A/B experiments — the "ledger"
 * half of the bundle experiment harness (audit elite-qsr §9 + revenue
 * audit "A/B experimentation ledger").
 *
 * Deterministic phone-hashed bucketing already lives in
 * `@/lib/experiments`; this module turns the per-variant outcome samples
 * the analytics rollup collects into an honest verdict: is a treatment
 * beating control, by how much, and is it significant yet — or does the
 * operator need to keep collecting?
 *
 * Intentionally pure (no imports, no I/O) so it runs in the analytics
 * route, in admin client code, and under `node --test`. Two-sided tests
 * throughout; the p-value uses a normal approximation, which is the
 * standard large-sample choice for both the two-proportion z-test and
 * (via Welch) the difference-of-means test. We gate verdicts on a
 * minimum sample so the normal approximation isn't trusted on tiny n.
 */

/** A binomial outcome: `successes` out of `trials` (e.g. applies / impressions). */
export interface ProportionSample {
  successes: number;
  trials: number;
}

/** A continuous outcome summarised by sample size, mean, and *sample*
 *  variance (s², the n−1 estimator). e.g. AOV or contribution per order. */
export interface MeanSample {
  n: number;
  mean: number;
  /** Sample variance (s²). 0 is allowed (degenerate single-value group). */
  variance: number;
}

export type Direction = "up" | "down" | "flat";

export interface ComparisonResult {
  /** Control point estimate (rate for proportions, mean for means). */
  baseline: number;
  /** Variant point estimate. */
  variant: number;
  /** variant − baseline (percentage points for rates, raw units for means). */
  absoluteLift: number;
  /** (variant − baseline) / baseline. NaN-safe: 0 when baseline is 0. */
  relativeLift: number;
  /** Test statistic (z for proportions, Welch t treated as z for means). */
  statistic: number;
  /** Two-sided p-value. */
  pValue: number;
  /** pValue < alpha AND both arms cleared the minimum-sample gate. */
  significant: boolean;
  direction: Direction;
  /** False when either arm is below `minSample` — the test ran but the
   *  normal approximation isn't trustworthy, so `significant` is forced
   *  false and the caller should keep collecting. */
  enoughData: boolean;
}

/**
 * Standard normal CDF Φ(z) via the Abramowitz & Stegun 7.1.26 erf
 * approximation. Max absolute error ≈ 1.5e-7 — far tighter than any
 * decision threshold we test against.
 */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Two-sided p-value for a z statistic. */
export function twoSidedP(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)));
}

function relLift(baseline: number, variant: number): number {
  if (baseline === 0) return variant === 0 ? 0 : Infinity;
  return (variant - baseline) / baseline;
}

function directionOf(absoluteLift: number): Direction {
  if (absoluteLift > 0) return "up";
  if (absoluteLift < 0) return "down";
  return "flat";
}

/**
 * Pooled two-proportion z-test. `minSample` is the per-arm trial floor
 * below which we don't trust the normal approximation (default 30 — the
 * conventional large-sample threshold; also ensures np̂ / n(1−p̂) aren't
 * absurdly small for the rates QSR conversion produces).
 */
export function compareProportions(
  control: ProportionSample,
  variant: ProportionSample,
  alpha = 0.05,
  minSample = 30,
): ComparisonResult {
  const pC = control.trials === 0 ? 0 : control.successes / control.trials;
  const pV = variant.trials === 0 ? 0 : variant.successes / variant.trials;
  const absoluteLift = pV - pC;

  const enoughData = control.trials >= minSample && variant.trials >= minSample;

  // Pooled proportion + standard error.
  const pooled =
    control.trials + variant.trials === 0
      ? 0
      : (control.successes + variant.successes) / (control.trials + variant.trials);
  const se = Math.sqrt(
    pooled * (1 - pooled) * (1 / control.trials + 1 / variant.trials),
  );
  const statistic = se === 0 || !Number.isFinite(se) ? 0 : absoluteLift / se;
  const pValue = se === 0 || !Number.isFinite(se) ? 1 : twoSidedP(statistic);

  return {
    baseline: pC,
    variant: pV,
    absoluteLift,
    relativeLift: relLift(pC, pV),
    statistic,
    pValue,
    significant: enoughData && pValue < alpha,
    direction: directionOf(absoluteLift),
    enoughData,
  };
}

/**
 * Welch's unequal-variance test for a difference of means. The Welch t
 * statistic is evaluated against the normal distribution (large-sample
 * approximation) — honest for the n a live bundle experiment accrues and
 * gated behind `minSample` so it isn't trusted on tiny groups.
 */
export function compareMeans(
  control: MeanSample,
  variant: MeanSample,
  alpha = 0.05,
  minSample = 30,
): ComparisonResult {
  const absoluteLift = variant.mean - control.mean;
  const enoughData = control.n >= minSample && variant.n >= minSample;

  const seSq =
    (control.n === 0 ? 0 : control.variance / control.n) +
    (variant.n === 0 ? 0 : variant.variance / variant.n);
  const se = Math.sqrt(seSq);
  const statistic = se === 0 || !Number.isFinite(se) ? 0 : absoluteLift / se;
  const pValue = se === 0 || !Number.isFinite(se) ? 1 : twoSidedP(statistic);

  return {
    baseline: control.mean,
    variant: variant.mean,
    absoluteLift,
    relativeLift: relLift(control.mean, variant.mean),
    statistic,
    pValue,
    significant: enoughData && pValue < alpha,
    direction: directionOf(absoluteLift),
    enoughData,
  };
}

/**
 * Required trials PER ARM to detect a relative change `mde` (e.g. 0.05 =
 * 5%) on a binomial metric at the given two-sided alpha and power. Uses
 * the standard normal-approximation sample-size formula. Returns the
 * per-arm n; multiply by the arm count for the experiment total.
 */
export function requiredSampleSizePerArm(
  baselineRate: number,
  mde: number,
  alpha = 0.05,
  power = 0.8,
): number {
  if (baselineRate <= 0 || baselineRate >= 1 || mde <= 0) return Infinity;
  const p1 = baselineRate;
  const p2 = Math.min(0.999999, Math.max(0.000001, baselineRate * (1 + mde)));
  const zAlpha = zForTail(alpha / 2);
  const zBeta = zForTail(1 - power);
  const pBar = (p1 + p2) / 2;
  const delta = Math.abs(p2 - p1);
  if (delta === 0) return Infinity;
  const n =
    Math.pow(
      zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) +
        zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)),
      2,
    ) /
    (delta * delta);
  return Math.ceil(n);
}

/** Inverse normal CDF (z such that Φ(z) = 1 − tail), Acklam's rational
 *  approximation. Only used for the fixed alpha/power constants above, so
 *  its ~1e-9 accuracy is far more than enough. */
function zForTail(tail: number): number {
  // We want z with upper-tail area `tail`, i.e. Φ⁻¹(1 − tail).
  const p = 1 - tail;
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number, r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

export type DecisionKind = "collect_more" | "winner" | "loser" | "no_difference";

export interface Decision {
  kind: DecisionKind;
  /** One-line operator-facing rationale. */
  reason: string;
}

/**
 * Turn a comparison + sample progress into a stop/continue recommendation.
 * - `collect_more` while either arm is below the required sample and no
 *   significant result has emerged yet.
 * - `winner` / `loser` when the treatment is significantly better / worse
 *   than control on the primary metric.
 * - `no_difference` when the required sample is reached with no
 *   significant gap (the experiment has run its course; ship control).
 */
export function recommendDecision(
  result: ComparisonResult,
  observedTrials: number,
  requiredTrials: number,
): Decision {
  if (result.significant) {
    if (result.direction === "up") {
      return {
        kind: "winner",
        reason: `Significant win: ${formatPct(result.relativeLift)} vs control (p=${result.pValue.toFixed(3)}). Safe to promote.`,
      };
    }
    if (result.direction === "down") {
      return {
        kind: "loser",
        reason: `Significantly worse: ${formatPct(result.relativeLift)} vs control (p=${result.pValue.toFixed(3)}). Keep control.`,
      };
    }
  }
  if (!result.enoughData || observedTrials < requiredTrials) {
    const remaining = Math.max(0, requiredTrials - observedTrials);
    // requiredTrials is Infinity when the baseline rate is 0/1 (no power
    // estimate possible) — don't render "~Infinity more orders".
    const remainingText = Number.isFinite(remaining) ? `~${remaining} more` : "more";
    return {
      kind: "collect_more",
      reason: `Not conclusive yet — ${remainingText} orders needed for a ${result.direction === "flat" ? "" : result.direction + " "}signal at 95% confidence.`,
    };
  }
  return {
    kind: "no_difference",
    reason: `Sample reached, no significant difference (p=${result.pValue.toFixed(3)}). Ship control; try a bolder change.`,
  };
}

function formatPct(rel: number): string {
  if (!Number.isFinite(rel)) return "—";
  const pct = rel * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}
