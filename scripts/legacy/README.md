# scripts/legacy

One-shot verification harnesses kept for historical reference. Each was
written to prove a specific fix worked; the code they validate still
lives in `src/lib/*`. They are **not** wired into `package.json` or CI.

| Script | Verifies |
|---|---|
| `verify-bundle-fix.ts` | `src/lib/bundles.ts` — dynamic-mains bundle pricing + cart-line construction |
| `verify-combo-fix.ts` | `src/lib/upsell.ts` — `getActiveComboDeals` scenarios |
| `verify-scalability-fixes.ts` | `src/lib/cohort-analytics.ts` + `src/lib/customer-segments.ts` — cohort + segment math |

Run any of them ad-hoc with:

```bash
npx tsx scripts/legacy/<name>.ts
```

If a regression is suspected in one of these areas, run the matching
harness before debugging. If you find yourself reaching for these
regularly, promote the relevant cases to a real test suite instead of
expanding this folder.
